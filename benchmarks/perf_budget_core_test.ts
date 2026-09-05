import { assertEquals, assertThrows } from "@std/assert";
import type { BenchJson, BenchMetrics } from "./bench_results.ts";
import {
  BENCH_BUDGETS_NS,
  evaluatePerformanceBudgets,
  parseBudgetMultiplier,
} from "./perf_budget_core.ts";

function metrics(avg: number): BenchMetrics {
  return { n: 10, min: avg, max: avg, avg, p75: avg, p99: avg };
}

function results(avgByName: Readonly<Record<string, number>>): BenchJson {
  return {
    benches: Object.entries(avgByName).map(([name, avg]) => ({
      name,
      results: [{ ok: metrics(avg) }],
    })),
  };
}

Deno.test("performance budgets: accepts results within every budget", () => {
  const input = results(
    Object.fromEntries(Object.entries(BENCH_BUDGETS_NS).map(([name, budget]) => [name, budget])),
  );

  const evaluation = evaluatePerformanceBudgets(input);

  assertEquals(evaluation.failures, []);
  assertEquals(evaluation.successes.length, Object.keys(BENCH_BUDGETS_NS).length);
});

Deno.test("performance budgets: reports missing and invalid results", () => {
  const [firstName] = Object.keys(BENCH_BUDGETS_NS);
  const evaluation = evaluatePerformanceBudgets({
    benches: [{ name: firstName, results: [{ ok: { avg: 1 } }] }],
  });

  assertEquals(evaluation.failures[0], `${firstName}: invalid benchmark metrics`);
  assertEquals(evaluation.failures.length, Object.keys(BENCH_BUDGETS_NS).length);
});

Deno.test("performance budgets: applies the supplied multiplier", () => {
  const [firstName, firstBudget] = Object.entries(BENCH_BUDGETS_NS)[0];
  const input = results({ [firstName]: firstBudget * 1.25 });

  const strict = evaluatePerformanceBudgets(input);
  const relaxed = evaluatePerformanceBudgets(input, 1.5);

  assertEquals(strict.failures[0].includes("exceeds budget"), true);
  assertEquals(relaxed.successes.length, 1);
});

Deno.test("performance budgets: rejects invalid multipliers", () => {
  assertEquals(parseBudgetMultiplier(undefined), 1);
  assertEquals(parseBudgetMultiplier("1.5"), 1.5);
  assertThrows(() => parseBudgetMultiplier("0"), Error, "positive number");
  assertThrows(() => parseBudgetMultiplier("nope"), Error, "positive number");
});
