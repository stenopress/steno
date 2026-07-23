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
