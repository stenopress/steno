import { c, paint } from "./terminal.ts";

export function toYamlString(value: string): string {
  return `"${value.replaceAll("\\", "\\\\").replaceAll('"', '\\"')}"`;
}

export function promptWithDefault(label: string, defaultValue: string): string {
  const arrow = paint(c.purple, "›");
  const fallback = paint(c.gray, `(${defaultValue})`);
  return prompt(`  ${arrow} ${label} ${fallback}`)?.trim() || defaultValue;
}

export function promptYesNo(label: string, defaultValue = false): boolean {
  const arrow = paint(c.purple, "›");
  const hint = defaultValue ? paint(c.gray, "[Y/n]") : paint(c.gray, "[y/N]");
  while (true) {
    const value = prompt(`  ${arrow} ${label} ${hint}`)?.trim().toLowerCase();
    if (!value) return defaultValue;
    if (value === "y" || value === "yes") return true;
    if (value === "n" || value === "no") return false;
    console.log(paint(c.yellow, "  ⚠  Please answer yes or no."));
  }
}

export function promptPackageSpecifier(): string | undefined {
  const arrow = paint(c.purple, "›");
  return (
    prompt(
      `  ${arrow} Package specifier ${paint(c.gray, "(e.g. jsr:@user/plugin-name)")}`,
    )?.trim() || undefined
  );
}
