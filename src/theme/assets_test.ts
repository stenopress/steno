import { assertEquals, assertRejects } from "@std/assert";
import { join } from "@std/path";
import { copyThemeAssets } from "./assets.ts";

Deno.test("theme assets: reject escaping paths before writing any assets", async () => {
  const root = await Deno.makeTempDir();
  try {
    for (const path of [
      "../../escaped.txt",
      "../escaped.css",
      "/absolute.txt",
      "C:/file.txt",
      "..\\file.txt",
    ]) {
      await assertRejects(
        () =>
          copyThemeAssets(
            { "a.txt": "safe", [path]: "unsafe" },
            join(root, "dist"),
            new Set(),
            true,
            false,
          ),
        Error,
        "Invalid theme asset path",
      );
      assertEquals(Array.from(Deno.readDirSync(root)), []);
    }
    await copyThemeAssets(
      { "nested/file.txt": "safe" },
      join(root, "dist"),
      new Set(),
      true,
      false,
    );
    assertEquals(await Deno.readTextFile(join(root, "dist/assets/nested/file.txt")), "safe");
  } finally {
    await Deno.remove(root, { recursive: true });
  }
});
