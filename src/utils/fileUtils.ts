/** Ensures a directory exists, creating parent directories when needed. */
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
