import type { SiteConfig } from "../../types.ts";

export function getPublicEnvVars(
  fileValues: Record<string, string> = {},
): Record<string, string> {
  const publicVars: Record<string, string> = Object.fromEntries(
    Object.entries(fileValues).filter(([key]) => key.startsWith("PUBLIC_")),
  );
  try {
    for (const [key, value] of Object.entries(Deno.env.toObject())) {
      if (key.startsWith("PUBLIC_")) {
        publicVars[key] = value;
      }
    }
  } catch {
    // Gracefully ignore NotCapable / PermissionDenied errors in sandboxed runs
  }
  return publicVars;
}

export function resolveConfigGlobals(
  config: SiteConfig,
): Record<string, unknown> {
  const globals = config.custom?.globals;
  if (globals === undefined) return {};
  if (!globals || typeof globals !== "object" || Array.isArray(globals)) {
    throw new Error("Invalid `custom.globals` in config: expected an object.");
  }
  return globals;
}
