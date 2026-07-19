export interface Node {
  type:
    | "text"
    | "expression"
    | "html"
    | "if"
    | "each"
    | "component"
    | "include";
  value?: string;
  expression?: string;
  filters?: { name: string; args: string[] }[];
  condition?: string;
  array?: string;
  item?: string;
  indexVar?: string;
  consequent?: Node[];
  alternate?: Node[];
  componentName?: string;
  props?: Record<string, string>;
  includePath?: string;
}

export function parseProps(attrString: string): Record<string, string> {
  const props: Record<string, string> = {};
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
        props[name] = attrString.substring(start, i).trim();
        i++;
      } else if (attrString[i] === '"' || attrString[i] === "'") {
        const quote = attrString[i++];
        const start = i;
        while (i < attrString.length && attrString[i] !== quote) i++;
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

export class ScribeParser {
  private readonly input: string;
  private readonly filePath?: string;
  private pos = 0;

  constructor(input: string, filePath?: string) {
    this.input = input;
    this.filePath = filePath;
  }

  private throwError(message: string): never {
    const textBefore = this.input.substring(0, this.pos);
    const lines = textBefore.split("\n");
    const prefix = this.filePath
      ? `${this.filePath}:${lines.length}:${
        lines[lines.length - 1].length + 1
      }: `
      : `Line ${lines.length}, col ${lines[lines.length - 1].length + 1}: `;
    throw new Error(prefix + message);
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

  public parseBlock(endTags: string[] = []): Node[] {
    const nodes: Node[] = [];
    while (this.pos < this.input.length) {
      if (endTags.some((tag) => this.match(tag))) break;

      if (this.match("{#if ")) nodes.push(this.parseIfBlock());
      else if (this.match("{#each ")) nodes.push(this.parseEachBlock());
      else if (this.match("{@include ")) nodes.push(this.parseIncludeBlock());
      else if (this.match("{@html ")) nodes.push(this.parseHtmlBlock());
      else if (
        this.peek() === "{" && !["#", "/", ":", "@"].includes(this.peek(1))
      ) nodes.push(this.parseVariableBlock());
      else if (this.peek() === "<" && /[A-Z]/.test(this.peek(1))) {
        nodes.push(this.parseComponentBlock());
      } else nodes.push(this.parseTextNode(endTags));
    }
    return nodes;
  }

  private parseIfBlock(): Node {
    this.consume("{#if ");
    const start = this.pos;
    while (this.pos < this.input.length && this.input[this.pos] !== "}") {
      this.pos++;
    }
    const condition = this.input.substring(start, this.pos).trim();
    this.consume("}");

    const consequent = this.parseBlock(["{:else if ", "{:else}", "{/if}"]);
    let alternate: Node[] = [];

    if (this.match("{:else if ")) alternate = [this.parseIfBlock()];
    else if (this.match("{:else}")) {
      this.consume("{:else}");
      alternate = this.parseBlock(["{/if}"]);
      this.consume("{/if}");
    } else if (this.match("{/if}")) {
      this.consume("{/if}");
    }
    return { type: "if", condition, consequent, alternate };
  }

  private parseEachBlock(): Node {
    this.consume("{#each ");
    const start = this.pos;
    while (this.pos < this.input.length && this.input[this.pos] !== "}") {
      this.pos++;
    }
    const rawEach = this.input.substring(start, this.pos).trim();
    this.consume("}");

    const asIndex = rawEach.indexOf(" as ");
    if (asIndex === -1) {
      this.throwError(
        `Invalid each block syntax: "${rawEach}". Expected "as" keyword.`,
      );
    }
    const array = rawEach.substring(0, asIndex).trim();
    const itemPart = rawEach.substring(asIndex + 4).trim();
    const [item, indexVar = ""] = itemPart.split(",").map((s) => s.trim());

    const consequent = this.parseBlock(["{/each}"]);
    this.consume("{/each}");
    return { type: "each", array, item, indexVar, consequent };
  }

  private parseIncludeBlock(): Node {
    this.consume("{@include ");
    const quoteChar = ["'", '"'].includes(this.input[this.pos])
      ? this.input[this.pos++]
      : null;
    const start = this.pos;
    while (
      this.pos < this.input.length &&
      (quoteChar
        ? this.input[this.pos] !== quoteChar
        : this.input[this.pos] !== "}")
    ) this.pos++;
    const includePath = this.input.substring(start, this.pos).trim();
    if (quoteChar) this.pos++;
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

    const parts = raw.split("|");
    return {
      type: "expression",
      expression: parts[0].trim(),
      filters: parts.slice(1).map((f) => {
        const term = f.trim();
        const paren = term.indexOf("(");
        if (paren !== -1 && term.endsWith(")")) {
          return {
            name: term.substring(0, paren).trim(),
            args: term.substring(paren + 1, term.length - 1).split(",").map(
              (a) => a.trim(),
            ).filter(Boolean),
          };
        }
        return { name: term, args: [] };
      }),
    };
  }

  private parseComponentBlock(): Node {
    this.consume("<");
    const start = this.pos;
    let braceCount = 0, inQuotes = false, quoteChar = "";
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
      ) break;
      this.pos++;
    }
    const componentStr = this.input.substring(start, this.pos).trim();
    this.consume("/>");

    const spaceIndex = componentStr.search(/\s/);
    const componentName = spaceIndex !== -1
      ? componentStr.substring(0, spaceIndex).trim()
      : componentStr;
    const attrString = spaceIndex !== -1
      ? componentStr.substring(spaceIndex).trim()
      : "";

    return { type: "component", componentName, props: parseProps(attrString) };
  }

  private parseTextNode(endTags: string[]): Node {
    const start = this.pos;
    while (this.pos < this.input.length) {
      if (endTags.some((tag) => this.match(tag))) break;
      if (
        this.match("{#if ") || this.match("{#each ") || this.match("{@html ") ||
        this.match("{@include ") ||
        (this.peek() === "{" && !["#", "/", ":", "@"].includes(this.peek(1))) ||
        (this.peek() === "<" && /[A-Z]/.test(this.peek(1)))
      ) break;
      this.pos++;
    }
    return { type: "text", value: this.input.substring(start, this.pos) };
  }
}
