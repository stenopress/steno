import { dirname, fromFileUrl, join } from "@std/path";

const nativeSymbols = {
  run_build: {
    parameters: [
      "buffer",
      "usize",
      "buffer",
      "usize",
      "buffer",
      "usize",
      "buffer",
      "usize",
      "i32",
    ],
    result: "i32",
  },
} as const;

type NativeLibrary = Deno.DynamicLibrary<typeof nativeSymbols>;

export interface NativeBuildInfo {
  available: boolean;
  target: string;
  path?: string;
  reason?: string;
}

export interface BuildManifest {
  config: Record<string, unknown>;
  pages: Array<{ fullPath: string; relPath: string }>;
  signature: string;
}

let nativeLibrary: NativeLibrary | null | undefined;
let nativeBuildInfo: NativeBuildInfo | undefined;

function readEnv(name: string): string | undefined {
  try {
    return Deno.env.get(name);
  } catch {
    return undefined;
  }
}

function nativeLibraryName(os: typeof Deno.build.os): string | null {
  switch (os) {
    case "darwin":
      return "libsteno_core.dylib";
    case "linux":
      return "libsteno_core.so";
    case "windows":
      return "steno_core.dll";
    default:
      return null;
  }
}

function candidatePaths(libraryName: string, target: string): string[] {
  const moduleDir = dirname(fromFileUrl(import.meta.url));
  const packageRoot = join(moduleDir, "..", "..");
  const override = readEnv("STENO_NATIVE_PATH");
  return [
    ...(override ? [override] : []),
    join(packageRoot, "native", target, libraryName),
    join(packageRoot, "native", libraryName),
    join(packageRoot, "crates", "steno_core", "target", "release", libraryName),
  ];
}

function canAttemptFfi(path: string): boolean {
  try {
    return Deno.permissions.querySync({ name: "ffi", path }).state !== "denied";
  } catch {
    return true;
  }
}

/** Loads native acceleration when a compatible local or packaged library exists. */
export function getNativeBuildInfo(): NativeBuildInfo {
  if (nativeBuildInfo) return nativeBuildInfo;

  const target = `${Deno.build.os}-${Deno.build.arch}`;
  if (readEnv("STENO_NATIVE") === "off") {
    nativeLibrary = null;
    return nativeBuildInfo = {
      available: false,
      target,
      reason: "disabled by STENO_NATIVE=off",
    };
  }

  const libraryName = nativeLibraryName(Deno.build.os);
  if (!libraryName) {
    nativeLibrary = null;
    return nativeBuildInfo = {
      available: false,
      target,
      reason: `unsupported operating system: ${Deno.build.os}`,
    };
  }

  const failures: string[] = [];
  let permissionBlocked = false;
  for (const path of candidatePaths(libraryName, target)) {
    if (!canAttemptFfi(path)) {
      permissionBlocked = true;
      failures.push(`FFI permission denied for ${path}`);
      continue;
    }
    try {
      nativeLibrary = Deno.dlopen(path, nativeSymbols);
      return nativeBuildInfo = { available: true, target, path };
    } catch (error) {
      failures.push(error instanceof Error ? error.message : String(error));
    }
  }

  nativeLibrary = null;
  const unavailableInfo: NativeBuildInfo = {
    available: false,
    target,
    reason: failures.at(-1) ?? `no native library found for ${target}`,
  };
  // A later operation in the same process may have broader permissions.
  // Cache genuine absence, but allow permission-scoped calls to recover.
  if (!permissionBlocked) nativeBuildInfo = unavailableInfo;

  if (readEnv("STENO_NATIVE") === "required") {
    throw new Error(
      `Steno's native engine is required but unavailable for ${target}. ` +
        "Run `deno task build:core`, set STENO_NATIVE_PATH to a compatible " +
        "library, or unset STENO_NATIVE to use the portable Deno engine. " +
        `Loader error: ${unavailableInfo.reason}`,
    );
  }

  return unavailableInfo;
}

export function performBuild(
  manifest: BuildManifest,
  dev: boolean,
  cachePath: string,
): boolean {
  const info = getNativeBuildInfo();
  if (!info.available || !nativeLibrary) return false;

  const encoder = new TextEncoder();
  const configBytes = encoder.encode(JSON.stringify(manifest.config));
  const pagesBytes = encoder.encode(JSON.stringify(manifest.pages));
  const cachePathBytes = encoder.encode(cachePath);
  const signatureBytes = encoder.encode(manifest.signature);

  const status = nativeLibrary.symbols.run_build(
    configBytes,
    BigInt(configBytes.length),
    pagesBytes,
    BigInt(pagesBytes.length),
    cachePathBytes,
    BigInt(cachePathBytes.length),
    signatureBytes,
    BigInt(signatureBytes.length),
    dev ? 1 : 0,
  );

  return status === 0;
}
