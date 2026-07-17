import { assertEquals, assertStringIncludes, assertThrows } from "@std/assert";
import { render } from "./scribe.ts";

export function registerScribeTests(): void {
  Deno.test("scribe: renders expressions and escapes HTML", () => {
    const output = render({
      template: `<p>{ title }</p>`,
      context: { title: `<b>x</b>` },
      components: {},
    });

    assertStringIncludes(output, "&lt;b&gt;x&lt;/b&gt;");
  });

  Deno.test("scribe: supports html passthrough and control flow", () => {
    const output = render({
      template:
        `{#if show}<ul>{#each tags as tag}<li>{ tag | lower }</li>{/each}</ul>{:else}<p>none</p>{/if}{@html extra}`,
      context: { show: true, tags: ["A", "B"], extra: "<hr>" },
      components: {},
    });

    assertStringIncludes(output, "<li>a</li>");
    assertStringIncludes(output, "<li>b</li>");
    assertStringIncludes(output, "<hr>");
  });

  Deno.test("scribe: renders components", () => {
    const output = render({
      template: `<Header title={title} />`,
      context: {
        title: "Hello",
        site: { title: "Site" },
        theme: { name: "T" },
      },
      components: {
        Header: `<h1>{ title }</h1>`,
      },
    });

    assertEquals(output, "<h1>Hello</h1>");
  });

  Deno.test("scribe: parse error includes filePath and line/col in message", () => {
    // {#each} without "as" keyword triggers a parse error after consuming the block header
    const template = `{#each items}{/each}`;
    const err = assertThrows(
      () =>
        render({
          template,
          context: {},
          components: {},
          filePath: "layouts/post.scr",
        }),
      Error,
    );
    assertStringIncludes(err.message, "layouts/post.scr");
    // line 1, col is past the consumed "{#each items}" token
    assertStringIncludes(err.message, ":1:");
    assertStringIncludes(err.message, 'Expected "as" keyword');
  });

  Deno.test("scribe: parse error without filePath falls back to Line/col prefix", () => {
    const template = `line one\n{#each items}{/each}`;
    const err = assertThrows(
      () => render({ template, context: {}, components: {} }),
      Error,
    );
    // no filePath → "Line N, col M:" prefix
    assertStringIncludes(err.message, "Line 2");
    assertStringIncludes(err.message, 'Expected "as" keyword');
  });

  Deno.test("scribe: {@include} renders included template via includeResolver", () => {
    const output = render({
      template: `<div>{@include "partials/cta.scr"}</div>`,
      context: { title: "Hello" },
      components: {},
      includeResolver: (path) => {
        if (path === "partials/cta.scr") return `<p>Sign up today!</p>`;
        throw new Error(`Unknown include: ${path}`);
      },
    });

    assertStringIncludes(output, "<p>Sign up today!</p>");
  });

  Deno.test("scribe: {@include} passes context to included template", () => {
    const output = render({
      template: `{@include "greeting.scr"}`,
      context: { name: "Alice" },
      components: {},
      includeResolver: () => `<span>Hello { name }</span>`,
    });

    assertStringIncludes(output, "Hello Alice");
  });

  Deno.test("scribe: {@include} supports nested includes", () => {
    const output = render({
      template: `{@include "outer.scr"}`,
      context: {},
      components: {},
      includeResolver: (path) => {
        if (path === "outer.scr") return `outer {@include "inner.scr"}`;
        if (path === "inner.scr") return `inner`;
        throw new Error(`Unknown: ${path}`);
      },
    });

    assertStringIncludes(output, "outer");
    assertStringIncludes(output, "inner");
  });

  Deno.test("scribe: {@include} throws when no includeResolver provided", () => {
    assertThrows(
      () =>
        render({
          template: `{@include "missing.scr"}`,
          context: {},
          components: {},
        }),
      Error,
      "no includeResolver was provided",
    );
  });

  Deno.test("scribe: {@include} works alongside components and expressions", () => {
    const output = render({
      template: `<Header />{@include "body.scr"}{ footer }`,
      context: {
        footer: "bye",
        site: { title: "Site" },
        theme: { name: "T" },
      },
      components: {
        Header: `<header>{ site.title }</header>`,
      },
      includeResolver: () => `<main>content</main>`,
    });

    assertStringIncludes(output, "<header>Site</header>");
    assertStringIncludes(output, "<main>content</main>");
    assertStringIncludes(output, "bye");
  });
}
