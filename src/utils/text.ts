/**
 * Computes the UTF-8 byte length of a string without allocating an encoded
 * byte array, unlike `TextEncoder#encode(value).byteLength`.
 */
export function utf8ByteLength(value: string): number {
  let bytes = value.length;
  for (let index = 0; index < value.length; index++) {
    const code = value.charCodeAt(index);
    if (code <= 0x7F) continue;
    if (code <= 0x7FF) {
      bytes++;
    } else if (
      code >= 0xD800 && code <= 0xDBFF &&
      index + 1 < value.length &&
      value.charCodeAt(index + 1) >= 0xDC00 &&
      value.charCodeAt(index + 1) <= 0xDFFF
    ) {
      bytes += 2;
      index++;
    } else {
      bytes += 2;
    }
  }
  return bytes;
}
