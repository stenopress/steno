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

export interface TauErrorLocation {
  filePath?: string;
  line?: number;
  column?: number;
}

export class TauError extends Error {
  readonly code: TauErrorCode;
  readonly filePath?: string;
  readonly line?: number;
  readonly column?: number;

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
