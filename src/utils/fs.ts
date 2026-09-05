import { dirname, isAbsolute, relative } from "@std/path";

export function isPathInsideOrEqual(candidate: string, parent: string): boolean {
  const rel = relative(parent, candidate);
  return rel === "" || (!rel.startsWith("..") && !isAbsolute(rel));
}

/** Creates `path`'s parent directory (recursively) if it doesn't exist. */
export function ensureParentDirSync(path: string): void {
  Deno.mkdirSync(dirname(path), { recursive: true });
}

/** Returns whether `path` exists and is a regular file, synchronously. */
export function fileExistsSync(path: string): boolean {
  try {
    return Deno.statSync(path).isFile;
  } catch (error) {
    if (error instanceof Deno.errors.NotFound) return false;
    throw error;
  }
}

/** Returns whether `path` exists and is a regular file. */
export async function fileExists(path: string): Promise<boolean> {
  try {
    return (await Deno.stat(path)).isFile;
  } catch (error) {
    if (error instanceof Deno.errors.NotFound) return false;
    throw error;
  }
}
