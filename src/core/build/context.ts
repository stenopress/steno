import type { SiteConfig, StenoHooks, StenoPlugin } from "../../types.ts";
import type { Theme } from "../../theme/theme.ts";
import type { MarkdownPage } from "../collections.ts";

export type BuildContext = {
  config: SiteConfig;
  theme?: Theme;
  plugins: StenoPlugin[];
  hooks: StenoHooks;
  state?: BuildState;
  pages?: MarkdownPage[];
  dev?: boolean;
};

export interface BuildState {
  signature: string | null;
  pages: Map<string, BuildStateEntry>;
}

export interface BuildStateEntry {
  relPath: string;
  outputPath: string;
  sourceText: string;
  body?: string;
  htmlContent?: string;
}
