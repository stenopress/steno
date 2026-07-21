import { assertEquals, assertThrows } from "@std/assert";
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
  const url = new URL(
    `../../test/fixtures/tau/${version}.json`,
    import.meta.url,
  );
  return JSON.parse(Deno.readTextFileSync(url)) as ConformanceCase[];
}

export function registerTauConformanceTests(): void {
  for (const testCase of loadCases("v0.8")) {
    Deno.test(`tau conformance v0.8: ${testCase.name}`, () => {
      const execute = () =>
        render({
          template: testCase.template,
          context: testCase.context,
          components: testCase.components ?? {},
        });

      if (testCase.errorCode) {
        const error = assertThrows(execute, TauError);
        assertEquals(error.code, testCase.errorCode);
      } else {
        assertEquals(execute(), testCase.output);
      }
    });
  }
}
