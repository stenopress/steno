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
