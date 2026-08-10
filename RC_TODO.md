# Release Candidate TODO

Target: `@steno/steno@1.0.0-rc.1`, followed by `1.0.0` after the RC acceptance period. The RC must
freeze and validate the stable public contracts that Steno will support throughout the `1.x` release
line. Official themes keep independent versions unless a separate compatible theme release is
required.

## Release blockers

- [ ] Finish or exclude the in-progress `packages/migrate` package from the RC.
- [ ] Enable the migrate test step in CI if the package is included.
- [ ] Make `deno task check` pass from a clean checkout.
- [ ] Remove temporary or accidental source comments and development artifacts.
- [ ] Confirm there are no unresolved release-blocking TODO/FIXME markers.
- [ ] Confirm the working tree contains only intentional RC changes.

## Versions and compatibility

- [ ] Freeze new feature development until `1.0.0` ships.
- [ ] Set the core package to `1.0.0-rc.1` without prematurely marking documentation as final
      `1.0.0`.
- [ ] Decide whether `@steno/init` will use `1.0.0-rc.1` or retain independent versioning.
- [ ] Keep official theme package versions and default theme ranges unchanged unless they are being
      released separately.
- [ ] Make the RC initializer explicitly generate projects using `@steno/steno@1.0.0-rc.1`.
- [ ] Verify existing official theme releases are compatible with the `1.0.0` RC.
- [ ] Document the supported Deno version range.
- [ ] Freeze and document the `1.x` compatibility promise for the public TypeScript API,
      configuration schema, CLI, generated output, themes, plugins, and Tau.
- [ ] Review every root export and remove anything that should not become a supported `1.x` API.
- [ ] Confirm plugin hook signatures and the isolated-plugin protocol are ready to remain stable.
- [ ] Confirm the theme contract and render context are ready to remain stable.
- [ ] Confirm Tau syntax, escaping behavior, error codes, and conformance fixtures are ready to
      remain stable.
- [ ] Decide how long deprecated `custom.*` configuration aliases remain supported.
- [ ] Verify Tau conformance fixtures cover every supported language version.

## Documentation

- [ ] Add or update `CHANGELOG.md` with all user-visible changes since the previous release.
- [ ] Add a `0.11.x` to `1.0.0` migration guide, including all breaking changes.
- [ ] Document which deprecated behavior remains available in `1.0.0` and when it may be removed.
- [ ] Update `SECURITY.md` supported versions.
- [ ] Verify every README and documentation command uses an intentional version or intentionally
      follows the latest release.
- [ ] Verify configuration, plugin sandbox, theme, Tau, deployment, and troubleshooting docs match
      current behavior.
- [ ] Document known RC limitations.

## Quality gates

- [ ] Run `deno task check`.
- [ ] Run `deno task test:ecosystem` with network access.
- [ ] Run `deno task --cwd packages/init test`.
- [ ] Run `deno task --cwd packages/init test:smoke`.
- [ ] Run migrate tests if migrate is included.
- [ ] Run `deno task bench:check` and archive the benchmark report.
- [ ] Run real-site tests on Linux, macOS, and Windows.
- [ ] Test both the minimum and latest supported Deno versions.
- [ ] Test a clean dependency cache and a warm dependency cache.
- [ ] Verify clean, warm, incremental, failed, and interrupted builds.

## Package validation

- [ ] Run `deno publish --dry-run` for the core package.
- [ ] Run `deno publish --dry-run` for the initializer.
- [ ] Dry-run any other package included in this release.
- [ ] Confirm package exports and public API documentation are complete.
- [ ] Confirm package contents do not include tests, fixtures, local caches, or unrelated packages.
- [ ] Confirm generated projects work using published packages rather than workspace paths.
- [ ] Confirm the release tag exactly matches the package version.

## RC acceptance testing

- [ ] Publish `@steno/steno@1.0.0-rc.1`.
- [ ] Publish or configure an initializer that creates RC projects without manual version edits.
- [ ] Create and build fresh minimal, documentation, and marketing sites.
- [ ] Build a zero-config single-page site.
- [ ] Test local, JSR, npm, and HTTPS themes where supported.
- [ ] Test trusted and isolated plugins, including denied and granted permissions.
- [ ] Upgrade at least two real `0.11.x` projects and record every migration issue.
- [ ] Test `build`, `dev`, `preview`, and `doctor` from the published RC.
- [ ] Test deployment output on at least one real static host.
- [ ] Allow an RC feedback period and triage all reported regressions.
- [ ] Treat accidental public API changes found during the RC as release blockers.

## Final release decision

- [ ] No open critical or high-severity defects.
- [ ] No unexplained test, benchmark, or cross-platform regressions.
- [ ] All documented commands work from a clean environment.
- [ ] Release notes and known limitations are ready.
- [ ] Publish order and rollback procedure are documented.
- [ ] Confirm the final `1.0.0` package differs from the accepted RC only by intentional fixes,
      version metadata, and release documentation.
- [ ] Approve the RC for `1.0.0` or publish another RC with fixes.
