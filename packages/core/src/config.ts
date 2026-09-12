import type { SiteConfig } from "./types.ts";

/** Resolves the public URL convention, retaining the legacy custom setting. */
export function resolveShortUrls(config: SiteConfig): boolean {
  return config.shortUrls ?? config.custom?.shortUrls ?? false;
}
