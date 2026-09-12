# Shared-package validation

Local comparison against Steno commit `53b5ec0d041254da2766358faeb0ab114a1525b7`,
using Deno 2.9.4 on macOS arm64. The baseline was extracted into a temporary
directory without changing the working tree or stash.

## Performance

The table uses the median of two complete benchmark-run averages per version.
Final candidate runs were sequential and did not overlap the test suites.
These are local observations, not a guarantee of a speedup on other machines.

| Benchmark                           |  Original |     Split |
| ----------------------------------- | --------: | --------: |
| Cold build, 250 pages               |  32.10 ms |  28.20 ms |
| Cold build, 1,000 pages             | 120.35 ms | 107.28 ms |
| Cold build, 4,000 pages             | 487.00 ms | 425.09 ms |
| Cached build, 1,000 pages           |  33.52 ms |  32.13 ms |
| Incremental build, one changed page | 248.09 ms | 227.93 ms |
| Typical page pipeline               |  95.82 µs |  95.50 µs |
| Simple Tau render                   |    949 ns |    943 ns |
| Tau scoped helpers                  |    746 ns |    738 ns |

An initial simple-render regression was removed by passing Core's default filters
through Tau's per-render state instead of copying the options object. Explicit
filter options still take precedence, and concurrent-render isolation is tested.

The invalid-YAML error benchmark was noisy: full-run medians were 13.20 µs versus
15.70 µs. Focused follow-ups measured 16.9 µs versus 17.6 µs, then 23.9 µs versus
17.0 µs with the baseline run first. This remains an
uncertain error-path result, not evidence of universal performance parity.

Three alternating CLI `--help` launches measured median startup of 0.05 seconds
for both versions. Median maximum resident memory was approximately 69.6 MB
versus 70.4 MB. This is a small startup-memory increase; it does not measure
large-site peak memory or first-time registry downloads.

All existing absolute performance budgets passed against the final candidate.
Raw benchmark JSON is currently in `/tmp/steno-base-bench-{1,2}.json` and
`/tmp/steno-split-final-{1,2}.json`; those temporary files are not release artifacts.

## Compatibility and release checks

- Steno's full check passed, including 438 unit tests, three representative-site
  tests, six installed-product tests, architecture/API checks and benchmark-tool tests.
- Core's full check passed with 60 tests; Tau's passed with 65 tests.
- All ten ecosystem tests passed.
- Regression coverage rejects escaping asset paths before any write and verifies
  filter replacement invalidates build signatures even for identical closure source.
- Installed-theme tests now use copied publishable theme files and public modules.
- Changed workflow YAML parses locally; hosted workflows have not run.

Registry validation is blocked because `@steno/core` is not published. The new
`test:registry` mode must pass after dependency publication. GitHub could not
resolve `stenopress/core` or `stenopress/tau` for the connected account, and neither
local sibling repository has a remote configured. No publication or production
deployment has been performed.

Follow [the release procedure](releasing-shared-packages.md) to complete hosted and
registry validation before promoting the split.
