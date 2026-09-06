import type { StenoPlugin } from "../types.ts";

/** Module content revisions are separate from hook text and factory options. */
export const pluginSourceRevisions = new WeakMap<StenoPlugin, string>();
