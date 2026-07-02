/**
 * @module
 * Scribe: A lightweight, custom template engine for Steno.
 *
 * This module parses template strings with support for control flow (`{#if}`, `{#each}`),
 * expressions, global filters, and capitalized component tags (e.g. `<Header />`).
 */

/**
 * Options configuration for rendering a Scribe template.
 */
export interface ScribeOptions {
  /** The raw template string to compile and render. */
  template: string;
  /** Context data containing variables accessible inside the template. */
  context: Record<string, unknown>;
  /** Dictionary of custom component templates, mapping component tag names (e.g. "Header") to their raw template string. */
  components: Record<string, string>; // Maps "Nav" -> "raw .scr template content"
  /** Optional file path of the template being rendered, used for descriptive syntax error reporting. */
  filePath?: string;
}

type FilterFunction = (val: unknown, ...args: unknown[]) => unknown;

interface ScribeHelpers {
  escapeHtml: (val: unknown) => string;
  filters: Record<string, FilterFunction>;
  renderComponent: (
    name: string,
    props: Record<string, unknown>,
    parentContext: Record<string, unknown>,
  ) => string;
}

type CompiledTemplateFn = (
  context: Record<string, unknown>,
  helpers: ScribeHelpers,
) => string;

interface Node {
  type: "text" | "expression" | "html" | "if" | "each" | "component";
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
}

/**
 * Global filter registry for template rendering.
 *
 * Includes standard built-in filters:
 * - `date`: Formats string/number/Date values into a locale date string.
 * - `truncate`: Limits a string to a specified length and appends "...".
 * - `upper`: Converts text to uppercase.
 * - `lower`: Converts text to lowercase.
 */
export const filters: Record<string, FilterFunction> = {
  date: (val: unknown) => {
    if (!val) return "";
    const normalizedVal =
      typeof val === "string" || typeof val === "number" || val instanceof Date
        ? val
        : String(val);
    const d = new Date(normalizedVal);
    return isNaN(d.getTime()) ? String(val) : d.toLocaleDateString();
  },
  truncate: (val: unknown, len: unknown = 100) => {
    if (val === null || val === undefined) return "";
    const s = String(val);
    const parsedLen = typeof len === "string" ? parseInt(len, 10) : Number(len);
    const finalLen = isNaN(parsedLen) ? 100 : parsedLen;
    return s.length > finalLen ? s.slice(0, finalLen) + "..." : s;
  },
  upper: (val: unknown) => (val ? String(val).toUpperCase() : ""),
  lower: (val: unknown) => (val ? String(val).toLowerCase() : ""),
};

// HTML escaping helper
export function escapeHtml(val: unknown): string {
  if (val === null || val === undefined) return "";
  return String(val)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function parseProps(attrString: string): Record<string, string> {
  const props: Record<string, string> = {};
  let i = 0;
  while (i < attrString.length) {
    // Skip whitespace
    while (i < attrString.length && /\s/.test(attrString[i])) {
      i++;
    }
    if (i >= attrString.length) break;

    // Shorthand brace {post}
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
      props[propName] = propName; // shorthand
      i++; // skip '}'
      continue;
    }

    // Parse attribute name
    const nameStart = i;
    while (i < attrString.length && !/[\s=>\/]/.test(attrString[i])) {
      i++;
    }
    const name = attrString.substring(nameStart, i);
    if (!name) {
      i++;
      continue;
    }

    // Skip spaces before '='
    while (i < attrString.length && /\s/.test(attrString[i])) {
      i++;
    }

    if (attrString[i] === "=") {
      i++;
      // Skip spaces after '='
      while (i < attrString.length && /\s/.test(attrString[i])) {
        i++;
      }
      if (attrString[i] === "{") {
        // Dynamic attribute
        i++;
        const start = i;
        let braceCount = 1;
        while (i < attrString.length && braceCount > 0) {
          if (attrString[i] === "{") braceCount++;
          else if (attrString[i] === "}") braceCount--;
          if (braceCount > 0) i++;
        }
        props[name] = attrString.substring(start, i).trim();
        i++; // skip '}'
      } else if (attrString[i] === '"' || attrString[i] === "'") {
        // Quoted string attribute
        const quote = attrString[i];
        i++;
        const start = i;
        while (i < attrString.length && attrString[i] !== quote) {
          i++;
        }
        const val = attrString.substring(start, i);
        props[name] = JSON.stringify(val); // expression for string literal
        i++; // skip quote
      } else {
        // Unquoted attribute value
        const start = i;
        while (i < attrString.length && !/[\s>\/]/.test(attrString[i])) {
          i++;
        }
        const val = attrString.substring(start, i);
        props[name] = JSON.stringify(val);
      }
    } else {
      // Boolean attribute
      props[name] = "true";
    }
  }
  return props;
}

class ScribeParser {
  private readonly input: string;
  private readonly filePath?: string;
  private pos = 0;

  constructor(input: string, filePath?: string) {
    this.input = input;
    this.filePath = filePath;
  }

  private getLineAndCol(): { line: number; col: number } {
    const textBefore = this.input.substring(0, this.pos);
    const lines = textBefore.split("\n");
    return {
      line: lines.length,
      col: lines[lines.length - 1].length + 1,
    };
  }

  private throwError(message: string): never {
    const { line, col } = this.getLineAndCol();
    const prefix = this.filePath
      ? `${this.filePath}:${line}:${col}: `
      : `Line ${line}, col ${col}: `;
    throw new Error(prefix + message);
  }

  private peek(offset = 0): string {
    return this.input[this.pos + offset] || "";
  }

  private match(str: string): boolean {
    return this.input.substring(this.pos, this.pos + str.length) === str;
  }

  private consumeString(str: string): void {
    if (this.match(str)) {
      this.pos += str.length;
    } else {
      this.throwError(`Expected "${str}"`);
    }
  }

  public parseBlock(endTags: string[] = []): Node[] {
    const nodes: Node[] = [];
    while (this.pos < this.input.length) {
      let hitEndTag = false;
      for (const tag of endTags) {
        if (this.match(tag)) {
          hitEndTag = true;
          break;
        }
      }
      if (hitEndTag) break;

      if (this.match("{#if ")) {
        nodes.push(this.parseIfBlock());
      } else if (this.match("{#each ")) {
        nodes.push(this.parseEachBlock());
      } else if (this.match("{@html ")) {
        nodes.push(this.parseHtmlBlock());
      } else if (
        this.peek() === "{" &&
        this.peek(1) !== "#" &&
        this.peek(1) !== "/" &&
        this.peek(1) !== ":" &&
        this.peek(1) !== "@"
      ) {
        nodes.push(this.parseVariableBlock());
      } else if (this.peek() === "<" && /[A-Z]/.test(this.peek(1))) {
        nodes.push(this.parseComponentBlock());
      } else {
        nodes.push(this.parseTextNode(endTags));
      }
    }
    return nodes;
  }

  private parseIfBlock(): Node {
    this.consumeString("{#if ");
    const condStart = this.pos;
    while (this.pos < this.input.length && this.input[this.pos] !== "}") {
      this.pos++;
    }
    const condition = this.input.substring(condStart, this.pos).trim();
    this.consumeString("}");

    const consequent = this.parseBlock(["{:else if ", "{:else}", "{/if}"]);
    let alternate: Node[] = [];

    if (this.match("{:else if ")) {
      const elseIfNode = this.parseIfBlock();
      alternate = [elseIfNode];
    } else if (this.match("{:else}")) {
      this.consumeString("{:else}");
      alternate = this.parseBlock(["{/if}"]);
      this.consumeString("{/if}");
    } else if (this.match("{/if}")) {
      this.consumeString("{/if}");
    }

    return {
      type: "if",
      condition,
      consequent,
      alternate,
    };
  }

  private parseEachBlock(): Node {
    this.consumeString("{#each ");
    const start = this.pos;
    while (this.pos < this.input.length && this.input[this.pos] !== "}") {
      this.pos++;
    }
    const rawEach = this.input.substring(start, this.pos).trim();
    this.consumeString("}");

    const asIndex = rawEach.indexOf(" as ");
    if (asIndex === -1) {
      this.throwError(
        `Invalid each block syntax: "${rawEach}". Expected "as" keyword.`,
      );
    }
    const array = rawEach.substring(0, asIndex).trim();
    const itemPart = rawEach.substring(asIndex + 4).trim();

    let item = itemPart;
    let indexVar = "";
    if (itemPart.includes(",")) {
      const parts = itemPart.split(",");
      item = parts[0].trim();
      indexVar = parts[1].trim();
    }

    const consequent = this.parseBlock(["{/each}"]);
    this.consumeString("{/each}");

    return {
      type: "each",
      array,
      item,
      indexVar,
      consequent,
    };
  }

  private parseHtmlBlock(): Node {
    this.consumeString("{@html ");
    const start = this.pos;
    while (this.pos < this.input.length && this.input[this.pos] !== "}") {
      this.pos++;
    }
    const expression = this.input.substring(start, this.pos).trim();
    this.consumeString("}");
    return {
      type: "html",
      expression,
    };
  }

  private parseVariableBlock(): Node {
    this.consumeString("{");
    const start = this.pos;
    let braceCount = 1;
    while (this.pos < this.input.length && braceCount > 0) {
      if (this.input[this.pos] === "{") braceCount++;
      else if (this.input[this.pos] === "}") braceCount--;
      if (braceCount > 0) this.pos++;
    }
    const raw = this.input.substring(start, this.pos).trim();
    this.consumeString("}");

    const parts = raw.split("|");
    const expression = parts[0].trim();
    const parsedFilters = parts.slice(1).map((f) => {
      const term = f.trim();
      const parenIndex = term.indexOf("(");
      if (parenIndex !== -1 && term.endsWith(")")) {
        const name = term.substring(0, parenIndex).trim();
        const args = term
          .substring(parenIndex + 1, term.length - 1)
          .split(",")
          .map((arg) => arg.trim())
          .filter(Boolean);
        return { name, args };
      }
      return { name: term, args: [] };
    });

    return {
      type: "expression",
      expression,
      filters: parsedFilters,
    };
  }

  private parseComponentBlock(): Node {
    this.consumeString("<");
    const start = this.pos;
    let braceCount = 0;
    let inQuotes = false;
    let quoteChar = "";
    while (this.pos < this.input.length) {
      const char = this.input[this.pos];
      if (inQuotes) {
        if (char === quoteChar && this.input[this.pos - 1] !== "\\") {
          inQuotes = false;
        }
      } else {
        if (char === '"' || char === "'") {
          inQuotes = true;
          quoteChar = char;
        } else if (char === "{") {
          braceCount++;
        } else if (char === "}") {
          braceCount--;
        } else if (
          char === "/" && this.input[this.pos + 1] === ">" && braceCount === 0
        ) {
          break;
        }
      }
      this.pos++;
    }
    const componentStr = this.input.substring(start, this.pos).trim();
    this.consumeString("/>");

    const spaceIndex = componentStr.search(/\s/);
    let componentName = componentStr;
    let attrString = "";
    if (spaceIndex !== -1) {
      componentName = componentStr.substring(0, spaceIndex).trim();
      attrString = componentStr.substring(spaceIndex).trim();
    }

    const props = parseProps(attrString);

    return {
      type: "component",
      componentName,
      props,
    };
  }

  private parseTextNode(endTags: string[]): Node {
    const start = this.pos;
    while (this.pos < this.input.length) {
      let hitEnd = false;
      for (const tag of endTags) {
        if (this.match(tag)) {
          hitEnd = true;
          break;
        }
      }
      if (hitEnd) break;

      if (
        this.match("{#if ") ||
        this.match("{#each ") ||
        this.match("{@html ") ||
        (this.peek() === "{" &&
          this.peek(1) !== "#" &&
          this.peek(1) !== "/" &&
          this.peek(1) !== ":" &&
          this.peek(1) !== "@") ||
        (this.peek() === "<" && /[A-Z]/.test(this.peek(1)))
      ) {
        break;
      }

      this.pos++;
    }
    const value = this.input.substring(start, this.pos);
    return {
      type: "text",
      value,
    };
  }
}

function compileNodes(nodes: Node[]): string {
  let code = "";
  for (const node of nodes) {
    if (node.type === "text") {
      code += `html.push(${JSON.stringify(node.value)});\n`;
    } else if (node.type === "expression") {
      let expr = node.expression;
      for (const filter of node.filters || []) {
        const filterArgs = [expr, ...filter.args].join(", ");
        expr = `helpers.filters.${filter.name}(${filterArgs})`;
      }
      code += `html.push(helpers.escapeHtml(${expr}));\n`;
    } else if (node.type === "html") {
      code += `html.push(String(${node.expression}));\n`;
    } else if (node.type === "if") {
      code += `if (${node.condition}) {\n`;
      code += compileNodes(node.consequent || []);
      if (node.alternate && node.alternate.length > 0) {
        code += `} else {\n`;
        code += compileNodes(node.alternate);
      }
      code += `}\n`;
    } else if (node.type === "each") {
      code +=
        `if (${node.array} && typeof ${node.array}[Symbol.iterator] === 'function') {\n`;
      if (node.indexVar) {
        code += `  let ${node.indexVar} = 0;\n`;
      }
      code += `  for (const ${node.item} of ${node.array}) {\n`;
      code += compileNodes(node.consequent || []);
      if (node.indexVar) {
        code += `    ${node.indexVar}++;\n`;
      }
      code += `  }\n`;
      code += `}\n`;
    } else if (node.type === "component") {
      const propsPairs = [];
      for (const [propName, expr] of Object.entries(node.props || {})) {
        propsPairs.push(`${JSON.stringify(propName)}: ${expr}`);
      }
      const propsObj = `{ ${propsPairs.join(", ")} }`;
      code += `html.push(helpers.renderComponent(${
        JSON.stringify(node.componentName)
      }, ${propsObj}, context));\n`;
    }
  }
  return code;
}

export function compileToFunction(
  template: string,
  filePath?: string,
): CompiledTemplateFn {
  const parser = new ScribeParser(template, filePath);
  const ast = parser.parseBlock();
  const body = compileNodes(ast);

  const functionCode = `
    const html = [];
    with (context) {
      ${body}
    }
    return html.join("");
  `;

  try {
    return new Function(
      "context",
      "helpers",
      functionCode,
    ) as CompiledTemplateFn;
  } catch (err) {
    console.error("Failed to compile template:", functionCode);
    throw err;
  }
}

/**
 * Renders a Scribe template with the provided context and components.
 *
 * @param options - Configuration options for Scribe including template, context, and components.
 * @returns The rendered template as a string.
 *
 * @example
 * ```ts
 * import { render } from "@steno/steno";
 *
 * const HTML = render({
 *   template: "<h1>{title}</h1>",
 *   context: { title: "Hello World" },
 *   components: {}
 * });
 * ```
 */
export function render(options: ScribeOptions): string {
  const renderFn = compileToFunction(options.template, options.filePath);

  const helpers = {
    escapeHtml,
    filters,
    renderComponent: (
      name: string,
      props: Record<string, unknown>,
      parentContext: Record<string, unknown>,
    ) => {
      let componentTemplate = options.components[name];
      if (componentTemplate === undefined) {
        const altName = name.charAt(0).toLowerCase() + name.slice(1);
        componentTemplate = options.components[altName];
      }

      if (componentTemplate === undefined) {
        throw new Error(
          `Component "${name}" not found. Available components: ${
            Object.keys(options.components).join(", ")
          }`,
        );
      }

      const localContext = {
        site: parentContext.site,
        theme: parentContext.theme,
        ...props,
      };

      return render({
        template: componentTemplate,
        context: localContext,
        components: options.components,
      });
    },
  };

  const contextProxy = new Proxy(options.context, {
    has(_target, key) {
      if (typeof key === "symbol") return false;
      return !(key === "html" || key === "helpers" || key === "context");
    },
    get(target, key) {
      if (key === Symbol.unscopables) return undefined;
      if (key in target) return target[key as string];
      if (key in helpers) return undefined;
      if (typeof globalThis !== "undefined" && key in globalThis) {
        return (globalThis as Record<PropertyKey, unknown>)[key];
      }
      return undefined;
    },
  });

  return renderFn(contextProxy, helpers);
}
