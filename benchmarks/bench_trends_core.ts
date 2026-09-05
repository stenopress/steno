export interface BenchSnapshot {
  timestamp: string;
  benches: Array<{ name: string; avgNs: number; p99Ns: number }>;
}

export interface TrendComparison {
  name: string;
  previousAvgNs: number;
  currentAvgNs: number;
  changeRatio: number;
}

export interface TrendEvaluation {
  comparisons: TrendComparison[];
  failures: TrendComparison[];
  added: string[];
  missing: string[];
}

export function parseRegressionThreshold(raw: string | undefined): number {
  if (raw === undefined) return 0.2;

  const threshold = Number(raw);
  if (!Number.isFinite(threshold) || threshold < 0) {
    throw new Error(`Benchmark trend threshold must be a non-negative number, received "${raw}".`);
  }
  return threshold;
}

export function compareBenchSnapshots(
  previous: BenchSnapshot,
  current: BenchSnapshot,
  threshold = 0.2,
): TrendEvaluation {
  const previousByName = new Map(previous.benches.map((bench) => [bench.name, bench]));
  const currentNames = new Set(current.benches.map((bench) => bench.name));
  const comparisons: TrendComparison[] = [];
  const added: string[] = [];

  for (const bench of current.benches) {
    const baseline = previousByName.get(bench.name);
    if (!baseline) {
      added.push(bench.name);
      continue;
    }
    const changeRatio =
      baseline.avgNs === 0
        ? bench.avgNs === 0
          ? 0
          : Number.POSITIVE_INFINITY
        : (bench.avgNs - baseline.avgNs) / baseline.avgNs;
    comparisons.push({
      name: bench.name,
      previousAvgNs: baseline.avgNs,
      currentAvgNs: bench.avgNs,
      changeRatio,
    });
  }

  return {
    comparisons,
    failures: comparisons.filter((comparison) => comparison.changeRatio > threshold),
    added,
    missing: previous.benches
      .filter((bench) => !currentNames.has(bench.name))
      .map((bench) => bench.name),
  };
}
