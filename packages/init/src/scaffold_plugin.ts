/**
 * @steno/init/scaffold-plugin - Scaffolds a starter Steno plugin package.
 *
 * @module
 */

import { join } from "@std/path";
import { c, checkOverwrite, heading, paint } from "./onboarding.ts";

/** Options accepted by {@link scaffoldPlugin}. */
export interface PluginScaffoldOptions {
  /** Directory the plugin is created in (default: `./<name>`). */
  targetDir?: string;
  /** Whether existing files may be overwritten. */
  force?: boolean;
}

function toIdentifier(name: string): string {
  const slug = name
    .replace(/[^a-zA-Z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .toLowerCase();
  return slug || "my-plugin";
}

function toCamelCase(value: string): string {
  return value.replace(/-([a-z0-9])/g, (_match, char) => char.toUpperCase());
}

function toPascalCase(value: string): string {
  const camel = toCamelCase(value);
  return camel.charAt(0).toUpperCase() + camel.slice(1);
}

/**
 * Scaffolds a minimal, working Steno plugin: a `mod.ts` default-exporting
 * a factory function that returns a `StenoPlugin`, plus a starter test —
 * this is exactly the shape `loadPlugins` expects. See the generated
 * README for how to point a site at it (a local plugin needs an absolute
 * `file://` URL and `pluginSourcePolicy.allowLocal: true`, unlike themes).
 *
 * @throws {OnboardingError} if files already exist and `force` is not true.
 */
export function scaffoldPlugin(
  name: string,
  options: PluginScaffoldOptions = {},
): void {
  const pluginName = toIdentifier(name);
  const factoryName = toCamelCase(pluginName);
  const optionsTypeName = `${toPascalCase(pluginName)}Options`;
  const root = options.targetDir ?? join(Deno.cwd(), pluginName);
  const modPath = join(root, "mod.ts");
  const testPath = join(root, "mod_test.ts");
  const denoJsonPath = join(root, "deno.json");
  const readmePath = join(root, "README.md");

  if (!options.force) {
    checkOverwrite([modPath, testPath, denoJsonPath, readmePath]);
  }

  heading("Scaffolding plugin");
  console.log();

  Deno.mkdirSync(root, { recursive: true });

  Deno.writeTextFileSync(
    denoJsonPath,
    `{
  "name": "@you/plugin-${pluginName}",
  "version": "0.1.0",
  "exports": {
    ".": "./mod.ts"
  },
  "imports": {
    "@steno/steno": "jsr:@steno/steno@^0.11.0",
    "@std/assert": "jsr:@std/assert@1"
  },
  "tasks": {
    "test": "deno test -A ./mod_test.ts"
  }
}
`,
  );

  Deno.writeTextFileSync(
    modPath,
    `import type { StenoPlugin } from "@steno/steno";

/** Options accepted by this plugin. */
export interface ${optionsTypeName} {
  /** Example option — replace with whatever this plugin actually needs. */
  example?: string;
}

/**
 * Creates the ${pluginName} plugin.
 *
 * Registered in a site's config.yml:
 *
 * \`\`\`yaml
 * plugins:
 *   - package: jsr:@you/plugin-${pluginName}
 *     # mode: isolated   # recommended for third-party plugins — runs this
 *                        # in a sandboxed subprocess instead of in-process
 * \`\`\`
 */
export default function ${factoryName}(
  options: ${optionsTypeName} = {},
): StenoPlugin {
  return {
    name: "${pluginName}",

    // Runs once before the build starts — good place to validate options.
    beforeBuild(_config) {
      void options.example;
    },

    // Transforms every page's rendered HTML. Must return a string — an
    // unvalidated non-string return here fails later in the build with no
    // reference back to this plugin, so keep this one honest.
    transformHtml(html) {
      return html;
    },
  };
}
`,
  );

  Deno.writeTextFileSync(
    testPath,
    `import { assertEquals } from "@std/assert";
import createPlugin from "./mod.ts";

Deno.test("${pluginName}: has a stable name", () => {
  const plugin = createPlugin();
  assertEquals(plugin.name, "${pluginName}");
});

Deno.test("${pluginName}: transformHtml returns a string unchanged by default", async () => {
  const plugin = createPlugin();
  const html = "<p>hello</p>";
  const result = await plugin.transformHtml?.(html);
  assertEquals(result, html);
});
`,
  );

  Deno.writeTextFileSync(
    readmePath,
    `# ${pluginName}

A Steno plugin scaffolded with \`deno run -A jsr:@steno/init/create-plugin\`.

## Use it in a site

Steno blocks bare relative plugin paths by default (only \`jsr:\`, \`npm:\`, and
\`https:\` specifiers are trusted out of the box). While developing locally,
point at this plugin with an absolute \`file://\` URL and opt in explicitly:

\`\`\`yaml
pluginSourcePolicy:
  allowLocal: true
plugins:
  - package: file:///absolute/path/to/${pluginName}/mod.ts
    # mode: isolated   # recommended once this is a third-party plugin
                        # rather than your own — runs it in a sandboxed
                        # subprocess with no filesystem/network access
                        # unless explicitly granted.
\`\`\`

Once published, drop \`pluginSourcePolicy\` and reference the package
specifier instead — no special config needed:

\`\`\`yaml
plugins:
  - package: jsr:@you/plugin-${pluginName}
\`\`\`

## Test

\`\`\`sh
deno task test
\`\`\`

## Learn more

- [Plugin development guide](https://github.com/stenopress/steno/blob/main/docs/plugins.md)
- [Plugin sandbox and threat model](https://github.com/stenopress/steno/blob/main/docs/plugin_sandbox.md)
`,
  );

  console.log(`  ${paint(c.green, "✔")} Plugin   → ${paint(c.gray, root)}`);
  console.log();
  console.log(
    `${paint(c.purpleBold, "◆")} ${paint(c.whiteBold, "Plugin scaffolded!")}`,
  );
  console.log();
  console.log(
    `  Point a site at it (see README.md for the full config):`,
  );
  console.log(
    `  ${paint(c.cyanBold, `plugins:\n    - package: file://${root}/mod.ts`)}`,
  );
  console.log();
}
