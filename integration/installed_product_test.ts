import { assert, assertEquals, assertStringIncludes } from "@std/assert";
import { dirname, fromFileUrl, join, relative } from "@std/path";

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

/**
 * Runs `deno publish --dry-run` against the real repository and returns the
 * absolute paths of every file it says would be published. Requires
 * `--allow-dirty` because this suite may run against an uncommitted working
 * tree (e.g. mid-review, in CI on a PR branch before squash).
 */
async function publishedFileManifest(): Promise<string[]> {
  const result = await new Deno.Command(Deno.execPath(), {
    args: ["publish", "--dry-run", "--allow-dirty"],
    cwd: repositoryRoot,
    stdout: "piped",
    stderr: "piped",
  }).output();
  const output = decoder.decode(result.stdout) + decoder.decode(result.stderr);
  assertEquals(result.success, true, output);

  const files = [...output.matchAll(/file:\/\/(\S+)/g)]
    .map((match) => decodeURIComponent(match[1]));
  assert(
    files.length > 10,
    `expected a substantial published file list, got ${files.length}:\n${output}`,
  );
  return files;
}

/** Copies exactly `files` (absolute paths under `repositoryRoot`) into a
 * fresh temp directory, preserving their relative layout. */
async function materializeInstalledCopy(files: string[]): Promise<string> {
  const installDir = await Deno.makeTempDir({ prefix: "steno-installed-" });
  for (const file of files) {
    const rel = relative(repositoryRoot, file);
    const dest = join(installDir, rel);
    await Deno.mkdir(dirname(dest), { recursive: true });
    await Deno.copyFile(file, dest);
  }
  return installDir;
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

async function runCli(
  installDir: string,
  siteRoot: string,
  args: string[],
): Promise<string> {
  const result = await new Deno.Command(Deno.execPath(), {
    args: ["run", "-A", join(installDir, "mod.ts"), ...args],
    cwd: siteRoot,
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
    for (
      const required of [
        "mod.ts",
        "deno.json",
        "src/core/steno_cli.ts",
        "src/theme/theme.ts",
      ]
    ) {
      assert(
        relPaths.includes(required),
        `published manifest is missing required runtime file: ${required}`,
      );
    }
    for (
      const forbidden of [
        ".claude/launch.json",
        ".devcontainer/devcontainer.json",
        "CONTRIBUTING.md",
        "CODE_OF_CONDUCT.md",
      ]
    ) {
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
      await runCli(installDir, site, [
        "build",
        "--config",
        "content/.steno/config.yml",
      ]);
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

for (
  const theme of ["theme-minimal", "theme-docs-minimal", "theme-marketing-minimal"]
) {
  Deno.test({
    name: `installed product: bundled ${theme} builds against the published package`,
    permissions: { env: true, read: true, run: true, write: true },
    fn: async () => {
      const installDir = await installedCopy();
      const site = await createFixture({
        theme: join(repositoryRoot, "packages", theme),
      });
      try {
        await runCli(installDir, site, [
          "build",
          "--config",
          "content/.steno/config.yml",
        ]);
        const html = await Deno.readTextFile(join(site, "dist", "index.html"));
        assertStringIncludes(html, "Installed build works");
      } finally {
        await removeDir(site);
      }
    },
  });
}
