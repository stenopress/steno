# Tau language specification

This document specifies Tau 0.8. Tau templates are UTF-8 text and use the `.tau`
extension.

## Grammar

The grammar uses an EBNF-like notation. `expression` is the restricted
JavaScript-expression subset described below.

```ebnf
template        = { text | interpolation | raw_html | include
                  | if_block | each_block | component } ;
interpolation   = "{", expression, { "|", filter }, "}" ;
filter          = identifier, [ "(", [ expression, { ",", expression } ], ")" ] ;
raw_html        = "{@html ", expression, "}" ;
include         = "{@include ", quoted_path, "}" ;
if_block        = "{#if ", expression, "}", template,
                  { "{:else if ", expression, "}", template },
                  [ "{:else}", template ], "{/if}" ;
each_block      = "{#each ", expression, " as ", identifier,
                  [ ",", identifier ], "}", template, "{/each}" ;
component       = "<", upper_identifier, { whitespace, prop },
                  [ whitespace ], "/>" ;
prop            = identifier
                | identifier, "=", quoted_string
                | identifier, "={", expression, "}"
                | "{", identifier, "}" ;
quoted_path     = '"', path_chars, '"' | "'", path_chars, "'" ;
identifier      = ( letter | "_" | "$" ), { letter | digit | "_" | "$" } ;
upper_identifier = uppercase_letter, { letter | digit | "_" | "$" } ;
```

Control tags must be balanced. Components are self-closing. Includes use a
literal path; dynamic include paths are not part of Tau 0.8.

## Expressions

Tau accepts side-effect-free JavaScript expressions for property access,
indexing, comparisons, arithmetic, boolean logic, optional chaining, literals,
and calls to functions explicitly supplied in the render context.

Tau rejects assignment, increment/decrement, arrow and function expressions,
classes, `new`, `await`, `yield`, `delete`, template literals, and statement
separators. It also rejects any identifier in a fixed blocklist, regardless of
whether it resolves to anything in context: `AsyncFunction`, `Deno`, `Function`,
`WebAssembly`, `__proto__`, `__tauIterable`, `constructor`, `context`, `eval`,
`globalThis`, `helpers`, `html`, `import`, `module`, `process`, `prototype`,
`require`, `self`, and `window`.

Tau hardening is defense in depth for trusted theme templates. The expression
subset is not an isolation boundary for arbitrary hostile code.

## Values

- Missing identifiers evaluate to `undefined`.
- `null` and `undefined` interpolate as an empty string.
- Other interpolated values are converted with `String(value)`.
- Missing values are false in conditions.
- A nullish or non-iterable value produces zero loop iterations.
- Invalid property access or a context function that throws produces
  `TAU_RENDER_FAILED` with the original failure available as `cause`.
- Component boolean props have the value `true`.
- A missing component, filter, or include resolver is an error.
- Filter-specific conversion rules are part of each filter's contract.

## Built-in filters

- `date` formats a value with `Date.prototype.toLocaleDateString()` in the
  host's locale. A falsy input renders as an empty string; an input that does
  not parse to a valid date renders as `String(value)` unchanged.
- `truncate(length)` cuts a stringified value to `length` characters, appending
  `...` when it was longer. `length` defaults to 100 and falls back to 100 if it
  does not parse as a number. `null`/`undefined` render as an empty string.
- `upper` and `lower` stringify and change case; a falsy input renders as an
  empty string.
- `url` validates a value for use in a URL attribute; see below.

Filters chain left to right: `{value | truncate(20) | upper}` truncates first,
then uppercases the result.

## Escaping and output contexts

`{expression}` performs HTML escaping for `&`, `<`, `>`, `"`, and `'`. This is
the rule in both text and quoted-attribute positions. Tau does not infer HTML
parser state, so expressions must not be placed into unquoted attributes,
element names, attribute names, JavaScript, CSS, or HTML comments.

URLs must use the `url` filter:

```tau
<a href="{target | url}">Open</a>
```

The filter permits relative URLs, fragments, and the `http:`, `https:`,
`mailto:`, and `tel:` schemes. It rejects control characters and all other
schemes. It is a validation step; normal interpolation then HTML-escapes the
result.

`{@html expression}` performs no escaping and is only for trusted,
already-sanitized HTML. Tau does not provide an HTML sanitizer.

Component prop expressions pass values without stringification to the component
context. Escaping occurs when the component interpolates those values.

## Resource limits

Limits are shared by the complete render tree:

- template size: 1 MiB per template;
- render/include/component depth: 64;
- loop iterations: 100,000;
- generated output: 16 MiB.

API consumers may lower or raise these values through `TauOptions.limits`.

## Errors

All parser, policy, and resource-limit failures throw `TauError`. Its stable
`code` is intended for automation; human-readable messages may improve between
patch releases. Source-backed parse errors also expose `filePath`, `line`, and
`column`.

## Compatibility

Tau follows Steno's compatibility policy. The executable fixtures under
`src/utils/fixtures/tau/` record output and error-code behavior for each
released Tau language line.
