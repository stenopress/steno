import { c } from "./output.ts";

/** Parsed CLI state for a Steno invocation. */
export interface CliOptions {
  /** The command to execute, either "build", "dev", "preview", "help", or "doctor". */
  command: "build" | "dev" | "preview" | "help" | "doctor";
  /** The path to the configuration file. */
  configPath: string;
  port?: number;
  /** Whether to print diagnostic build/render detail (theme, plugins, per-page template context). */
  verbose: boolean;
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
  let port: number | undefined;
  let verbose = false;

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];

    if (arg === "-h" || arg === "--help") {
      return { command: "help", configPath, verbose };
    }

    if (arg === "-V" || arg === "--verbose") {
      verbose = true;
      continue;
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

    if (arg === "-p" || arg === "--port") {
      const value = args[i + 1];
      const parsedPort = Number(value);

      if (
        !value ||
        !Number.isInteger(parsedPort) ||
        parsedPort < 1 ||
        parsedPort > 65535
      ) {
        throw new Error(
          "Invalid --port value. Expected an integer between 1 and 65535.",
        );
      }

      port = parsedPort;
      i++;
      continue;
    }

    if (
      arg === "build" || arg === "dev" || arg === "doctor" || arg === "help" ||
      arg === "preview"
    ) {
      command = arg;
      continue;
    }

    if (arg.startsWith("-")) {
      throw new Error(`Unknown option: ${arg}`);
    }

    throw new Error(`Unknown command: ${arg}`);
  }

  return port === undefined
    ? { command, configPath, verbose }
    : { command, configPath, port, verbose };
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
  ${c.green}preview${c.reset}              Preview the site locally
  ${c.green}help${c.reset}                 Show this help message

${c.bold}Options:${c.reset}
  ${c.cyan}-c, --config${c.reset} ${c.gray}<path>${c.reset}  Path to config file ${c.gray}(default: content/.steno/config.yml)${c.reset}
  ${c.cyan}-h, --help${c.reset}           Show help
  ${c.cyan}-p, --port${c.reset} ${c.gray}<number>${c.reset} Port to run preview server on ${c.gray}(default: 4173)${c.reset}
  ${c.cyan}-V, --verbose${c.reset}        Print theme/plugin diagnostics and each rendered
                       page's template context ${c.gray}(build, dev)${c.reset}

${c.bold}Examples:${c.reset}
  ${c.gray}deno x jsr:@steno/steno${c.reset}
  ${c.gray}deno x jsr:@steno/steno build${c.reset}
  ${c.gray}deno x jsr:@steno/steno dev${c.reset}
  ${c.gray}deno x jsr:@steno/steno doctor${c.reset}
  ${c.gray}deno x jsr:@steno/steno preview${c.reset}
  ${c.gray}deno x jsr:@steno/steno build --config content/.steno/config.yml${c.reset}
  ${c.gray}deno x jsr:@steno/steno build --verbose${c.reset}
`);
}
