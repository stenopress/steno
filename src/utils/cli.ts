import { c } from "./output.ts";

/** Parsed CLI state for a Steno invocation. */
export interface CliOptions {
  /** The command to execute, either "build", "dev", "help", or "doctor". */
  command: "build" | "dev" | "help" | "doctor";
  /** The path to the configuration file. */
  configPath: string;
}

const defaultConfigPath = "content/.steno/config.yml";

/**
 * Parses command-line arguments and returns a structured object of CLI options.
 *
 * @param args An array of command-line arguments (e.g., `Deno.args`).
 * @returns An object containing the parsed command and configuration path.
 * @throws {Error} If an unknown option or command is encountered, or if a required value is missing.
 */
export function parseCliArgs(args: string[]): CliOptions {
  let command: CliOptions["command"] = "build";
  let configPath = defaultConfigPath;

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];

    if (arg === "-h" || arg === "--help") {
      return { command: "help", configPath };
    }

    if (arg === "-c" || arg === "--config") {
      const value = args[i + 1];
      if (!value || value.startsWith("-")) {
        throw new Error(
          "Missing value for --config. Example: --config content/.steno/config.yml",
        );
      }
      configPath = value;
      i++;
      continue;
    }

    if (arg === "build" || arg === "dev" || arg === "doctor") {
      command = arg;
      continue;
    }

    if (arg.startsWith("-")) {
      throw new Error(`Unknown option: ${arg}`);
    }

    throw new Error(`Unknown command: ${arg}`);
  }

  return { command, configPath };
}

/** Writes the CLI usage summary to stdout. */
export function printHelp(): void {
  console.log(`
${c.bold}steno${c.reset} - static site generator

${c.bold}Usage:${c.reset}
  deno x jsr:@steno/steno ${c.gray}[command] [options]${c.reset}

${c.bold}Commands:${c.reset}
  ${c.green}build${c.reset}                Build the site into dist/ ${c.gray}(default)${c.reset}
  ${c.green}dev${c.reset}                  Start dev server with live reload
  ${c.green}doctor${c.reset}               Check your project for common issues

${c.bold}Options:${c.reset}
  ${c.cyan}-c, --config${c.reset} ${c.gray}<path>${c.reset}  Path to config file ${c.gray}(default: content/.steno/config.yml)${c.reset}
  ${c.cyan}-h, --help${c.reset}           Show help

${c.bold}Examples:${c.reset}
  ${c.gray}deno x jsr:@steno/steno${c.reset}
  ${c.gray}deno x jsr:@steno/steno build${c.reset}
  ${c.gray}deno x jsr:@steno/steno dev${c.reset}
  ${c.gray}deno x jsr:@steno/steno doctor${c.reset}
  ${c.gray}deno x jsr:@steno/steno build --config content/.steno/config.yml${c.reset}
`);
}
