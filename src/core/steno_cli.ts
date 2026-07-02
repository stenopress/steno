import { printHelp, parseCliArgs } from "../utils/cli.ts";
import { Steno } from "./steno.ts";

export async function runStenoCli(args: string[]): Promise<void> {
  const options = parseCliArgs(args);

  if (options.command === "help") {
    printHelp();
    return;
  }

  const steno = new Steno(options.configPath, false);
  if (options.command === "dev") {
    await steno.dev();
    return;
  }

  await steno.build();
}
