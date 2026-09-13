import { parse as parseYaml } from "@std/yaml";
import { parse as parseToml } from "@std/toml";
import { errorMessage } from "./text.ts";

/** Extracts frontmatter metadata and the remaining document body. */
export function parseFrontmatter(
  content: string,
  filePath?: string,
): { frontmatter: Record<string, unknown>; body: string } {
  const delimiter = content.startsWith("---\n") ? "---" : content.startsWith("+++\n") ? "+++" : "";

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
  try {
    frontmatter =
      delimiter === "---" ? parseYaml(frontmatterContent) : parseToml(frontmatterContent);
  } catch (error) {
    const format = delimiter === "---" ? "YAML" : "TOML";
    const fileStr = filePath ? ` in "${filePath}"` : "";
    throw new Error(`Failed to parse ${format} frontmatter${fileStr}: ${errorMessage(error)}`);
  }

  const normalizedFrontmatter =
    frontmatter && typeof frontmatter === "object" ? (frontmatter as Record<string, unknown>) : {};
  return { frontmatter: normalizedFrontmatter, body };
}
