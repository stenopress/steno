import { assertEquals, assertRejects, assertStringIncludes } from "@std/assert";
import { filters, render } from "./tau.ts";
import { formatTauError, TauError } from "./tau_error.ts";

export function registerTauTests(): void {
  Deno.test("tau: CLI diagnostics include source, code, and suggestion", () => {
    const error = new TauError(
      "TAU_UNKNOWN_FILTER",
      'Unknown filter "typo".',
      { filePath: "content/index.md", line: 4, column: 8 },
    );
    const output = formatTauError(error);

    assertStringIncludes(output, "content/index.md:4:8");
    assertStringIncludes(output, "Code: TAU_UNKNOWN_FILTER");
    assertStringIncludes(output, "Hint: Use a registered Tau filter");
  });

  Deno.test("tau: renders expressions and escapes HTML", async () => {
    const output = await render({
      template: `<p>{ title }</p>`,
      context: { title: `<b>x</b>` },
      components: {},
    });

    assertStringIncludes(output, "&lt;b&gt;x&lt;/b&gt;");
  });

  Deno.test("tau: escapes quoted attributes and validates URL schemes", async () => {
    const output = await render({
      template: `<a title="{title}" href="{url | url}">link</a>`,
      context: {
        title: `" onclick="alert(1)`,
        url: "https://example.com/?a=1&b=2",
      },
      components: {},
    });
    assertEquals(
      output,
      `<a title="&quot; onclick=&quot;alert(1)" href="https://example.com/?a=1&amp;b=2">link</a>`,
    );

    for (
      const url of ["javascript:alert(1)", "data:text/html,x", "java\nscript:x"]
    ) {
      const error = await assertRejects(
        () =>
          render({
            template: `{url | url}`,
            context: { url },
            components: {},
          }),
        TauError,
      );
      assertEquals(error.code, "TAU_UNSAFE_URL");
    }
  });

  Deno.test("tau: raw HTML is explicitly unescaped", async () => {
    assertEquals(
      await render({
        template: `{@html value}`,
        context: { value: `<script>trustedOnly()</script>` },
        components: {},
      }),
      `<script>trustedOnly()</script>`,
    );
  });

  Deno.test("tau: supports html passthrough and control flow", async () => {
    const output = await render({
      template:
        `{#if show}<ul>{#each tags as tag}<li>{ tag | lower }</li>{/each}</ul>{:else}<p>none</p>{/if}{@html extra}`,
      context: { show: true, tags: ["A", "B"], extra: "<hr>" },
      components: {},
    });

    assertStringIncludes(output, "<li>a</li>");
    assertStringIncludes(output, "<li>b</li>");
    assertStringIncludes(output, "<hr>");
  });

  Deno.test("tau: supports else-if branches", async () => {
    const output = await render({
      template: `{#if first}first{:else if second}second{:else}third{/if}`,
      context: { first: false, second: true },
      components: {},
    });

    assertEquals(output, "second");
  });

  Deno.test("tau: renders components", async () => {
    const output = await render({
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

  Deno.test("tau: parse error includes filePath and line/col in message", async () => {
    // {#each} without "as" keyword triggers a parse error after consuming the block header
    const template = `{#each items}{/each}`;
    const err = await assertRejects(
      () =>
        render({
          template,
          context: {},
          components: {},
          filePath: "layouts/post.tau",
        }),
      Error,
    );
    assertStringIncludes(err.message, "layouts/post.tau");
    // line 1, col is past the consumed "{#each items}" token
    assertStringIncludes(err.message, ":1:");
    assertStringIncludes(err.message, 'Expected "as" keyword');
  });

  Deno.test("tau: parse error without filePath falls back to Line/col prefix", async () => {
    const template = `line one\n{#each items}{/each}`;
    const err = await assertRejects(
      () => render({ template, context: {}, components: {} }),
      Error,
    );
    // no filePath → "Line N, col M:" prefix
    assertStringIncludes(err.message, "Line 2");
    assertStringIncludes(err.message, 'Expected "as" keyword');
  });

  Deno.test("tau: {@include} renders included template via includeResolver", async () => {
    const output = await render({
      template: `<div>{@include "partials/cta.tau"}</div>`,
      context: { title: "Hello" },
      components: {},
      includeResolver: (path) => {
        if (path === "partials/cta.tau") return `<p>Sign up today!</p>`;
        throw new Error(`Unknown include: ${path}`);
      },
    });

    assertStringIncludes(output, "<p>Sign up today!</p>");
  });

  Deno.test("tau: {@include} passes context to included template", async () => {
    const output = await render({
      template: `{@include "greeting.tau"}`,
      context: { name: "Alice" },
      components: {},
      includeResolver: () => `<span>Hello { name }</span>`,
    });

    assertStringIncludes(output, "Hello Alice");
  });

  Deno.test("tau: {@include} supports nested includes", async () => {
    const output = await render({
      template: `{@include "outer.tau"}`,
      context: {},
      components: {},
      includeResolver: (path) => {
        if (path === "outer.tau") return `outer {@include "inner.tau"}`;
        if (path === "inner.tau") return `inner`;
        throw new Error(`Unknown: ${path}`);
      },
    });

    assertStringIncludes(output, "outer");
    assertStringIncludes(output, "inner");
  });

  Deno.test("tau: {@include} throws when no includeResolver provided", async () => {
    await assertRejects(
      () =>
        render({
          template: `{@include "missing.tau"}`,
          context: {},
          components: {},
        }),
      Error,
      "no includeResolver was provided",
    );
  });

  Deno.test("tau: rejects absolute and traversing include paths", async () => {
    for (const path of ["../secret.tau", "/secret.tau", "file:///secret.tau"]) {
      const error = await assertRejects(
        () =>
          render({
            template: `{@include "${path}"}`,
            context: {},
            components: {},
            includeResolver: () => "unreachable",
          }),
        TauError,
      );
      assertEquals(error.code, "TAU_UNSAFE_INCLUDE_PATH");
    }
  });

  Deno.test("tau: {@include} works alongside components and expressions", async () => {
    const output = await render({
      template: `<Header />{@include "body.tau"}{ footer }`,
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

  Deno.test("tau: blocks ambient runtime and constructor access", async () => {
    for (
      const template of [
        `{ Deno.cwd() }`,
        `{ globalThis }`,
        `{ helpers }`,
        `{ value.constructor.constructor("return 1")() }`,
        // Dynamic/computed access to a blocked name must be rejected too,
        // not just the static ".constructor" dot-access form.
        `{ value["constructor"] }`,
        `{ value["cons" + "tructor"] }`,
      ]
    ) {
      await assertRejects(
        () =>
          render({
            template,
            context: { value: {} },
            components: {},
          }),
        Error,
        "not allowed",
      );
    }
  });

  Deno.test("tau: supports ternary, optional chaining, and nullish coalescing", async () => {
    assertEquals(
      await render({
        template: `{flag ? "yes" : "no"}`,
        context: { flag: true },
        components: {},
      }),
      "yes",
    );
    assertEquals(
      await render({
        template: `{user?.profile?.name}`,
        context: { user: null },
        components: {},
      }),
      "",
    );
    assertEquals(
      await render({
        template: `{user?.profile?.name}`,
        context: { user: { profile: { name: "Ada" } } },
        components: {},
      }),
      "Ada",
    );
    assertEquals(
      await render({
        template: `{missing ?? "fallback"}`,
        context: {},
        components: {},
      }),
      "fallback",
    );
    assertEquals(
      await render({
        template: `{1 + 2 * 3}`,
        context: {},
        components: {},
      }),
      "7",
    );
    assertEquals(
      await render({
        template: `{items[0]}`,
        context: { items: ["first", "second"] },
        components: {},
      }),
      "first",
    );
  });

  Deno.test("tau: each-block loop variables can shadow a blocked name", async () => {
    // Real for-of bindings shadow the blocklist, matching the old
    // with()-based scoping rules.
    const output = await render({
      template: `{#each items as context}{context}{/each}`,
      context: { items: ["a", "b"] },
      components: {},
    });
    assertEquals(output, "ab");
  });

  Deno.test("tau: rejects code-generating and mutating expressions", async () => {
    for (
      const template of [
        `{ value = 1 }`,
        `{ (() => value)() }`,
        `{ value | upper);Deno.cwd( }`,
        `{#each items as item);Deno.cwd();//}{/each}`,
      ]
    ) {
      await assertRejects(
        () => render({ template, context: { value: 0 }, components: {} }),
      );
    }
  });

  Deno.test("tau: rejects prototype-derived filters, components, and props", async () => {
    await assertRejects(
      () =>
        render({
          template: `{value | toString}`,
          context: { value: "x" },
          components: {},
        }),
      Error,
      'Unknown Tau filter "toString"',
    );
    await assertRejects(
      () =>
        render({
          template: `<ToString />`,
          context: {},
          components: {},
        }),
      Error,
      'Component "ToString" not found',
    );
    await assertRejects(
      () =>
        render({
          template: `<Card __proto__="x" />`,
          context: {},
          components: { Card: "ok" },
        }),
      Error,
      'prop "__proto__" is not allowed',
    );
  });

  Deno.test("tau: detects recursive includes and components", async () => {
    await assertRejects(
      () =>
        render({
          template: `{@include "loop.tau"}`,
          context: {},
          components: {},
          includeResolver: () => `{@include "loop.tau"}`,
        }),
      Error,
      "include cycle detected",
    );

    await assertRejects(
      () =>
        render({
          template: `<Loop />`,
          context: {},
          components: { Loop: `<Loop />` },
        }),
      Error,
      "component cycle detected",
    );
  });

  Deno.test("tau: enforces iteration, output, and template limits", async () => {
    await assertRejects(
      () =>
        render({
          template: `{#each items as item}{item}{/each}`,
          context: { items: [1, 2, 3] },
          components: {},
          limits: { maxIterations: 2 },
        }),
      Error,
      "iterations exceed",
    );

    await assertRejects(
      () =>
        render({
          template: `{value}`,
          context: { value: "12345" },
          components: {},
          limits: { maxOutputBytes: 4 },
        }),
      Error,
      "output exceeds",
    );

    await assertRejects(
      () =>
        render({
          template: "12345",
          context: {},
          components: {},
          limits: { maxTemplateBytes: 4 },
        }),
      Error,
      "template exceeds",
    );
  });

  Deno.test("tau: rejects invalid limits and unclosed if blocks", async () => {
    await assertRejects(
      () =>
        render({
          template: "ok",
          context: {},
          components: {},
          limits: { maxDepth: 0 },
        }),
      Error,
      'limit "maxDepth"',
    );
    await assertRejects(
      () =>
        render({
          template: "{#if true}missing close",
          context: {},
          components: {},
        }),
      Error,
      "Unclosed if block",
    );
  });

  Deno.test("tau: awaits an async context function without explicit await syntax", async () => {
    const output = await render({
      template: `{fetchTitle()}`,
      context: {
        fetchTitle: () => Promise.resolve("Async Title"),
      },
      components: {},
    });
    assertEquals(output, "Async Title");
  });

  Deno.test("tau: a sync context function still works with the async pipeline", async () => {
    const output = await render({
      template: `{greet(name)}`,
      context: {
        name: "Ada",
        greet: (name: string) => `Hello, ${name}!`,
      },
      components: {},
    });
    assertEquals(output, "Hello, Ada!");
  });

  Deno.test("tau: an async filter is awaited", async () => {
    filters.shout = (val: unknown) =>
      Promise.resolve(`${String(val).toUpperCase()}!`);
    try {
      const output = await render({
        template: `{value | shout}`,
        context: { value: "hi" },
        components: {},
      });
      assertEquals(output, "HI!");
    } finally {
      delete filters.shout;
    }
  });
}
