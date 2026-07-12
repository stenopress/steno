import { parse as parseYaml } from "@std/yaml";
import { parse as parseToml } from "@std/toml";

/** Extracts frontmatter metadata and the remaining document body. */
export function parseFrontmatter(
  content: string,
  filePath?: string,
): { frontmatter: Record<string, unknown>; body: string } {
  const delimiter = content.startsWith("---\n")
    ? "---"
    : content.startsWith("+++\n")
    ? "+++"
    : "";

  if (!delimiter) {
    return { frontmatter: {}, body: content };
  }

  const frontmatterStart = delimiter.length + 1;
  const closingMarker = `\n${delimiter}`;
  const closingIndex = content.indexOf(closingMarker, frontmatterStart);
  if (closingIndex === -1) {
    return { frontmatter: {}, body: content };
  }

  const frontmatterContent = content.slice(frontmatterStart, closingIndex);
  const body = content.slice(closingIndex + closingMarker.length);

  let frontmatter;
  if (delimiter === "---") {
    try {
      frontmatter = parseYaml(frontmatterContent);
    } catch (error) {
      const fileStr = filePath ? ` in "${filePath}"` : "";
      const errMsg = error instanceof Error ? error.message : String(error);
      throw new Error(
        `Failed to parse YAML frontmatter${fileStr}: ${errMsg}`,
      );
    }
  } else {
    try {
      frontmatter = parseToml(frontmatterContent);
    } catch (error) {
      const fileStr = filePath ? ` in "${filePath}"` : "";
      const errMsg = error instanceof Error ? error.message : String(error);
      throw new Error(
        `Failed to parse TOML frontmatter${fileStr}: ${errMsg}`,
      );
    }
  }

  const normalizedFrontmatter = frontmatter && typeof frontmatter === "object"
    ? (frontmatter as Record<string, unknown>)
    : {};
  return { frontmatter: normalizedFrontmatter, body };
}
