import { dirname, isAbsolute, join } from "@std/path";
import { fileExists } from "../utils/fs.ts";
import { hasControlCharacters } from "../utils/text.ts";

const INCLUDE_PATTERN_SOURCE = String.raw`\{@include\s+"([^"]+)"\}`;

function isUnsafeIncludePath(includePath: string): boolean {
  return isAbsolute(includePath) ||
    includePath.startsWith("/") ||
    includePath.includes("\\") ||
    includePath.split("/").includes("..") ||
    /^[A-Za-z][A-Za-z\d+.-]*:/.test(includePath) ||
    hasControlCharacters(includePath);
}

async function resolveIncludePath(
  includePath: string,
  currentFile: string,
  contentDir: string,
): Promise<string | null> {
  if (isUnsafeIncludePath(includePath)) return null;

  // try relative to current file first
  const relativeToFile = join(dirname(currentFile), includePath);
  if (await fileExists(relativeToFile)) return relativeToFile;

  // fall back to contentDir
  const relativeToContent = join(contentDir, includePath);
  if (await fileExists(relativeToContent)) return relativeToContent;

  return null;
}

/**
 * Recursively processes {@include "..."} directives in a Markdown body.
 * Detects circular includes and throws with a clear error.
 *
 * Include paths must be relative and cannot traverse parent directories,
 * use backslashes, carry a scheme prefix, or contain control characters -
 * the same containment rules Tau templates enforce for `{@include}`.
 *
 * @param body - The Markdown content to process.
 * @param currentFile - Absolute path to the file being processed.
 * @param contentDir - The root content directory for fallback resolution.
 * @param stack - Set of currently open files for circular detection.
 */
export async function processIncludes(
  body: string,
  currentFile: string,
  contentDir: string,
  stack: Set<string> = new Set([currentFile]),
): Promise<string> {
  const pattern = new RegExp(INCLUDE_PATTERN_SOURCE, "g");
  let result = "";
  let lastIndex = 0;
  let match: RegExpExecArray | null;

  while ((match = pattern.exec(body)) !== null) {
    const [fullMatch, includePath] = match;
    result += body.slice(lastIndex, match.index);
    lastIndex = match.index + fullMatch.length;

    const resolvedPath = await resolveIncludePath(
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

    const included = await Deno.readTextFile(resolvedPath);
    const newStack = new Set([...stack, resolvedPath]);

    // recursively process includes in the included file
    result += await processIncludes(
      included,
      resolvedPath,
      contentDir,
      newStack,
    );
  }

  result += body.slice(lastIndex);
  return result;
}
