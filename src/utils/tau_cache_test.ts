import { assertEquals } from "@std/assert";
import { clearTauCache, getTauCacheStats, render } from "./tau.ts";

export function registerTauCacheTests(): void {
  Deno.test("tau cache: remains bounded and reports LRU pressure", () => {
    clearTauCache();
    for (let index = 0; index < 700; index++) {
      render({
        template: `<p>${index}:{value}</p>${"x".repeat(512)}`,
        context: { value: index },
        components: {},
      });
    }

    const stats = getTauCacheStats();
    assertEquals(stats.capacity, 512);
    assertEquals(stats.size, 512);
    assertEquals(stats.misses, 700);
    assertEquals(stats.evictions, 188);
  });

  Deno.test("tau cache: records hits and can release retained templates", () => {
    clearTauCache();
    const options = {
      template: "<p>{value}</p>",
      context: { value: "x" },
      components: {},
    };
    render(options);
    render(options);

    assertEquals(getTauCacheStats(), {
      size: 1,
      capacity: 512,
      hits: 1,
      misses: 1,
      evictions: 0,
    });

    clearTauCache();
    assertEquals(getTauCacheStats().size, 0);
  });
}
