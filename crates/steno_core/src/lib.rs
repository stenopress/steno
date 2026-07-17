use pulldown_cmark::{html, Parser};
use rayon::prelude::*;
use serde::{Deserialize, Serialize};
use std::fs;
use std::path::{Path, PathBuf};
use std::sync::OnceLock;

static WORKER_POOL: OnceLock<rayon::ThreadPool> = OnceLock::new();

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct PageInfo {
    full_path: String,
    rel_path: String,
}

#[derive(Deserialize)]
struct Frontmatter {
    draft: Option<bool>,
}

#[derive(Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
struct CacheEntry {
    full_path: String,
    rel_path: String,
    output_path: String,
    source_text: String,
    #[serde(default)]
    body: String,
    #[serde(default)]
    html_content: String,
}

#[derive(Serialize, Deserialize)]
struct BuildCache {
    version: i32,
    signature: String,
    pages: Vec<CacheEntry>,
}

fn extract_frontmatter(content: &str) -> Result<(&str, Option<Frontmatter>), ()> {
    let (delimiter, yaml) = if content.starts_with("---\n") {
        ("---", true)
    } else if content.starts_with("+++\n") {
        ("+++", false)
    } else {
        return Ok((content, None));
    };
    let frontmatter_start = delimiter.len() + 1;
    let closing_marker = format!("\n{delimiter}");
    let Some(closing_index) = content[frontmatter_start..]
        .find(&closing_marker)
        .map(|index| index + frontmatter_start)
    else {
        return Ok((content, None));
    };
    let frontmatter_text = &content[frontmatter_start..closing_index];
    let body = &content[closing_index + closing_marker.len()..];
    let draft = if yaml {
        serde_yaml::from_str::<serde_yaml::Value>(frontmatter_text)
            .map_err(|_| ())?
            .get("draft")
            .and_then(|value| value.as_bool())
    } else {
        toml::from_str::<toml::Value>(frontmatter_text)
            .map_err(|_| ())?
            .get("draft")
            .and_then(|value| value.as_bool())
    };
    Ok((body, Some(Frontmatter { draft })))
}

fn load_previous_cache(cache_path: &str) -> Option<BuildCache> {
    match fs::read_to_string(cache_path) {
        Ok(content) => serde_json::from_str(&content).ok(),
        Err(_) => None,
    }
}

fn output_path(output_dir: &str, rel_path: &str, short_urls: bool) -> PathBuf {
    let normalized = rel_path.replace('\\', "/");
    if !short_urls {
        return Path::new(output_dir)
            .join(normalized.strip_suffix(".md").unwrap_or(&normalized))
            .with_extension("html");
    }

    if normalized == "index.md" {
        return Path::new(output_dir).join("index.html");
    }
    if let Some(directory) = normalized.strip_suffix("/index.md") {
        return Path::new(output_dir).join(directory).join("index.html");
    }

    Path::new(output_dir)
        .join(normalized.strip_suffix(".md").unwrap_or(&normalized))
        .join("index.html")
}

#[no_mangle]
pub extern "C" fn run_build(
    config_ptr: *const u8,
    config_len: usize,
    pages_ptr: *const u8,
    pages_len: usize,
    cache_path_ptr: *const u8,
    cache_path_len: usize,
    signature_ptr: *const u8,
    signature_len: usize,
    dev: i32,
) -> i32 {
    // This workload is dominated by many small file operations. A small pool
    // avoids the filesystem contention caused by Rayon's CPU-sized default.
    let worker_pool = WORKER_POOL.get_or_init(|| {
        rayon::ThreadPoolBuilder::new()
            .num_threads(4)
            .build()
            .expect("valid native worker pool")
    });
    let config_bytes = unsafe { std::slice::from_raw_parts(config_ptr, config_len) };
    let pages_bytes = unsafe { std::slice::from_raw_parts(pages_ptr, pages_len) };
    let cache_path_bytes = unsafe { std::slice::from_raw_parts(cache_path_ptr, cache_path_len) };
    let signature_bytes = unsafe { std::slice::from_raw_parts(signature_ptr, signature_len) };

    let cache_path = match std::str::from_utf8(cache_path_bytes) {
        Ok(p) => p,
        Err(_) => return 1,
    };

    let signature = match std::str::from_utf8(signature_bytes) {
        Ok(s) => s,
        Err(_) => return 1,
    };

    let is_dev = dev != 0;

    // Deserialize the config
    let config: serde_json::Value = match serde_json::from_slice(config_bytes) {
        Ok(v) => v,
        Err(_) => return 1,
    };

    let output_dir = config
        .get("output")
        .and_then(|v| v.as_str())
        .unwrap_or("dist");
    let short_urls = config
        .get("custom")
        .and_then(|value| value.get("shortUrls"))
        .and_then(|value| value.as_bool())
        .unwrap_or(false);

    // Deserialize the list of pages
    let pages: Vec<PageInfo> = match serde_json::from_slice(pages_bytes) {
        Ok(v) => v,
        Err(_) => return 1,
    };

    let previous_cache = load_previous_cache(cache_path);

    // Process pages in parallel
    let cache_entries = worker_pool.install(|| {
        pages
            .par_iter()
            .map(|page| {
                let full_path = &page.full_path;
                let rel_path = &page.rel_path;

                let content = fs::read_to_string(full_path).map_err(|_| ())?;
                let (body, frontmatter) = extract_frontmatter(&content)?;
                if !is_dev && frontmatter.and_then(|value| value.draft).unwrap_or(false) {
                    return Ok(None);
                }

                let parser = Parser::new(&body);
                let mut html_output = String::new();
                html::push_html(&mut html_output, parser);
                let body = body.to_string();

                let output_path = output_path(output_dir, rel_path, short_urls);

                // Ensure parent directory exists
                if let Some(parent) = output_path.parent() {
                    fs::create_dir_all(parent).map_err(|_| ())?;
                }

                fs::write(&output_path, &html_output).map_err(|_| ())?;

                Ok(Some(CacheEntry {
                    full_path: full_path.clone(),
                    rel_path: rel_path.clone(),
                    output_path: output_path.to_string_lossy().into_owned(),
                    source_text: content,
                    body,
                    html_content: html_output,
                }))
            })
            .collect::<Result<Vec<Option<CacheEntry>>, ()>>()
    });
    let cache_entries: Vec<CacheEntry> = match cache_entries {
        Ok(entries) => entries.into_iter().flatten().collect(),
        Err(()) => return 1,
    };

    // Remove outputs for deleted pages and drafts excluded from production.
    if let Some(previous) = previous_cache {
        let current_paths: std::collections::HashMap<&str, &str> = cache_entries
            .iter()
            .map(|entry| (entry.full_path.as_str(), entry.output_path.as_str()))
            .collect();
        for entry in previous.pages {
            if current_paths.get(entry.full_path.as_str()).copied()
                != Some(entry.output_path.as_str())
            {
                let _ = fs::remove_file(entry.output_path);
            }
        }
    }

    // Save cache file
    let cache = BuildCache {
        version: 1,
        signature: signature.to_string(),
        pages: cache_entries,
    };

    if let Ok(cache_json) = serde_json::to_string(&cache) {
        if let Some(parent) = Path::new(cache_path).parent() {
            let _ = fs::create_dir_all(parent);
        }
        let _ = fs::write(cache_path, cache_json);
    }

    0
}
