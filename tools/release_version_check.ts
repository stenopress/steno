import { dirname, fromFileUrl, join } from "@std/path";

type Manifest = {
  name?: unknown;
  version?: unknown;
  imports?: Record<string, unknown>;
};

export type ReleaseVersions = {
  steno: string;
  core: string;
  tau: string;
};

const themeNames = ["minimal", "docs-minimal", "marketing-minimal"] as const;

function path(root: string, relativePath: string): string {
  return join(root, relativePath);
}

async function readManifest(
  root: string,
  relativePath: string,
  failures: string[],
): Promise<Manifest> {
  try {
    return JSON.parse(await Deno.readTextFile(path(root, relativePath))) as Manifest;
  } catch (error) {
    failures.push(`${relativePath}: could not read a JSON manifest (${String(error)})`);
    return {};
  }
}

async function readText(root: string, relativePath: string, failures: string[]): Promise<string> {
  try {
    return await Deno.readTextFile(path(root, relativePath));
  } catch (error) {
    failures.push(`${relativePath}: could not be read (${String(error)})`);
    return "";
  }
}

function expectEqual(
  failures: string[],
  location: string,
  expected: unknown,
  actual: unknown,
): void {
  if (actual !== expected) {
    failures.push(
      `${location}: expected ${JSON.stringify(expected)}, found ${JSON.stringify(actual)}`,
    );
  }
}

function expectIncludes(
  failures: string[],
  relativePath: string,
  text: string,
  expected: string,
): void {
  if (!text.includes(expected)) {
    failures.push(`${relativePath}: expected to contain ${JSON.stringify(expected)}`);
  }
}

function expectOnlyVersions(
  failures: string[],
  relativePath: string,
  text: string,
  pattern: RegExp,
  expected: string,
): void {
  for (const match of text.matchAll(pattern)) {
    if (match[1] !== expected) {
      failures.push(
        `${relativePath}: expected version ${expected} in ${JSON.stringify(match[0])}, found ${
          match[1]
        }`,
      );
    }
  }
}

function activeLine(stenoVersion: string): string | undefined {
  const match = /^(\d+)\.(\d+)\.\d+(?:-[0-9A-Za-z.-]+)?$/.exec(stenoVersion);
  return match ? `| v${match[1]}.${match[2]}.x   | Yes` : undefined;
}

/**
 * Checks the first-party release graph rooted at `root`.
 *
 * Steno and Core versions come from their respective manifests. Tau is supplied
 * because it is released from a separate repository.
 */
export async function checkReleaseVersions(root: string, tauVersion: string): Promise<string[]> {
  const failures: string[] = [];
  const stenoManifest = await readManifest(root, "deno.json", failures);
  const coreManifest = await readManifest(root, "packages/core/deno.json", failures);
  const steno = stenoManifest.version;
  const core = coreManifest.version;

  if (typeof steno !== "string" || typeof core !== "string") {
    if (typeof steno !== "string") failures.push("deno.json version: expected a string");
    if (typeof core !== "string") {
      failures.push("packages/core/deno.json version: expected a string");
    }
    return failures;
  }

  const versions: ReleaseVersions = { steno, core, tau: tauVersion };
  const rootImports = stenoManifest.imports ?? {};
  const coreImports = coreManifest.imports ?? {};
  expectEqual(
    failures,
    "deno.json imports.@steno/core",
    `jsr:@steno/core@${versions.core}`,
    rootImports["@steno/core"],
  );
  expectEqual(
    failures,
    "deno.json imports.@steno/tau",
    `jsr:@steno/tau@${versions.tau}`,
    rootImports["@steno/tau"],
  );
  expectEqual(
    failures,
    "packages/core/deno.json imports.@steno/tau",
    `jsr:@steno/tau@${versions.tau}`,
    coreImports["@steno/tau"],
  );

  const initManifest = await readManifest(root, "packages/init/deno.json", failures);
  expectEqual(failures, "packages/init/deno.json version", versions.steno, initManifest.version);

  for (const themeName of themeNames) {
    const packageRoot = `packages/theme-${themeName}`;
    const manifestPath = `${packageRoot}/deno.json`;
    const manifest = await readManifest(root, manifestPath, failures);
    expectEqual(failures, `${manifestPath} version`, versions.steno, manifest.version);
    expectEqual(
      failures,
      `${manifestPath} imports.@steno/steno`,
      `jsr:@steno/steno@^${versions.steno}`,
      manifest.imports?.["@steno/steno"],
    );

    const modPath = `${packageRoot}/mod.ts`;
    const readmePath = `${packageRoot}/README.md`;
    expectIncludes(
      failures,
      modPath,
      await readText(root, modPath, failures),
      `version: "${versions.steno}"`,
    );
    const readme = await readText(root, readmePath, failures);
    expectOnlyVersions(
      failures,
      readmePath,
      readme,
      /jsr:@steno\/theme-[\w-]+@\^([0-9]+\.[0-9]+\.[0-9]+(?:-[0-9A-Za-z.-]+)?)/g,
      versions.steno,
    );
  }

  const coreReadme = await readText(root, "packages/core/README.md", failures);
  expectOnlyVersions(
    failures,
    "packages/core/README.md",
    coreReadme,
    /jsr:@steno\/core@([0-9]+\.[0-9]+\.[0-9]+(?:-[0-9A-Za-z.-]+)?)/g,
    versions.core,
  );

  const initExpectations = [
    {
      path: "packages/init/src/onboarding.ts",
      values: [
        `const DEFAULT_STENO_VERSION = "^${versions.steno}";`,
        `const DEFAULT_THEME_VERSION = "^${versions.steno}";`,
      ],
    },
    {
      path: "packages/init/src/create.ts",
      values: [`default: ^${versions.steno}`],
    },
    {
      path: "packages/init/src/scaffold_plugin.ts",
      values: [`jsr:@steno/steno@^${versions.steno}`],
    },
    {
      path: "packages/init/src/scaffold_theme.ts",
      values: [`jsr:@steno/steno@^${versions.steno}`],
    },
    {
      path: "packages/init/README.md",
      values: [`@steno/steno\` to \`^${versions.steno}\``, `themes to \`^${versions.steno}\``],
    },
    {
      path: "packages/init/test.ts",
      values: [`jsr:@steno/steno@^${versions.steno}`],
    },
    {
      path: "packages/init/smoke_test.ts",
      values: [
        `jsr:@steno/steno@^${versions.steno}`,
        `jsr:@steno/theme-\${theme}@^${versions.steno}`,
      ],
    },
  ];
  for (const expectation of initExpectations) {
    const text = await readText(root, expectation.path, failures);
    for (const expected of expectation.values) {
      expectIncludes(failures, expectation.path, text, expected);
    }
  }

  const security = await readText(root, "SECURITY.md", failures);
  const expectedActiveLine = activeLine(versions.steno);
  if (expectedActiveLine === undefined) {
    failures.push(`deno.json version: ${JSON.stringify(versions.steno)} is not a semantic version`);
  } else {
    expectIncludes(failures, "SECURITY.md", security, expectedActiveLine);
  }

  return failures;
}

if (import.meta.main) {
  const [tauVersion] = Deno.args;
  if (Deno.args.length !== 1 || !tauVersion) {
    throw new Error("Usage: deno run --allow-read tools/release_version_check.ts <tau-version>");
  }

  const root = dirname(dirname(fromFileUrl(import.meta.url)));
  const failures = await checkReleaseVersions(root, tauVersion);
  if (failures.length > 0) {
    throw new Error(
      `Release-version check failed:\n${failures.map((failure) => `- ${failure}`).join("\n")}`,
    );
  }
}
