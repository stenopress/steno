import type {
  HeadTag,
  LinkHeadTag,
  MetaHeadTag,
  ScriptHeadTag,
} from "../types.ts";

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

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

/** Validates a head-tag list and returns it with its public type. */
export function validateHeadTags(value: unknown, path = "head"): HeadTag[] {
  if (!Array.isArray(value)) headError(path, "expected an array");
  value.forEach((entry, index) => {
    const entryPath = `${path}[${index}]`;
    if (!isRecord(entry)) headError(entryPath, "expected an object");
    if (entry.key !== undefined && typeof entry.key !== "string") {
      headError(`${entryPath}.key`, "expected a string");
    }

    const tag = entry.tag ?? "meta";
    if (tag === "meta") {
      for (
        const field of ["name", "property", "httpEquiv", "charset", "content"]
      ) {
        if (entry[field] !== undefined && typeof entry[field] !== "string") {
          headError(`${entryPath}.${field}`, "expected a string");
        }
      }
      const selectors = [
        entry.name,
        entry.property,
        entry.httpEquiv,
        entry.charset,
      ]
        .filter((item) => item !== undefined);
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
      if (typeof entry.rel !== "string") {
        headError(`${entryPath}.rel`, "expected a string");
      }
      if (typeof entry.href !== "string") {
        headError(`${entryPath}.href`, "expected a string");
      }
      for (
        const field of [
          "type",
          "media",
          "sizes",
          "crossOrigin",
          "referrerPolicy",
        ]
      ) {
        if (entry[field] !== undefined && typeof entry[field] !== "string") {
          headError(`${entryPath}.${field}`, "expected a string");
        }
      }
      return;
    }

    if (tag === "script") {
      if (entry.src === undefined && entry.content === undefined) {
        headError(entryPath, "script tags require src or content");
      }
      for (
        const field of [
          "src",
          "content",
          "type",
          "integrity",
          "crossOrigin",
          "referrerPolicy",
        ]
      ) {
        if (entry[field] !== undefined && typeof entry[field] !== "string") {
          headError(`${entryPath}.${field}`, "expected a string");
        }
      }
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
    if (tag.name) return `meta:name:${tag.name.toLowerCase()}`;
    if (tag.property) return `meta:property:${tag.property.toLowerCase()}`;
    if (tag.httpEquiv) return `meta:http:${tag.httpEquiv.toLowerCase()}`;
    if (tag.charset) return "meta:charset";
  }
  if (isScriptTag(tag) && tag.src) return `script:${tag.src}`;
  if (isLinkTag(tag)) {
    return tag.rel.toLowerCase() === "canonical"
      ? "link:canonical"
      : `link:${tag.rel.toLowerCase()}:${tag.href}`;
  }
  return undefined;
}

/** Merges page tags over matching site tags while preserving stable order. */
export function mergeHeadTags(
  siteTags: HeadTag[] = [],
  pageTags: HeadTag[] = [],
): HeadTag[] {
  const merged = [...siteTags];
  const positions = new Map<string, number>();
  merged.forEach((tag, index) => {
    const identity = tagIdentity(tag);
    if (identity) positions.set(identity, index);
  });
  for (const tag of pageTags) {
    const identity = tagIdentity(tag);
    const position = identity ? positions.get(identity) : undefined;
    if (position === undefined) {
      if (identity) positions.set(identity, merged.length);
      merged.push(tag);
    } else {
      merged[position] = tag;
    }
  }
  return merged;
}

function escapeAttribute(value: string): string {
  return value.replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(
    /</g,
    "&lt;",
  ).replace(/>/g, "&gt;");
}

function attribute(name: string, value: string | undefined): string {
  return value === undefined ? "" : ` ${name}="${escapeAttribute(value)}"`;
}

export function renderHeadTags(tags: HeadTag[]): string {
  return tags.map((tag) => {
    if (isMetaTag(tag)) {
      return `<meta${attribute("name", tag.name)}${
        attribute("property", tag.property)
      }${attribute("http-equiv", tag.httpEquiv)}${
        attribute("charset", tag.charset)
      }${attribute("content", tag.content)}>`;
    }
    if (isLinkTag(tag)) {
      return `<link${attribute("rel", tag.rel)}${attribute("href", tag.href)}${
        attribute("type", tag.type)
      }${attribute("media", tag.media)}${attribute("sizes", tag.sizes)}${
        attribute("crossorigin", tag.crossOrigin)
      }${attribute("referrerpolicy", tag.referrerPolicy)}>`;
    }
    const body = (tag.content ?? "").replace(/<\/script/gi, "<\\/script");
    return `<script${attribute("src", tag.src)}${attribute("type", tag.type)}${
      tag.async ? " async" : ""
    }${tag.defer ? " defer" : ""}${tag.noModule ? " nomodule" : ""}${
      attribute("integrity", tag.integrity)
    }${attribute("crossorigin", tag.crossOrigin)}${
      attribute("referrerpolicy", tag.referrerPolicy)
    }>${body}</script>`;
  }).join("\n");
}

/** Injects managed tags before `</head>`, creating a head when necessary. */
export function injectHeadTags(html: string, tags: HeadTag[]): string {
  if (tags.length === 0) return html;
  const rendered = renderHeadTags(tags);
  const headClose = html.search(/<\/head\s*>/i);
  if (headClose >= 0) {
    return `${html.slice(0, headClose)}${rendered}\n${html.slice(headClose)}`;
  }
  const bodyOpen = html.search(/<body(?:\s|>)/i);
  if (bodyOpen >= 0) {
    return `${html.slice(0, bodyOpen)}<head>\n${rendered}\n</head>\n${
      html.slice(bodyOpen)
    }`;
  }
  return `<head>\n${rendered}\n</head>\n${html}`;
}
