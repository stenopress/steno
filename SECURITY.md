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

## Built-in Security Architecture

Steno is designed with local-first and supply-chain security in mind. Rather
than executing arbitrary third-party code with full permissions, the runtime
includes a customizable security sandbox for imports:

- **Plugin Import Restrictions:** By default, Steno restricts third-party
  plugins from executing unverified operations.
- **Local and Remote Blocking:** Local file imports (`file://`) and remote HTTP
  imports (`http://`, `https://`) are blocked for plugins by default.
- **Node Builtins Protection:** Plugins are prevented from accessing Node.js
  system APIs (`node:`) unless explicitly opted in by the developer.
- **Protocol Protections:** High-risk data and blob URI imports are permanently
  blocked across the runtime.

You can configure these boundaries inside your `config.yml` under
`custom.pluginSecurity`.

---

## Reporting a Vulnerability

Please do not report security vulnerabilities via public GitHub issues. If you
discover a security bug, vulnerability, or unexpected sandbox escape in Steno,
report it privately.

### Disclosure Process

1. Email your report directly to the maintainer at **me@gxbs.dev**.
2. Include a detailed description of the vulnerability, steps to reproduce, and
   a minimal working proof of concept (PoC) if possible.
3. We will acknowledge your report within 48 hours and coordinate a timeline for
   a patch and subsequent public advisory.

We appreciate your responsible disclosure and help in keeping the open-source
software ecosystem secure.
