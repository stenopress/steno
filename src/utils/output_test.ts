import { assertEquals } from "@std/assert";
import { createColors } from "./output.ts";

export function registerOutputTests(): void {
  Deno.test("output: colors are enabled by default", () => {
    const colors = createColors(false);

    assertEquals(colors.green.startsWith("\x1b["), true);
    assertEquals(colors.bold.startsWith("\x1b["), true);
    assertEquals(colors.reset, "\x1b[0m");
  });

  Deno.test("output: NO_COLOR removes ANSI sequences", () => {
    const colors = createColors(true);

    for (const value of Object.values(colors)) {
      assertEquals(value, "");
    }
  });

  Deno.test({
    name: "output: respects NO_COLOR environment variable",
    permissions: { run: true, env: true, read: true },
    fn: async () => {
      const command = new Deno.Command(Deno.execPath(), {
        args: [
          "eval",
          'import { c } from "./src/utils/output.ts"; console.log(JSON.stringify(c));',
        ],
        env: {
          ...Deno.env.toObject(),
          NO_COLOR: "1",
        },
        stdout: "piped",
      });

      const result = await command.output();
      const colors = JSON.parse(new TextDecoder().decode(result.stdout));

      assertEquals(result.success, true);
      assertEquals(colors.green, "");
      assertEquals(colors.bold, "");
    },
  });
}
