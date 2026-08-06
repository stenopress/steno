import { assertEquals, assertStringIncludes } from "@std/assert";
import { join } from "@std/path";
import { runDoctor } from "./doctor.ts";

export function registerDoctorTests(): void {
  Deno.test({
    name: "doctor: reports each plugin execution mode",
    permissions: { read: true, write: true },
    fn: async () => {
      const tempDir = await Deno.makeTempDir();
      const contentDir = join(tempDir, "content");
      const outputDir = join(tempDir, "dist");
      const configPath = join(tempDir, "config.yml");
      await Deno.mkdir(contentDir);
      await Deno.writeTextFile(join(contentDir, "index.md"), "# Home");
      await Deno.writeTextFile(
        configPath,
        `contentDir: ${JSON.stringify(contentDir)}
output: ${JSON.stringify(outputDir)}
plugins:
  - package: "jsr:@example/trusted@1"
  - package: "jsr:@example/isolated@1"
    mode: isolated
`,
      );

      const messages: string[] = [];
      const original = {
        log: console.log,
        warn: console.warn,
        error: console.error,
      };
      console.log = (...args) => messages.push(args.join(" "));
      console.warn = (...args) => messages.push(args.join(" "));
      console.error = (...args) => messages.push(args.join(" "));
      try {
        await runDoctor(configPath);
      } finally {
        Object.assign(console, original);
      }

      const output = messages.join("\n");
      assertStringIncludes(
        output,
        "Plugin jsr:@example/trusted@1 (trusted, in-process)",
      );
      assertStringIncludes(
        output,
        "Plugin jsr:@example/isolated@1 (isolated, subprocess)",
      );
      assertStringIncludes(
        output,
        'Consider "mode: isolated" for third-party plugins',
      );
    },
  });

  Deno.test({
    name:
      "doctor: does not suggest isolation when all plugins are already isolated",
    permissions: { read: true, write: true },
    fn: async () => {
      const tempDir = await Deno.makeTempDir();
      const contentDir = join(tempDir, "content");
      const outputDir = join(tempDir, "dist");
      const configPath = join(tempDir, "config.yml");
      await Deno.mkdir(contentDir);
      await Deno.writeTextFile(join(contentDir, "index.md"), "# Home");
      await Deno.writeTextFile(
        configPath,
        `contentDir: ${JSON.stringify(contentDir)}
output: ${JSON.stringify(outputDir)}
plugins:
  - package: "jsr:@example/isolated@1"
    mode: isolated
`,
      );

      const messages: string[] = [];
      const original = {
        log: console.log,
        warn: console.warn,
        error: console.error,
      };
      console.log = (...args) => messages.push(args.join(" "));
      console.warn = (...args) => messages.push(args.join(" "));
      console.error = (...args) => messages.push(args.join(" "));
      try {
        await runDoctor(configPath);
      } finally {
        Object.assign(console, original);
      }

      const output = messages.join("\n");
      const hintCount =
        output.split('Consider "mode: isolated" for third-party plugins')
          .length - 1;
      assertEquals(hintCount, 0);
    },
  });

  Deno.test({
    name: "doctor: passes on a zero-config project with no config.yml",
    permissions: { read: true, write: true },
    fn: async () => {
      const tempDir = await Deno.makeTempDir();
      const originalCwd = Deno.cwd();
      await Deno.mkdir(join(tempDir, "content"), { recursive: true });
      await Deno.writeTextFile(
        join(tempDir, "content", "index.md"),
        "# Home",
      );

      const messages: string[] = [];
      const original = {
        log: console.log,
        warn: console.warn,
        error: console.error,
      };
      console.log = (...args) => messages.push(args.join(" "));
      console.warn = (...args) => messages.push(args.join(" "));
      console.error = (...args) => messages.push(args.join(" "));
      try {
        Deno.chdir(tempDir);
        await runDoctor("content/.steno/config.yml");
      } finally {
        Deno.chdir(originalCwd);
        Object.assign(console, original);
      }

      const output = messages.join("\n");
      assertStringIncludes(output, "Zero-config mode");
      assertEquals(output.includes("Config not found"), false);
    },
  });

  Deno.test({
    name: "doctor: warns when theme/shortUrls remain nested under custom",
    permissions: { read: true, write: true },
    fn: async () => {
      const tempDir = await Deno.makeTempDir();
      const contentDir = join(tempDir, "content");
      const outputDir = join(tempDir, "dist");
      const configPath = join(tempDir, "config.yml");
      await Deno.mkdir(contentDir);
      await Deno.writeTextFile(join(contentDir, "index.md"), "# Home");
      await Deno.writeTextFile(
        configPath,
        `contentDir: ${JSON.stringify(contentDir)}
output: ${JSON.stringify(outputDir)}
custom:
  theme: "./theme"
  shortUrls: true
`,
      );

      const messages: string[] = [];
      const original = {
        log: console.log,
        warn: console.warn,
        error: console.error,
      };
      console.log = (...args) => messages.push(args.join(" "));
      console.warn = (...args) => messages.push(args.join(" "));
      console.error = (...args) => messages.push(args.join(" "));
      try {
        await runDoctor(configPath);
      } finally {
        Object.assign(console, original);
      }

      const output = messages.join("\n");
      assertStringIncludes(
        output,
        'custom.theme is deprecated - move it to top-level "theme"',
      );
      assertStringIncludes(
        output,
        'custom.shortUrls is deprecated - move it to top-level "shortUrls"',
      );
    },
  });

  Deno.test({
    name: "doctor: does not warn when theme/shortUrls are top-level",
    permissions: { read: true, write: true },
    fn: async () => {
      const tempDir = await Deno.makeTempDir();
      const contentDir = join(tempDir, "content");
      const outputDir = join(tempDir, "dist");
      const configPath = join(tempDir, "config.yml");
      await Deno.mkdir(contentDir);
      await Deno.writeTextFile(join(contentDir, "index.md"), "# Home");
      await Deno.writeTextFile(
        configPath,
        `contentDir: ${JSON.stringify(contentDir)}
output: ${JSON.stringify(outputDir)}
theme: "./theme"
shortUrls: true
`,
      );

      const messages: string[] = [];
      const original = {
        log: console.log,
        warn: console.warn,
        error: console.error,
      };
      console.log = (...args) => messages.push(args.join(" "));
      console.warn = (...args) => messages.push(args.join(" "));
      console.error = (...args) => messages.push(args.join(" "));
      try {
        await runDoctor(configPath);
      } finally {
        Object.assign(console, original);
      }

      const output = messages.join("\n");
      assertEquals(output.includes("is deprecated"), false);
    },
  });

  Deno.test({
    name:
      "doctor: does not flag malformed frontmatter in public/ (real build never parses it)",
    permissions: { read: true, write: true },
    fn: async () => {
      const tempDir = await Deno.makeTempDir();
      const contentDir = join(tempDir, "content");
      const outputDir = join(tempDir, "dist");
      const configPath = join(tempDir, "config.yml");
      await Deno.mkdir(contentDir);
      await Deno.writeTextFile(join(contentDir, "index.md"), "# Home");

      // A raw markdown file meant to be served as-is, not parsed as a page.
      const publicDir = join(contentDir, "public");
      await Deno.mkdir(publicDir);
      await Deno.writeTextFile(
        join(publicDir, "raw.md"),
        "---\nnot: [valid\n---\nbroken frontmatter on purpose\n",
      );

      await Deno.writeTextFile(
        configPath,
        `contentDir: ${JSON.stringify(contentDir)}
output: ${JSON.stringify(outputDir)}
`,
      );

      const messages: string[] = [];
      const original = {
        log: console.log,
        warn: console.warn,
        error: console.error,
      };
      console.log = (...args) => messages.push(args.join(" "));
      console.warn = (...args) => messages.push(args.join(" "));
      console.error = (...args) => messages.push(args.join(" "));
      try {
        await runDoctor(configPath);
      } finally {
        Object.assign(console, original);
      }

      const output = messages.join("\n");
      assertStringIncludes(output, "Frontmatter parses cleanly");
      assertEquals(output.includes("raw.md"), false);
    },
  });

  Deno.test({
    name: "doctor: flags malformed frontmatter in an actual content page",
    permissions: { read: true, write: true },
    fn: async () => {
      const tempDir = await Deno.makeTempDir();
      const contentDir = join(tempDir, "content");
      const outputDir = join(tempDir, "dist");
      const configPath = join(tempDir, "config.yml");
      await Deno.mkdir(contentDir);
      await Deno.writeTextFile(
        join(contentDir, "broken.md"),
        "---\nnot: [valid\n---\nbroken frontmatter on purpose\n",
      );
      await Deno.writeTextFile(
        configPath,
        `contentDir: ${JSON.stringify(contentDir)}
output: ${JSON.stringify(outputDir)}
`,
      );

      const messages: string[] = [];
      const original = {
        log: console.log,
        warn: console.warn,
        error: console.error,
      };
      console.log = (...args) => messages.push(args.join(" "));
      console.warn = (...args) => messages.push(args.join(" "));
      console.error = (...args) => messages.push(args.join(" "));
      try {
        await runDoctor(configPath);
      } finally {
        Object.assign(console, original);
      }

      const output = messages.join("\n");
      assertStringIncludes(output, "broken.md");
      assertStringIncludes(output, "Doctor found errors");
    },
  });
}
