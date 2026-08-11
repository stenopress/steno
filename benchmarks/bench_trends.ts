import { join } from "@std/path";
import { formatNs, getMetrics, readOrRunBenchmarks } from "./bench_results.ts";

interface BenchSnapshot {
  timestamp: string;
  benches: Array<{ name: string; avgNs: number; p99Ns: number }>;
}

const HISTORY_DIR = join(Deno.cwd(), "benchmarks", ".bench-history");
const LATEST_FILE = join(HISTORY_DIR, "latest.json");
const HISTORY_FILE = join(HISTORY_DIR, "history.ndjson");

const output = await readOrRunBenchmarks(Deno.args[0]);
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
await Deno.writeTextFile(LATEST_FILE, JSON.stringify(snapshot, null, 2));
await Deno.writeTextFile(HISTORY_FILE, JSON.stringify(snapshot) + "\n", {
  append: true,
  create: true,
});

const top = [...snapshot.benches].sort((a, b) => b.avgNs - a.avgNs).slice(0, 10);

console.log(`Stored benchmark snapshot at ${LATEST_FILE}`);
for (const bench of top) {
  console.log(`${bench.name}: avg=${formatNs(bench.avgNs)} p99=${formatNs(bench.p99Ns)}`);
}
