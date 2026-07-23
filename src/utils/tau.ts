import { type Node, TauParser } from "./tau_parser.ts";
import { TauError } from "./tau_error.ts";

/** Options accepted by the Tau template renderer. */
export interface TauOptions {
  /** Tau template source to render. */
  template: string;
  /** Values exposed to template expressions. */
  context: Record<string, unknown>;
  /** Named component templates available during rendering. */
  components: Record<string, string>;
  /** Source path included in parse and render errors. */
  filePath?: string;
  /** Resolves an include path to Tau template source. */
  includeResolver?: (path: string) => string;
  /** Per-render resource-limit overrides. */
  limits?: Partial<TauLimits>;
}

/** Resource limits enforced while compiling and rendering Tau templates. */
export interface TauLimits {
  /** Maximum nested component and include depth. */
  maxDepth: number;
  /** Maximum total loop iterations per render. */
  maxIterations: number;
  /** Maximum UTF-8 output size in bytes. */
  maxOutputBytes: number;
  /** Maximum input template size in bytes. */
  maxTemplateBytes: number;
}

/** Function signature for a Tau value filter. */
export type FilterFunction = (
  val: unknown,
  ...args: unknown[]
) => unknown;
type CompiledTemplateFn = (
  context: Record<string, unknown>,
  helpers: TauHelpers,
) => string;

interface TauHelpers {
  filters: Record<string, FilterFunction>;
  append: (target: string[], value: unknown, escape: boolean) => void;
  isIterable: (value: unknown) => boolean;
  countIteration: () => void;
  renderComponent: (
    name: string,
    props: Record<string, unknown>,
    parentContext: Record<string, unknown>,
    target: string[],
  ) => string;
  resolveInclude: (
    path: string,
    context: Record<string, unknown>,
    target: string[],
  ) => string;
}

const templateCache = new Map<string, CompiledTemplateFn>();
let templateCacheHits = 0;
let templateCacheMisses = 0;
let templateCacheEvictions = 0;
const DEFAULT_LIMITS: TauLimits = {
  maxDepth: 64,
  maxIterations: 100_000,
  maxOutputBytes: 16 * 1024 * 1024,
  maxTemplateBytes: 1024 * 1024,
};

interface RenderState {
  limits: TauLimits;
  depth: number;
  iterations: number;
  outputBytes: number;
  includeStack: string[];
  componentStack: string[];
}

const BLOCKED_EXPRESSION_NAMES = new Set([
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

function hasControlCharacters(value: string): boolean {
  for (let index = 0; index < value.length; index++) {
    const code = value.charCodeAt(index);
    if (code <= 0x1F || code === 0x7F) return true;
  }
  return false;
}

function utf8ByteLength(value: string): number {
  let bytes = value.length;
  for (let index = 0; index < value.length; index++) {
    const code = value.charCodeAt(index);
    if (code <= 0x7F) continue;
    if (code <= 0x7FF) {
      bytes++;
    } else if (
      code >= 0xD800 && code <= 0xDBFF &&
      index + 1 < value.length &&
      value.charCodeAt(index + 1) >= 0xDC00 &&
      value.charCodeAt(index + 1) <= 0xDFFF
    ) {
      bytes += 2;
      index++;
    } else {
      bytes += 2;
    }
  }
  return bytes;
}

function assertSafeExpression(expression: string): void {
  const syntax = expression.replace(
    /"(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*'/g,
    '""',
  );
  if (
    /(?:=>|;|`|\\|\+\+|--|\b(?:await|class|delete|function|new|this|yield)\b)/
      .test(syntax) ||
    /(?:^|[^=!<>])=(?!=|>)/.test(syntax)
  ) {
    throw new TauError(
      "TAU_UNSAFE_EXPRESSION",
      `Unsafe Tau expression syntax: "${expression}".`,
    );
  }
  for (const identifier of syntax.match(/[A-Za-z_$][\w$]*/g) ?? []) {
    if (BLOCKED_EXPRESSION_NAMES.has(identifier)) {
      throw new TauError(
        "TAU_UNSAFE_EXPRESSION",
        `Tau expression access to "${identifier}" is not allowed.`,
      );
    }
  }
}

function resolveLimits(overrides?: Partial<TauLimits>): TauLimits {
  const limits = { ...DEFAULT_LIMITS, ...overrides };
  for (const [name, value] of Object.entries(limits)) {
    if (!Number.isSafeInteger(value) || value <= 0) {
      throw new TauError(
        "TAU_INVALID_LIMIT",
        `Tau limit "${name}" must be a positive integer.`,
      );
    }
  }
  return limits;
}

/** Built-in Tau filters and the registry for custom filters. */
export const filters: Record<string, FilterFunction> = Object.assign(
  Object.create(null),
  {
    date: (val: unknown) => {
      if (!val) return "";
      const d = new Date(
        typeof val === "string" || typeof val === "number" ||
          val instanceof Date
          ? val
          : String(val),
      );
      return isNaN(d.getTime()) ? String(val) : d.toLocaleDateString();
    },
    truncate: (val: unknown, len: unknown = 100) => {
      if (val === null || val === undefined) return "";
      const parsedLen = typeof len === "string"
        ? parseInt(len, 10)
        : Number(len);
      const finalLen = isNaN(parsedLen) ? 100 : parsedLen;
      return String(val).length > finalLen
        ? String(val).slice(0, finalLen) + "..."
        : String(val);
    },
    upper: (val: unknown) => (val ? String(val).toUpperCase() : ""),
    lower: (val: unknown) => (val ? String(val).toLowerCase() : ""),
    url: (val: unknown) => {
      if (val === null || val === undefined) return "";
      const value = String(val).trim();
      if (hasControlCharacters(value)) {
        throw new TauError(
          "TAU_UNSAFE_URL",
          "Tau URL values cannot contain control characters.",
        );
      }
      const scheme = /^([A-Za-z][A-Za-z\d+.-]*):/.exec(value)?.[1];
      if (
        scheme &&
        !["http", "https", "mailto", "tel"].includes(scheme.toLowerCase())
      ) {
        throw new TauError(
          "TAU_UNSAFE_URL",
          `Tau URL scheme "${scheme.toLowerCase()}:" is not allowed.`,
        );
      }
      return value;
    },
  },
);

export function escapeHtml(val: unknown): string {
  if (val === null || val === undefined) return "";
  return String(val).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(
    />/g,
    "&gt;",
  ).replace(/"/g, "&quot;").replace(/'/g, "&#39;");
}

function compileNodes(nodes: Node[]): string {
  let code = "";
  for (const node of nodes) {
    if (node.type === "text") {
      code += `helpers.append(html, ${JSON.stringify(node.value)}, false);\n`;
    } else if (node.type === "expression") {
      let expr = node.expression;
      assertSafeExpression(expr!);
      for (const filter of node.filters || []) {
        if (!Object.hasOwn(filters, filter.name)) {
          throw new TauError(
            "TAU_UNKNOWN_FILTER",
            `Unknown Tau filter "${filter.name}".`,
          );
        }
        for (const arg of filter.args) assertSafeExpression(arg);
        expr = `helpers.filters.${filter.name}(${
          [expr, ...filter.args].join(", ")
        })`;
      }
      code += `helpers.append(html, ${expr}, true);\n`;
    } else if (node.type === "html") {
      assertSafeExpression(node.expression!);
      code += `helpers.append(html, ${node.expression}, false);\n`;
    } else if (node.type === "include") {
      code += `helpers.resolveInclude(${
        JSON.stringify(node.includePath)
      }, context, html);\n`;
    } else if (node.type === "if") {
      assertSafeExpression(node.condition!);
      code += `if (${node.condition}) {\n${
        compileNodes(node.consequent || [])
      }}`;
      if (node.alternate?.length) {
        code += ` else {\n${compileNodes(node.alternate)}}\n`;
      } else code += "\n";
    } else if (node.type === "each") {
      assertSafeExpression(node.array!);
      code += `{\nconst __tauIterable = ${node.array};\n`;
      code += `if (helpers.isIterable(__tauIterable)) {\n`;
      if (node.indexVar) code += `  let ${node.indexVar} = 0;\n`;
      code +=
        `  for (const ${node.item} of __tauIterable) {\n    helpers.countIteration();\n${
          compileNodes(node.consequent || [])
        }`;
      if (node.indexVar) code += `    ${node.indexVar}++;\n`;
      code += `  }\n}\n}\n`;
    } else if (node.type === "component") {
      const propsObj = `{ ${
        Object.entries(node.props || {}).map(([k, v]) => {
          assertSafeExpression(v);
          return `${JSON.stringify(k)}: ${v}`;
        }).join(", ")
      } }`;
      code += `helpers.renderComponent(${
        JSON.stringify(node.componentName)
      }, ${propsObj}, context, html);\n`;
    }
  }
  return code;
}

export function compileToFunction(
  template: string,
  filePath?: string,
): CompiledTemplateFn {
  const body = compileNodes(new TauParser(template, filePath).parseBlock());
  try {
    return new Function(
      "context",
      "helpers",
      `const html = []; with (context) {\n${body}\n} return html.join("");`,
    ) as CompiledTemplateFn;
  } catch (err) {
    throw new TauError(
      "TAU_UNSAFE_EXPRESSION",
      "Failed to compile Tau template expression.",
      {},
      { cause: err },
    );
  }
}

function getCompiledTemplate(
  template: string,
  filePath?: string,
): CompiledTemplateFn {
  const key = `${filePath ?? ""}\u0000${template}`;
  const cached = templateCache.get(key);
  if (cached) {
    templateCacheHits++;
    templateCache.delete(key);
    templateCache.set(key, cached);
    return cached;
  }
  templateCacheMisses++;
  const compiled = compileToFunction(template, filePath);
  templateCache.set(key, compiled);
  if (templateCache.size > 512) {
    templateCache.delete(templateCache.keys().next().value!);
    templateCacheEvictions++;
  }
  return compiled;
}

/** Runtime statistics for the compiled Tau template cache. */
export interface TauCacheStats {
  /** Number of currently cached templates. */
  size: number;
  /** Maximum number of cached templates. */
  capacity: number;
  /** Number of successful cache lookups since the last reset. */
  hits: number;
  /** Number of templates compiled since the last reset. */
  misses: number;
  /** Number of templates evicted since the last reset. */
  evictions: number;
}

/** Returns a snapshot of the compiled template cache statistics. */
export function getTauCacheStats(): TauCacheStats {
  return {
    size: templateCache.size,
    capacity: 512,
    hits: templateCacheHits,
    misses: templateCacheMisses,
    evictions: templateCacheEvictions,
  };
}

/** Clears compiled templates and resets all cache counters. */
export function clearTauCache(): void {
  templateCache.clear();
  templateCacheHits = 0;
  templateCacheMisses = 0;
  templateCacheEvictions = 0;
}

function renderWithCompiledTemplate(
  renderFn: CompiledTemplateFn,
  options: TauOptions,
  componentFnCache: Map<string, CompiledTemplateFn>,
  state: RenderState,
): string {
  state.depth++;
  if (state.depth > state.limits.maxDepth) {
    state.depth--;
    throw new TauError(
      "TAU_LIMIT_DEPTH",
      `Tau render depth exceeds the limit of ${state.limits.maxDepth}.`,
    );
  }

  const helpers = {
    filters,
    append: (target: string[], value: unknown, escape: boolean) => {
      const output = escape ? escapeHtml(value) : String(value ?? "");
      state.outputBytes += utf8ByteLength(output);
      if (state.outputBytes > state.limits.maxOutputBytes) {
        throw new TauError(
          "TAU_LIMIT_OUTPUT",
          `Tau output exceeds the limit of ${state.limits.maxOutputBytes} bytes.`,
        );
      }
      target.push(output);
    },
    isIterable: (value: unknown) =>
      value != null &&
      typeof (value as { [Symbol.iterator]?: unknown })[Symbol.iterator] ===
        "function",
    countIteration: () => {
      state.iterations++;
      if (state.iterations > state.limits.maxIterations) {
        throw new TauError(
          "TAU_LIMIT_ITERATIONS",
          `Tau iterations exceed the limit of ${state.limits.maxIterations}.`,
        );
      }
    },
    resolveInclude: (
      path: string,
      ctx: Record<string, unknown>,
      target: string[],
    ) => {
      if (!options.includeResolver) {
        throw new TauError(
          "TAU_INCLUDE_RESOLVER_MISSING",
          `{@include "${path}"} used in template but no includeResolver was provided.`,
        );
      }
      if (state.includeStack.includes(path)) {
        throw new TauError(
          "TAU_INCLUDE_CYCLE",
          `Tau include cycle detected: ${
            [...state.includeStack, path].join(" -> ")
          }.`,
        );
      }
      state.includeStack.push(path);
      try {
        const includedTemplate = options.includeResolver(path);
        assertTemplateSize(includedTemplate, state.limits);
        const output = renderWithCompiledTemplate(
          getCompiledTemplate(includedTemplate, path),
          {
            ...options,
            template: includedTemplate,
            context: ctx,
            filePath: path,
          },
          componentFnCache,
          state,
        );
        target.push(output);
        return output;
      } finally {
        state.includeStack.pop();
      }
    },
    renderComponent: (
      name: string,
      props: Record<string, unknown>,
      parentContext: Record<string, unknown>,
      target: string[],
    ) => {
      const lowerName = name.charAt(0).toLowerCase() + name.slice(1);
      const componentTemplate = Object.hasOwn(options.components, name)
        ? options.components[name]
        : Object.hasOwn(options.components, lowerName)
        ? options.components[lowerName]
        : undefined;
      if (componentTemplate === undefined) {
        throw new TauError(
          "TAU_COMPONENT_NOT_FOUND",
          `Component "${name}" not found.`,
        );
      }
      if (state.componentStack.includes(name)) {
        throw new TauError(
          "TAU_COMPONENT_CYCLE",
          `Tau component cycle detected: ${
            [...state.componentStack, name].join(" -> ")
          }.`,
        );
      }
      assertTemplateSize(componentTemplate, state.limits);

      let componentRenderFn = componentFnCache.get(componentTemplate);
      if (!componentRenderFn) {
        componentRenderFn = getCompiledTemplate(
          componentTemplate,
          options.filePath,
        );
        componentFnCache.set(componentTemplate, componentRenderFn);
      }

      const globals =
        parentContext.globals && typeof parentContext.globals === "object" &&
          !Array.isArray(parentContext.globals)
          ? parentContext.globals
          : {};
      state.componentStack.push(name);
      try {
        const output = renderWithCompiledTemplate(
          componentRenderFn,
          {
            ...options,
            template: componentTemplate,
            context: {
              ...globals,
              globals,
              site: parentContext.site,
              theme: parentContext.theme,
              ...props,
            },
          },
          componentFnCache,
          state,
        );
        target.push(output);
        return output;
      } finally {
        state.componentStack.pop();
      }
    },
  };

  const contextProxy = new Proxy(options.context, {
    has: (_, key) =>
      typeof key !== "symbol" &&
      !["html", "helpers", "context"].includes(key as string),
    get: (target, key) => {
      if (key === Symbol.unscopables) return undefined;
      if (Object.hasOwn(target, key)) return target[key as string];
      if (key in helpers) return undefined;
      return undefined;
    },
  });

  try {
    try {
      return renderFn(contextProxy, helpers);
    } catch (error) {
      if (error instanceof TauError) throw error;
      throw new TauError(
        "TAU_RENDER_FAILED",
        `Tau rendering failed: ${
          error instanceof Error ? error.message : String(error)
        }`,
        { filePath: options.filePath },
        { cause: error },
      );
    }
  } finally {
    state.depth--;
  }
}

function assertTemplateSize(template: string, limits: TauLimits): void {
  const bytes = utf8ByteLength(template);
  if (bytes > limits.maxTemplateBytes) {
    throw new TauError(
      "TAU_LIMIT_TEMPLATE",
      `Tau template exceeds the limit of ${limits.maxTemplateBytes} bytes.`,
    );
  }
}

/**
 * Renders a Tau template with the supplied context and components.
 *
 * @param options Template source, context, components, and optional limits.
 * @returns The rendered HTML string.
 */
export function render(options: TauOptions): string {
  const limits = resolveLimits(options.limits);
  assertTemplateSize(options.template, limits);
  return renderWithCompiledTemplate(
    getCompiledTemplate(options.template, options.filePath),
    options,
    new Map(),
    {
      limits,
      depth: 0,
      iterations: 0,
      outputBytes: 0,
      includeStack: [],
      componentStack: [],
    },
  );
}
