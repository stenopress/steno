import { filters as tauFilters, render as renderTau } from "@steno/tau";
import type { FilterFunction, TauOptions } from "@steno/tau";
import { marked } from "marked";

export { clearTauCache, getTauCacheStats } from "@steno/tau";
export type { FilterFunction, TauCacheStats, TauLimits, TauOptions } from "@steno/tau";

/** Steno-compatible filters, including the shared Markdown integration. */
export const filters: Record<string, FilterFunction> = Object.assign(
  Object.create(null),
  tauFilters,
  {
    markdown_inline: (val: unknown) => marked.parseInline(String(val ?? ""), { async: false }),
  },
);

/** Renders a template with the content engine's filters and scoped theme functions. */
export function render(options: TauOptions): Promise<string> {
  return renderTau(options, filters);
}
