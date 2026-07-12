export default {
  name: "docs-minimal",
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
        margin: 0;
        min-height: 100vh;
        display: grid;
        grid-template-columns: 18rem minmax(0, 1fr);
        font: 16px/1.6 system-ui, sans-serif;
        color: #111827;
        background: #fff;
      }
      aside {
        border-right: 1px solid #e5e7eb;
        padding: 1.5rem;
      }
      main {
        padding: 2rem;
        min-width: 0;
      }
      nav ul {
        list-style: none;
        padding: 0;
        margin: 0.75rem 0 0;
      }
      nav li { margin: 0.35rem 0; }
      nav a {
        color: inherit;
        text-decoration: none;
      }
      nav a:hover { text-decoration: underline; }\`}</style>
  </head>
  <body>
    <aside>
      <strong>{ site.title }</strong>
      <nav>
        <ul>
          {#if site.navigation}
          {#each site.navigation as item}
            <li>
              {#if item.url}
                <a href={item.url}>{ item.title }</a>
              {:else}
                <span>{ item.title }</span>
              {/if}
              {#if item.children && item.children.length}
                <ul>
                  {#each item.children as child}
                    <li>
                      {#if child.url}
                        <a href={child.url}>{ child.title }</a>
                      {:else}
                        <span>{ child.title }</span>
                      {/if}
                      {#if child.children && child.children.length}
                        <ul>
                          {#each child.children as grandchild}
                            <li>
                              {#if grandchild.url}
                                <a href={grandchild.url}>{ grandchild.title }</a>
                              {:else}
                                <span>{ grandchild.title }</span>
                              {/if}
                            </li>
                          {/each}
                        </ul>
                      {/if}
                    </li>
                  {/each}
                </ul>
              {/if}
            </li>
          {/each}
          {/if}
        </ul>
      </nav>
    </aside>
    <main>{@html content}</main>
  </body>
</html>`,
  },
};
