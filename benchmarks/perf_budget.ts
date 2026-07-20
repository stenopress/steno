import { join } from "@std/path";

type BenchJson = {
  benches?: Array<{
    name?: string;
    results?: Array<{ ok?: { avg?: number; p99?: number } }>;
  }>;
};

const NS_PER_US = 1_000;
const NS_PER_MS = 1_000_000;
const BUDGET_MULTIPLIER_ENV = "STENO_BENCH_BUDGET_MULTIPLIER";

const BENCH_BUDGETS_NS: Record<string, number> = {
  "build (warm, 1000 pages unchanged)": 45 * NS_PER_MS,
  "build (incremental, 1 changed page of 1000)": 45 * NS_PER_MS,
  "pipeline (typical page parse->markdown->scribe)": 250 * NS_PER_US,
  "pipeline (large page parse->markdown->scribe)": 1_000 * NS_PER_US,
  "scribe render (simple)": 8 * NS_PER_US,
  "scribe render (list of 1000 items)": 6 * NS_PER_MS,
  "parseFrontmatter (yaml)": 6 * NS_PER_US,
  "parseFrontmatter (yaml + 10k-word body)": 3 * NS_PER_US,
};

function readBudgetMultiplier(): number {
  const raw = Deno.env.get(BUDGET_MULTIPLIER_ENV);
  if (raw === undefined) return 1;

  const multiplier = Number(raw);
  if (!Number.isFinite(multiplier) || multiplier <= 0) {
    throw new Error(
      `${BUDGET_MULTIPLIER_ENV} must be a positive number, received "${raw}".`,
    );
  }
  return multiplier;
}

function formatNs(ns: number): string {
  if (ns >= NS_PER_MS) return `${(ns / NS_PER_MS).toFixed(2)} ms`;
  if (ns >= NS_PER_US) return `${(ns / NS_PER_US).toFixed(2)} us`;
  return `${ns.toFixed(2)} ns`;
}

async function runBenchJson(): Promise<BenchJson> {
  const benchmarkDir = join(Deno.cwd(), "benchmarks");
  const result = await new Deno.Command(Deno.execPath(), {
    args: ["bench", "-A", "--json", benchmarkDir],
    stdout: "piped",
    stderr: "inherit",
  }).output();

  if (result.code !== 0) {
    throw new Error("Bench command failed.");
  }
  const raw = new TextDecoder().decode(result.stdout).trim();
  return JSON.parse(raw) as BenchJson;
}

const output = await runBenchJson();
const benches = output.benches ?? [];
const failures: string[] = [];
const budgetMultiplier = readBudgetMultiplier();

if (budgetMultiplier !== 1) {
  console.log(
    `Applying benchmark budget multiplier: ${budgetMultiplier.toFixed(2)}x`,
  );
}

for (const [name, baseBudgetNs] of Object.entries(BENCH_BUDGETS_NS)) {
  const budgetNs = baseBudgetNs * budgetMultiplier;
  const bench = benches.find((entry) => entry.name === name);
  if (!bench) {
    failures.push(`${name}: missing benchmark result`);
    continue;
  }
  const metrics = bench.results?.find((result) => result.ok)?.ok;
  if (!metrics || typeof metrics.avg !== "number") {
    failures.push(`${name}: invalid benchmark metrics`);
    continue;
  }
  if (metrics.avg > budgetNs) {
    failures.push(
      `${name}: avg ${formatNs(metrics.avg)} exceeds budget ${
        formatNs(budgetNs)
      }`,
    );
  } else {
    console.log(
      `${name}: ${formatNs(metrics.avg)} (budget ${formatNs(budgetNs)})`,
    );
  }
}

if (failures.length > 0) {
  for (const failure of failures) {
    console.error(`PERF FAIL: ${failure}`);
  }
  Deno.exit(1);
}

console.log("Performance budgets passed.");
