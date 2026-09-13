import { isRecord } from "./text.ts";
import type { HeadTag, LinkHeadTag, MetaHeadTag, ScriptHeadTag } from "./types.ts";

function isMetaTag(tag: HeadTag): tag is MetaHeadTag {
  return tag.tag === undefined || tag.tag === "meta";
}
function isLinkTag(tag: HeadTag): tag is LinkHeadTag {
  return tag.tag === "link";
}
function isScriptTag(tag: HeadTag): tag is ScriptHeadTag {
  return tag.tag === "script";
}

function headError(path: string, message: string): never {
  throw new Error(`Invalid head configuration at "${path}": ${message}.`);
}

/** Utility to assert string types on optional record properties */
function checkStrings(entry: Record<string, unknown>, fields: string[], entryPath: string) {
  for (const f of fields) {
    if (entry[f] !== undefined && typeof entry[f] !== "string") {
      headError(`${entryPath}.${f}`, "expected a string");
    }
  }
}

/** Validates a head-tag list and returns it with its public type. */
export function validateHeadTags(value: unknown, path = "head"): HeadTag[] {
  if (!Array.isArray(value)) headError(path, "expected an array");

  value.forEach((entry, index) => {
    const entryPath = `${path}[${index}]`;
    if (!isRecord(entry)) headError(entryPath, "expected an object");
    checkStrings(entry, ["key"], entryPath);

    const tag = entry.tag ?? "meta";

    if (tag === "meta") {
      checkStrings(entry, ["name", "property", "httpEquiv", "charset", "content"], entryPath);
      const selectors = [entry.name, entry.property, entry.httpEquiv, entry.charset].filter(
        (item) => item !== undefined,
      );
      if (selectors.length !== 1) {
        headError(
          entryPath,
          "meta tags require exactly one of name, property, httpEquiv, or charset",
        );
      }
      if (entry.charset === undefined && typeof entry.content !== "string") {
        headError(`${entryPath}.content`, "expected a string");
      }
      return;
    }

    if (tag === "link") {
      if (typeof entry.rel !== "string") headError(`${entryPath}.rel`, "expected a string");
      if (typeof entry.href !== "string") headError(`${entryPath}.href`, "expected a string");
      checkStrings(entry, ["type", "media", "sizes", "crossOrigin", "referrerPolicy"], entryPath);
      return;
    }

    if (tag === "script") {
      if (entry.src === undefined && entry.content === undefined) {
        headError(entryPath, "script tags require src or content");
      }
      checkStrings(
        entry,
        ["src", "content", "type", "integrity", "crossOrigin", "referrerPolicy"],
        entryPath,
      );

      for (const field of ["async", "defer", "noModule"]) {
        if (entry[field] !== undefined && typeof entry[field] !== "boolean") {
          headError(`${entryPath}.${field}`, "expected a boolean");
        }
      }
      return;
    }

    headError(`${entryPath}.tag`, 'expected "meta", "link", or "script"');
  });
  return value as HeadTag[];
}

function tagIdentity(tag: HeadTag): string | undefined {
  if (tag.key) return `key:${tag.key}`;

  if (isMetaTag(tag)) {
    const key = tag.name || tag.property || tag.httpEquiv;
    if (key) {
      const type = tag.name ? "name" : tag.property ? "property" : "http";
      return `meta:${type}:${key.toLowerCase()}`;
    }
    if (tag.charset) return "meta:charset";
  }

  if (isScriptTag(tag) && tag.src) return `script:${tag.src}`;

  if (isLinkTag(tag)) {
    const rel = tag.rel.toLowerCase();
    return rel === "canonical" ? "link:canonical" : `link:${rel}:${tag.href}`;
  }
  return undefined;
}

/** Merges page tags over matching site tags while preserving stable order. */
export function mergeHeadTags(siteTags: HeadTag[] = [], pageTags: HeadTag[] = []): HeadTag[] {
  const merged = [...siteTags];
  const positions = new Map<string, number>();

  merged.forEach((tag, idx) => {
    const id = tagIdentity(tag);
    if (id) positions.set(id, idx);
  });

  for (const tag of pageTags) {
    const id = tagIdentity(tag);
    const pos = id ? positions.get(id) : undefined;
    if (pos === undefined) {
      if (id) positions.set(id, merged.length);
      merged.push(tag);
    } else {
      merged[pos] = tag;
    }
  }
  return merged;
}

function escapeAttr(val: string): string {
  return val
    .replace(/&/g, "&amp;")
    .replace(/"/g, "&quot;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

function buildAttrs(attrs: Record<string, string | boolean | undefined>): string {
  return Object.entries(attrs)
    .filter(([_, val]) => val !== undefined && val !== false)
    .map(([key, val]) => (val === true ? ` ${key}` : ` ${key}="${escapeAttr(String(val))}"`))
    .join("");
}

export function renderHeadTags(tags: HeadTag[]): string {
  return tags
    .map((tag) => {
      if (isMetaTag(tag)) {
        return `<meta${buildAttrs({
          name: tag.name,
          property: tag.property,
          "http-equiv": tag.httpEquiv,
          charset: tag.charset,
          content: tag.content,
        })}>`;
      }

      if (isLinkTag(tag)) {
        return `<link${buildAttrs({
          rel: tag.rel,
          href: tag.href,
          type: tag.type,
          media: tag.media,
          sizes: tag.sizes,
          crossorigin: tag.crossOrigin,
          referrerpolicy: tag.referrerPolicy,
        })}>`;
      }
      const body = (tag.content ?? "").replace(/<\/script/gi, "<\\/script");
      return `<script${buildAttrs({
        src: tag.src,
        type: tag.type,
        async: tag.async,
        defer: tag.defer,
        nomodule: tag.noModule,
        integrity: tag.integrity,
        crossorigin: tag.crossOrigin,
        referrerpolicy: tag.referrerPolicy,
      })}>${body}</script>`;
    })
    .join("\n");
}

/** Injects managed tags before `</head>`, creating a head when necessary. */
export function injectHeadTags(html: string, tags: HeadTag[]): string {
  if (tags.length === 0) return html;
  const rendered = renderHeadTags(tags);

  if (/<\/head\s*>/i.test(html)) {
    return html.replace(/<\/head\s*>/i, `${rendered}\n$&`);
  }
  if (/<body(?:\s|>)/i.test(html)) {
    return html.replace(/<body(?:\s|>)/i, `<head>\n${rendered}\n</head>\n$&`);
  }
  return `<head>\n${rendered}\n</head>\n${html}`;
}
