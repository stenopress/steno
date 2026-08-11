import { assertEquals, assertRejects } from "@std/assert";
import { render } from "./tau.ts";
import { TauError, type TauErrorCode } from "./tau_error.ts";

interface ConformanceCase {
  name: string;
  template: string;
  context: Record<string, unknown>;
  components?: Record<string, string>;
  output?: string;
  errorCode?: TauErrorCode;
}

function loadCases(version: string): ConformanceCase[] {
  const url = new URL(`./fixtures/tau/${version}.json`, import.meta.url);
  return JSON.parse(Deno.readTextFileSync(url)) as ConformanceCase[];
}

// JSON fixtures can't encode functions; this sentinel string stands in for a
// context-supplied async function so the "async call is awaited" case can be
// expressed declaratively like every other fixture.
const ASYNC_HELLO_SENTINEL = "__async_hello__";

function resolveContext(context: Record<string, unknown>): Record<string, unknown> {
  const resolved: Record<string, unknown> = { ...context };
  for (const [key, value] of Object.entries(resolved)) {
    if (value === ASYNC_HELLO_SENTINEL) {
      resolved[key] = () => Promise.resolve("Async Hello");
    }
  }
  return resolved;
}

function registerVersion(version: string): void {
  for (const testCase of loadCases(version)) {
    Deno.test(`tau conformance ${version}: ${testCase.name}`, async () => {
      const execute = () =>
        render({
          template: testCase.template,
          context: resolveContext(testCase.context),
          components: testCase.components ?? {},
        });

      if (testCase.errorCode) {
        const error = await assertRejects(execute, TauError);
        assertEquals(error.code, testCase.errorCode);
      } else {
        assertEquals(await execute(), testCase.output);
      }
    });
  }
}

export function registerTauConformanceTests(): void {
  registerVersion("v0.8");
  registerVersion("v0.9");
}
