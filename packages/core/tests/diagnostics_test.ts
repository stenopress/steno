import { assertEquals, assertThrows } from "@std/assert";
import {
  DiagnosticBag,
  enforceDiagnostics,
  formatDiagnostic,
  StenoDiagnosticError,
} from "../src/diagnostics.ts";

Deno.test("diagnostics inherit config provenance without mutating inputs", () => {
  const diagnostic = {
    code: "plugin-load-failed",
    severity: "error" as const,
    message: "Unavailable",
  };
  const bag = new DiagnosticBag("site.yml");
  bag.add(diagnostic);
  bag.add({ ...diagnostic, config: "other.yml" });
  assertEquals(bag.all[0], { ...diagnostic, config: "site.yml" });
  assertEquals(bag.all[1].config, "other.yml");
  assertEquals("config" in diagnostic, false);
  const zeroConfigBag = new DiagnosticBag();
  zeroConfigBag.add(diagnostic);
  assertEquals(zeroConfigBag.all[0].config, undefined);
});

Deno.test("diagnostic formatting includes input context and avoids repeated config paths", () => {
  assertEquals(
    formatDiagnostic({
      code: "plugin-load-failed",
      severity: "error",
      message: "Unavailable",
      file: "plugin.ts",
      config: "site.yml",
      plugin: "plugin",
      theme: "local",
      hint: "Check the source.",
    }),
    '[plugin-load-failed] Unavailable (plugin.ts) [plugin "plugin", theme "local", config "site.yml"]\n  hint: Check the source.',
  );
  assertEquals(
    formatDiagnostic({
      code: "config-invalid",
      severity: "error",
      message: "Invalid",
      file: "site.yml",
      config: "site.yml",
    }),
    "[config-invalid] Invalid (site.yml)",
  );
});

Deno.test("diagnostics retain context in production errors and remain permissive in dev", () => {
  const bag = new DiagnosticBag("site.yml");
  bag.add({
    code: "theme-load-failed",
    severity: "error",
    message: "Unavailable",
    theme: "local",
    hint: "Check the theme.",
  });
  const lines: string[] = [];
  const originalError = console.error;
  console.error = (line) => lines.push(String(line));
  try {
    enforceDiagnostics(bag, true);
    const error = assertThrows(() => enforceDiagnostics(bag, false), StenoDiagnosticError);
    assertEquals(error.diagnostics, bag.errors);
    assertEquals(lines.length, 2);
    assertEquals(lines[0], `[steno:error] ${formatDiagnostic(bag.all[0])}`);
  } finally {
    console.error = originalError;
  }
});
