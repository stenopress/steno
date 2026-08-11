/**
 * @steno/init/scaffold-theme - Scaffolds a starter Steno theme package.
 *
 * @module
 */

import { join } from "@std/path";
import { c, checkOverwrite, heading, paint } from "./onboarding.ts";

/** Options accepted by {@link scaffoldTheme}. */
export interface ThemeScaffoldOptions {
  /** Directory the theme is created in (default: `./<name>`). */
  targetDir?: string;
  /** Whether existing files may be overwritten. */
  force?: boolean;
}

function toIdentifier(name: string): string {
  const slug = name
    .replace(/[^a-zA-Z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .toLowerCase();
  return slug || "my-theme";
}

/**
 * Scaffolds a minimal, working Steno theme: a `mod.ts` exporting a
 * `StenoTheme`, one Tau layout, and one stylesheet — the same shape as
 * the bundled `@steno/theme-minimal` reference theme, so it's a real
 * starting point rather than a toy example.
 *
 * @throws {OnboardingError} if files already exist and `force` is not true.
 */
export function scaffoldTheme(name: string, options: ThemeScaffoldOptions = {}): void {
  const themeName = toIdentifier(name);
  const root = options.targetDir ?? join(Deno.cwd(), themeName);
  const modPath = join(root, "mod.ts");
  const denoJsonPath = join(root, "deno.json");
  const layoutPath = join(root, "layouts", "layout.tau");
  const stylePath = join(root, "assets", "style.css");
  const readmePath = join(root, "README.md");

  if (!options.force) {
    checkOverwrite([modPath, denoJsonPath, layoutPath, stylePath, readmePath]);
  }

  heading("Scaffolding theme");
  console.log();

  Deno.mkdirSync(join(root, "layouts"), { recursive: true });
  Deno.mkdirSync(join(root, "assets"), { recursive: true });

  Deno.writeTextFileSync(
    denoJsonPath,
    `{
  "name": "@you/theme-${themeName}",
  "version": "0.1.0",
  "exports": {
    ".": "./mod.ts"
  },
  "imports": {
    "@steno/steno": "jsr:@steno/steno@^0.11.2"
  }
}
`,
  );

  Deno.writeTextFileSync(
    modPath,
    `import type { StenoTheme } from "@steno/steno";

// fetch() works both for local files (file://) and once this theme is
// published and imported over jsr:/https:, so layouts and assets can stay
// in their own files instead of being inlined as strings here.
const layout = await fetch(new URL("./layouts/layout.tau", import.meta.url))
  .then((r) => r.text());

const theme: StenoTheme = {
  name: "${themeName}",
  version: "0.1.0",
  layouts: { layout },
  assets: {
    "style.css": new URL("./assets/style.css", import.meta.url),
  },
};

export default theme;
`,
  );

  Deno.writeTextFileSync(
    layoutPath,
    `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>{#if title}{ title }{:else}{ site.title }{/if}</title>
    {#if description}<meta name="description" content={description} />{/if}
    <link rel="stylesheet" href="/assets/{ assets?.['style.css'] }" />
  </head>
  <body>
    <header>
      <a href="/">{#if site.title}{ site.title }{:else}Home{/if}</a>
      {#if site.navigation}
        <nav>
          <ul>
            {#each site.navigation as item}
              <li><a href={item.url}>{ item.title }</a></li>
            {/each}
          </ul>
        </nav>
      {/if}
    </header>

    <main>
      {@html content}
    </main>

    <footer>
      <p>Built with Steno.</p>
    </footer>
  </body>
</html>
`,
  );

  Deno.writeTextFileSync(
    stylePath,
    `:root {
  color-scheme: light dark;
  font-family: system-ui, sans-serif;
}

body {
  max-width: 40rem;
  margin: 0 auto;
  padding: 2rem 1rem;
}
`,
  );

  Deno.writeTextFileSync(
    readmePath,
    `# ${themeName}

A Steno theme scaffolded with \`deno run -A jsr:@steno/init/create-theme\`.

## Structure

- \`mod.ts\` — the theme's entry point, exporting a \`StenoTheme\` object.
- \`layouts/layout.tau\` — the default page layout (Tau template syntax).
- \`assets/style.css\` — a stylesheet copied into every build's output.

## Use it in a site

Point a site's \`config.yml\` at this theme by local path while developing:

\`\`\`yaml
theme: ./${themeName}
\`\`\`

\`steno dev\` watches a local theme's directory and reloads on change.

Once published, reference it by package specifier instead, e.g.
\`theme: jsr:@you/theme-${themeName}\`.

## Learn more

- [Theme development guide](https://github.com/stenopress/steno/blob/main/docs/theme_development.md)
- [Theme specification](https://github.com/stenopress/steno/blob/main/docs/theme-specification.md)
- [Tau template syntax](https://github.com/stenopress/steno/blob/main/docs/tau_syntax.md)
`,
  );

  console.log(`  ${paint(c.green, "✔")} Theme    → ${paint(c.gray, root)}`);
  console.log();
  console.log(`${paint(c.purpleBold, "◆")} ${paint(c.whiteBold, "Theme scaffolded!")}`);
  console.log();
  console.log(`  Point a site at it: ${paint(c.cyanBold, `theme: ./${themeName}`)}`);
  console.log();
}
