for (const copyButton of document.querySelectorAll(".copy-command")) {
  copyButton.addEventListener("click", async () => {
    const code = copyButton.querySelector("code")?.textContent?.trim();
    const label = copyButton.querySelector("span");
    if (!code || !label) return;

    try {
      await navigator.clipboard.writeText(code);
      label.textContent = "Copied";
      globalThis.setTimeout(() => {
        label.textContent = "Copy";
      }, 1600);
    } catch {
      globalThis.prompt("Copy this command:", code);
    }
  });
}
