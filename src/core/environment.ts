import { join } from "@std/path";

export type StenoEnvironment = "development" | "production";

/** Returns dotenv files from lowest to highest precedence. */
export function getEnvironmentFilePaths(
  rootDir: string,
  environment: StenoEnvironment,
): string[] {
  return [
    join(rootDir, ".env"),
    join(rootDir, ".env.local"),
    join(rootDir, `.env.${environment}`),
    join(rootDir, `.env.${environment}.local`),
  ];
}

function parseQuotedValue(value: string, quote: string): string {
  const closing = value.lastIndexOf(quote);
  if (closing <= 0) throw new Error("unterminated quoted value");
  const content = value.slice(1, closing);
  return quote === '"'
    ? content.replace(/\\n/g, "\n").replace(/\\r/g, "\r").replace(
      /\\t/g,
      "\t",
    ).replace(/\\"/g, '"').replace(/\\\\/g, "\\")
    : content;
}

/** Parses a dotenv document without changing process-global environment. */
export function parseEnvironmentFile(
  source: string,
  filePath = ".env",
): Record<string, string> {
  const values: Record<string, string> = {};
  for (const [index, rawLine] of source.split(/\r?\n/).entries()) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) continue;
    const normalized = line.startsWith("export ")
      ? line.slice("export ".length).trimStart()
      : line;
    const separator = normalized.indexOf("=");
    if (separator < 1) {
      throw new Error(
        `Invalid dotenv entry in "${filePath}" at line ${index + 1}.`,
      );
    }
    const key = normalized.slice(0, separator).trim();
    if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(key)) {
      throw new Error(
        `Invalid dotenv key "${key}" in "${filePath}" at line ${index + 1}.`,
      );
    }
    const rawValue = normalized.slice(separator + 1).trim();
    try {
      values[key] = rawValue.startsWith('"') || rawValue.startsWith("'")
        ? parseQuotedValue(rawValue, rawValue[0])
        : rawValue.replace(/\s+#.*$/, "").trimEnd();
    } catch (error) {
      throw new Error(
        `Invalid dotenv value for "${key}" in "${filePath}" at line ${
          index + 1
        }: ${error instanceof Error ? error.message : String(error)}.`,
      );
    }
  }
  return values;
}

/** Loads layered dotenv values. Existing process variables always win. */
export function loadEnvironmentFiles(
  rootDir: string,
  environment: StenoEnvironment,
): Record<string, string> {
  const values: Record<string, string> = {};
  for (const filePath of getEnvironmentFilePaths(rootDir, environment)) {
    try {
      Object.assign(
        values,
        parseEnvironmentFile(Deno.readTextFileSync(filePath), filePath),
      );
    } catch (error) {
      if (error instanceof Deno.errors.NotFound) continue;
      throw error;
    }
  }

  try {
    for (const key of Object.keys(values)) {
      const processValue = Deno.env.get(key);
      if (processValue !== undefined) values[key] = processValue;
    }
  } catch {
    // File values still work when environment permission is unavailable.
  }
  return values;
}
