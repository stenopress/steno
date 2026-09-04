import { c, paint } from "./terminal.ts";

export type OnboardingFailure = new (message: string) => Error;

export function checkProjectOverwrite(paths: string[], Failure: OnboardingFailure): void {
  const existing = paths.filter((path) => {
    try {
      Deno.statSync(path);
      return true;
    } catch (error) {
      if (error instanceof Deno.errors.NotFound) return false;
      throw error;
    }
  });

  if (existing.length === 0) return;
  throw new Failure(
    `Aborted: the following files already exist:\n${existing
      .map((path) => `  ${paint(c.purple, "•")} ${path}`)
      .join("\n")}\n\nUse ${paint(c.whiteBold, "--force")} to overwrite.`,
  );
}
