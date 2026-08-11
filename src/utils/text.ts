/** Returns `error`'s message, coercing non-`Error` values to a string. */
export function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
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
