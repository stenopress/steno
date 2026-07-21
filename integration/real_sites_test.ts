import { assert, assertEquals, assertStringIncludes } from "@std/assert";
import { dirname, fromFileUrl, join, relative } from "@std/path";

interface SiteExpectation {
  zeroConfig?: boolean;
  files: Record<string, string[]>;
  mutableSource: string;
  mutableOutput: string;
  originalText: string;
  changedText: string;
}

interface CommandResult {
  code: number;
  output: string;
}

const integrationDir = dirname(fromFileUrl(import.meta.url));
const repositoryRoot = dirname(integrationDir);
const stenoEntry = join(repositoryRoot, "mod.ts");
const sitesDir = join(integrationDir, "sites");
const decoder = new TextDecoder();

async function copyTree(source: string, destination: string): Promise<void> {
  await Deno.mkdir(destination, { recursive: true });
  for await (const entry of Deno.readDir(source)) {
    const sourcePath = join(source, entry.name);
    const destinationPath = join(destination, entry.name);
    if (entry.isDirectory) await copyTree(sourcePath, destinationPath);
    else if (entry.isFile) await Deno.copyFile(sourcePath, destinationPath);
  }
}

async function removeIfPresent(path: string): Promise<void> {
  try {
    await Deno.remove(path, { recursive: true });
  } catch (error) {
    if (!(error instanceof Deno.errors.NotFound)) throw error;
  }
}

async function runBuild(
  projectRoot: string,
  zeroConfig = false,
): Promise<CommandResult> {
  const args = ["run", "-A", stenoEntry, "build"];
  if (!zeroConfig) {
    args.push("--config", "content/.steno/config.yml");
  }
  const result = await new Deno.Command(Deno.execPath(), {
    args,
    cwd: projectRoot,
    stdout: "piped",
    stderr: "piped",
  }).output();
  return {
    code: result.code,
    output: decoder.decode(result.stdout) + decoder.decode(result.stderr),
  };
}

async function listFiles(root: string, current = root): Promise<string[]> {
  const files: string[] = [];
  for await (const entry of Deno.readDir(current)) {
    const path = join(current, entry.name);
    if (entry.isDirectory) files.push(...await listFiles(root, path));
    else if (entry.isFile) {
      files.push(relative(root, path).replaceAll("\\", "/"));
    }
  }
  return files.sort();
}

async function snapshotTree(root: string): Promise<Map<string, Uint8Array>> {
  const snapshot = new Map<string, Uint8Array>();
  for (const path of await listFiles(root)) {
    snapshot.set(path, await Deno.readFile(join(root, path)));
  }
  return snapshot;
}

function normalizeOutputPath(
  fromHtml: string,
  rawTarget: string,
): string | undefined {
  const target = rawTarget.trim();
  if (
    !target || target.startsWith("#") || target.startsWith("//") ||
    /^[A-Za-z][A-Za-z\d+.-]*:/.test(target)
  ) return;

  const withoutQuery = target.split(/[?#]/, 1)[0];
  let joined = withoutQuery.startsWith("/")
    ? withoutQuery.slice(1)
    : `${dirname(fromHtml).replaceAll("\\", "/")}/${withoutQuery}`;
  const parts: string[] = [];
  for (const part of joined.split("/")) {
    if (!part || part === ".") continue;
    if (part === "..") parts.pop();
    else parts.push(part);
  }
  joined = parts.join("/");
  if (!joined) return "index.html";
  if (withoutQuery.endsWith("/")) return `${joined}/index.html`;
  if (!parts.at(-1)?.includes(".")) return `${joined}/index.html`;
  return joined;
}

async function assertInternalLinks(outputDir: string): Promise<void> {
  const files = await listFiles(outputDir);
  const fileSet = new Set(files);
  const attributePattern =
    /\b(?:href|src)\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+))/gi;

  for (const htmlPath of files.filter((path) => path.endsWith(".html"))) {
    const html = await Deno.readTextFile(join(outputDir, htmlPath));
    for (const match of html.matchAll(attributePattern)) {
      const target = match[1] ?? match[2] ?? match[3] ?? "";
      const outputPath = normalizeOutputPath(htmlPath, target);
      if (!outputPath) continue;
      assert(
        fileSet.has(outputPath),
        `${htmlPath} links to missing output ${outputPath} (${target})`,
      );
    }
  }
}

async function assertExpectedSite(
  outputDir: string,
  expectation: SiteExpectation,
): Promise<void> {
  for (const [path, snippets] of Object.entries(expectation.files)) {
    const filePath = join(outputDir, path);
    const stat = await Deno.stat(filePath);
    assert(stat.isFile, `Expected generated file ${path}`);
    if (!path.endsWith(".html")) continue;
    const content = await Deno.readTextFile(filePath);
    for (const snippet of snippets) assertStringIncludes(content, snippet);
  }
  await assertInternalLinks(outputDir);
}

for await (const entry of Deno.readDir(sitesDir)) {
  if (!entry.isDirectory) continue;
  const siteName = entry.name;

  Deno.test({
    name: `real site: ${siteName} builds deterministically and atomically`,
    permissions: { read: true, write: true, run: true, env: true, net: true },
    fn: async () => {
      const tempRoot = await Deno.makeTempDir({
        prefix: `steno-real-site-${siteName}-`,
      });
      try {
        await copyTree(join(sitesDir, siteName), tempRoot);
        const expectation = JSON.parse(
          await Deno.readTextFile(join(tempRoot, "site.expected.json")),
        ) as SiteExpectation;
        const outputDir = join(tempRoot, "dist");
        const cachePath = expectation.zeroConfig
          ? join(tempRoot, ".steno", "build-cache.json")
          : join(tempRoot, "content", ".steno", "build-cache.json");

        const firstBuild = await runBuild(tempRoot, expectation.zeroConfig);
        assertEquals(firstBuild.code, 0, firstBuild.output);
        await assertExpectedSite(outputDir, expectation);
        const firstSnapshot = await snapshotTree(outputDir);

        await removeIfPresent(outputDir);
        await removeIfPresent(cachePath);
        const cleanBuild = await runBuild(tempRoot, expectation.zeroConfig);
        assertEquals(cleanBuild.code, 0, cleanBuild.output);
        assertEquals(await snapshotTree(outputDir), firstSnapshot);

        const warmBuild = await runBuild(tempRoot, expectation.zeroConfig);
        assertEquals(warmBuild.code, 0, warmBuild.output);
        assertEquals(await snapshotTree(outputDir), firstSnapshot);

        const mutableSource = join(tempRoot, expectation.mutableSource);
        const source = await Deno.readTextFile(mutableSource);
        assertStringIncludes(source, expectation.originalText);
        await Deno.writeTextFile(
          mutableSource,
          source.replace(expectation.originalText, expectation.changedText),
        );
        const incrementalBuild = await runBuild(
          tempRoot,
          expectation.zeroConfig,
        );
        assertEquals(incrementalBuild.code, 0, incrementalBuild.output);
        const mutableHtml = await Deno.readTextFile(
          join(outputDir, expectation.mutableOutput),
        );
        assertStringIncludes(mutableHtml, expectation.changedText);
        const incrementalSnapshot = await snapshotTree(outputDir);

        await Deno.writeTextFile(
          mutableSource,
          `---\ntitle: [invalid\n---\n# This build must fail\n`,
        );
        const failedBuild = await runBuild(tempRoot, expectation.zeroConfig);
        assert(failedBuild.code !== 0, "Expected malformed site build to fail");
        assertEquals(await snapshotTree(outputDir), incrementalSnapshot);

        const leakedTransactionPaths = (await listFiles(outputDir)).filter((
          path,
        ) => path.includes("steno-stage") || path.includes("steno-backup"));
        assertEquals(leakedTransactionPaths, []);
      } finally {
        await removeIfPresent(tempRoot);
      }
    },
  });
}
