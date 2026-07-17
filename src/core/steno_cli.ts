import { parseCliArgs, printHelp } from "../utils/cli.ts";
import { Steno } from "./steno.ts";
import { getNativeBuildInfo } from "./native.ts";

function printDoctor(): void {
  const native = getNativeBuildInfo();
  console.log("Steno environment");
  console.log(`  Deno:   ${Deno.version.deno}`);
  console.log(`  Target: ${native.target}`);
  console.log(
    native.available
      ? `  Engine: native (${native.path})`
      : "  Engine: portable Deno",
  );
  if (!native.available) {
    console.log(`  Native: ${native.reason}`);
    console.log(
      "  Note: the portable engine is fully supported. In a source checkout, run `deno task setup` to enable native acceleration.",
    );
  }
}

/** Runs the public CLI command for a Steno project. */
export async function runStenoCli(args: string[]): Promise<void> {
  const options = parseCliArgs(args);

  if (options.command === "help") {
    printHelp();
    return;
  }

  if (options.command === "doctor") {
    printDoctor();
    return;
  }

  const steno = new Steno(options.configPath, false);
  if (options.command === "dev") {
    await steno.dev();
    return;
  }

  await steno.build();
}
