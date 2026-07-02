import { assertEquals, assertThrows } from "@std/assert";
import { parseCliArgs } from "./cli.ts";

export function registerCliTests(): void {
  Deno.test("cli: defaults to build with default config", () => {
    const options = parseCliArgs([]);
    assertEquals(options, {
      command: "build",
      configPath: "content/.steno/config.yml",
    });
  });

  Deno.test("cli: parses dev command", () => {
    const options = parseCliArgs(["dev"]);
    assertEquals(options, {
      command: "dev",
      configPath: "content/.steno/config.yml",
    });
  });

  Deno.test("cli: parses build command and custom config", () => {
    const options = parseCliArgs([
      "build",
      "--config",
      "content/.steno/custom.yml",
    ]);
    assertEquals(options, {
      command: "build",
      configPath: "content/.steno/custom.yml",
    });
  });

  Deno.test("cli: handles short config flag", () => {
    const options = parseCliArgs(["-c", "content/.steno/config.toml"]);
    assertEquals(options, {
      command: "build",
      configPath: "content/.steno/config.toml",
    });
  });

  Deno.test("cli: returns help command", () => {
    const options = parseCliArgs(["--help"]);
    assertEquals(options, {
      command: "help",
      configPath: "content/.steno/config.yml",
    });
  });

  Deno.test("cli: throws on unknown command", () => {
    assertThrows(
      () => parseCliArgs(["serve"]),
      Error,
      "Unknown command: serve",
    );
  });

  Deno.test("cli: throws on unknown option", () => {
    assertThrows(
      () => parseCliArgs(["--wat"]),
      Error,
      "Unknown option: --wat",
    );
  });

  Deno.test("cli: throws when config value is missing", () => {
    assertThrows(
      () => parseCliArgs(["build", "--config"]),
      Error,
      "Missing value for --config",
    );
  });
}
