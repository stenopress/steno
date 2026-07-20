# Security Policy

We take the security of Steno, its template engine Scribe, and the wider
ecosystem seriously. This document outlines our supported versions, built-in
security features, and the process for reporting vulnerabilities.

---

## Supported Versions

Because Steno is currently in active development, security updates and patches
are primarily backported to the latest minor or major release.

| Version  | Supported | Notes                                                              |
| :------- | :-------- | :----------------------------------------------------------------- |
| v0.7.x   | Yes       | Current active branch. All security patches are applied here.      |
| < v0.7.0 | No        | Legacy development versions. Please upgrade to the latest release. |

---

## Plugin trust and source policy

String plugin entries and plugins configured with `mode: trusted` are trusted
build-time code. Their factories and hooks execute in the Steno process and
inherit its Deno permissions. This includes theme-bundled plugins. Such code may
be able to read or modify files, make network requests, inspect environment
variables, start subprocesses, use FFI, or access Node compatibility APIs when
the Steno process has the corresponding permissions.

`custom.pluginSourcePolicy` is a source policy for configured top-level module
specifiers. The historical `custom.pluginSecurity` name remains a deprecated
compatibility alias. Neither configuration is an execution sandbox:

- `jsr:` and `npm:` top-level plugin specifiers are allowed by default.
- `file:`, HTTP(S), and `node:` top-level specifiers require explicit opt-in.
- `data:` and `blob:` top-level specifiers are rejected.
- Transitive imports are not inspected or restricted by this policy.
- `allowNodeBuiltins: false` does not stop an allowed plugin from importing a
  Node built-in internally.
- Theme plugins are enabled by default and can be disabled with
  `allowThemePlugins: false`.

Plugin entries explicitly configured with `mode: isolated` execute in a
dedicated, deny-by-default subprocess. The capability model, adversarial threat
model, and exclusions are documented in
[`docs/plugin_sandbox.md`](docs/plugin_sandbox.md).

Theme modules, Scribe templates, and theme-bundled plugins are not currently
isolated. Only install themes you trust, pin their versions, review updates, and
grant Steno the least Deno permissions practical for the project.

---

## Reporting a Vulnerability

Please do not report security vulnerabilities via public GitHub issues. If you
discover a security bug, vulnerability, source-policy bypass, or unexpected
permission behavior in Steno, report it privately.

### Disclosure Process

1. Email your report directly to the maintainer at **me@gxbs.dev**.
2. Include a detailed description of the vulnerability, steps to reproduce, and
   a minimal working proof of concept (PoC) if possible.
3. We will acknowledge your report within 48 hours and coordinate a timeline for
   a patch and subsequent public advisory.

We appreciate your responsible disclosure and help in keeping the open-source
software ecosystem secure.
