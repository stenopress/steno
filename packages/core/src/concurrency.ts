/**
 * Runs `mapFn` over `items` with at most `concurrency` calls in flight at
 * once, returning results in the same order as `items`.
 */
export async function mapWithConcurrency<T, R>(
  items: T[],
  concurrency: number,
  mapFn: (item: T) => Promise<R>,
): Promise<R[]> {
  const results = new Array<R>(items.length);
  let nextIndex = 0;
  const workerCount = Math.min(concurrency, items.length);
  await Promise.all(
    Array.from({ length: workerCount }, async () => {
      while (true) {
        const index = nextIndex++;
        if (index >= items.length) return;
        results[index] = await mapFn(items[index]);
      }
    }),
  );
  return results;
}
