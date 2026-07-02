/**
 * Ensures that a directory exists. If the directory does not exist, it is created,
 * along with any necessary parent directories.
 *
 * @param dirPath The path to the directory to ensure.
 */
export function ensureDirSync(dirPath: string): void {
  try {
    if (!Deno.statSync(dirPath).isDirectory) {
      Deno.mkdirSync(dirPath, { recursive: true });
    }
  } catch (error) {
    if (error instanceof Deno.errors.NotFound) {
      Deno.mkdirSync(dirPath, { recursive: true });
    } else {
      throw error;
    }
  }
}
