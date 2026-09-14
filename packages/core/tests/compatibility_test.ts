import { assertEquals } from "@std/assert";
import { registerConfigValidationTests } from "../src/config_validation_test.ts";
import { registerFrontmatterTests } from "../src/frontmatter_test.ts";
import { registerHeadTests } from "../src/head_test.ts";
import "../src/page_config_test.ts";
import { registerPathUtilsTests } from "../src/path_utils_test.ts";
import "../src/text_test.ts";

Deno.test("public api: Core export contract is intentional", async () => {
  const manifest = JSON.parse(
    await Deno.readTextFile(new URL("../deno.json", import.meta.url)),
  ) as { exports: Record<string, string> };
  const contracts: Record<string, string[]> = {
    ".": [
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
    ],
    "./assets": ["copyThemeAssets"],
    "./collections": [
      "Collection",
      "CollectionItem",
      "CollectionMap",
      "MarkdownPage",
      "MarkdownPageCache",
      "buildCollections",
      "collectMarkdownPages",
    ],
    "./concurrency": ["mapWithConcurrency"],
    "./config": ["resolveShortUrls"],
    "./config-validation": ["validateSiteConfig"],
    "./diagnostics": [
      "Diagnostic",
      "DiagnosticBag",
      "StenoDiagnosticError",
      "enforceDiagnostics",
      "formatDiagnostic",
      "printDiagnostics",
    ],
    "./frontmatter": ["parseFrontmatter"],
    "./fs": ["ensureParentDirSync", "fileExists", "fileExistsSync", "isPathInsideOrEqual"],
    "./head": ["injectHeadTags", "mergeHeadTags", "renderHeadTags", "validateHeadTags"],
    "./isolated-plugin": [
      "disposeIsolatedPlugins",
      "getIsolatedPluginSignature",
      "loadIsolatedPlugin",
    ],
    "./isolated-protocol": [
      "ISOLATED_PLUGIN_PROTOCOL_VERSION",
      "IsolatedPluginHook",
      "IsolatedPluginRequest",
      "IsolatedPluginResponse",
      "readProtocolLines",
    ],
    "./isolated-worker": ["errorResponse", "handleRequest"],
    "./page-config": ["resolvePageConfigOverrides"],
    "./paths": [
      "PageRoute",
      "RoutablePage",
      "STENO_DIR",
      "commonAncestorDir",
      "humanizeSegment",
      "inferPageTitle",
      "isPathInsideOrEqual",
      "resolveMarkdownScanIgnorePaths",
      "resolvePageOutputPath",
      "resolvePageRoute",
      "resolvePublicDir",
    ],
    "./plugins": ["StenoPlugin", "isStenoPlugin", "runAstTransforms", "runHtmlTransforms"],
    "./render": ["PageContextOptions", "createPageContext", "renderMarkdown", "renderPage"],
    "./template": [
      "FilterFunction",
      "TauCacheStats",
      "TauLimits",
      "TauOptions",
      "clearTauCache",
      "filters",
      "getTauCacheStats",
      "render",
    ],
    "./text": [
      "errorMessage",
      "hasControlCharacters",
      "hashContent",
      "isRecord",
      "minifyCss",
      "minifyHtml",
      "utf8ByteLength",
    ],
    "./theme": [
      "BundledThemeSources",
      "LoadedDirectoryTheme",
      "PageRenderContext",
      "Theme",
      "ThemeConfig",
      "ThemeDirectoryMetadata",
      "bundledThemeLocalPath",
      "mergeTheme",
    ],
    "./theme-config": ["ThemeConfig", "resolveSchemaDefaults", "validateThemeConfig"],
    "./theme-functions": ["loadThemeFunctions", "validateThemeFunctions"],
    "./types": [
      "CollectionConfig",
      "CollectionFieldSchema",
      "GeneratedPage",
      "HeadTag",
      "HeadTagBase",
      "IsolatedPluginPermissions",
      "LinkHeadTag",
      "MarkdownToken",
      "MarkdownTokens",
      "MetaHeadTag",
      "NavigationNode",
      "PageConfigOverrides",
      "PluginEntry",
      "PluginSecurityConfig",
      "PluginSourcePolicy",
      "ScriptHeadTag",
      "SiteConfig",
      "StenoHooks",
      "StenoPlugin",
      "StenoTheme",
      "ThemeConfigField",
    ],
  };

  assertEquals(Object.keys(manifest.exports).sort(), Object.keys(contracts).sort());

  for (const [entrypoint, expectedSymbols] of Object.entries(contracts)) {
    const modulePath = new URL(`../${manifest.exports[entrypoint].slice(2)}`, import.meta.url);
    const output = await new Deno.Command(Deno.execPath(), {
      args: ["doc", "--json", modulePath.href],
    }).output();

    assertEquals(output.success, true, entrypoint);

    const document = JSON.parse(new TextDecoder().decode(output.stdout)) as {
      nodes: Record<string, { symbols: { name: string }[] }>;
    };
    const module = Object.values(document.nodes)[0];
    assertEquals(module.symbols.map(({ name }) => name).sort(), expectedSymbols.sort(), entrypoint);
  }
});

registerFrontmatterTests();
registerConfigValidationTests();
registerHeadTests();
registerPathUtilsTests();
