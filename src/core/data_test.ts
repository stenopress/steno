import { assertEquals } from "@std/assert";
import { join } from "@std/path";
import { loadDataFiles } from "./data.ts";

function makeDataDir(files: Record<string, string>): string {
    const tempDir = Deno.makeTempDirSync();
    const dataDir = join(tempDir, "_data");
    Deno.mkdirSync(dataDir, { recursive: true });

    for (const [relPath, content] of Object.entries(files)) {
        const fullPath = join(dataDir, relPath);
        Deno.mkdirSync(join(fullPath, ".."), { recursive: true });
        Deno.writeTextFileSync(fullPath, content);
    }

    return tempDir;
}

export function registerDataTests(): void {
    Deno.test("data: returns empty object when _data dir does not exist", () => {
        const tempDir = Deno.makeTempDirSync();
        const result = loadDataFiles(tempDir);
        assertEquals(result, {});
    });

    Deno.test("data: loads a JSON file", () => {
        const dir = makeDataDir({"team.json": `[{"name":"Alice"}]`});
        const result = loadDataFiles(dir);
        assertEquals(result.team, [{name: "Alice"}]);
    });

    Deno.test("data: loads a YAML file", () => {
        const dir = makeDataDir({"nav.yaml": `- title: Home\n  url: /\n`});
        const result = loadDataFiles(dir);
        assertEquals(result.nav, [{title: "Home", url: "/"}]);
    });

    Deno.test("data: loads a TOML file", () => {
        const dir = makeDataDir({"site.toml": `title = "My Site"\n`});
        const result = loadDataFiles(dir);
        assertEquals(result.site, {title: "My Site"});
    });

    Deno.test("data: nested directory becomes nested key", () => {
        const dir = makeDataDir({
            "blog/authors.json": `[{"name":"Bob"}]`,
        });
        const result = loadDataFiles(dir);
        assertEquals((result.blog as Record<string, unknown>).authors, [{name: "Bob"}]);
    });

    Deno.test("data: multiple files are merged", () => {
        const dir = makeDataDir({
            "team.json": `[{"name":"Alice"}]`,
            "nav.yaml": `- title: Home\n  url: /\n`,
        });
        const result = loadDataFiles(dir);
        assertEquals(Array.isArray(result.team), true);
        assertEquals(Array.isArray(result.nav), true);
    });

    Deno.test("data: skips unsupported file types", () => {
        const dir = makeDataDir({
            "notes.txt": `hello`,
            "team.json": `[{"name":"Alice"}]`,
        });
        const result = loadDataFiles(dir);
        assertEquals(Object.keys(result), ["team"]);
    });

    Deno.test("data: yml extension is supported", () => {
        const dir = makeDataDir({"config.yml": `debug: true\n`});
        const result = loadDataFiles(dir);
        assertEquals(result.config, {debug: true});
    });

    Deno.test("data: invalid JSON is skipped with warning", () => {
        const dir = makeDataDir({"broken.json": `{not valid json`});
        // should not throw
        const result = loadDataFiles(dir);
        assertEquals(result.broken, undefined);
    });
}