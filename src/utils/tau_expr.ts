import { TauError } from "./tau_error.ts";

/**
 * Identifiers Tau expressions may never resolve, whether accessed as a bare
 * identifier or as a static property name. This is the same defense-in-depth
 * blocklist Tau has always enforced; it is now checked structurally against
 * a parsed AST instead of scanned as text, which also closes the dynamic
 * `obj["constructor"]` bypass class (see {@link TauHelpers.get} in tau.ts).
 */
export const BLOCKED_EXPRESSION_NAMES: ReadonlySet<string> = new Set([
  "AsyncFunction",
  "Deno",
  "Function",
  "WebAssembly",
  "__proto__",
  "__tauIterable",
  "constructor",
  "eval",
  "helpers",
  "html",
  "globalThis",
  "import",
  "module",
  "process",
  "prototype",
  "require",
  "self",
  "context",
  "window",
]);

/**
 * JavaScript reserved words Tau expressions reject when used as a bare
 * identifier (a primary expression value), matching the language subset
 * documented in `docs/tau_syntax.md`.
 */
const RESERVED_KEYWORDS: ReadonlySet<string> = new Set([
  "await",
  "class",
  "delete",
  "function",
  "new",
  "this",
  "yield",
]);

/** A parsed Tau expression AST node. */
export type TauExprNode =
  | { type: "Literal"; value: string | number | boolean | null | undefined }
  | { type: "Identifier"; name: string }
  | {
    type: "Member";
    object: TauExprNode;
    property: TauExprNode | string;
    computed: boolean;
    optional: boolean;
  }
  | {
    type: "Call";
    callee: TauExprNode;
    args: TauExprNode[];
    optional: boolean;
  }
  | { type: "Unary"; operator: "!" | "-" | "+"; argument: TauExprNode }
  | { type: "Binary"; operator: string; left: TauExprNode; right: TauExprNode }
  | {
    type: "Logical";
    operator: "&&" | "||" | "??";
    left: TauExprNode;
    right: TauExprNode;
  }
  | {
    type: "Conditional";
    test: TauExprNode;
    consequent: TauExprNode;
    alternate: TauExprNode;
  };

type TokenType = "ident" | "number" | "string" | "punct";
interface Token {
  type: TokenType;
  value: string;
  pos: number;
}

const PUNCTUATORS = [
  "===",
  "!==",
  "?.",
  "??",
  "==",
  "!=",
  "<=",
  ">=",
  "&&",
  "||",
  ".",
  ",",
  "(",
  ")",
  "[",
  "]",
  "!",
  "-",
  "+",
  "*",
  "/",
  "%",
  "<",
  ">",
  "?",
  ":",
].sort((a, b) => b.length - a.length);

const BINARY_PRECEDENCE: Record<string, number> = {
  "??": 1,
  "||": 1,
  "&&": 2,
  "==": 3,
  "!=": 3,
  "===": 3,
  "!==": 3,
  "<": 4,
  "<=": 4,
  ">": 4,
  ">=": 4,
  "+": 5,
  "-": 5,
  "*": 6,
  "/": 6,
  "%": 6,
};

function isDigit(char: string): boolean {
  return char >= "0" && char <= "9";
}

function isIdentifierStart(char: string): boolean {
  return /[A-Za-z_$]/.test(char);
}

function isIdentifierPart(char: string): boolean {
  return /[A-Za-z0-9_$]/.test(char);
}

function fail(message: string, source: string): never {
  throw new TauError(
    "TAU_UNSAFE_EXPRESSION",
    `${message} in Tau expression: "${source}".`,
  );
}

function tokenize(source: string): Token[] {
  const tokens: Token[] = [];
  let pos = 0;

  const readString = (quote: string): string => {
    const start = pos;
    pos++;
    let value = "";
    while (true) {
      if (pos >= source.length) {
        fail("Unterminated string literal", source);
      }
      const char = source[pos];
      if (char === quote) {
        pos++;
        break;
      }
      if (char === "\\") {
        pos++;
        const escaped = source[pos];
        if (escaped === undefined) fail("Unterminated string literal", source);
        switch (escaped) {
          case "n":
            value += "\n";
            break;
          case "r":
            value += "\r";
            break;
          case "t":
            value += "\t";
            break;
          case "b":
            value += "\b";
            break;
          case "f":
            value += "\f";
            break;
          case "v":
            value += "\v";
            break;
          case "0":
            value += "\0";
            break;
          default:
            value += escaped;
        }
        pos++;
        continue;
      }
      value += char;
      pos++;
    }
    void start;
    return value;
  };

  const readNumber = (): number => {
    const start = pos;
    while (isDigit(source[pos] ?? "")) pos++;
    if (source[pos] === "." && isDigit(source[pos + 1] ?? "")) {
      pos++;
      while (isDigit(source[pos] ?? "")) pos++;
    }
    if (source[pos] === "e" || source[pos] === "E") {
      const save = pos;
      pos++;
      if (source[pos] === "+" || source[pos] === "-") pos++;
      if (isDigit(source[pos] ?? "")) {
        while (isDigit(source[pos] ?? "")) pos++;
      } else {
        pos = save;
      }
    }
    return Number(source.slice(start, pos));
  };

  while (pos < source.length) {
    const char = source[pos];
    if (char === " " || char === "\t" || char === "\n" || char === "\r") {
      pos++;
      continue;
    }
    if (char === "`" || char === ";" || char === "\\") {
      fail(`Unexpected character "${char}"`, source);
    }
    if (char === "=") {
      // Rejects bare "=" (assignment) and "=>" (arrow functions).
      if (source[pos + 1] === "=") {
        tokens.push({
          type: "punct",
          value: source[pos + 2] === "=" ? "===" : "==",
          pos,
        });
        pos += source[pos + 2] === "=" ? 3 : 2;
        continue;
      }
      fail('Assignment ("=") is not allowed', source);
    }
    if (char === "+" && source[pos + 1] === "+") {
      fail('Increment ("++") is not allowed', source);
    }
    if (char === "-" && source[pos + 1] === "-") {
      fail('Decrement ("--") is not allowed', source);
    }
    if (char === '"' || char === "'") {
      const value = readString(char);
      tokens.push({ type: "string", value, pos });
      continue;
    }
    if (isDigit(char)) {
      const startPos = pos;
      const value = readNumber();
      tokens.push({ type: "number", value: String(value), pos: startPos });
      continue;
    }
    if (isIdentifierStart(char)) {
      const start = pos;
      pos++;
      while (pos < source.length && isIdentifierPart(source[pos])) pos++;
      tokens.push({
        type: "ident",
        value: source.slice(start, pos),
        pos: start,
      });
      continue;
    }
    const punct = PUNCTUATORS.find((p) => source.startsWith(p, pos));
    if (punct) {
      tokens.push({ type: "punct", value: punct, pos });
      pos += punct.length;
      continue;
    }
    fail(`Unexpected character "${char}"`, source);
  }

  return tokens;
}

function assertAllowedPropertyName(name: string, source: string): void {
  if (BLOCKED_EXPRESSION_NAMES.has(name)) {
    throw new TauError(
      "TAU_UNSAFE_EXPRESSION",
      `Tau expression access to "${name}" is not allowed.`,
    );
  }
  void source;
}

class ExprParser {
  private index = 0;
  constructor(
    private readonly tokens: Token[],
    private readonly source: string,
  ) {}

  private peek(offset = 0): Token | undefined {
    return this.tokens[this.index + offset];
  }

  private advance(): Token {
    const token = this.tokens[this.index];
    if (!token) fail("Unexpected end of expression", this.source);
    this.index++;
    return token;
  }

  private matchPunct(value: string): boolean {
    const token = this.peek();
    return !!token && token.type === "punct" && token.value === value;
  }

  private expectPunct(value: string): void {
    if (!this.matchPunct(value)) {
      fail(`Expected "${value}"`, this.source);
    }
    this.advance();
  }

  parseTop(): TauExprNode {
    if (this.tokens.length === 0) {
      fail("Unexpected end of expression", this.source);
    }
    const node = this.parseConditional();
    if (this.index < this.tokens.length) {
      fail(`Unexpected token "${this.peek()!.value}"`, this.source);
    }
    return node;
  }

  private parseConditional(): TauExprNode {
    const test = this.parseBinary(1);
    if (this.matchPunct("?")) {
      this.advance();
      const consequent = this.parseConditional();
      this.expectPunct(":");
      const alternate = this.parseConditional();
      return { type: "Conditional", test, consequent, alternate };
    }
    return test;
  }

  private parseBinary(minPrec: number): TauExprNode {
    let left = this.parseUnary();
    while (true) {
      const token = this.peek();
      if (!token || token.type !== "punct") break;
      const prec = BINARY_PRECEDENCE[token.value];
      if (prec === undefined || prec < minPrec) break;
      this.advance();
      const right = this.parseBinary(prec + 1);
      if (
        token.value === "&&" || token.value === "||" || token.value === "??"
      ) {
        left = {
          type: "Logical",
          operator: token.value as "&&" | "||" | "??",
          left,
          right,
        };
      } else {
        left = { type: "Binary", operator: token.value, left, right };
      }
    }
    return left;
  }

  private parseUnary(): TauExprNode {
    if (this.matchPunct("!") || this.matchPunct("-") || this.matchPunct("+")) {
      const operator = this.advance().value as "!" | "-" | "+";
      const argument = this.parseUnary();
      return { type: "Unary", operator, argument };
    }
    return this.parsePostfix();
  }

  private parseArgs(): TauExprNode[] {
    this.expectPunct("(");
    const args: TauExprNode[] = [];
    if (!this.matchPunct(")")) {
      args.push(this.parseConditional());
      while (this.matchPunct(",")) {
        this.advance();
        args.push(this.parseConditional());
      }
    }
    this.expectPunct(")");
    return args;
  }

  private parsePropertyName(): string {
    const token = this.peek();
    if (!token || (token.type !== "ident")) {
      fail("Expected a property name", this.source);
    }
    this.advance();
    assertAllowedPropertyName(token.value, this.source);
    return token.value;
  }

  private parsePostfix(): TauExprNode {
    let expr = this.parsePrimary();
    while (true) {
      if (this.matchPunct(".")) {
        this.advance();
        const name = this.parsePropertyName();
        expr = {
          type: "Member",
          object: expr,
          property: name,
          computed: false,
          optional: false,
        };
      } else if (this.matchPunct("?.")) {
        this.advance();
        if (this.matchPunct("(")) {
          const args = this.parseArgs();
          expr = { type: "Call", callee: expr, args, optional: true };
        } else if (this.matchPunct("[")) {
          this.advance();
          const property = this.parseConditional();
          this.expectPunct("]");
          this.checkComputedLiteral(property);
          expr = {
            type: "Member",
            object: expr,
            property,
            computed: true,
            optional: true,
          };
        } else {
          const name = this.parsePropertyName();
          expr = {
            type: "Member",
            object: expr,
            property: name,
            computed: false,
            optional: true,
          };
        }
      } else if (this.matchPunct("[")) {
        this.advance();
        const property = this.parseConditional();
        this.expectPunct("]");
        this.checkComputedLiteral(property);
        expr = {
          type: "Member",
          object: expr,
          property,
          computed: true,
          optional: false,
        };
      } else if (this.matchPunct("(")) {
        const args = this.parseArgs();
        expr = { type: "Call", callee: expr, args, optional: false };
      } else {
        break;
      }
    }
    return expr;
  }

  private checkComputedLiteral(node: TauExprNode): void {
    if (node.type === "Literal" && typeof node.value === "string") {
      assertAllowedPropertyName(node.value, this.source);
    }
  }

  private parsePrimary(): TauExprNode {
    const token = this.peek();
    if (!token) fail("Unexpected end of expression", this.source);

    if (token.type === "number") {
      this.advance();
      return { type: "Literal", value: Number(token.value) };
    }
    if (token.type === "string") {
      this.advance();
      return { type: "Literal", value: token.value };
    }
    if (token.type === "punct" && token.value === "(") {
      this.advance();
      const inner = this.parseConditional();
      this.expectPunct(")");
      return inner;
    }
    if (token.type === "ident") {
      this.advance();
      switch (token.value) {
        case "true":
          return { type: "Literal", value: true };
        case "false":
          return { type: "Literal", value: false };
        case "null":
          return { type: "Literal", value: null };
        case "undefined":
          return { type: "Literal", value: undefined };
      }
      if (RESERVED_KEYWORDS.has(token.value)) {
        throw new TauError(
          "TAU_UNSAFE_EXPRESSION",
          `Tau expression keyword "${token.value}" is not allowed.`,
        );
      }
      return { type: "Identifier", name: token.value };
    }
    fail(`Unexpected token "${token.value}"`, this.source);
  }
}

/** Parses a Tau expression string into an AST, enforcing Tau's language subset. */
export function parseTauExpression(source: string): TauExprNode {
  const tokens = tokenize(source);
  return new ExprParser(tokens, source).parseTop();
}

/**
 * Compiles a Tau expression string to a JS source snippet safe to splice
 * into a compiled template function body.
 *
 * Free identifiers become explicit `context.name` reads (no `with`); names
 * in `locals` (bound `{#each}` item/index variables) are emitted bare since
 * they resolve to real lexical bindings in the generated function.
 */
export function compileExpression(
  source: string,
  locals: ReadonlySet<string>,
): string {
  const ast = parseTauExpression(source);
  return emitExpr(ast, locals);
}

function emitExpr(node: TauExprNode, locals: ReadonlySet<string>): string {
  switch (node.type) {
    case "Literal":
      return node.value === undefined
        ? "undefined"
        : JSON.stringify(node.value);
    case "Identifier": {
      if (locals.has(node.name)) return node.name;
      if (BLOCKED_EXPRESSION_NAMES.has(node.name)) {
        throw new TauError(
          "TAU_UNSAFE_EXPRESSION",
          `Tau expression access to "${node.name}" is not allowed.`,
        );
      }
      return `context.${node.name}`;
    }
    case "Member": {
      const objectSrc = emitExpr(node.object, locals);
      if (node.computed) {
        const propertySrc = emitExpr(node.property as TauExprNode, locals);
        return `helpers.get(${objectSrc}, ${propertySrc}, ${node.optional})`;
      }
      return `${objectSrc}${node.optional ? "?." : "."}${node
        .property as string}`;
    }
    case "Call": {
      const calleeSrc = emitExpr(node.callee, locals);
      const argsSrc = node.args.map((arg) => emitExpr(arg, locals)).join(", ");
      // Unconditional await lets a context function be sync or async.
      return node.optional
        ? `(await ${calleeSrc}?.(${argsSrc}))`
        : `(await ${calleeSrc}(${argsSrc}))`;
    }
    case "Unary":
      return `(${node.operator}${emitExpr(node.argument, locals)})`;
    case "Binary":
      return `(${emitExpr(node.left, locals)} ${node.operator} ${
        emitExpr(node.right, locals)
      })`;
    case "Logical":
      return `(${emitExpr(node.left, locals)} ${node.operator} ${
        emitExpr(node.right, locals)
      })`;
    case "Conditional":
      return `(${emitExpr(node.test, locals)} ? ${
        emitExpr(node.consequent, locals)
      } : ${emitExpr(node.alternate, locals)})`;
  }
}
