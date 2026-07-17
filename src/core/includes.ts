import { dirname, isAbsolute, join } from "@std/path";

const INCLUDE_PATTERN = /\{@include\s+"([^"]+)"\}/g;

function resolveIncludePath(
  includePath: string,
  currentFile: string,
  contentDir: string,
): string | null {
  if (isAbsolute(includePath)) return null;

  // try relative to current file first
  const relativeToFile = join(dirname(currentFile), includePath);
  try {
    Deno.statSync(relativeToFile);
    return relativeToFile;
  } catch {
    // fall through
  }

  // fall back to contentDir
  const relativeToContent = join(contentDir, includePath);
  try {
    Deno.statSync(relativeToContent);
    return relativeToContent;
  } catch {
    // not found
  }

  return null;
}

/**
 * Recursively processes {@include "..."} directives in a Markdown body.
 * Detects circular includes and throws with a clear error.
 *
 * @param body - The Markdown content to process.
 * @param currentFile - Absolute path to the file being processed.
 * @param contentDir - The root content directory for fallback resolution.
 * @param stack - Set of currently open files for circular detection.
 */
export function processIncludes(
  body: string,
  currentFile: string,
  contentDir: string,
  stack: Set<string> = new Set([currentFile]),
): string {
  return body.replace(INCLUDE_PATTERN, (_match, includePath: string) => {
    const resolvedPath = resolveIncludePath(
      includePath,
      currentFile,
      contentDir,
    );

    if (!resolvedPath) {
      throw new Error(
        `Include not found: "${includePath}" in "${currentFile}".\n` +
          `Tried:\n` +
          `  - ${join(dirname(currentFile), includePath)}\n` +
          `  - ${join(contentDir, includePath)}`,
      );
    }

    if (stack.has(resolvedPath)) {
      throw new Error(
        `Circular include detected: "${resolvedPath}" is already in the include stack.\n` +
          `Stack: ${[...stack].join(" → ")}`,
      );
    }

    const included = Deno.readTextFileSync(resolvedPath);
    const newStack = new Set([...stack, resolvedPath]);

    // recursively process includes in the included file
    return processIncludes(included, resolvedPath, contentDir, newStack);
  });
}
