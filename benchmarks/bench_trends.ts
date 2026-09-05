import { join } from "@std/path";
import { formatNs, getMetrics, readOrRunBenchmarks } from "./bench_results.ts";
import {
  type BenchSnapshot,
  compareBenchSnapshots,
  parseRegressionThreshold,
} from "./bench_trends_core.ts";

const HISTORY_DIR = join(Deno.cwd(), "benchmarks", ".bench-history");
const LATEST_FILE = join(HISTORY_DIR, "latest.json");
const HISTORY_FILE = join(HISTORY_DIR, "history.ndjson");
const TREND_THRESHOLD_ENV = "STENO_BENCH_TREND_THRESHOLD";

async function readLatestSnapshot(): Promise<BenchSnapshot | undefined> {
  try {
    return JSON.parse(await Deno.readTextFile(LATEST_FILE)) as BenchSnapshot;
  } catch (error) {
    if (error instanceof Deno.errors.NotFound) return;
    throw error;
  }
}

const output = await readOrRunBenchmarks(Deno.args[0]);
const previous = await readLatestSnapshot();
const snapshot: BenchSnapshot = {
  timestamp: new Date().toISOString(),
  benches: (output.benches ?? [])
    .map((bench) => {
      const ok = getMetrics(bench);
      if (!bench.name || !ok) return null;
      return {
        name: bench.name,
        avgNs: ok.avg,
        p99Ns: ok.p99,
      };
    })
    .filter((entry): entry is { name: string; avgNs: number; p99Ns: number } => entry !== null),
};

await Deno.mkdir(HISTORY_DIR, { recursive: true });
await Deno.writeTextFile(HISTORY_FILE, JSON.stringify(snapshot) + "\n", {
  append: true,
  create: true,
});

if (!previous) {
  await Deno.writeTextFile(LATEST_FILE, JSON.stringify(snapshot, null, 2));
  console.log(`Stored initial benchmark baseline at ${LATEST_FILE}`);
  Deno.exit(0);
}

const threshold = parseRegressionThreshold(Deno.env.get(TREND_THRESHOLD_ENV));
const evaluation = compareBenchSnapshots(previous, snapshot, threshold);
for (const comparison of evaluation.comparisons) {
  const change = `${comparison.changeRatio >= 0 ? "+" : ""}${(comparison.changeRatio * 100).toFixed(
    1,
  )}%`;
  console.log(
    `${comparison.name}: ${formatNs(comparison.previousAvgNs)} -> ${formatNs(
      comparison.currentAvgNs,
    )} (${change})`,
  );
}
for (const name of evaluation.added) console.log(`${name}: new benchmark`);
for (const name of evaluation.missing) console.warn(`${name}: missing from current run`);

if (evaluation.failures.length > 0) {
  for (const failure of evaluation.failures) {
    console.error(
      `TREND FAIL: ${failure.name} regressed ${(failure.changeRatio * 100).toFixed(1)}% ` +
        `(limit ${(threshold * 100).toFixed(1)}%)`,
    );
  }
  Deno.exit(1);
}

await Deno.writeTextFile(LATEST_FILE, JSON.stringify(snapshot, null, 2));
console.log(`Updated accepted benchmark baseline at ${LATEST_FILE}`);
