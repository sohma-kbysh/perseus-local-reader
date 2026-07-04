(() => {
  const state = {
    notes: [],
    activeWord: null,
    dialog: null,
    passageSelection: null,
    targetNoteId: new URLSearchParams(window.location.search).get("note"),
    targetHandled: false,
  };

  function byId(id) {
    return document.getElementById(id);
  }

  function normalize(value) {
    return String(value || "").normalize("NFC");
  }

  function currentVersionUrn() {
    try {
      return currentVersion().urn || "";
    } catch {
      return "";
    }
  }

  function currentWorkMeta() {
    return {
      author: workData?.group || "",
      workTitle: workData?.title || "",
      workUrn: workUrn || "",
      versionUrn: currentVersionUrn(),
      chunk: Number(chunkIndex || 0),
    };
  }

  async function requestJson(url, options = {}) {
    const response = await fetch(url, { cache: "no-store", ...options });
    const payload = await response.json();
    if (!response.ok) {
      throw new Error(payload.error || `HTTP ${response.status}`);
    }
    return payload;
  }

  async function loadNotes() {
    try {
      const payload = await requestJson("/api/notes");
      state.notes = payload.notes || [];
      refreshHighlights();
    } catch (error) {
      console.error("Failed to load notes", error);
    }
  }

  function noteMatchesCurrentVersion(note) {
    if (note.workUrn !== workUrn) return false;
    if (note.kind === "word" && note.scope === "work-form") return true;
    return note.versionUrn === currentVersionUrn();
  }

  function citationForNode(node) {
    const section = node?.closest?.(".section");
    const heading = section?.querySelector?.("h2");
    return heading?.textContent?.trim() || currentChunk()?.label || "";
  }

  function wordContextFromElement(word) {
    const words = [...document.querySelectorAll("#text .word")];
    return {
      ...currentWorkMeta(),
      kind: "word",
      form: word.textContent.trim(),
      bare: typeof greekToBare === "function" ? greekToBare(word.textContent) : "",
      wordIndex: words.indexOf(word),
      citation: citationForNode(word),
    };
  }

  function occurrenceNote(context) {
    return state.notes.find(
      (note) =>
        note.kind === "word" &&
        note.scope === "occurrence" &&
        note.workUrn === context.workUrn &&
        note.versionUrn === context.versionUrn &&
        Number(note.chunk) === Number(context.chunk) &&
        Number(note.wordIndex) === Number(context.wordIndex),
    );
  }

  function workFormNote(context) {
    return state.notes.find(
      (note) =>
        note.kind === "word" &&
        note.scope === "work-form" &&
        note.workUrn === context.workUrn &&
        normalize(note.form) === normalize(context.form),
    );
  }

  function postMorphState() {
    const frame = byId("morphFrame");
    if (!frame?.contentWindow || !state.activeWord) return;
    frame.contentWindow.postMessage(
      {
        type: "perseus-word-note-state",
        occurrence: Boolean(occurrenceNote(state.activeWord)),
        workForm: Boolean(workFormNote(state.activeWord)),
      },
      window.location.origin,
    );
  }

  function setupWordBridge() {
    const text = byId("text");
    text.addEventListener("click", (event) => {
      const word = event.target.closest?.(".word");
      if (!word) return;
      state.activeWord = wordContextFromElement(word);
      setTimeout(postMorphState, 0);
    });

    const frame = byId("morphFrame");
    frame.addEventListener("load", () => setTimeout(postMorphState, 0));

    window.addEventListener("message", (event) => {
      if (event.origin !== window.location.origin) return;
      if (event.source !== frame.contentWindow) return;

      if (event.data?.type === "perseus-word-note-ready") {
        postMorphState();
        return;
      }

      if (event.data?.type !== "perseus-word-note-request") return;
      if (!state.activeWord) return;

      state.activeWord = {
        ...state.activeWord,
        form: event.data.form || state.activeWord.form,
        bare: event.data.bare || state.activeWord.bare,
        lemma: event.data.lemma || "",
        definition: event.data.definition || "",
      };
      openWordDialog(state.activeWord);
    });
  }

  function setupSelectionNotes() {
    const text = byId("text");
    const toolbar = byId("selectionNoteToolbar");

    function captureSelection() {
      const selection = window.getSelection();
      if (!selection || selection.rangeCount === 0 || selection.isCollapsed) {
        toolbar.hidden = true;
        return;
      }

      const range = selection.getRangeAt(0);
      if (
        !text.contains(range.startContainer) ||
        !text.contains(range.endContainer)
      ) {
        toolbar.hidden = true;
        return;
      }

      let raw = range.toString();
      const leading = raw.length - raw.trimStart().length;
      const trailing = raw.length - raw.trimEnd().length;
      raw = raw.trim();
      if (!raw) {
        toolbar.hidden = true;
        return;
      }

      const start = offsetWithin(text, range.startContainer, range.startOffset) + leading;
      const end =
        offsetWithin(text, range.endContainer, range.endOffset) - trailing;
      if (end <= start) {
        toolbar.hidden = true;
        return;
      }

      const startElement =
        range.startContainer.nodeType === Node.ELEMENT_NODE
          ? range.startContainer
          : range.startContainer.parentElement;

      state.passageSelection = {
        ...currentWorkMeta(),
        kind: "passage",
        quote: raw,
        start,
        end,
        citation: citationForNode(startElement),
      };

      const rect = range.getBoundingClientRect();
      toolbar.style.left = `${Math.max(8, Math.min(window.innerWidth - 150, rect.left))}px`;
      toolbar.style.top = `${Math.max(8, rect.top - 42)}px`;
      toolbar.hidden = false;
    }

    document.addEventListener("mouseup", () => setTimeout(captureSelection, 0));
    document.addEventListener("keyup", (event) => {
      if (event.key.startsWith("Arrow") || event.key === "Shift") {
        setTimeout(captureSelection, 0);
      }
    });
    document.addEventListener("scroll", () => {
      toolbar.hidden = true;
    }, true);

    byId("addSelectionNote").addEventListener("mousedown", (event) => {
      event.preventDefault();
    });
    byId("addSelectionNote").addEventListener("click", () => {
      toolbar.hidden = true;
      if (state.passageSelection) openPassageDialog(state.passageSelection);
    });
  }

  function offsetWithin(root, node, offset) {
    const range = document.createRange();
    range.selectNodeContents(root);
    range.setEnd(node, offset);
    return range.toString().length;
  }

  function setupDialog() {
    byId("noteDialogCancel").addEventListener("click", closeDialog);
    byId("noteOverlay").addEventListener("click", (event) => {
      if (event.target === byId("noteOverlay")) closeDialog();
    });
    byId("noteDialogSave").addEventListener("click", saveDialogNote);
    byId("noteDialogDelete").addEventListener("click", deleteDialogNote);

    document
      .querySelectorAll('input[name="wordNoteScope"]')
      .forEach((radio) =>
        radio.addEventListener("change", populateWordDialogForScope),
      );
  }

  function openWordDialog(context) {
    state.dialog = { kind: "word", context };
    byId("noteDialogTitle").textContent = "単語のメモ";
    byId("noteQuotePreview").textContent = context.form;
    byId("wordNoteScope").hidden = false;

    const preferredScope = occurrenceNote(context)
      ? "occurrence"
      : workFormNote(context)
        ? "work-form"
        : "occurrence";
    const radio = document.querySelector(
      `input[name="wordNoteScope"][value="${preferredScope}"]`,
    );
    radio.checked = true;
    populateWordDialogForScope();
    byId("noteOverlay").hidden = false;
    byId("noteMemo").focus();
  }

  function populateWordDialogForScope() {
    if (state.dialog?.kind !== "word") return;
    const context = state.dialog.context;
    const scope = document.querySelector(
      'input[name="wordNoteScope"]:checked',
    ).value;
    const note =
      scope === "work-form"
        ? workFormNote(context)
        : occurrenceNote(context);
    state.dialog.existing = note || null;
    byId("noteMemo").value = note?.memo || "";
    byId("noteDialogDelete").hidden = !note;
  }

  function openPassageDialog(context, existing = null) {
    state.dialog = { kind: "passage", context, existing };
    byId("noteDialogTitle").textContent =
      existing ? "文章メモを編集" : "文章をメモに追加";
    byId("noteQuotePreview").textContent = context.quote;
    byId("wordNoteScope").hidden = true;
    byId("noteMemo").value = existing?.memo || "";
    byId("noteDialogDelete").hidden = !existing;
    byId("noteOverlay").hidden = false;
    byId("noteMemo").focus();
  }

  function closeDialog() {
    byId("noteOverlay").hidden = true;
    state.dialog = null;
  }

  async function saveDialogNote() {
    const dialog = state.dialog;
    if (!dialog) return;

    const memo = byId("noteMemo").value;
    let payload;

    if (dialog.kind === "word") {
      const context = dialog.context;
      const scope = document.querySelector(
        'input[name="wordNoteScope"]:checked',
      ).value;
      const existing =
        scope === "work-form"
          ? workFormNote(context)
          : occurrenceNote(context);

      payload = {
        ...context,
        id: existing?.id,
        kind: "word",
        scope,
        quote: context.form,
        memo,
      };
      if (scope === "work-form") {
        delete payload.wordIndex;
      }
    } else {
      payload = {
        ...dialog.context,
        id: dialog.existing?.id,
        kind: "passage",
        scope: "range",
        memo,
      };
    }

    try {
      const response = await requestJson("/api/notes/save", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      replaceNote(response.note);
      closeDialog();
      refreshCurrentChunk();
      postMorphState();
    } catch (error) {
      byId("noteDialogStatus").textContent =
        `保存できませんでした: ${error.message}`;
    }
  }

  async function deleteDialogNote() {
    const note = state.dialog?.existing;
    if (!note) return;
    try {
      const response = await requestJson("/api/notes/delete", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ids: [note.id] }),
      });
      const deleted = new Set(response.deleted || []);
      state.notes = state.notes.filter((item) => !deleted.has(item.id));
      closeDialog();
      refreshCurrentChunk();
      postMorphState();
    } catch (error) {
      byId("noteDialogStatus").textContent =
        `削除できませんでした: ${error.message}`;
    }
  }

  function replaceNote(note) {
    const index = state.notes.findIndex((item) => item.id === note.id);
    if (index >= 0) state.notes[index] = note;
    else state.notes.push(note);
  }

  function refreshCurrentChunk() {
    const y = window.scrollY;
    renderChunk();
    requestAnimationFrame(() => window.scrollTo(0, y));
  }

  function clearNoteDecorations() {
    document.querySelectorAll("#text .word.note-highlight").forEach((word) => {
      word.classList.remove("note-highlight", "note-target-pulse");
      word.removeAttribute("data-note-ids");
      word.removeAttribute("title");
    });
  }

  function refreshHighlights() {
    if (!workData || !document.querySelector("#text")) return;
    clearNoteDecorations();

    const currentNotes = state.notes.filter(noteMatchesCurrentVersion);
    const passages = currentNotes.filter(
      (note) =>
        note.kind === "passage" &&
        Number(note.chunk) === Number(chunkIndex),
    );
    for (const note of passages) {
      applyPassageHighlight(note);
    }

    const words = [...document.querySelectorAll("#text .word")];
    words.forEach((word, index) => {
      word.dataset.wordIndex = String(index);
      const matches = currentNotes.filter((note) => {
        if (note.kind !== "word") return false;
        if (note.scope === "work-form") {
          return normalize(note.form) === normalize(word.textContent.trim());
        }
        return (
          note.versionUrn === currentVersionUrn() &&
          Number(note.chunk) === Number(chunkIndex) &&
          Number(note.wordIndex) === index
        );
      });
      if (!matches.length) return;
      word.classList.add("note-highlight");
      word.dataset.noteIds = matches.map((note) => note.id).join(" ");
      word.title = matches
        .map((note) => note.memo || "メモ済み")
        .join("\n");
    });

    document
      .querySelectorAll("#text mark.note-highlight")
      .forEach((mark) => {
        mark.addEventListener("click", (event) => {
          if (event.target.closest(".word")) return;
          const note = state.notes.find(
            (item) => item.id === mark.dataset.noteId,
          );
          if (!note) return;
          event.preventDefault();
          event.stopPropagation();
          openPassageDialog(note, note);
        });
      });

    handleTargetNote();
  }

  function resolvePassageRange(note, text) {
    let start = Number(note.start);
    let end = Number(note.end);
    const quote = String(note.quote || "");

    if (
      Number.isInteger(start) &&
      Number.isInteger(end) &&
      start >= 0 &&
      end > start &&
      end <= text.length &&
      text.slice(start, end).trim() === quote.trim()
    ) {
      return { start, end };
    }

    const found = text.indexOf(quote);
    if (found >= 0) {
      return { start: found, end: found + quote.length };
    }
    return null;
  }

  function applyPassageHighlight(note) {
    const root = byId("text");
    const resolved = resolvePassageRange(note, root.textContent);
    if (!resolved) return;

    const nodes = [];
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
    let position = 0;
    while (walker.nextNode()) {
      const node = walker.currentNode;
      const length = node.nodeValue.length;
      nodes.push({ node, start: position, end: position + length });
      position += length;
    }

    nodes
      .filter(({ start, end }) =>
        end > resolved.start && start < resolved.end,
      )
      .reverse()
      .forEach(({ node, start, end }) => {
        const localStart = Math.max(0, resolved.start - start);
        const localEnd = Math.min(end - start, resolved.end - start);
        if (localEnd <= localStart) return;

        const range = document.createRange();
        range.setStart(node, localStart);
        range.setEnd(node, localEnd);
        const mark = document.createElement("mark");
        mark.className = "note-highlight";
        mark.dataset.noteId = note.id;
        mark.title = note.memo || "文章メモ";
        try {
          range.surroundContents(mark);
        } catch {
          // DOM changed unexpectedly; keep the text readable without a marker.
        }
      });
  }

  function handleTargetNote() {
    if (!state.targetNoteId || state.targetHandled) return;
    const note = state.notes.find((item) => item.id === state.targetNoteId);
    if (!note) return;
    if (note.workUrn !== workUrn) return;
    if (
      note.kind !== "word" ||
      note.scope !== "work-form"
    ) {
      if (
        note.versionUrn !== currentVersionUrn() ||
        Number(note.chunk) !== Number(chunkIndex)
      ) {
        return;
      }
    }

    let target = document.querySelector(
      `#text mark.note-highlight[data-note-id="${state.targetNoteId}"]`,
    );
    if (!target) {
      target = [...document.querySelectorAll("#text .word.note-highlight")]
        .find((word) =>
          (word.dataset.noteIds || "").split(/\s+/).includes(state.targetNoteId),
        );
    }
    if (!target) return;

    state.targetHandled = true;
    target.classList.add("note-target-pulse");
    target.scrollIntoView({ behavior: "smooth", block: "center" });
  }

  function patchRenderChunk() {
    const original = renderChunk;
    renderChunk = function patchedRenderChunk(...args) {
      const result = original.apply(this, args);
      requestAnimationFrame(refreshHighlights);
      return result;
    };
  }

  function init() {
    patchRenderChunk();
    setupDialog();
    setupWordBridge();
    setupSelectionNotes();
    loadNotes();
  }

  init();
})();
