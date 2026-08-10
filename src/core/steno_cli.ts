import { parseCliArgs, printHelp, printVersion } from "../utils/cli.ts";
import { Steno } from "./steno.ts";
import { runDoctor } from "./doctor.ts";

/** Runs the public CLI command for a Steno project. */
export async function runStenoCli(args: string[]): Promise<void> {
  const options = parseCliArgs(args);

  if (options.command === "help") {
    printHelp();
    return;
  }

  if (options.command === "version") {
    printVersion();
    return;
  }

  if (options.command === "doctor") {
    const hasErrors = await runDoctor(options.configPath);
    if (hasErrors) throw new Error("Doctor found errors.");
    return;
  }

  const steno = new Steno(options.configPath, false, {}, options.verbose);

  if (options.command === "preview") {
    await steno.preview(options.port);
    return;
  }

  if (options.command === "dev") {
    await steno.dev();
    return;
  }

  await steno.build();
}
