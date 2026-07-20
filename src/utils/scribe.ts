import { type Node, ScribeParser } from "./scribe_parser.ts";

export interface ScribeOptions {
  template: string;
  context: Record<string, unknown>;
  components: Record<string, string>;
  filePath?: string;
  includeResolver?: (path: string) => string;
}

type FilterFunction = (val: unknown, ...args: unknown[]) => unknown;
type CompiledTemplateFn = (
  context: Record<string, unknown>,
  helpers: ScribeHelpers,
) => string;

interface ScribeHelpers {
  escapeHtml: (val: unknown) => string;
  filters: Record<string, FilterFunction>;
  renderComponent: (
    name: string,
    props: Record<string, unknown>,
    parentContext: Record<string, unknown>,
  ) => string;
  resolveInclude: (path: string, context: Record<string, unknown>) => string;
}

const templateCache = new Map<string, CompiledTemplateFn>();

export const filters: Record<string, FilterFunction> = {
  date: (val) => {
    if (!val) return "";
    const d = new Date(
      typeof val === "string" || typeof val === "number" || val instanceof Date
        ? val
        : String(val),
    );
    return isNaN(d.getTime()) ? String(val) : d.toLocaleDateString();
  },
  truncate: (val, len = 100) => {
    if (val === null || val === undefined) return "";
    const parsedLen = typeof len === "string" ? parseInt(len, 10) : Number(len);
    const finalLen = isNaN(parsedLen) ? 100 : parsedLen;
    return String(val).length > finalLen
      ? String(val).slice(0, finalLen) + "..."
      : String(val);
  },
  upper: (val) => (val ? String(val).toUpperCase() : ""),
  lower: (val) => (val ? String(val).toLowerCase() : ""),
};

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
      code += `html.push(${JSON.stringify(node.value)});\n`;
    } else if (node.type === "expression") {
      let expr = node.expression;
      for (const filter of node.filters || []) {
        expr = `helpers.filters.${filter.name}(${
          [expr, ...filter.args].join(", ")
        })`;
      }
      code += `html.push(helpers.escapeHtml(${expr}));\n`;
    } else if (node.type === "html") {
      code += `html.push(String(${node.expression}));\n`;
    } else if (node.type === "include") {
      code += `html.push(helpers.resolveInclude(${
        JSON.stringify(node.includePath)
      }, context));\n`;
    } else if (node.type === "if") {
      code += `if (${node.condition}) {\n${
        compileNodes(node.consequent || [])
      }}`;
      if (node.alternate?.length) {
        code += ` else {\n${compileNodes(node.alternate)}}\n`;
      } else code += "\n";
    } else if (node.type === "each") {
      code +=
        `if (${node.array} && typeof ${node.array}[Symbol.iterator] === 'function') {\n`;
      if (node.indexVar) code += `  let ${node.indexVar} = 0;\n`;
      code += `  for (const ${node.item} of ${node.array}) {\n${
        compileNodes(node.consequent || [])
      }`;
      if (node.indexVar) code += `    ${node.indexVar}++;\n`;
      code += `  }\n}\n`;
    } else if (node.type === "component") {
      const propsObj = `{ ${
        Object.entries(node.props || {}).map(([k, v]) =>
          `${JSON.stringify(k)}: ${v}`
        ).join(", ")
      } }`;
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
  const body = compileNodes(new ScribeParser(template, filePath).parseBlock());
  try {
    return new Function(
      "context",
      "helpers",
      `const html = []; with (context) {\n${body}\n} return html.join("");`,
    ) as CompiledTemplateFn;
  } catch (err) {
    console.error("Failed to compile template execution body.");
    throw err;
  }
}

function getCompiledTemplate(
  template: string,
  filePath?: string,
): CompiledTemplateFn {
  const key = `${filePath ?? ""}\u0000${template}`;
  const cached = templateCache.get(key);
  if (cached) {
    templateCache.delete(key);
    templateCache.set(key, cached);
    return cached;
  }
  const compiled = compileToFunction(template, filePath);
  templateCache.set(key, compiled);
  if (templateCache.size > 512) {
    templateCache.delete(templateCache.keys().next().value!);
  }
  return compiled;
}

function renderWithCompiledTemplate(
  renderFn: CompiledTemplateFn,
  options: ScribeOptions,
  componentFnCache: Map<string, CompiledTemplateFn>,
): string {
  const helpers = {
    escapeHtml,
    filters,
    resolveInclude: (path: string, ctx: Record<string, unknown>) => {
      if (!options.includeResolver) {
        throw new Error(
          `{@include "${path}"} used in template but no includeResolver was provided.`,
        );
      }
      return render({
        ...options,
        template: options.includeResolver(path),
        context: ctx,
        filePath: path,
      });
    },
    renderComponent: (
      name: string,
      props: Record<string, unknown>,
      parentContext: Record<string, unknown>,
    ) => {
      const componentTemplate = options.components[name] ??
        options.components[name.charAt(0).toLowerCase() + name.slice(1)];
      if (componentTemplate === undefined) {
        throw new Error(`Component "${name}" not found.`);
      }

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
      return renderWithCompiledTemplate(componentRenderFn, {
        ...options,
        template: componentTemplate,
        context: {
          ...globals,
          globals,
          site: parentContext.site,
          theme: parentContext.theme,
          ...props,
        },
      }, componentFnCache);
    },
  };

  const contextProxy = new Proxy(options.context, {
    has: (_, key) =>
      typeof key !== "symbol" &&
      !["html", "helpers", "context"].includes(key as string),
    get: (target, key) => {
      if (key === Symbol.unscopables) return undefined;
      if (key in target) return target[key as string];
      if (key in helpers) return undefined;
      return typeof globalThis !== "undefined" && key in globalThis
        ? Reflect.get(globalThis, key)
        : undefined;
    },
  });

  return renderFn(contextProxy, helpers);
}

export function render(options: ScribeOptions): string {
  return renderWithCompiledTemplate(
    getCompiledTemplate(options.template, options.filePath),
    options,
    new Map(),
  );
}
