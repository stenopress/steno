import { registerFrontmatterTests } from "../src/frontmatter_test.ts";
import { registerConfigValidationTests } from "../src/config_validation_test.ts";
import { registerHeadTests } from "../src/head_test.ts";
import { registerPathUtilsTests } from "../src/path_utils_test.ts";
import { assertEquals } from "@std/assert";
import "../src/page_config_test.ts";
import "../src/text_test.ts";

Deno.test("public api: Core export contract is intentional", async () => {
  const manifest = JSON.parse(
    await Deno.readTextFile(new URL("../deno.json", import.meta.url)),
  ) as { exports: Record<string, string> };
  const output = await new Deno.Command(Deno.execPath(), {
    args: ["doc", "--json", new URL("../mod.ts", import.meta.url).pathname],
  }).output();

  assertEquals(Object.keys(manifest.exports).sort(), [
    ".",
    "./assets",
    "./collections",
    "./concurrency",
    "./config",
    "./config-validation",
    "./diagnostics",
    "./frontmatter",
    "./fs",
    "./head",
    "./isolated-plugin",
    "./isolated-protocol",
    "./isolated-worker",
    "./page-config",
    "./paths",
    "./plugins",
    "./render",
    "./template",
    "./text",
    "./theme",
    "./theme-config",
    "./theme-functions",
    "./types",
  ]);
  assertEquals(output.success, true);

  const document = JSON.parse(new TextDecoder().decode(output.stdout)) as {
    nodes: Record<string, { symbols: { name: string }[] }>;
  };
  const module = Object.values(document.nodes)[0];

  assertEquals(module.symbols.map(({ name }) => name).sort(), [
    "Collection",
    "CollectionConfig",
    "CollectionFieldSchema",
    "CollectionItem",
    "CollectionMap",
    "Diagnostic",
    "DiagnosticBag",
    "FilterFunction",
    "GeneratedPage",
    "HeadTag",
    "HeadTagBase",
    "IsolatedPluginPermissions",
    "LinkHeadTag",
    "MarkdownPage",
    "MarkdownPageCache",
    "MarkdownToken",
    "MarkdownTokens",
    "MetaHeadTag",
    "NavigationNode",
    "PageConfigOverrides",
    "PageContextOptions",
    "PageRenderContext",
    "PageRoute",
    "PluginEntry",
    "PluginSecurityConfig",
    "PluginSourcePolicy",
    "RoutablePage",
    "ScriptHeadTag",
    "SiteConfig",
    "StenoDiagnosticError",
    "StenoHooks",
    "StenoPlugin",
    "StenoTheme",
    "TauCacheStats",
    "TauLimits",
    "TauOptions",
    "Theme",
    "ThemeConfig",
    "ThemeConfigField",
    "buildCollections",
    "clearTauCache",
    "collectMarkdownPages",
    "createPageContext",
    "filters",
    "getTauCacheStats",
    "inferPageTitle",
    "isStenoPlugin",
    "mergeTheme",
    "parseFrontmatter",
    "render",
    "renderMarkdown",
    "renderPage",
    "resolvePageRoute",
    "runHtmlTransforms",
    "validateSiteConfig",
  ]);
});

registerFrontmatterTests();
registerConfigValidationTests();
registerHeadTests();
registerPathUtilsTests();
