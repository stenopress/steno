/** Stable error codes emitted while parsing or rendering Tau templates. */
export type TauErrorCode =
  | "TAU_COMPONENT_CYCLE"
  | "TAU_COMPONENT_NOT_FOUND"
  | "TAU_INCLUDE_CYCLE"
  | "TAU_INCLUDE_RESOLVER_MISSING"
  | "TAU_INVALID_IDENTIFIER"
  | "TAU_INVALID_LIMIT"
  | "TAU_LIMIT_DEPTH"
  | "TAU_LIMIT_ITERATIONS"
  | "TAU_LIMIT_OUTPUT"
  | "TAU_LIMIT_TEMPLATE"
  | "TAU_PARSE_EMPTY"
  | "TAU_PARSE_EXPECTED_TOKEN"
  | "TAU_PARSE_INVALID_EACH"
  | "TAU_PARSE_UNCLOSED_BLOCK"
  | "TAU_RENDER_FAILED"
  | "TAU_UNKNOWN_FILTER"
  | "TAU_UNSAFE_EXPRESSION"
  | "TAU_UNSAFE_INCLUDE_PATH"
  | "TAU_UNSAFE_PROP"
  | "TAU_UNSAFE_URL";

/** Optional source location associated with a Tau error. */
export interface TauErrorLocation {
  /** Path of the template that caused the error. */
  filePath?: string;
  /** One-based source line. */
  line?: number;
  /** One-based source column. */
  column?: number;
}

/** Structured error thrown by the Tau parser and renderer. */
export class TauError extends Error {
  /** Machine-readable error category. */
  readonly code: TauErrorCode;
  /** Template path associated with the error. */
  readonly filePath?: string;
  /** One-based source line associated with the error. */
  readonly line?: number;
  /** One-based source column associated with the error. */
  readonly column?: number;

  /** Creates a Tau error with an optional source location and cause. */
  constructor(
    code: TauErrorCode,
    message: string,
    location: TauErrorLocation = {},
    options?: ErrorOptions,
  ) {
    const position = location.filePath && location.line && location.column
      ? `${location.filePath}:${location.line}:${location.column}: `
      : location.line && location.column
      ? `Line ${location.line}, col ${location.column}: `
      : "";
    super(`${position}${message}`, options);
    this.name = "TauError";
    this.code = code;
    this.filePath = location.filePath;
    this.line = location.line;
    this.column = location.column;
  }
}

/** Returns a concise recovery suggestion for a Tau failure. */
export function getTauErrorHint(code: TauErrorCode): string {
  if (code.startsWith("TAU_PARSE_")) {
    return "Check Tau block syntax and matching closing tags.";
  }
  if (code.startsWith("TAU_LIMIT_")) {
    return "Reduce template work or intentionally raise the corresponding Tau limit.";
  }

  switch (code) {
    case "TAU_COMPONENT_NOT_FOUND":
      return "Define the component in the active theme or correct its name.";
    case "TAU_UNKNOWN_FILTER":
      return "Use a registered Tau filter or correct its name.";
    case "TAU_UNSAFE_URL":
      return "Use an HTTP(S), mailto, tel, relative, or fragment URL.";
    case "TAU_UNSAFE_INCLUDE_PATH":
      return "Use a relative include path that stays inside the content root.";
    case "TAU_COMPONENT_CYCLE":
    case "TAU_INCLUDE_CYCLE":
      return "Remove the recursive component or include reference.";
    case "TAU_INCLUDE_RESOLVER_MISSING":
      return "Provide an include resolver before using include directives.";
    case "TAU_INVALID_IDENTIFIER":
    case "TAU_UNSAFE_EXPRESSION":
    case "TAU_UNSAFE_PROP":
      return "Use a simple, safe template expression without privileged property access.";
    case "TAU_RENDER_FAILED":
      return "Check the template expression and its input values.";
    default:
      return "Check the template syntax and input values.";
  }
}

/** Formats a Tau error for human-readable CLI output. */
export function formatTauError(error: TauError): string {
  return `${error.message}\n  Code: ${error.code}\n  Hint: ${
    getTauErrorHint(error.code)
  }`;
}
