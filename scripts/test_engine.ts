const engine = Deno.args[0];
if (engine !== "native" && engine !== "portable") {
  console.error("Usage: deno run -A scripts/test_engine.ts <native|portable>");
  Deno.exit(2);
}

const command = new Deno.Command(Deno.execPath(), {
  args: ["test", "-A", "./test.ts"],
  env: {
    ...Deno.env.toObject(),
    STENO_NATIVE: engine === "native" ? "required" : "off",
  },
  stdin: "inherit",
  stdout: "inherit",
  stderr: "inherit",
});

const status = await command.spawn().status;
if (!status.success) Deno.exit(status.code);
