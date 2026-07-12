import { parseFrontmatter } from "../src/utils/frontmatter.ts";

const yamlDocument = `---
title: Benchmarking frontmatter
author: Steno
tags:
  - deno
  - benchmark
published: true
---
# Hello

This is benchmark content.`;

const tomlDocument = `+++
title = "Benchmarking frontmatter"
author = "Steno"
tags = ["deno", "benchmark"]
published = true
+++
# Hello

This is benchmark content.`;

const bodyOnlyDocument = `# Hello

This file has no frontmatter.`;

const megaPostBody = Array.from(
  { length: 10_000 },
  (_, index) =>
    `word${index} performance benchmarking large markdown payload for frontmatter slicing`,
).join(" ");

const megaPostDocument = `---
title: Mega Post
author: Steno
---
${megaPostBody}
`;

const invalidYamlDocument = `---
title: "Broken
tags: [a, b
---
# Invalid
`;

const missingClosingDelimiterDocument = `---
title: Missing close
author: Steno
# no closing delimiter`;

Deno.bench(
  "parseFrontmatter (yaml)",
  { group: "frontmatter", baseline: true },
  () => {
    parseFrontmatter(yamlDocument);
  },
);

Deno.bench("parseFrontmatter (toml)", { group: "frontmatter" }, () => {
  parseFrontmatter(tomlDocument);
});

Deno.bench("parseFrontmatter (body only)", () => {
  parseFrontmatter(bodyOnlyDocument);
});

Deno.bench("parseFrontmatter (yaml + 10k-word body)", () => {
  parseFrontmatter(megaPostDocument);
});

Deno.bench(
  "parseFrontmatter (invalid yaml fails fast)",
  { group: "frontmatter-errors", baseline: true },
  () => {
    try {
      parseFrontmatter(invalidYamlDocument);
    } catch {
      // expected
    }
  },
);

Deno.bench(
  "parseFrontmatter (missing closing delimiter)",
  { group: "frontmatter-errors" },
  () => {
    parseFrontmatter(missingClosingDelimiterDocument);
  },
);
