import { readOrRunBenchmarks } from "./bench_results.ts";
import { evaluatePerformanceBudgets, parseBudgetMultiplier } from "./perf_budget_core.ts";

const BUDGET_MULTIPLIER_ENV = "STENO_BENCH_BUDGET_MULTIPLIER";

const output = await readOrRunBenchmarks(Deno.args[0]);
const budgetMultiplier = parseBudgetMultiplier(Deno.env.get(BUDGET_MULTIPLIER_ENV));

if (budgetMultiplier !== 1) {
  console.log(`Applying benchmark budget multiplier: ${budgetMultiplier.toFixed(2)}x`);
}

const { successes, failures } = evaluatePerformanceBudgets(output, budgetMultiplier);
for (const success of successes) console.log(success);

if (failures.length > 0) {
  for (const failure of failures) {
    console.error(`PERF FAIL: ${failure}`);
  }
  Deno.exit(1);
}

console.log("Performance budgets passed.");
