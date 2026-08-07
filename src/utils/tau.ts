import { type Node, TauParser } from "./tau_parser.ts";
import { TauError } from "./tau_error.ts";
import { errorMessage, utf8ByteLength } from "./text.ts";
import { BLOCKED_EXPRESSION_NAMES, compileExpression } from "./tau_expr.ts";

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

/** Function signature for a Tau value filter. May be sync or async. */
export type FilterFunction = (
  val: unknown,
  ...args: unknown[]
) => unknown;
type CompiledTemplateFn = (
  context: Record<string, unknown>,
  helpers: TauHelpers,
) => Promise<string>;

interface TauHelpers {
  filters: Record<string, FilterFunction>;
  append: (target: string[], value: unknown, escape: boolean) => void;
  get: (obj: unknown, key: unknown, optional: boolean) => unknown;
  isIterable: (value: unknown) => boolean;
  countIteration: () => void;
  renderComponent: (
    name: string,
    props: Record<string, unknown>,
    parentContext: Record<string, unknown>,
    target: string[],
  ) => Promise<string>;
  resolveInclude: (
    path: string,
    context: Record<string, unknown>,
    target: string[],
  ) => Promise<string>;
}

// `new Function` can't build an async function; borrow AsyncFunction's constructor.
const AsyncFunction: FunctionConstructor =
  Object.getPrototypeOf(async function () {}).constructor;

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

function hasControlCharacters(value: string): boolean {
  for (let index = 0; index < value.length; index++) {
    const code = value.charCodeAt(index);
    if (code <= 0x1F || code === 0x7F) return true;
  }
  return false;
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

const EMPTY_LOCALS: ReadonlySet<string> = new Set();

/** Shared across one compileToFunction call to name child-content buffers uniquely. */
interface CompileState {
  nextId: number;
}

function compileNodes(
  nodes: Node[],
  locals: ReadonlySet<string> = EMPTY_LOCALS,
  target = "html",
  state: CompileState = { nextId: 0 },
): string {
  let code = "";
  // Mutated by "let" nodes so bindings are visible to later siblings only.
  let currentLocals = locals;
  for (const node of nodes) {
    if (node.type === "text") {
      code += `helpers.append(${target}, ${
        JSON.stringify(node.value)
      }, false);\n`;
    } else if (node.type === "let") {
      const value = compileExpression(node.expression!, currentLocals);
      code += `const ${node.letName} = ${value};\n`;
      const nextLocals = new Set(currentLocals);
      nextLocals.add(node.letName!);
      currentLocals = nextLocals;
    } else if (node.type === "expression") {
      let expr = compileExpression(node.expression!, currentLocals);
      for (const filter of node.filters || []) {
        if (!Object.hasOwn(filters, filter.name)) {
          throw new TauError(
            "TAU_UNKNOWN_FILTER",
            `Unknown Tau filter "${filter.name}".`,
          );
        }
        const args = filter.args.map((arg) =>
          compileExpression(arg, currentLocals)
        );
        expr = `(await helpers.filters.${filter.name}(${
          [expr, ...args].join(", ")
        }))`;
      }
      code += `helpers.append(${target}, ${expr}, true);\n`;
    } else if (node.type === "html") {
      const expr = compileExpression(node.expression!, currentLocals);
      code += `helpers.append(${target}, ${expr}, false);\n`;
    } else if (node.type === "include") {
      code += `await helpers.resolveInclude(${
        JSON.stringify(node.includePath)
      }, context, ${target});\n`;
    } else if (node.type === "if") {
      const condition = compileExpression(node.condition!, currentLocals);
      code += `if (${condition}) {\n${
        compileNodes(node.consequent || [], currentLocals, target, state)
      }}`;
      if (node.alternate?.length) {
        code += ` else {\n${
          compileNodes(node.alternate, currentLocals, target, state)
        }}\n`;
      } else code += "\n";
    } else if (node.type === "each") {
      const array = compileExpression(node.array!, currentLocals);
      const loopLocals = new Set(currentLocals);
      loopLocals.add(node.item!);
      if (node.indexVar) loopLocals.add(node.indexVar);
      const hasElse = (node.alternate?.length ?? 0) > 0;
      code += `{\nconst __tauIterable = ${array};\n`;
      if (hasElse) code += `let __tauHadItems = false;\n`;
      code += `if (helpers.isIterable(__tauIterable)) {\n`;
      if (node.indexVar) code += `  let ${node.indexVar} = 0;\n`;
      code += `  for (const ${node.item} of __tauIterable) {\n${
        hasElse ? "    __tauHadItems = true;\n" : ""
      }    helpers.countIteration();\n${
        compileNodes(node.consequent || [], loopLocals, target, state)
      }`;
      if (node.indexVar) code += `    ${node.indexVar}++;\n`;
      code += `  }\n}\n`;
      if (hasElse) {
        code += `if (!__tauHadItems) {\n${
          compileNodes(node.alternate || [], currentLocals, target, state)
        }}\n`;
      }
      code += `}\n`;
    } else if (node.type === "component") {
      const propsEntries = Object.entries(node.props || {}).map(([k, v]) => {
        const value = compileExpression(v, currentLocals);
        return `${JSON.stringify(k)}: ${value}`;
      });
      if (node.consequent && node.consequent.length > 0) {
        const childTarget = `__tauChildren${state.nextId++}`;
        code += `const ${childTarget} = [];\n${
          compileNodes(node.consequent, currentLocals, childTarget, state)
        }`;
        propsEntries.push(`children: ${childTarget}.join("")`);
      }
      const propsObj = `{ ${propsEntries.join(", ")} }`;
      code += `await helpers.renderComponent(${
        JSON.stringify(node.componentName)
      }, ${propsObj}, context, ${target});\n`;
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
    return new AsyncFunction(
      "context",
      "helpers",
      `const html = [];\n${body}\nreturn html.join("");`,
    ) as unknown as CompiledTemplateFn;
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

async function renderWithCompiledTemplate(
  renderFn: CompiledTemplateFn,
  options: TauOptions,
  componentFnCache: Map<string, CompiledTemplateFn>,
  state: RenderState,
): Promise<string> {
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
    get: (obj: unknown, key: unknown, optional: boolean) => {
      if (optional && (obj === null || obj === undefined)) return undefined;
      if (typeof key === "string" && BLOCKED_EXPRESSION_NAMES.has(key)) {
        throw new TauError(
          "TAU_UNSAFE_EXPRESSION",
          `Tau expression access to "${key}" is not allowed.`,
        );
      }
      return (obj as Record<string, unknown>)[key as string];
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
    resolveInclude: async (
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
        const output = await renderWithCompiledTemplate(
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
    renderComponent: async (
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
        const output = await renderWithCompiledTemplate(
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

  try {
    try {
      return await renderFn(options.context, helpers);
    } catch (error) {
      if (error instanceof TauError) throw error;
      throw new TauError(
        "TAU_RENDER_FAILED",
        `Tau rendering failed: ${errorMessage(error)}`,
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
 * Async because template expressions may call a context-supplied async
 * function (`{someAsyncFn()}`); the result is awaited implicitly, so a sync
 * function works too. Filters may also be async.
 *
 * @param options Template source, context, components, and optional limits.
 * @returns The rendered HTML string.
 */
export async function render(options: TauOptions): Promise<string> {
  const limits = resolveLimits(options.limits);
  assertTemplateSize(options.template, limits);
  return await renderWithCompiledTemplate(
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
