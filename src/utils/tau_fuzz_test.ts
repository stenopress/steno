import { assert, assertEquals, assertLessOrEqual } from "@std/assert";
import { escapeHtml, render } from "./tau.ts";
import { TauError } from "./tau_error.ts";
import { TauParser } from "./tau_parser.ts";

function createRandom(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (Math.imul(state, 1_664_525) + 1_013_904_223) >>> 0;
    return state / 0x1_0000_0000;
  };
}

function randomString(random: () => number, length: number): string {
  const alphabet = "{}<>=/#:@|()[]'\" abcXYZ019_-$\n";
  let value = "";
  for (let index = 0; index < length; index++) {
    value += alphabet[Math.floor(random() * alphabet.length)];
  }
  return value;
}

export function registerTauFuzzTests(): void {
  Deno.test("tau property: escaped interpolation never emits raw HTML delimiters", () => {
    const random = createRandom(0x54415508);
    for (let index = 0; index < 1_000; index++) {
      const value = randomString(random, Math.floor(random() * 80));
      const output = render({
        template: "{value}",
        context: { value },
        components: {},
      });
      assertEquals(output, escapeHtml(value));
      assertEquals(
        output,
        render({
          template: "{value}",
          context: { value },
          components: {},
        }),
      );
    }
  });

  Deno.test("tau fuzz: parser terminates deterministically on arbitrary input", () => {
    const random = createRandom(0xF022_0008);
    for (let index = 0; index < 2_000; index++) {
      const input = randomString(random, Math.floor(random() * 256));
      try {
        const first = new TauParser(input).parseBlock();
        const second = new TauParser(input).parseBlock();
        assertEquals(first, second);
      } catch (error) {
        assert(error instanceof TauError);
      }
    }
  });

  Deno.test("tau adversarial: parser rejects excessive syntax depth", () => {
    const template = `${"{#if true}".repeat(300)}x${"{/if}".repeat(300)}`;
    const error = (() => {
      try {
        render({ template, context: {}, components: {} });
      } catch (caught) {
        return caught;
      }
    })();
    assert(error instanceof TauError);
    assertEquals(error.code, "TAU_LIMIT_DEPTH");
  });

  Deno.test("tau adversarial: infinite iterables stop at the shared limit", () => {
    const infinite = {
      *[Symbol.iterator]() {
        while (true) yield "x";
      },
    };
    const error = (() => {
      try {
        render({
          template: "{#each values as value}{value}{/each}",
          context: { values: infinite },
          components: {},
          limits: { maxIterations: 32 },
        });
      } catch (caught) {
        return caught;
      }
    })();
    assert(error instanceof TauError);
    assertEquals(error.code, "TAU_LIMIT_ITERATIONS");
  });

  Deno.test("tau property: output never exceeds its configured byte limit", () => {
    const limit = 128;
    try {
      const output = render({
        template: "{#each values as value}{value}{/each}",
        context: { values: Array(100).fill("😀") },
        components: {},
        limits: { maxOutputBytes: limit },
      });
      assertLessOrEqual(new TextEncoder().encode(output).byteLength, limit);
    } catch (error) {
      assert(error instanceof TauError);
      assertEquals(error.code, "TAU_LIMIT_OUTPUT");
    }
  });
}
