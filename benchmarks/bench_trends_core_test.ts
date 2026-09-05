import { assertEquals, assertThrows } from "@std/assert";
import {
  type BenchSnapshot,
  compareBenchSnapshots,
  parseRegressionThreshold,
} from "./bench_trends_core.ts";

function snapshot(benches: Record<string, number>): BenchSnapshot {
  return {
    timestamp: "2026-09-05T00:00:00.000Z",
    benches: Object.entries(benches).map(([name, avgNs]) => ({ name, avgNs, p99Ns: avgNs })),
  };
}

Deno.test("benchmark trends: identifies regressions beyond the threshold", () => {
  const result = compareBenchSnapshots(
    snapshot({ stable: 100, slower: 100, faster: 100 }),
    snapshot({ stable: 110, slower: 121, faster: 80 }),
    0.2,
  );

  assertEquals(
    result.failures.map((entry) => entry.name),
    ["slower"],
  );
  assertEquals(
    result.comparisons.map((entry) => entry.changeRatio),
    [0.1, 0.21, -0.2],
  );
});

Deno.test("benchmark trends: reports added and missing scenarios", () => {
  const result = compareBenchSnapshots(
    snapshot({ retained: 100, removed: 100 }),
    snapshot({ retained: 100, added: 100 }),
  );

  assertEquals(result.added, ["added"]);
  assertEquals(result.missing, ["removed"]);
});

Deno.test("benchmark trends: handles a zero-duration baseline", () => {
  const result = compareBenchSnapshots(
    snapshot({ unchanged: 0, slower: 0 }),
    snapshot({
      unchanged: 0,
      slower: 1,
    }),
  );

  assertEquals(result.comparisons[0].changeRatio, 0);
  assertEquals(result.comparisons[1].changeRatio, Number.POSITIVE_INFINITY);
  assertEquals(result.failures.length, 1);
});

Deno.test("benchmark trends: validates the regression threshold", () => {
  assertEquals(parseRegressionThreshold(undefined), 0.2);
  assertEquals(parseRegressionThreshold("0"), 0);
  assertEquals(parseRegressionThreshold("0.35"), 0.35);
  assertThrows(() => parseRegressionThreshold("-0.1"), Error, "non-negative number");
  assertThrows(() => parseRegressionThreshold("nope"), Error, "non-negative number");
});
