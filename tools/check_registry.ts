const config = JSON.parse(await Deno.readTextFile(new URL("../deno.json", import.meta.url)));
const dependencies = Object.entries(config.imports as Record<string, string>)
  .filter(([name]) => name === "@steno/core" || name === "@steno/tau")
  .map(([, specifier]) => specifier);

if (dependencies.length === 0) {
  throw new Error("Expected versioned shared-package dependencies in deno.json.");
}

const result = await new Deno.Command(Deno.execPath(), {
  args: ["check", "--no-config", "--no-lock", ...dependencies],
  stdin: "null",
  stdout: "inherit",
  stderr: "inherit",
}).output();
if (!result.success) {
  throw new Error("Publish and verify the shared dependencies before releasing Steno.");
}
