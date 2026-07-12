export default {
  name: "minimal",
  version: "1.0.0",
  layouts: {
    layout: `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>{#if title}{ title }{:else}{ site.title }{/if}</title>
    <style>{\`:root { color-scheme: light; }
      body {
        margin: 0 auto;
        max-width: 72rem;
        padding: 2rem 1.5rem;
        font: 16px/1.6 system-ui, sans-serif;
        color: #111827;
        background: #fff;
      }
      main { display: block; }\`}</style>
  </head>
  <body>
    <main>{@html content}</main>
  </body>
</html>`,
  },
};
