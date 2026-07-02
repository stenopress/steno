import { assertEquals } from "@std/assert";
import { join } from "@std/path";
import { ensureDirSync } from "./fileUtils.ts";

export function registerFileUtilsTests(): void {
  Deno.test({
    name: "fileUtils: ensureDirSync creates nested directories",
    permissions: { read: true, write: true },
    fn: () => {
      const tempDir = Deno.makeTempDirSync();
      const nestedDir = join(tempDir, "a", "b", "c");

      ensureDirSync(nestedDir);

      const stat = Deno.statSync(nestedDir);
      assertEquals(stat.isDirectory, true);
    },
  });

  Deno.test({
    name: "fileUtils: ensureDirSync is idempotent",
    permissions: { read: true, write: true },
    fn: () => {
      const tempDir = Deno.makeTempDirSync();

      ensureDirSync(tempDir);
      ensureDirSync(tempDir);

      const stat = Deno.statSync(tempDir);
      assertEquals(stat.isDirectory, true);
    },
  });
}
