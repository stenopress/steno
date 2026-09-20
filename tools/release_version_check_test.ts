import { assertEquals, assertStringIncludes } from "@std/assert";
import { join } from "@std/path";
import { checkReleaseVersions } from "./release_version_check.ts";

const stenoVersion = "0.13.0";
const coreVersion = "0.1.0";
const tauVersion = "0.9.0";
const themeNames = ["minimal", "docs-minimal", "marketing-minimal"];

async function writeFixture(root: string): Promise<void> {
  async function write(relativePath: string, text: string): Promise<void> {
    const destination = join(root, relativePath);
    await Deno.mkdir(join(destination, ".."), { recursive: true });
    await Deno.writeTextFile(destination, text);
  }

  await write(
    "deno.json",
    JSON.stringify({
      name: "@steno/steno",
      version: stenoVersion,
      imports: {
        "@steno/core": `jsr:@steno/core@${coreVersion}`,
        "@steno/tau": `jsr:@steno/tau@${tauVersion}`,
      },
    }),
  );
  await write(
    "packages/core/deno.json",
    JSON.stringify({
      name: "@steno/core",
      version: coreVersion,
      imports: { "@steno/tau": `jsr:@steno/tau@${tauVersion}` },
    }),
  );
  await write("packages/core/README.md", `deno add jsr:@steno/core@${coreVersion}\n`);
  await write("packages/init/deno.json", JSON.stringify({ version: stenoVersion }));

  for (const themeName of themeNames) {
    const rootPath = `packages/theme-${themeName}`;
    await write(
      `${rootPath}/deno.json`,
      JSON.stringify({
        version: stenoVersion,
        imports: { "@steno/steno": `jsr:@steno/steno@^${stenoVersion}` },
        minimumDependencyAge: {
          age: "P1D",
          exclude: ["jsr:@steno/core", "jsr:@steno/steno", "jsr:@steno/tau"],
        },
      }),
    );
    await write(`${rootPath}/mod.ts`, `export default { version: "${stenoVersion}" };\n`);
    await write(`${rootPath}/README.md`, `theme: jsr:@steno/theme-${themeName}@^${stenoVersion}\n`);
  }

  await write(
    "packages/init/src/onboarding.ts",
    `const DEFAULT_STENO_VERSION = "^${stenoVersion}";\nconst DEFAULT_THEME_VERSION = "^${stenoVersion}";\n`,
  );
  await write("packages/init/src/create.ts", `default: ^${stenoVersion}\n`);
  await write("packages/init/src/scaffold_plugin.ts", `jsr:@steno/steno@^${stenoVersion}\n`);
  await write("packages/init/src/scaffold_theme.ts", `jsr:@steno/steno@^${stenoVersion}\n`);
  await write(
    "packages/init/README.md",
    `@steno/steno\` to \`^${stenoVersion}\` and themes to \`^${stenoVersion}\`\n`,
  );
  await write("packages/init/test.ts", `jsr:@steno/steno@^${stenoVersion}\n`);
  await write(
    "packages/init/smoke_test.ts",
    `jsr:@steno/steno@^${stenoVersion}\njsr:@steno/theme-\${theme}@^${stenoVersion}\n`,
  );
  await write(
    "SECURITY.md",
    `| v0.13.x   | Yes       | Current active branch. All security patches are applied here. |\n`,
  );
}

Deno.test("release version check accepts a consistent package graph", async () => {
  const root = await Deno.makeTempDir({ prefix: "steno_release_version_" });
  try {
    await writeFixture(root);
    assertEquals(await checkReleaseVersions(root, tauVersion), []);
  } finally {
    await Deno.remove(root, { recursive: true });
  }
});

Deno.test("release version check reports mismatched first-party references", async () => {
  const root = await Deno.makeTempDir({ prefix: "steno_release_version_" });
  try {
    await writeFixture(root);
    await Deno.writeTextFile(
      join(root, "packages/theme-minimal/README.md"),
      "theme: jsr:@steno/theme-minimal@^0.12.0\n",
    );

    const failures = await checkReleaseVersions(root, tauVersion);
    assertEquals(failures.length, 1);
    assertStringIncludes(failures[0], "packages/theme-minimal/README.md");
    assertStringIncludes(failures[0], "0.12.0");
  } finally {
    await Deno.remove(root, { recursive: true });
  }
});

Deno.test("release version check requires theme transitive dependency exclusions", async () => {
  const root = await Deno.makeTempDir({ prefix: "steno_release_version_" });
  try {
    await writeFixture(root);
    await Deno.writeTextFile(
      join(root, "packages/theme-minimal/deno.json"),
      JSON.stringify({
        version: stenoVersion,
        imports: { "@steno/steno": `jsr:@steno/steno@^${stenoVersion}` },
        minimumDependencyAge: {
          age: "P1D",
          exclude: ["jsr:@steno/steno", "jsr:@steno/tau"],
        },
      }),
    );

    const failures = await checkReleaseVersions(root, tauVersion);
    assertEquals(failures.length, 1);
    assertStringIncludes(failures[0], "packages/theme-minimal/deno.json");
    assertStringIncludes(failures[0], "minimumDependencyAge.exclude");
  } finally {
    await Deno.remove(root, { recursive: true });
  }
});
