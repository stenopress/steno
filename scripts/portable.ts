/** Runs the local Steno CLI with native acceleration explicitly disabled. */
Deno.env.set("STENO_NATIVE", "off");

const { runStenoCli } = await import("../mod.ts");

if (import.meta.main) {
  await runStenoCli(Deno.args);
}
