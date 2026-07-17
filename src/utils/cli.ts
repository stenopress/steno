/** Parsed CLI state for a Steno invocation. */
export interface CliOptions {
  /** The command to execute. */
  command: "build" | "dev" | "doctor" | "help";
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
steno - static site generator

Usage:
  deno run -A jsr:@steno/steno [command] [options]

Commands:
  build                Build the site into dist/ (default)
  dev                  Start dev server with live reload
  doctor               Show runtime and native-engine diagnostics

Options:
  -c, --config <path>  Path to config file (default: content/.steno/config.yml)
  -h, --help           Show help

Examples:
  deno run -A jsr:@steno/steno build
  deno run -A jsr:@steno/steno dev
  deno run -A jsr:@steno/steno doctor
  deno run -A jsr:@steno/steno build --config content/.steno/config.yml
`);
}
