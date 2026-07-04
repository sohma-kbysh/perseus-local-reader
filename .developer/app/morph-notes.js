(() => {
  const params = new URLSearchParams(window.location.search);
  const form = params.get("form") || "";
  const bare = params.get("bare") || "";
  let state = { occurrence: false, workForm: false };

  function extractMorphSummary() {
    const analysis = document.querySelector(".morph-analysis");
    return {
      lemma: analysis?.querySelector("h3")?.textContent?.trim() || "",
      definition: analysis?.querySelector("p")?.textContent?.trim() || "",
    };
  }

  function renderState() {
    const button = document.getElementById("wordNoteButton");
    const status = document.getElementById("wordNoteStatus");
    if (!button || !status) return;

    const labels = [];
    if (state.occurrence) labels.push("この箇所");
    if (state.workForm) labels.push("同じ語形すべて");

    button.textContent = labels.length
      ? "★ メモを編集"
      : "☆ メモに追加";
    status.textContent = labels.length
      ? `メモ済み: ${labels.join("・")}`
      : "この箇所だけ、または作品内の同じ語形すべてを対象にできます。";
  }

  function ensureButton() {
    if (!form || document.getElementById("wordNoteButton")) return;
    const morph = document.getElementById("morph");
    const heading = morph.querySelector("h2");
    if (!heading) return;

    const section = document.createElement("section");
    section.className = "morph-note-section";
    section.innerHTML = `
      <button id="wordNoteButton" class="tool-button" type="button">
        ☆ メモに追加
      </button>
      <span id="wordNoteStatus" class="morph-note-status"></span>
    `;

    const developer = morph.querySelector(".developer-details");
    if (developer) morph.insertBefore(section, developer);
    else morph.appendChild(section);

    section.querySelector("#wordNoteButton").addEventListener("click", () => {
      const summary = extractMorphSummary();
      window.parent.postMessage(
        {
          type: "perseus-word-note-request",
          form,
          bare,
          lemma: summary.lemma,
          definition: summary.definition,
        },
        window.location.origin,
      );
    });
    renderState();

    window.parent.postMessage(
      { type: "perseus-word-note-ready" },
      window.location.origin,
    );
  }

  const observer = new MutationObserver(ensureButton);
  observer.observe(document.getElementById("morph"), {
    childList: true,
    subtree: true,
  });

  window.addEventListener("message", (event) => {
    if (event.origin !== window.location.origin) return;
    if (event.data?.type !== "perseus-word-note-state") return;
    state = {
      occurrence: Boolean(event.data.occurrence),
      workForm: Boolean(event.data.workForm),
    };
    renderState();
  });

  ensureButton();
})();
