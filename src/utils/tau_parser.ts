import { TauError, type TauErrorCode } from "./tau_error.ts";

export interface Node {
  type:
    | "text"
    | "expression"
    | "html"
    | "if"
    | "each"
    | "let"
    | "component"
    | "include";
  value?: string;
  expression?: string;
  filters?: { name: string; args: string[] }[];
  condition?: string;
  array?: string;
  item?: string;
  indexVar?: string;
  letName?: string;
  consequent?: Node[];
  alternate?: Node[];
  componentName?: string;
  props?: Record<string, string>;
  includePath?: string;
  /** Whitespace-control: trim the sibling text immediately before this node. */
  trimBefore?: boolean;
  /** Whitespace-control: trim the sibling text immediately after this node. */
  trimAfter?: boolean;
}

const IDENTIFIER_PATTERN = /^[A-Za-z_$][\w$]*$/;

function hasControlCharacters(value: string): boolean {
  for (let index = 0; index < value.length; index++) {
    const code = value.charCodeAt(index);
    if (code <= 0x1F || code === 0x7F) return true;
  }
  return false;
}

function splitTopLevel(
  value: string,
  delimiter: "|" | ",",
): string[] {
  const parts: string[] = [];
  let start = 0;
  let quote = "";
  let escaped = false;
  let roundDepth = 0;
  let squareDepth = 0;

  for (let index = 0; index < value.length; index++) {
    const char = value[index];
    if (quote) {
      if (escaped) escaped = false;
      else if (char === "\\") escaped = true;
      else if (char === quote) quote = "";
      continue;
    }
    if (char === '"' || char === "'") {
      quote = char;
      continue;
    }
    if (char === "(") roundDepth++;
    else if (char === ")") roundDepth--;
    else if (char === "[") squareDepth++;
    else if (char === "]") squareDepth--;
    else if (
      char === delimiter &&
      roundDepth === 0 &&
      squareDepth === 0 &&
      !(delimiter === "|" &&
        (value[index - 1] === "|" || value[index + 1] === "|"))
    ) {
      parts.push(value.substring(start, index));
      start = index + 1;
    }
  }
  parts.push(value.substring(start));
  return parts;
}

/**
 * Whitespace-control tag variants. A tag written as `{-#if `/`{-:else}`/etc.
 * trims the trailing whitespace of the text immediately before it; a tag
 * written as `{#if cond-}`/`{:else-}`/etc. trims the leading whitespace of
 * the text immediately after it. Scoped to `{#if}`, `{:else if}`, `{:else}`,
 * `{/if}`, `{#each}`, and `{/each}`.
 */
function tagVariants(literal: string): string[] {
  const withBefore = "{-" + literal.slice(1);
  const withAfter = literal.slice(0, -1) + "-}";
  const withBoth = "{-" + literal.slice(1, -1) + "-}";
  return [withBoth, withBefore, withAfter, literal];
}

function prefixVariants(prefix: string): string[] {
  return ["{-" + prefix.slice(1), prefix];
}

function trimTrailingWhitespace(nodes: Node[]): void {
  const last = nodes[nodes.length - 1];
  if (last?.type === "text" && last.value !== undefined) {
    last.value = last.value.replace(/\s+$/, "");
  }
}

function trimLeadingWhitespace(nodes: Node[]): void {
  const first = nodes[0];
  if (first?.type === "text" && first.value !== undefined) {
    first.value = first.value.replace(/^\s+/, "");
  }
}

function extractTrimSuffix(
  raw: string,
): { content: string; trimAfter: boolean } {
  if (raw.endsWith("-")) {
    return { content: raw.slice(0, -1).trim(), trimAfter: true };
  }
  return { content: raw, trimAfter: false };
}

function assertIdentifier(
  value: string,
  label: string,
  fail: (message: string) => never,
): void {
  if (!IDENTIFIER_PATTERN.test(value)) {
    fail(`Invalid ${label} "${value}". Expected a JavaScript identifier.`);
  }
  if (value.startsWith("__tau")) {
    fail(`Invalid ${label} "${value}". The "__tau" prefix is reserved.`);
  }
}

export function parseProps(attrString: string): Record<string, string> {
  const props: Record<string, string> = Object.create(null);
  let i = 0;
  while (i < attrString.length) {
    while (i < attrString.length && /\s/.test(attrString[i])) i++;
    if (i >= attrString.length) break;

    if (attrString[i] === "{") {
      i++;
      const start = i;
      let braceCount = 1;
      while (i < attrString.length && braceCount > 0) {
        if (attrString[i] === "{") braceCount++;
        else if (attrString[i] === "}") braceCount--;
        if (braceCount > 0) i++;
      }
      const propName = attrString.substring(start, i).trim();
      if (braceCount !== 0) {
        throw new TauError(
          "TAU_PARSE_UNCLOSED_BLOCK",
          "Unclosed shorthand component prop.",
        );
      }
      if (!IDENTIFIER_PATTERN.test(propName)) {
        throw new TauError(
          "TAU_INVALID_IDENTIFIER",
          `Invalid component prop "${propName}".`,
        );
      }
      if (["__proto__", "constructor", "prototype"].includes(propName)) {
        throw new TauError(
          "TAU_UNSAFE_PROP",
          `Tau component prop "${propName}" is not allowed.`,
        );
      }
      props[propName] = propName;
      i++;
      continue;
    }

    const nameStart = i;
    while (i < attrString.length && !/[\s=>\/]/.test(attrString[i])) i++;
    const name = attrString.substring(nameStart, i);
    if (!name) {
      i++;
      continue;
    }
    if (["__proto__", "constructor", "prototype"].includes(name)) {
      throw new TauError(
        "TAU_UNSAFE_PROP",
        `Tau component prop "${name}" is not allowed.`,
      );
    }

    while (i < attrString.length && /\s/.test(attrString[i])) i++;

    if (attrString[i] === "=") {
      i++;
      while (i < attrString.length && /\s/.test(attrString[i])) i++;
      if (attrString[i] === "{") {
        i++;
        const start = i;
        let braceCount = 1;
        while (i < attrString.length && braceCount > 0) {
          if (attrString[i] === "{") braceCount++;
          else if (attrString[i] === "}") braceCount--;
          if (braceCount > 0) i++;
        }
        if (braceCount !== 0) {
          throw new TauError(
            "TAU_PARSE_UNCLOSED_BLOCK",
            `Unclosed expression for component prop "${name}".`,
          );
        }
        props[name] = attrString.substring(start, i).trim();
        i++;
      } else if (attrString[i] === '"' || attrString[i] === "'") {
        const quote = attrString[i++];
        const start = i;
        while (i < attrString.length && attrString[i] !== quote) i++;
        if (i >= attrString.length) {
          throw new TauError(
            "TAU_PARSE_UNCLOSED_BLOCK",
            `Unclosed quoted value for component prop "${name}".`,
          );
        }
        props[name] = JSON.stringify(attrString.substring(start, i));
        i++;
      } else {
        const start = i;
        while (i < attrString.length && !/[\s>\/]/.test(attrString[i])) i++;
        props[name] = JSON.stringify(attrString.substring(start, i));
      }
    } else {
      props[name] = "true";
    }
  }
  return props;
}

export class TauParser {
  private readonly input: string;
  private readonly filePath?: string;
  private pos = 0;
  private depth = 0;
  private pendingTrimStart = false;

  constructor(
    input: string,
    filePath?: string,
    private readonly maxParseDepth = 256,
  ) {
    this.input = input;
    this.filePath = filePath;
  }

  private throwError(
    message: string,
    code: TauErrorCode = "TAU_PARSE_EXPECTED_TOKEN",
  ): never {
    const textBefore = this.input.substring(0, this.pos);
    const lines = textBefore.split("\n");
    throw new TauError(code, message, {
      filePath: this.filePath,
      line: lines.length,
      column: lines[lines.length - 1].length + 1,
    });
  }

  private peek(offset = 0) {
    return this.input[this.pos + offset] || "";
  }
  private match(str: string) {
    return this.input.substring(this.pos, this.pos + str.length) === str;
  }
  private consume(str: string) {
    if (this.match(str)) this.pos += str.length;
    else this.throwError(`Expected "${str}"`);
  }

  private matchBlockKeyword(): boolean {
    return this.match("{#if ") || this.match("{#each ") || this.match("{#let ");
  }

  private matchCommentStart(): boolean {
    return this.match("{#") && !this.matchBlockKeyword();
  }

  private parseCommentBlock(): void {
    this.consume("{#");
    while (this.pos < this.input.length && !this.match("#}")) this.pos++;
    if (!this.match("#}")) {
      this.throwError(
        'Unclosed comment. Expected "#}".',
        "TAU_PARSE_UNCLOSED_BLOCK",
      );
    }
    this.consume("#}");
  }

  public parseBlock(endTags: string[] = []): Node[] {
    this.depth++;
    if (this.depth > this.maxParseDepth) {
      this.throwError(
        `Tau parser depth exceeds the limit of ${this.maxParseDepth}.`,
        "TAU_LIMIT_DEPTH",
      );
    }
    const nodes: Node[] = [];
    try {
      while (this.pos < this.input.length) {
        if (this.pendingTrimStart) {
          this.pendingTrimStart = false;
          while (
            this.pos < this.input.length && /\s/.test(this.input[this.pos])
          ) this.pos++;
        }
        if (endTags.some((tag) => this.match(tag))) break;

        if (this.match("{#if ") || this.match("{-#if ")) {
          const node = this.parseIfBlock();
          if (node.trimBefore) trimTrailingWhitespace(nodes);
          nodes.push(node);
          if (node.trimAfter) this.pendingTrimStart = true;
        } else if (this.match("{#each ") || this.match("{-#each ")) {
          const node = this.parseEachBlock();
          if (node.trimBefore) trimTrailingWhitespace(nodes);
          nodes.push(node);
          if (node.trimAfter) this.pendingTrimStart = true;
        } else if (this.match("{#let ")) nodes.push(this.parseLetBlock());
        else if (this.matchCommentStart()) this.parseCommentBlock();
        else if (this.match("{@include ")) nodes.push(this.parseIncludeBlock());
        else if (this.match("{@html ")) nodes.push(this.parseHtmlBlock());
        else if (this.match("{@children}")) {
          this.consume("{@children}");
          nodes.push({ type: "html", expression: "children" });
        } else if (
          this.peek() === "{" && !["#", "/", ":", "@"].includes(this.peek(1))
        ) nodes.push(this.parseVariableBlock());
        else if (this.peek() === "<" && /[A-Z]/.test(this.peek(1))) {
          nodes.push(this.parseComponentBlock());
        } else nodes.push(this.parseTextNode(endTags));
      }
      return nodes;
    } finally {
      this.depth--;
    }
  }

  private consumeTagPrefix(prefix: string): boolean {
    const withDash = "{-" + prefix.slice(1);
    if (this.match(withDash)) {
      this.pos += withDash.length;
      return true;
    }
    this.consume(prefix);
    return false;
  }

  private parseIfBlock(prefix = "{#if "): Node {
    const trimBefore = this.consumeTagPrefix(prefix);
    const start = this.pos;
    while (this.pos < this.input.length && this.input[this.pos] !== "}") {
      this.pos++;
    }
    const raw = this.input.substring(start, this.pos).trim();
    this.consume("}");
    const { content: condition, trimAfter: trimAfterOpen } = extractTrimSuffix(
      raw,
    );
    if (!condition) {
      this.throwError("If condition cannot be empty.", "TAU_PARSE_EMPTY");
    }

    const elseIfPrefixes = prefixVariants("{:else if ");
    const elseVariants = tagVariants("{:else}");
    const closeVariants = tagVariants("{/if}");
    const consequent = this.parseBlock([
      ...elseIfPrefixes,
      ...elseVariants,
      ...closeVariants,
    ]);
    if (trimAfterOpen) trimLeadingWhitespace(consequent);

    let alternate: Node[] = [];
    let trimAfter = false;

    const elseIfMatch = elseIfPrefixes.find((p) => this.match(p));
    const elseMatch = elseVariants.find((v) => this.match(v));
    const closeMatch = closeVariants.find((v) => this.match(v));

    if (elseIfMatch) {
      if (elseIfMatch.startsWith("{-")) trimTrailingWhitespace(consequent);
      const nested = this.parseIfBlock("{:else if ");
      alternate = [nested];
      trimAfter = nested.trimAfter === true;
    } else if (elseMatch) {
      if (elseMatch.startsWith("{-")) trimTrailingWhitespace(consequent);
      this.pos += elseMatch.length;
      const innerCloseVariants = tagVariants("{/if}");
      alternate = this.parseBlock(innerCloseVariants);
      if (elseMatch.endsWith("-}")) trimLeadingWhitespace(alternate);
      const innerClose = innerCloseVariants.find((v) => this.match(v));
      if (!innerClose) {
        this.throwError(
          'Unclosed if block. Expected "{/if}".',
          "TAU_PARSE_UNCLOSED_BLOCK",
        );
      }
      if (innerClose.startsWith("{-")) trimTrailingWhitespace(alternate);
      this.pos += innerClose.length;
      trimAfter = innerClose.endsWith("-}");
    } else if (closeMatch) {
      if (closeMatch.startsWith("{-")) trimTrailingWhitespace(consequent);
      this.pos += closeMatch.length;
      trimAfter = closeMatch.endsWith("-}");
    } else {
      this.throwError(
        'Unclosed if block. Expected "{/if}".',
        "TAU_PARSE_UNCLOSED_BLOCK",
      );
    }
    return {
      type: "if",
      condition,
      consequent,
      alternate,
      trimBefore,
      trimAfter,
    };
  }

  private parseEachBlock(): Node {
    const trimBefore = this.consumeTagPrefix("{#each ");
    const start = this.pos;
    while (this.pos < this.input.length && this.input[this.pos] !== "}") {
      this.pos++;
    }
    const raw = this.input.substring(start, this.pos).trim();
    this.consume("}");
    const { content: rawEach, trimAfter: trimAfterOpen } = extractTrimSuffix(
      raw,
    );

    const asIndex = rawEach.indexOf(" as ");
    if (asIndex === -1) {
      this.throwError(
        `Invalid each block syntax: "${rawEach}". Expected "as" keyword.`,
        "TAU_PARSE_INVALID_EACH",
      );
    }
    const array = rawEach.substring(0, asIndex).trim();
    const itemPart = rawEach.substring(asIndex + 4).trim();
    const [item, indexVar = ""] = itemPart.split(",").map((s) => s.trim());
    if (!array) {
      this.throwError(
        "Each iterable expression cannot be empty.",
        "TAU_PARSE_EMPTY",
      );
    }
    assertIdentifier(
      item,
      "each item binding",
      (message) => this.throwError(message, "TAU_INVALID_IDENTIFIER"),
    );
    if (indexVar) {
      assertIdentifier(
        indexVar,
        "each index binding",
        (message) => this.throwError(message, "TAU_INVALID_IDENTIFIER"),
      );
    }

    const elseVariants = tagVariants("{:else}");
    const closeVariants = tagVariants("{/each}");
    const consequent = this.parseBlock([...elseVariants, ...closeVariants]);
    if (trimAfterOpen) trimLeadingWhitespace(consequent);

    let alternate: Node[] = [];
    let trimAfter = false;

    const elseMatch = elseVariants.find((v) => this.match(v));
    if (elseMatch) {
      if (elseMatch.startsWith("{-")) trimTrailingWhitespace(consequent);
      this.pos += elseMatch.length;
      const innerCloseVariants = tagVariants("{/each}");
      alternate = this.parseBlock(innerCloseVariants);
      if (elseMatch.endsWith("-}")) trimLeadingWhitespace(alternate);
      const innerClose = innerCloseVariants.find((v) => this.match(v));
      if (!innerClose) {
        this.throwError(
          'Unclosed each block. Expected "{/each}".',
          "TAU_PARSE_UNCLOSED_BLOCK",
        );
      }
      if (innerClose.startsWith("{-")) trimTrailingWhitespace(alternate);
      this.pos += innerClose.length;
      trimAfter = innerClose.endsWith("-}");
    } else {
      const closeMatch = closeVariants.find((v) => this.match(v));
      if (!closeMatch) {
        this.throwError(
          'Unclosed each block. Expected "{/each}".',
          "TAU_PARSE_UNCLOSED_BLOCK",
        );
      }
      if (closeMatch.startsWith("{-")) trimTrailingWhitespace(consequent);
      this.pos += closeMatch.length;
      trimAfter = closeMatch.endsWith("-}");
    }

    return {
      type: "each",
      array,
      item,
      indexVar,
      consequent,
      alternate,
      trimBefore,
      trimAfter,
    };
  }

  private parseLetBlock(): Node {
    this.consume("{#let ");
    const start = this.pos;
    while (this.pos < this.input.length && this.input[this.pos] !== "}") {
      this.pos++;
    }
    const raw = this.input.substring(start, this.pos).trim();
    this.consume("}");

    const eqIndex = raw.indexOf("=");
    if (eqIndex === -1) {
      this.throwError(
        `Invalid let binding syntax: "${raw}". Expected "name = expression".`,
        "TAU_PARSE_EXPECTED_TOKEN",
      );
    }
    const letName = raw.substring(0, eqIndex).trim();
    const expression = raw.substring(eqIndex + 1).trim();
    assertIdentifier(
      letName,
      "let binding",
      (message) => this.throwError(message, "TAU_INVALID_IDENTIFIER"),
    );
    if (!expression) {
      this.throwError(
        "Let binding expression cannot be empty.",
        "TAU_PARSE_EMPTY",
      );
    }
    return { type: "let", letName, expression };
  }

  private parseIncludeBlock(): Node {
    this.consume("{@include ");
    const quoteChar = ["'", '"'].includes(this.input[this.pos])
      ? this.input[this.pos++]
      : null;
    if (!quoteChar) {
      this.throwError(
        "Include paths must be quoted string literals.",
        "TAU_PARSE_EXPECTED_TOKEN",
      );
    }
    const start = this.pos;
    while (
      this.pos < this.input.length &&
      (quoteChar
        ? this.input[this.pos] !== quoteChar
        : this.input[this.pos] !== "}")
    ) this.pos++;
    const includePath = this.input.substring(start, this.pos).trim();
    if (quoteChar) {
      if (this.pos >= this.input.length) {
        this.throwError(
          "Unclosed quoted include path.",
          "TAU_PARSE_UNCLOSED_BLOCK",
        );
      }
      this.pos++;
    }
    if (!includePath) {
      this.throwError("Include path cannot be empty.", "TAU_PARSE_EMPTY");
    }
    if (
      includePath.startsWith("/") ||
      includePath.includes("\\") ||
      includePath.split("/").includes("..") ||
      /^[A-Za-z][A-Za-z\d+.-]*:/.test(includePath) ||
      hasControlCharacters(includePath)
    ) {
      this.throwError(
        `Unsafe include path "${includePath}". Includes must be relative and cannot traverse parent directories.`,
        "TAU_UNSAFE_INCLUDE_PATH",
      );
    }
    this.consume("}");
    return { type: "include", includePath };
  }

  private parseHtmlBlock(): Node {
    this.consume("{@html ");
    const start = this.pos;
    while (this.pos < this.input.length && this.input[this.pos] !== "}") {
      this.pos++;
    }
    const expression = this.input.substring(start, this.pos).trim();
    this.consume("}");
    if (!expression) {
      this.throwError("HTML expression cannot be empty.", "TAU_PARSE_EMPTY");
    }
    return { type: "html", expression };
  }

  private parseVariableBlock(): Node {
    this.consume("{");
    const start = this.pos;
    let braceCount = 1;
    while (this.pos < this.input.length && braceCount > 0) {
      if (this.input[this.pos] === "{") braceCount++;
      else if (this.input[this.pos] === "}") braceCount--;
      if (braceCount > 0) this.pos++;
    }
    const raw = this.input.substring(start, this.pos).trim();
    this.consume("}");
    if (!raw) this.throwError("Expression cannot be empty.", "TAU_PARSE_EMPTY");

    const parts = splitTopLevel(raw, "|");
    return {
      type: "expression",
      expression: parts[0].trim(),
      filters: parts.slice(1).map((f) => {
        const term = f.trim();
        const paren = term.indexOf("(");
        if (paren !== -1 && term.endsWith(")")) {
          const name = term.substring(0, paren).trim();
          assertIdentifier(
            name,
            "filter name",
            (message) => this.throwError(message, "TAU_INVALID_IDENTIFIER"),
          );
          return {
            name,
            args: splitTopLevel(
              term.substring(paren + 1, term.length - 1),
              ",",
            ).map(
              (a) => a.trim(),
            ).filter(Boolean),
          };
        }
        assertIdentifier(
          term,
          "filter name",
          (message) => this.throwError(message, "TAU_INVALID_IDENTIFIER"),
        );
        return { name: term, args: [] };
      }),
    };
  }

  private parseComponentBlock(): Node {
    this.consume("<");
    const start = this.pos;
    let braceCount = 0, inQuotes = false, quoteChar = "";
    let selfClosing = false;
    while (this.pos < this.input.length) {
      const char = this.input[this.pos];
      if (inQuotes) {
        if (char === quoteChar && this.input[this.pos - 1] !== "\\") {
          inQuotes = false;
        }
      } else if (['"', "'"].includes(char)) {
        inQuotes = true;
        quoteChar = char;
      } else if (char === "{") braceCount++;
      else if (char === "}") braceCount--;
      else if (
        char === "/" && this.input[this.pos + 1] === ">" && braceCount === 0
      ) {
        selfClosing = true;
        break;
      } else if (char === ">" && braceCount === 0) {
        selfClosing = false;
        break;
      }
      this.pos++;
    }
    if (this.pos >= this.input.length) {
      this.throwError(
        'Unclosed component tag. Expected "/>" or ">".',
        "TAU_PARSE_UNCLOSED_BLOCK",
      );
    }
    const componentStr = this.input.substring(start, this.pos).trim();
    this.consume(selfClosing ? "/>" : ">");

    const spaceIndex = componentStr.search(/\s/);
    const componentName = spaceIndex !== -1
      ? componentStr.substring(0, spaceIndex).trim()
      : componentStr;
    if (!/^[A-Z][A-Za-z\d_$]*$/.test(componentName)) {
      this.throwError(
        `Invalid component name "${componentName}".`,
        "TAU_INVALID_IDENTIFIER",
      );
    }
    const attrString = spaceIndex !== -1
      ? componentStr.substring(spaceIndex).trim()
      : "";
    const props = parseProps(attrString);

    if (selfClosing) {
      return { type: "component", componentName, props };
    }

    const closeTag = `</${componentName}>`;
    const consequent = this.parseBlock([closeTag]);
    if (!this.match(closeTag)) {
      this.throwError(
        `Unclosed component "<${componentName}>". Expected "${closeTag}".`,
        "TAU_PARSE_UNCLOSED_BLOCK",
      );
    }
    this.consume(closeTag);
    return { type: "component", componentName, props, consequent };
  }

  private parseTextNode(endTags: string[]): Node {
    const start = this.pos;
    while (this.pos < this.input.length) {
      if (endTags.some((tag) => this.match(tag))) break;
      if (
        this.match("{#if ") || this.match("{#each ") || this.match("{#let ") ||
        this.match("{@html ") || this.match("{@children}") ||
        this.match("{@include ") || this.matchCommentStart() ||
        (this.peek() === "{" && !["#", "/", ":", "@"].includes(this.peek(1))) ||
        (this.peek() === "<" && /[A-Z]/.test(this.peek(1)))
      ) break;
      this.pos++;
    }
    return { type: "text", value: this.input.substring(start, this.pos) };
  }
}
