import { parse as parseYaml } from "@std/yaml";
import { parse as parseToml } from "@std/toml";

/** Extracts frontmatter metadata and the remaining document body. */
export function parseFrontmatter(
  content: string,
  filePath?: string,
): { frontmatter: Record<string, unknown>; body: string } {
  const frontmatterRegex = /^(---|\+\+\+)\n([\s\S]+?)\n\1/;
  const match = content.match(frontmatterRegex);
  if (match) {
    const delimiter = match[1];
    const frontmatterContent = match[2];
    const body = content.slice(match[0].length);
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
  return { frontmatter: {}, body: content };
}
