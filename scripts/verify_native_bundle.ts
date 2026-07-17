import { basename, join } from "@std/path";

interface NativeTarget {
  directory: string;
  library: string;
}

const targets: NativeTarget[] = [
  { directory: "darwin-aarch64", library: "libsteno_core.dylib" },
  { directory: "darwin-x86_64", library: "libsteno_core.dylib" },
  { directory: "linux-aarch64", library: "libsteno_core.so" },
  { directory: "linux-x86_64", library: "libsteno_core.so" },
  { directory: "windows-aarch64", library: "steno_core.dll" },
  { directory: "windows-x86_64", library: "steno_core.dll" },
];

const encoder = new TextEncoder();
const maxLibraryBytes = 4 * 1024 * 1024;
const maxBundleBytes = 18 * 1024 * 1024;

function toHex(bytes: ArrayBuffer): string {
  return [...new Uint8Array(bytes)]
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

const config = JSON.parse(await Deno.readTextFile("deno.json"));
const releaseTag = Deno.env.get("GITHUB_REF_NAME");
if (
  releaseTag && releaseTag !== config.version &&
  releaseTag !== `v${config.version}`
) {
  throw new Error(
    `Release tag ${releaseTag} does not match package version ${config.version}.`,
  );
}
const manifest: Record<string, unknown> = {
  version: 1,
  package: config.name,
  packageVersion: config.version,
  targets: {},
};
const manifestTargets = manifest.targets as Record<string, unknown>;
let bundleBytes = 0;

for (const target of targets) {
  const path = join("native", target.directory, target.library);
  let bytes: Uint8Array;
  try {
    bytes = await Deno.readFile(path);
  } catch (error) {
    if (error instanceof Deno.errors.NotFound) {
      throw new Error(`Missing required native release library: ${path}`);
    }
    throw error;
  }
  if (bytes.length === 0) throw new Error(`Native library is empty: ${path}`);
  if (bytes.length >= maxLibraryBytes) {
    throw new Error(
      `Native library exceeds the 4 MiB release budget: ${path} (${bytes.length} bytes)`,
    );
  }
  bundleBytes += bytes.length;

  const digest = await crypto.subtle.digest("SHA-256", bytes);
  manifestTargets[target.directory] = {
    file: basename(path),
    bytes: bytes.length,
    sha256: toHex(digest),
  };
}

if (bundleBytes >= maxBundleBytes) {
  throw new Error(
    `Native bundle exceeds the 18 MiB release budget (${bundleBytes} bytes).`,
  );
}

await Deno.writeTextFile(
  join("native", "manifest.json"),
  JSON.stringify(manifest, null, 2) + "\n",
);

const manifestBytes = encoder.encode(JSON.stringify(manifest)).length;
console.log(
  `Verified ${targets.length} native targets (${bundleBytes} bytes); manifest is ${manifestBytes} bytes.`,
);
