import { fromFileUrl } from "@std/path";

const config = JSON.parse(await Deno.readTextFile(new URL("../deno.json", import.meta.url)));
const registryConfig = fromFileUrl(new URL("registry-deno.json", import.meta.url));
const dependencies = ["@steno/core", "@steno/tau"].map((name) => {
  const specifier = config.imports?.[name];
  if (typeof specifier !== "string" || !new RegExp(`^jsr:${name}@[^/]+$`).test(specifier)) {
    throw new Error(`Expected versioned ${name} dependency in deno.json.`);
  }
  return specifier;
});

const result = await new Deno.Command(Deno.execPath(), {
  args: ["check", "--config", registryConfig, "--no-lock", ...dependencies],
  stdin: "null",
  stdout: "inherit",
  stderr: "inherit",
}).output();
if (!result.success) {
  throw new Error("Publish and verify the shared dependencies before releasing Steno.");
}
