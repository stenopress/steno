import { formatNs, getMetrics, type BenchJson } from "./bench_results.ts";

const NS_PER_MS = 1_000_000;
const NS_PER_US = 1_000;

export const BENCH_BUDGETS_NS: Readonly<Record<string, number>> = {
  "build (cold, 250 pages)": 50 * NS_PER_MS,
  "build (cold, 1000 pages)": 200 * NS_PER_MS,
  "build (cold, 4000 pages)": 800 * NS_PER_MS,
  "build (warm, 1000 pages unchanged)": 45 * NS_PER_MS,
  "build (atomic incremental, 1 changed page of 1000)": 275 * NS_PER_MS,
  "pipeline (typical page parse->markdown->tau)": 250 * NS_PER_US,
  "pipeline (large page parse->markdown->tau)": 1_000 * NS_PER_US,
  "core (prepared page context->layout)": 250 * NS_PER_US,
  "tau render (simple)": 8 * NS_PER_US,
  "tau render (list of 1000 items)": 6 * NS_PER_MS,
  "parseFrontmatter (yaml)": 6 * NS_PER_US,
  "parseFrontmatter (yaml + 10k-word body)": 3 * NS_PER_US,
};

export interface BudgetEvaluation {
  successes: string[];
  failures: string[];
}

export function parseBudgetMultiplier(raw: string | undefined): number {
  if (raw === undefined) return 1;

  const multiplier = Number(raw);
  if (!Number.isFinite(multiplier) || multiplier <= 0) {
    throw new Error(`Benchmark budget multiplier must be a positive number, received "${raw}".`);
  }
  return multiplier;
}

export function evaluatePerformanceBudgets(
  output: BenchJson,
  budgetMultiplier = 1,
): BudgetEvaluation {
  const benches = output.benches ?? [];
  const successes: string[] = [];
  const failures: string[] = [];

  for (const [name, baseBudgetNs] of Object.entries(BENCH_BUDGETS_NS)) {
    const budgetNs = baseBudgetNs * budgetMultiplier;
    const bench = benches.find((entry) => entry.name === name);
    if (!bench) {
      failures.push(`${name}: missing benchmark result`);
      continue;
    }
    const metrics = getMetrics(bench);
    if (!metrics) {
      failures.push(`${name}: invalid benchmark metrics`);
      continue;
    }
    if (metrics.avg > budgetNs) {
      failures.push(`${name}: avg ${formatNs(metrics.avg)} exceeds budget ${formatNs(budgetNs)}`);
    } else {
      successes.push(`${name}: ${formatNs(metrics.avg)} (budget ${formatNs(budgetNs)})`);
    }
  }

  return { successes, failures };
}
