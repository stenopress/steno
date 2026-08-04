# Tau language specification

This document specifies Tau 0.9. Tau templates are UTF-8 text and use the `.tau`
extension. Tau 0.9 is a superset of Tau 0.8: every Tau 0.8 template still parses
and renders identically (see [Compatibility](#compatibility)).

## Grammar

The grammar uses an EBNF-like notation. `expression` is the restricted
JavaScript-expression subset described below. `-` markers on a tag are the
optional [whitespace-control](#whitespace-control) suffix/prefix.

```ebnf
template        = { text | interpolation | raw_html | include | comment
                  | if_block | each_block | let_binding | component
                  | children_slot } ;
interpolation   = "{", expression, { "|", filter }, "}" ;
filter          = identifier, [ "(", [ expression, { ",", expression } ], ")" ] ;
raw_html        = "{@html ", expression, "}" ;
include         = "{@include ", quoted_path, "}" ;
comment         = "{#", { any character except "#}" }, "#}" ;
if_block        = "{", ["-"], "#if ", expression, ["-"], "}", template,
                  { "{", ["-"], ":else if ", expression, ["-"], "}", template },
                  [ "{", ["-"], ":else", ["-"], "}", template ],
                  "{", ["-"], "/if", ["-"], "}" ;
each_block      = "{", ["-"], "#each ", expression, " as ", identifier,
                  [ ",", identifier ], ["-"], "}", template,
                  [ "{", ["-"], ":else", ["-"], "}", template ],
                  "{", ["-"], "/each", ["-"], "}" ;
let_binding     = "{#let ", identifier, " = ", expression, "}" ;
children_slot   = "{@children}" ;
component       = "<", upper_identifier, { whitespace, prop }, [ whitespace ],
                  ( "/>" | ">", template, "</", upper_identifier, ">" ) ;
prop            = identifier
                | identifier, "=", quoted_string
                | identifier, "={", expression, "}"
                | "{", identifier, "}" ;
quoted_path     = '"', path_chars, '"' | "'", path_chars, "'" ;
identifier      = ( letter | "_" | "$" ), { letter | digit | "_" | "$" } ;
upper_identifier = uppercase_letter, { letter | digit | "_" | "$" } ;
```

Control tags must be balanced. Components are self-closing (`<Foo />`) or carry
children (`<Foo>...</Foo>`). Includes use a literal path; dynamic include paths
are not part of Tau.

## Comments

`{# any text #}` is removed at parse time and produces no output. Comments
cannot be nested and cannot contain the literal `#}`. A comment does not start
with `{#if`, `{#each`, or `{#let`, so those tags are never mistaken for one.

```tau
{# TODO: replace with real navigation once the API ships #}
```

## Expressions

Tau accepts side-effect-free JavaScript expressions for property access,
indexing, comparisons, arithmetic, boolean logic, the ternary operator, optional
chaining, nullish coalescing, literals, and calls to functions explicitly
supplied in the render context.

Tau rejects assignment, increment/decrement, arrow and function expressions,
classes, `new`, `await`, `yield`, `delete`, template literals, and statement
separators. It also rejects any identifier in a fixed blocklist, regardless of
whether it resolves to anything in context: `AsyncFunction`, `Deno`, `Function`,
`WebAssembly`, `__proto__`, `__tauIterable`, `constructor`, `context`, `eval`,
`globalThis`, `helpers`, `html`, `import`, `module`, `process`, `prototype`,
`require`, `self`, and `window`. The blocklist is enforced structurally against
a parsed expression, not scanned as text: it applies equally to a static
property (`value.constructor`) and a dynamically computed one
(`value["constructor"]`, `value["cons" + "tructor"]`), so building a blocked
name at runtime does not bypass it. A `{#each}` item or index binding, or a
`{#let}` name, may still shadow a blocklisted name for the duration of its
scope, the same way a real `for...of` or `const` binding would.

Tau hardening is defense in depth for trusted theme templates. The expression
subset is not an isolation boundary for arbitrary hostile code.

### Async function calls

A call in an expression (`{fn()}`, `{obj.method(arg)}`) is always awaited, so a
context-supplied function may be sync or async without any special syntax -
`await` itself remains rejected as expression syntax. Filters registered on the
`filters` export may also return a promise; it is awaited the same way.
`render()` is therefore always `async` and returns `Promise<string>`.

```ts
render({
  template: "{fetchTitle()}",
  context: { fetchTitle: () => fetch("/title").then((r) => r.text()) },
  components: {},
});
```

## Local bindings

`{#let name = expression}` computes `expression` once and binds it to `name` for
the rest of the enclosing block - the same each/if/component nesting a `{#each}`
item variable would use. It does not need a closing tag; `name` stops being
visible at the end of the block it appears in (end of the template, or the
enclosing `{#if}`/`{#each}`/component-children block).

```tau
{#each posts as post}
  {#let excerpt = post.body | truncate(120)}
  <p>{excerpt}</p>
{/each}
```

`name` follows the same identifier rules as a component or filter name and
cannot start with `__tau`.

## Control flow

`{#each items as item}...{:else}...{/each}` renders the `{:else}` branch when
`items` is nullish, non-iterable, or empty - the loop body never ran. This
mirrors `{#if}`'s `{:else}` but keys off iteration count instead of a boolean.

```tau
{#each comments as comment}
  <li>{comment.body}</li>
{:else}
  <li class="empty">No comments yet.</li>
{/each}
```

## Components

A component tag is either self-closing (`<Card title={title} />`) or carries
children (`<Card title={title}>{@html body}</Card>`). Children are compiled in
the _caller's_ scope - they can reference the surrounding `{#each}` item,
`{#let}` bindings, and page context - and rendered once, before the component
template runs. The component template retrieves the rendered children with
`{@children}`, a zero-argument tag equivalent to `{@html children}`:

```tau
<!-- theme component: Card.tau -->
<div class="card"><h2>{title}</h2><div class="body">{@children}</div></div>
```

```tau
<!-- usage -->
<Card title={post.title}>
  <p>{post.excerpt}</p>
</Card>
```

A component with no `{@children}` in its template silently ignores any children
content passed to it. There is only one, unnamed slot per component; Tau 0.9
does not have named slots.

## Whitespace control

`{#if}`, `{:else if}`, `{:else}`, `{/if}`, `{#each}`, and `{/each}` accept an
optional `-` immediately inside the tag delimiter on either side:

- `{-#if cond}` (dash after `{`) trims trailing whitespace from the text
  immediately _before_ the tag.
- `{#if cond-}` (dash before `}`) trims leading whitespace from the text
  immediately _after_ the tag (i.e., at the start of its block).
- Both can be combined (`{-#if cond-}`), and each closing/branch tag
  (`{:else-}`, `{-/each}`, `{/if-}`, ...) accepts the same markers
  independently.

Trimming removes all adjacent whitespace (spaces, tabs, newlines), not just up
to the next newline. Other tags (`{expr}`, `{@html}`, `{@include}`, component
tags) do not support trim markers.

```tau
<ul>
  {#each items as item-}
    <li>{item}</li>
  {-/each}
</ul>
```

renders as `<ul>\n  <li>a</li><li>b</li>\n</ul>` instead of leaving a blank line
per iteration.

## Values

- Missing identifiers evaluate to `undefined`.
- `null` and `undefined` interpolate as an empty string.
- Other interpolated values are converted with `String(value)`.
- Missing values are false in conditions.
- A nullish or non-iterable value produces zero loop iterations (and runs
  `{:else}` if present).
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
then uppercases the result. A filter may be sync or async (see
[Async function calls](#async-function-calls)).

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
already-sanitized HTML. Tau does not provide an HTML sanitizer. `{@children}` is
sugar for `{@html children}` and carries the same caveat: children content is
inserted unescaped, since it was already rendered (and escaped where
appropriate) at the call site.

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
released Tau language line. Tau 0.9 is purely additive over 0.8 - every
construct in `v0.8.json` still produces the same output or error code; new
behavior (comments, `{#let}`, each/`{:else}`, component children, whitespace
control, async calls) is covered separately in `v0.9.json`.
