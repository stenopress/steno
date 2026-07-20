# Plugin sandbox

Steno supports two explicit plugin execution modes:

- `trusted` is the default for compatibility. The plugin is imported into the
  Steno process and inherits all of its permissions.
- `isolated` runs the plugin in a dedicated Deno subprocess with runtime
  capabilities denied unless they are explicitly granted.

```yaml
plugins:
  - package: jsr:@example/minify@1.2.3
    mode: isolated
    timeoutMs: 5000
    maxOutputBytes: 4194304
    memoryMb: 128
    lockFile: ./deno.lock
    permissions:
      read:
        - ./content
      env:
        - PUBLIC_SITE_URL
      net:
        - api.example.com:443
      import:
        - jsr.io:443
```

Registry plugins in isolated mode must include an explicit version. HTTP(S)
plugins also require a `sha256-<base64>` integrity value. Every isolated remote
plugin runs with a frozen Deno lockfile (`./deno.lock` by default), protecting
its complete remote dependency graph.

## Security boundary

Each isolated plugin gets its own process. Steno communicates with it using a
versioned JSON-lines protocol over stdin/stdout. Plugin factories and these
hooks execute inside the worker: `beforeBuild`, `transformAst`, `transformHtml`,
`afterPage`, and `afterBuild`.

The worker starts with:

- a cleared process environment;
- filesystem read and write denied;
- runtime network access denied;
- environment access denied;
- subprocess execution denied;
- FFI denied;
- OS/system information denied;
- remote module imports limited to required and configured hosts;
- no interactive permission prompts;
- a configurable V8 heap ceiling;
- per-request input and output limits; and
- a deadline for initialization and every hook call.

The worker is terminated when it times out, crashes, emits malformed or
oversized protocol data, throws from a hook, completes a build, or when the
parent build exits early. A worker failure fails the build but cannot terminate
the Steno process.

API consumers can call `steno.cancel()` to terminate active isolated-plugin
workers. An in-flight isolated hook rejects and the build fails cleanly.

Filesystem permission for a local `file://` plugin always includes its top-level
module file so Deno can import it. Local transitive modules need explicit read
grants. Runtime Node compatibility APIs are subject to the same Deno
permissions: importing `node:fs` does not grant filesystem access, and importing
`node:child_process` does not grant subprocess access.

## Threat model

The sandbox is designed to contain a malicious plugin that attempts to:

- read or modify project and host files;
- read secrets from environment variables;
- open network connections;
- execute child processes;
- load native libraries through FFI;
- inspect protected operating-system information;
- reach those capabilities indirectly through Node compatibility APIs;
- hang a build with an infinite loop;
- exhaust the V8 heap;
- flood the parent with output;
- corrupt the protocol; or
- crash or exit its worker.

Capabilities explicitly listed under `permissions` are intentionally outside the
boundary. A plugin allowed to write a directory can corrupt files in that
directory. A plugin allowed network and secret-bearing environment variables can
exfiltrate those variables. Grants should therefore be narrow.

## Current exclusions

The following are not claimed to be sandboxed:

- Plugins configured with `mode: trusted` or the string shorthand.
- Theme modules, Tau templates, and theme-bundled plugins. Themes are loaded and
  rendered in-process. Set `allowThemePlugins: false` to disable bundled
  plugins, but only install themes you trust.
- The Steno parent process itself.
- Denial of service outside the worker's V8 heap, such as kernel or Deno runtime
  vulnerabilities.
- Vulnerabilities in Deno's permission implementation, V8, the operating system,
  or native code explicitly allowed by the user.
- Integrity of an entire remote dependency graph unless a frozen lockfile is
  used.

The sandbox should be treated as defense in depth until it has passed
cross-platform adversarial testing and independent security review.
