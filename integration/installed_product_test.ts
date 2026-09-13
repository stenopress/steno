import { assert, assertEquals, assertStringIncludes } from "@std/assert";
import { dirname, fromFileUrl, join, relative, toFileUrl } from "@std/path";

// This suite does not exercise the repository checkout directly. It
// simulates the exact file set `deno publish` would ship (via
// `deno publish --dry-run`), materializes only those files into a clean
// temporary directory, and runs the CLI from *that* copy. A bug where
// `publish.exclude` in deno.json accidentally drops a runtime file, or a
// theme/plugin's dynamic import can't resolve outside the source tree,
// would pass every other test in this repository yet break real installs -
// this is the test that would catch it.

const integrationDir = dirname(fromFileUrl(import.meta.url));
const repositoryRoot = dirname(integrationDir);
const decoder = new TextDecoder();
const useRegistry = Deno.env.get("STENO_TEST_REGISTRY") === "1";

/**
 * Runs `deno publish --dry-run` against the real repository and returns the
 * absolute paths of every file it says would be published. Requires
 * `--allow-dirty` because this suite may run against an uncommitted working
 * tree (e.g. mid-review, in CI on a PR branch before squash).
 */
async function publishedFileManifest(packageRoot = repositoryRoot): Promise<string[]> {
  const result = await new Deno.Command(Deno.execPath(), {
    args: ["publish", "--dry-run", "--allow-dirty"],
    cwd: packageRoot,
    stdout: "piped",
    stderr: "piped",
  }).output();
  const output = decoder.decode(result.stdout) + decoder.decode(result.stderr);
  assertEquals(result.success, true, output);

  const files = [...output.matchAll(/^\s+file:\/\/(\S+) \(/gm)].map((match) =>
    fromFileUrl(`file://${match[1]}`),
  );
  assert(
    files.length > 2,
    `expected a substantial published file list, got ${files.length}:\n${output}`,
  );
  return files;
}

/** Installs only publishable files from each package into clean sibling directories.
 * Local links substitute for the unpublished registry versions during extraction. */
async function materializeInstalledCopy(files: string[]): Promise<string> {
  const installRoot = await Deno.makeTempDir({ prefix: "steno-installed-" });
  const packages = [
    { name: "steno", root: repositoryRoot, files },
    ...(await Promise.all(
      (useRegistry ? [] : ["core", "tau"]).map(async (name) => {
        const root = dirname(fromFileUrl(import.meta.resolve(`@steno/${name}`)));
        return { name, root, files: await publishedFileManifest(root) };
      }),
    )),
    ...(await Promise.all(
      ["theme-minimal", "theme-docs-minimal", "theme-marketing-minimal"].map(async (name) => {
        const root = join(repositoryRoot, "packages", name);
        return { name, root, files: await publishedFileManifest(root) };
      }),
    )),
  ];
  for (const pkg of packages) {
    for (const file of pkg.files) {
      const rel = relative(pkg.root, file);
      assert(!rel.startsWith(".."), `manifest includes a file outside ${pkg.name}: ${file}`);
      const packageDir = pkg.name === "core" ? join("steno", "packages", "core") : pkg.name;
      const dest = join(installRoot, packageDir, rel);
      await Deno.mkdir(dirname(dest), { recursive: true });
      await Deno.copyFile(file, dest);
    }
  }
  if (useRegistry) {
    const configPath = join(installRoot, "steno", "deno.json");
    const config = JSON.parse(await Deno.readTextFile(configPath));
    delete config.links;
    delete config.workspace;
    config.minimumDependencyAge = {
      age: "P1D",
      exclude: ["jsr:@steno/core", "jsr:@steno/tau"],
    };
    await Deno.writeTextFile(configPath, JSON.stringify(config));
  }
  return join(installRoot, "steno");
}

interface FixtureOptions {
  theme?: string;
}

async function createFixture(options: FixtureOptions = {}): Promise<string> {
  const root = await Deno.makeTempDir({ prefix: "steno-installed-site-" });
  const contentDir = join(root, "content");
  await Deno.mkdir(join(contentDir, ".steno"), { recursive: true });
  const theme = options.theme ? `custom:\n  theme: "${options.theme}"\n` : "";
  await Deno.writeTextFile(
    join(contentDir, ".steno", "config.yml"),
    `title: "Installed product check"
description: "Verifies the published package, not the source checkout"
author: "Steno"
contentDir: "content"
output: "dist"
${theme}`,
  );
  await Deno.writeTextFile(
    join(contentDir, "index.md"),
    `---\ntitle: Home\nlayout: layout\n---\n\n# Installed build works\n`,
  );
  return root;
}

async function runCli(installDir: string, siteRoot: string, args: string[]): Promise<string> {
  const result = await new Deno.Command(Deno.execPath(), {
    args: ["run", "-A", join(installDir, "mod.ts"), ...args],
    cwd: siteRoot,
    env: useRegistry ? { DENO_DIR: join(dirname(installDir), "deno-cache") } : undefined,
    stdout: "piped",
    stderr: "piped",
  }).output();
  const output = decoder.decode(result.stdout) + decoder.decode(result.stderr);
  assertEquals(result.success, true, output);
  return output;
}

async function removeDir(path: string): Promise<void> {
  await Deno.remove(path, { recursive: true });
}

let cachedInstallDir: string | undefined;

/** The manifest and copy are expensive (a real `deno publish --dry-run`
 * plus a full file copy) and identical for every test below, so build it
 * once per test run instead of once per test. */
async function installedCopy(): Promise<string> {
  if (!cachedInstallDir) {
    const files = await publishedFileManifest();

    // The exact regression this suite exists to catch: verify the
    // manifest still contains every runtime file the CLI needs, and none
    // of the contributor-only/tooling files that shouldn't ship.
    const relPaths = files.map((file) => relative(repositoryRoot, file));
    for (const required of ["mod.ts", "deno.json", "src/core/steno_cli.ts", "src/theme/theme.ts"]) {
      assert(
        relPaths.includes(required),
        `published manifest is missing required runtime file: ${required}`,
      );
    }
    for (const forbidden of [
      ".claude/launch.json",
      ".devcontainer/devcontainer.json",
      "CONTRIBUTING.md",
      "CODE_OF_CONDUCT.md",
    ]) {
      assert(
        !relPaths.includes(forbidden),
        `published manifest unexpectedly includes ${forbidden}`,
      );
    }

    cachedInstallDir = await materializeInstalledCopy(files);
  }
  return cachedInstallDir;
}

Deno.test({
  name: "installed product: `build` succeeds from the published file set alone",
  permissions: { env: true, read: true, run: true, write: true },
  fn: async () => {
    const installDir = await installedCopy();
    const site = await createFixture();
    try {
      await runCli(installDir, site, ["build", "--config", "content/.steno/config.yml"]);
      const html = await Deno.readTextFile(join(site, "dist", "index.html"));
      assertStringIncludes(html, "Installed build works");
    } finally {
      await removeDir(site);
    }
  },
});

Deno.test({
  name: "installed product: `doctor` succeeds from the published file set alone",
  permissions: { env: true, read: true, run: true, write: true },
  fn: async () => {
    const installDir = await installedCopy();
    const site = await createFixture();
    try {
      const output = await runCli(installDir, site, [
        "doctor",
        "--config",
        "content/.steno/config.yml",
      ]);
      assertStringIncludes(output.toLowerCase(), "all checks passed");
    } finally {
      await removeDir(site);
    }
  },
});

Deno.test({
  name: "installed product: isolated plugin worker resolves from the Core package",
  permissions: { env: true, read: true, run: true, write: true },
  fn: async () => {
    const installDir = await installedCopy();
    const site = await createFixture();
    try {
      const pluginPath = join(site, "plugin.ts");
      await Deno.writeTextFile(
        pluginPath,
        `export default () => ({ name: "installed-isolated", transformHtml: (html: string) => html + "<p>Isolated Core worker</p>" });`,
      );
      await Deno.writeTextFile(
        join(site, "content/.steno/config.yml"),
        `pluginSourcePolicy:\n  allowLocal: true\nplugins:\n  - package: "${toFileUrl(pluginPath).href}"\n    mode: isolated\n`,
        { append: true },
      );
      await runCli(installDir, site, ["build", "--config", "content/.steno/config.yml"]);
      assertStringIncludes(
        await Deno.readTextFile(join(site, "dist/index.html")),
        "<p>Isolated Core worker</p>",
      );
    } finally {
      await removeDir(site);
    }
  },
});

for (const theme of ["theme-minimal", "theme-docs-minimal", "theme-marketing-minimal"]) {
  Deno.test({
    name: `installed product: bundled ${theme} builds against the published package`,
    permissions: { env: true, read: true, run: true, write: true },
    fn: async () => {
      const installDir = await installedCopy();
      const site = await createFixture({
        theme: toFileUrl(join(dirname(installDir), theme, "mod.ts")).href,
      });
      try {
        await runCli(installDir, site, ["build", "--config", "content/.steno/config.yml"]);
        const html = await Deno.readTextFile(join(site, "dist", "index.html"));
        assertStringIncludes(html, "Installed build works");
      } finally {
        await removeDir(site);
      }
    },
  });
}
