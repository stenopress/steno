import { parseCliArgs, printHelp } from "../utils/cli.ts";
import { Steno } from "./steno.ts";
import { runDoctor } from "./doctor.ts";

/** Runs the public CLI command for a Steno project. */
export async function runStenoCli(args: string[]): Promise<void> {
  const options = parseCliArgs(args);

  if (options.command === "help") {
    printHelp();
    return;
  }

  if (options.command === "doctor") {
    await runDoctor(options.configPath);
    return;
  }

  const steno = new Steno(options.configPath, false);
  if (options.command === "dev") {
    await steno.dev();
    return;
  }

  await steno.build();
}
