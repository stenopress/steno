import { assertEquals, assertThrows } from "@std/assert";
import { parseFrontmatter } from "./frontmatter.ts";

export function registerFrontmatterTests(): void {
  Deno.test("frontmatter: parses YAML frontmatter", () => {
    const input = `---\ntitle: Hello\nauthor: Dev\n---\n\nBody text`;
    const parsed = parseFrontmatter(input);

    assertEquals(parsed.frontmatter.title, "Hello");
    assertEquals(parsed.frontmatter.author, "Dev");
    assertEquals(parsed.body.trim(), "Body text");
  });

  Deno.test("frontmatter: parses TOML frontmatter", () => {
    const input = `+++\ntitle = "Hello"\nauthor = "Dev"\n+++\n\nBody text`;
    const parsed = parseFrontmatter(input);

    assertEquals(parsed.frontmatter.title, "Hello");
    assertEquals(parsed.frontmatter.author, "Dev");
    assertEquals(parsed.body.trim(), "Body text");
  });

  Deno.test("frontmatter: returns empty frontmatter when missing", () => {
    const parsed = parseFrontmatter("Just markdown body");

    assertEquals(parsed.frontmatter, {});
    assertEquals(parsed.body, "Just markdown body");
  });

  Deno.test("frontmatter: throws on invalid YAML frontmatter", () => {
    const input = `---\ntitle: [\nbad yaml\n---\n\nBody`;
    assertThrows(
      () => parseFrontmatter(input),
      Error,
      "Failed to parse YAML frontmatter",
    );
  });

  Deno.test("frontmatter: throws on invalid TOML frontmatter", () => {
    const input = `+++\ntitle = bad toml [\n+++\n\nBody`;
    assertThrows(
      () => parseFrontmatter(input),
      Error,
      "Failed to parse TOML frontmatter",
    );
  });

  Deno.test("frontmatter: error message includes filePath for invalid YAML", () => {
    const input = `---\ntitle: [\nbad yaml\n---\n\nBody`;
    assertThrows(
      () => parseFrontmatter(input, "content/post.md"),
      Error,
      'Failed to parse YAML frontmatter in "content/post.md"',
    );
  });

  Deno.test("frontmatter: error message includes filePath for invalid TOML", () => {
    const input = `+++\ntitle = bad toml [\n+++\n\nBody`;
    assertThrows(
      () => parseFrontmatter(input, "content/post.md"),
      Error,
      'Failed to parse TOML frontmatter in "content/post.md"',
    );
  });
}
