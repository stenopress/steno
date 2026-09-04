const ESC = "\x1b[";

function noColorRequested(): boolean {
  try {
    return Deno.env.get("NO_COLOR") !== undefined;
  } catch {
    return false;
  }
}

const useColor = !noColorRequested();
const color = (code: string): string => (useColor ? `${ESC}${code}m` : "");

/** Shared color codes used by the init scaffolders. */
export const c = {
  reset: color("0"),
  bold: color("1"),
  dim: color("2"),
  purple: color("38;5;135"),
  purpleBold: color("1;38;5;135"),
  white: color("97"),
  whiteBold: color("1;97"),
  gray: color("38;5;245"),
  green: color("38;5;120"),
  yellow: color("38;5;222"),
  cyan: color("38;5;159"),
  cyanBold: color("1;38;5;159"),
};

/** Wraps text in a terminal color and resets the color afterward. */
export function paint(terminalColor: string, text: string): string {
  return `${terminalColor}${text}${c.reset}`;
}

function stripAnsi(text: string): string {
  return text.replace(new RegExp(`${ESC}[0-9;]*m`, "g"), "");
}

function terminalWidth(): number {
  try {
    return Deno.consoleSize().columns;
  } catch {
    return 80;
  }
}

function wrapText(text: string, width: number): string[] {
  const lines: string[] = [];
  let current = "";
  for (const word of text.split(" ")) {
    const next = current ? `${current} ${word}` : word;
    if (next.length <= width) current = next;
    else {
      if (current) lines.push(current);
      current = word;
    }
  }
  if (current) lines.push(current);
  return lines;
}

export function printBanner(): void {
  const logo = [
    `   \x1b[32mTTTTT\x1b[0m    \x1b[31mNNNN\x1b[0m`,
    ` \x1b[35mSSS\x1b[0m \x1b[32mT\x1b[0m \x1b[33mEEEE\x1b[0m \x1b[31mN  N\x1b[0m \x1b[34mOOOO\x1b[0m`,
    `\x1b[35mS\x1b[0m    \x1b[32mT\x1b[0m \x1b[33mE\x1b[0m    \x1b[31mN  N\x1b[0m \x1b[34mO  O\x1b[0m`,
    ` \x1b[35mSS\x1b[0m  \x1b[32mT\x1b[0m \x1b[33mEEE\x1b[0m  \x1b[31mN  N\x1b[0m \x1b[34mO  O\x1b[0m`,
    `   \x1b[35mS\x1b[0m \x1b[32mT\x1b[0m \x1b[33mE\x1b[0m    \x1b[31mN  N\x1b[0m \x1b[34mO  O\x1b[0m`,
    `\x1b[35mSSS\x1b[0m    \x1b[33mEEEE\x1b[0m      \x1b[34mOOOO\x1b[0m`,
  ];
  const logoWidth = Math.max(...logo.map((line) => stripAnsi(line).length));
  const lines = wrapText("A fast Deno-powered static site generator", logoWidth);
  const leftPad = Math.max(0, Math.floor((terminalWidth() - logoWidth) / 2));
  const prefix = " ".repeat(leftPad);

  for (const line of logo) console.log(prefix + (useColor ? line : stripAnsi(line)));
  console.log();
  for (const line of lines) {
    const pad = Math.floor((logoWidth - line.length) / 2);
    console.log(paint(c.gray, prefix + " ".repeat(pad) + line));
  }
  console.log();
}

/** Prints a section header matching the onboarding output. */
export function heading(text: string): void {
  console.log(`\n${paint(c.purpleBold, "◆")} ${paint(c.whiteBold, text)}`);
  console.log(paint(c.gray, "  " + "─".repeat(text.length + 2)));
}

export function isInteractiveTerminal(): boolean {
  try {
    return Deno.stdin.isTerminal() && Deno.stdout.isTerminal();
  } catch {
    return false;
  }
}

export function setRawMode(enabled: boolean): void {
  try {
    Deno.stdin.setRaw(enabled);
  } catch {
    // A non-interactive stdin cannot enter raw mode.
  }
}

const encoder = new TextEncoder();

export function writeTerminal(text: string): void {
  Deno.stdout.writeSync(encoder.encode(text));
}

export type Key = "up" | "down" | "space" | "enter" | "cancel" | "unknown";

export function decodeKey(bytes: Uint8Array): Key {
  if (bytes.length === 1) {
    if (bytes[0] === 3 || bytes[0] === 27) return "cancel";
    if (bytes[0] === 13 || bytes[0] === 10) return "enter";
    if (bytes[0] === 32) return "space";
  }
  if (bytes.length >= 3 && bytes[0] === 27 && bytes[1] === 91) {
    if (bytes[2] === 65) return "up";
    if (bytes[2] === 66) return "down";
  }
  return "unknown";
}

export function readKey(): Key {
  const buffer = new Uint8Array(8);
  const bytesRead = Deno.stdin.readSync(buffer);
  return bytesRead ? decodeKey(buffer.subarray(0, bytesRead)) : "unknown";
}

export function truncate(text: string, maxLength: number): string {
  if (maxLength <= 1 || text.length <= maxLength) return text;
  return text.slice(0, Math.max(0, maxLength - 1)).trimEnd() + "…";
}

export { ESC };
