import type { SiteConfig, StenoHooks, StenoPlugin } from "../../types.ts";
import type { Theme } from "../../theme/theme.ts";
import type { MarkdownPage, MarkdownPageCache } from "../collections.ts";

export type BuildContext = {
  config: SiteConfig;
  theme?: Theme;
  plugins: StenoPlugin[];
  hooks: StenoHooks;
  state?: BuildState;
  pages?: MarkdownPage[];
  dev?: boolean;
  environment?: Record<string, string>;
  /** Prints theme/plugin diagnostics and each rendered page's template context. */
  verbose?: boolean;
};

export interface BuildState {
  signature: string | null;
  pages: Map<string, BuildStateEntry>;
  /**
   * Reused across rebuilds (e.g. by the dev server) so `collectMarkdownPages`
   * can skip re-reading and re-parsing files whose mtime hasn't changed.
   */
  pageCache?: MarkdownPageCache;
}

export interface BuildStateEntry {
  relPath: string;
  outputPath: string;
  sourceText: string;
  body?: string;
  htmlContent?: string;
  /** Theme assets manifest that was in effect when `htmlContent` was rendered. */
  assetsSignature?: string;
  /** Serialized `collections` map in effect when `htmlContent` was rendered. */
  collectionsSignature?: string;
}
