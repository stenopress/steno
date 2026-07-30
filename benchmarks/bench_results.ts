import { join } from "@std/path";

export interface BenchMetrics {
  n: number;
  min: number;
  max: number;
  avg: number;
  p75: number;
  p99: number;
}

export interface BenchJson {
  version?: number;
  runtime?: string;
  cpu?: string;
  benches?: Array<{
    name?: string;
    group?: string;
    results?: Array<{ ok?: Partial<BenchMetrics> }>;
  }>;
}

const NS_PER_US = 1_000;
const NS_PER_MS = 1_000_000;
const NS_PER_S = 1_000_000_000;

export function formatNs(ns: number): string {
  if (ns >= NS_PER_S) return `${(ns / NS_PER_S).toFixed(2)} s`;
  if (ns >= NS_PER_MS) return `${(ns / NS_PER_MS).toFixed(2)} ms`;
  if (ns >= NS_PER_US) return `${(ns / NS_PER_US).toFixed(2)} µs`;
  return `${ns.toFixed(2)} ns`;
}

export function getMetrics(
  bench: NonNullable<BenchJson["benches"]>[number],
): BenchMetrics | undefined {
  const metrics = bench.results?.find((result) => result.ok)?.ok;
  if (
    !metrics ||
    typeof metrics.n !== "number" ||
    typeof metrics.min !== "number" ||
    typeof metrics.max !== "number" ||
    typeof metrics.avg !== "number" ||
    typeof metrics.p75 !== "number" ||
    typeof metrics.p99 !== "number"
  ) return;
  return metrics as BenchMetrics;
}

export async function readOrRunBenchmarks(
  inputPath?: string,
): Promise<BenchJson> {
  if (inputPath) {
    return JSON.parse(await Deno.readTextFile(inputPath)) as BenchJson;
  }

  const result = await new Deno.Command(Deno.execPath(), {
    args: ["bench", "-A", "--json", join(Deno.cwd(), "benchmarks")],
    stdout: "piped",
    stderr: "inherit",
  }).output();
  if (!result.success) throw new Error("Bench command failed.");
  return JSON.parse(new TextDecoder().decode(result.stdout)) as BenchJson;
}
