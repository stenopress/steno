import { assertEquals } from "@std/assert";
import { decodeKey, truncate } from "./terminal.ts";

Deno.test("terminal: decodes interactive keys", () => {
  assertEquals(decodeKey(new Uint8Array([27, 91, 65])), "up");
  assertEquals(decodeKey(new Uint8Array([27, 91, 66])), "down");
  assertEquals(decodeKey(new Uint8Array([32])), "space");
  assertEquals(decodeKey(new Uint8Array([13])), "enter");
  assertEquals(decodeKey(new Uint8Array([10])), "enter");
  assertEquals(decodeKey(new Uint8Array([3])), "cancel");
  assertEquals(decodeKey(new Uint8Array([27])), "cancel");
  assertEquals(decodeKey(new Uint8Array([120])), "unknown");
  assertEquals(decodeKey(new Uint8Array()), "unknown");
});

Deno.test("terminal: truncates only when text exceeds the limit", () => {
  assertEquals(truncate("short", 10), "short");
  assertEquals(truncate("long description", 8), "long de…");
  assertEquals(truncate("anything", 1), "anything");
});
