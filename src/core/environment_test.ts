import { assertEquals, assertThrows } from "@std/assert";
import { join } from "@std/path";
import { loadEnvironmentFiles, parseEnvironmentFile } from "./environment.ts";

export function registerEnvironmentTests(): void {
  Deno.test("environment: parses comments, exports, quotes and escapes", () => {
    assertEquals(
      parseEnvironmentFile(
        `# comment\nexport PUBLIC_NAME="Steno Site"\nPUBLIC_PATH=/docs # note\nPUBLIC_LINES="one\\ntwo"\nEMPTY=`,
      ),
      {
        PUBLIC_NAME: "Steno Site",
        PUBLIC_PATH: "/docs",
        PUBLIC_LINES: "one\ntwo",
        EMPTY: "",
      },
    );
  });

  Deno.test("environment: rejects invalid dotenv syntax with a line", () => {
    assertThrows(
      () => parseEnvironmentFile("NOT AN ENTRY", "/site/.env"),
      Error,
      'in "/site/.env" at line 1',
    );
  });

  Deno.test({
    name: "environment: layers base, local, mode and mode-local files",
    permissions: { read: true, write: true, env: true },
    fn: () => {
      const root = Deno.makeTempDirSync();
      const processKey = "STENO_TEST_ENV_PROCESS_WINS";
      const valueKey = "STENO_TEST_ENV_LAYER_VALUE";
      const baseKey = "STENO_TEST_ENV_BASE_ONLY";
      Deno.writeTextFileSync(
        join(root, ".env"),
        `${valueKey}=base\n${baseKey}=yes\n`,
      );
      Deno.writeTextFileSync(join(root, ".env.local"), `${valueKey}=local\n`);
      Deno.writeTextFileSync(
        join(root, ".env.development"),
        `${valueKey}=development\n${processKey}=file\n`,
      );
      Deno.writeTextFileSync(
        join(root, ".env.development.local"),
        `${valueKey}=development-local\n`,
      );
      Deno.writeTextFileSync(
        join(root, ".env.production"),
        `${valueKey}=production\n`,
      );
      Deno.env.set(processKey, "process");

      try {
        assertEquals(loadEnvironmentFiles(root, "development"), {
          [valueKey]: "development-local",
          [baseKey]: "yes",
          [processKey]: "process",
        });
        assertEquals(
          loadEnvironmentFiles(root, "production")[valueKey],
          "production",
        );
      } finally {
        Deno.env.delete(processKey);
        Deno.removeSync(root, { recursive: true });
      }
    },
  });
}
