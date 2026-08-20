/** Returns `error`'s message, coercing non-`Error` values to a string. */
export function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

/**
 * Returns a SHA-256 fingerprint of `content`, for cache-invalidation
 * signatures that only need equality, not the content itself.
 */
export async function hashContent(content: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(content));
  return Array.from(new Uint8Array(digest))
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

/**
 * Minifies CSS: strips comments, collapses runs of whitespace to a single
 * space, and trims the space around `{ } : ; ,`. String literals (quoted
 * values, `url(...)`) are left untouched so their contents survive intact.
 *
 * This is a small hand-rolled pass, not a full CSS parser - it favors safety
 * over squeezing out every last byte.
 */
export function minifyCss(css: string): string {
  let out = "";
  let index = 0;
  const length = css.length;

  while (index < length) {
    const char = css[index];

    // drop comments
    if (char === "/" && css[index + 1] === "*") {
      const end = css.indexOf("*/", index + 2);
      index = end === -1 ? length : end + 2;
      continue;
    }

    // preserve unquoted `url(...)` contents
    if (
      (char === "u" || char === "U") &&
      css.slice(index, index + 4).toLowerCase() === "url(" &&
      css[index + 4] !== '"' &&
      css[index + 4] !== "'"
    ) {
      const end = css.indexOf(")", index + 4);
      const cursor = end === -1 ? length : end + 1;
      out += css.slice(index, cursor);
      index = cursor;
      continue;
    }

    // quoted string literal; skip over it so we don't minify its contents
    if (char === '"' || char === "'") {
      const quote = char;
      let cursor = index + 1;
      while (cursor < length) {
        if (css[cursor] === "\\") {
          cursor += 2;
          continue;
        }
        if (css[cursor] === quote) {
          cursor++;
          break;
        }
        cursor++;
      }
      out += css.slice(index, cursor);
      index = cursor;
      continue;
    }

    // drop whitespace
    if (/\s/.test(char)) {
      let cursor = index;
      while (cursor < length && /\s/.test(css[cursor])) cursor++;
      const prev = out[out.length - 1];
      const next = css[cursor];
      const skippable = (ch: string | undefined) => ch !== undefined && /[{}:;,]/.test(ch);
      // only keep a single space if it's between two non-skippable characters
      if (!skippable(prev) && !skippable(next) && out.length > 0 && next !== undefined) {
        out += " ";
      }
      index = cursor;
      continue;
    }

    if (char === ";" && out[out.length - 1] === ";") {
      index++;
      continue;
    }

    // drop the last semicolon before a closing brace, since it's optional
    if (char === "}" && out[out.length - 1] === ";") {
      out = out.slice(0, -1);
    }

    out += char;
    index++;
  }

  return out.trim();
}

/** Elements whose content is significant or non-HTML and must survive minification untouched. */
const HTML_RAW_TAG_PATTERN = /^(?:script|style|pre|textarea)$/i;

/**
 * Minifies HTML: strips comments (conditional comments like `<!--[if IE]-->`
 * are kept as-is) and collapses runs of whitespace in text content down to a
 * single space. Never removes a run entirely, since browsers already
 * collapse whitespace to one space when rendering normal flow - this only
 * removes bytes that were already invisible.
 *
 * Tag markup and attribute values are copied through untouched, and the
 * contents of `<script>`, `<style>`, `<pre>`, and `<textarea>` elements are
 * preserved verbatim (whitespace there is either significant or not HTML).
 *
 * This is a small hand-rolled pass, not a full HTML parser - it favors
 * safety over squeezing out every last byte.
 */
export function minifyHtml(html: string): string {
  let out = "";
  let index = 0;
  const length = html.length;

  while (index < length) {
    if (html[index] === "<") {
      // drop all comments except those conditional (`<!--[if ...`/`<![endif]-->`).
      if (html.startsWith("<!--", index)) {
        const isConditional = html.startsWith("<!--[", index);
        const end = html.indexOf("-->", index + 4);
        const commentEnd = end === -1 ? length : end + 3;
        if (isConditional) out += html.slice(index, commentEnd);
        index = commentEnd;
        continue;
      }

      // skip over tags, but preserve their markup and attribute values verbatim
      let cursor = index + 1;
      const closing = html[cursor] === "/";
      if (closing) cursor++;
      const nameStart = cursor;
      while (cursor < length && /[a-zA-Z0-9-]/.test(html[cursor])) cursor++;
      const tagName = html.slice(nameStart, cursor);

      while (cursor < length && html[cursor] !== ">") {
        const quote = html[cursor];
        if (quote === '"' || quote === "'") {
          cursor++;
          while (cursor < length && html[cursor] !== quote) cursor++;
        }
        cursor++;
      }
      const tagEnd = cursor < length ? cursor + 1 : length;
      out += html.slice(index, tagEnd);
      index = tagEnd;

      if (!closing && HTML_RAW_TAG_PATTERN.test(tagName)) {
        const closeTag = `</${tagName.toLowerCase()}`;
        const rawEnd = length;
        let search = index;
        while (true) {
          const found = html.indexOf("</", search);
          if (found === -1) break;
          if (html.slice(found, found + closeTag.length).toLowerCase() === closeTag) {
            const rawEnd = found;
            break;
          }
          search = found + 2;
        }
        out += html.slice(index, rawEnd);
        index = rawEnd;
      }
      continue;
    }

    if (/\s/.test(html[index])) {
      let cursor = index;
      while (cursor < length && /\s/.test(html[cursor])) cursor++;
      out += " ";
      index = cursor;
      continue;
    }

    out += html[index];
    index++;
  }

  return out.trim();
}

/** Returns whether `value` contains any ASCII control characters. */
export function hasControlCharacters(value: string): boolean {
  for (let i = 0; i < value.length; i++) {
    const code = value.charCodeAt(i);
    if (code <= 0x1f || code === 0x7f) return true;
  }
  return false;
}

/** Returns whether `value` is a plain object (not `null`, not an array). */
export function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

/**
 * Computes the UTF-8 byte length of a string without allocating an encoded
 * byte array, unlike `TextEncoder#encode(value).byteLength`.
 */
export function utf8ByteLength(value: string): number {
  let bytes = value.length;
  for (let index = 0; index < value.length; index++) {
    const code = value.charCodeAt(index);
    if (code <= 0x7f) continue;
    if (code <= 0x7ff) {
      bytes++;
    } else if (
      code >= 0xd800 &&
      code <= 0xdbff &&
      index + 1 < value.length &&
      value.charCodeAt(index + 1) >= 0xdc00 &&
      value.charCodeAt(index + 1) <= 0xdfff
    ) {
      bytes += 2;
      index++;
    } else {
      bytes += 2;
    }
  }
  return bytes;
}
