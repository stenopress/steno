import { assertEquals } from "@std/assert";
import { minifyCss, minifyHtml } from "./text.ts";

Deno.test("minifyCss: strips comments and collapses whitespace", () => {
  const css = `
    /* header */
    body {
      color:   red;
      margin: 0;
    }
  `;
  assertEquals(minifyCss(css), "body{color:red;margin:0}");
});

Deno.test("minifyCss: preserves string literal contents", () => {
  const css = `.a { content: "a  b"; font-family: 'Comic  Sans'; }`;
  assertEquals(minifyCss(css), `.a{content:"a  b";font-family:'Comic  Sans'}`);
});

Deno.test("minifyCss: preserves whitespace inside url()", () => {
  const css = `.a { background: url("a b.png"); }`;
  assertEquals(minifyCss(css), `.a{background:url("a b.png")}`);
});

Deno.test("minifyCss: collapses repeated semicolons", () => {
  const css = `.a { color: red;; ; margin: 0; }`;
  assertEquals(minifyCss(css), `.a{color:red;margin:0}`);
});

Deno.test("minifyCss: keeps required space in selector combinators", () => {
  const css = `.a .b > .c { color: red; }`;
  assertEquals(minifyCss(css), `.a .b > .c{color:red}`);
});

Deno.test("minifyCss: handles empty input", () => {
  assertEquals(minifyCss(""), "");
  assertEquals(minifyCss("   \n\t  "), "");
});

Deno.test("minifyHtml: strips comments and collapses whitespace", () => {
  const html = `
    <!-- header -->
    <div>
      <p>Hello   World</p>
    </div>
  `;
  assertEquals(minifyHtml(html), "<div> <p>Hello World</p> </div>");
});

Deno.test("minifyHtml: keeps required space between inline elements", () => {
  const html = `<b>Hello</b> <b>World</b>`;
  assertEquals(minifyHtml(html), `<b>Hello</b> <b>World</b>`);
});

Deno.test("minifyHtml: preserves <pre> content verbatim", () => {
  const html = `<pre>  line one\n    line two  </pre>`;
  assertEquals(minifyHtml(html), html);
});

Deno.test("minifyHtml: preserves <script> and <style> content verbatim", () => {
  const html = `<script>if (a  <  b) { x(); }</script><style>.a  {  color: red;  }</style>`;
  assertEquals(minifyHtml(html), html);
});

Deno.test("minifyHtml: keeps a '>' inside a quoted attribute from ending the tag early", () => {
  const html = `<div data-x="a>b"><p>hi</p></div>`;
  assertEquals(minifyHtml(html), html);
});

Deno.test("minifyHtml: keeps conditional comments, drops regular ones", () => {
  const html = `<!--[if IE]><p>old</p><![endif]--><!-- note --><p>x</p>`;
  assertEquals(minifyHtml(html), `<!--[if IE]><p>old</p><![endif]--><p>x</p>`);
});

Deno.test("minifyHtml: handles empty input", () => {
  assertEquals(minifyHtml(""), "");
  assertEquals(minifyHtml("   \n\t  "), "");
});
