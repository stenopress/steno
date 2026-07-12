import { join } from "@std/path";

type BenchJson = {
  benches?: Array<{
    name?: string;
    results?: Array<{ ok?: { avg?: number; p99?: number } }>;
  }>;
};

interface BenchSnapshot {
  timestamp: string;
  benches: Array<{ name: string; avgNs: number; p99Ns: number }>;
}

const NS_PER_US = 1_000;
const NS_PER_MS = 1_000_000;
const HISTORY_DIR = join(Deno.cwd(), "benchmarks", ".bench-history");
const LATEST_FILE = join(HISTORY_DIR, "latest.json");
const HISTORY_FILE = join(HISTORY_DIR, "history.ndjson");

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
  return JSON.parse(new TextDecoder().decode(result.stdout)) as BenchJson;
}

const output = await runBenchJson();
const snapshot: BenchSnapshot = {
  timestamp: new Date().toISOString(),
  benches: (output.benches ?? [])
    .map((bench) => {
      const ok = bench.results?.find((result) => result.ok)?.ok;
      if (
        !bench.name ||
        !ok ||
        typeof ok.avg !== "number" ||
        typeof ok.p99 !== "number"
      ) {
        return null;
      }
      return {
        name: bench.name,
        avgNs: ok.avg,
        p99Ns: ok.p99,
      };
    })
    .filter((entry): entry is { name: string; avgNs: number; p99Ns: number } =>
      entry !== null
    ),
};

await Deno.mkdir(HISTORY_DIR, { recursive: true });
await Deno.writeTextFile(LATEST_FILE, JSON.stringify(snapshot, null, 2));
await Deno.writeTextFile(HISTORY_FILE, JSON.stringify(snapshot) + "\n", {
  append: true,
  create: true,
});

const top = [...snapshot.benches]
  .sort((a, b) => b.avgNs - a.avgNs)
  .slice(0, 10);

console.log(`Stored benchmark snapshot at ${LATEST_FILE}`);
for (const bench of top) {
  console.log(
    `${bench.name}: avg=${formatNs(bench.avgNs)} p99=${formatNs(bench.p99Ns)}`,
  );
}
