const state = {
  notes: [],
  selected: new Set(),
  query: "",
  kind: "all",
  sort: "updated-desc",
};

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function normalize(value) {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f\u1ab0-\u1aff\u1dc0-\u1dff]/g, "")
    .toLowerCase();
}

function setStatus(message, kind = "") {
  const node = document.getElementById("notesStatus");
  node.textContent = message;
  node.dataset.kind = kind;
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
  setStatus("メモを読み込んでいます…");
  try {
    const payload = await requestJson("/api/notes");
    state.notes = payload.notes || [];
    state.selected = new Set(
      [...state.selected].filter((id) => state.notes.some((note) => note.id === id)),
    );
    render();
    setStatus("メモを読み込みました。", "success");
  } catch (error) {
    setStatus(`メモを読み込めませんでした: ${error.message}`, "error");
  }
}

function filteredNotes() {
  const terms = normalize(state.query).split(/\s+/).filter(Boolean);
  let rows = state.notes.filter((note) => {
    if (state.kind !== "all" && note.kind !== state.kind) return false;
    if (!terms.length) return true;
    const haystack = normalize([
      note.quote,
      note.memo,
      note.author,
      note.workTitle,
      note.citation,
      note.form,
      note.bare,
      note.lemma,
      note.definition,
    ].join(" "));
    return terms.every((term) => haystack.includes(term));
  });

  rows = [...rows];
  if (state.sort === "work") {
    rows.sort((a, b) =>
      `${a.author} ${a.workTitle} ${a.citation}`.localeCompare(
        `${b.author} ${b.workTitle} ${b.citation}`,
        "ja",
      ),
    );
  } else {
    const field = state.sort === "created-desc" ? "createdAt" : "updatedAt";
    rows.sort((a, b) => String(b[field] || "").localeCompare(String(a[field] || "")));
  }
  return rows;
}

function sourceUrl(note) {
  const params = new URLSearchParams({
    urn: note.workUrn || "",
    version: note.versionUrn || "",
    chunk: String(note.chunk ?? 0),
    note: note.id,
  });
  return `./reader.html?${params.toString()}`;
}

function scopeLabel(note) {
  if (note.kind !== "word") return "選択範囲";
  return note.scope === "work-form"
    ? "作品内の同じ語形すべて"
    : "この箇所だけ";
}

function render() {
  document.getElementById("allCount").textContent = state.notes.length;
  document.getElementById("wordCount").textContent =
    state.notes.filter((note) => note.kind === "word").length;
  document.getElementById("passageCount").textContent =
    state.notes.filter((note) => note.kind === "passage").length;

  const rows = filteredNotes();
  const list = document.getElementById("notesList");
  document.getElementById("notesEmpty").hidden = rows.length !== 0;

  list.innerHTML = rows.map((note) => {
    const checked = state.selected.has(note.id) ? "checked" : "";
    const kindLabel = note.kind === "word" ? "単語" : "文章";
    const meta = [
      note.author,
      note.workTitle,
      note.citation,
      scopeLabel(note),
    ].filter(Boolean).join(" · ");

    return `
      <article class="note-card" data-note-id="${escapeHtml(note.id)}">
        <input
          class="note-select"
          type="checkbox"
          aria-label="このメモを選択"
          ${checked}
        />
        <div class="note-card-main">
          <div class="note-card-header">
            <div>
              <div class="note-card-badges">
                <span class="note-badge ${note.kind}">${kindLabel}</span>
                ${note.lemma ? `<span class="note-badge" lang="grc">${escapeHtml(note.lemma)}</span>` : ""}
              </div>
              <div class="note-card-meta">${escapeHtml(meta)}</div>
            </div>
            <time class="note-card-meta">${escapeHtml(note.updatedAt || note.createdAt || "")}</time>
          </div>
          <blockquote class="note-card-quote" ${note.kind === "word" ? 'lang="grc"' : ""}>${escapeHtml(note.quote)}</blockquote>
          <textarea rows="3" class="note-edit" placeholder="メモを入力">${escapeHtml(note.memo || "")}</textarea>
          <div class="note-card-actions">
            <a class="note-source-link" href="${escapeHtml(sourceUrl(note))}">本文で開く</a>
            <button class="tool-button save-note" type="button">保存</button>
            <button class="tool-button note-danger delete-note" type="button">削除</button>
          </div>
        </div>
      </article>
    `;
  }).join("");

  list.querySelectorAll(".note-card").forEach((card) => {
    const id = card.dataset.noteId;
    const checkbox = card.querySelector(".note-select");
    checkbox.addEventListener("change", () => {
      if (checkbox.checked) state.selected.add(id);
      else state.selected.delete(id);
      updateSelectionUI();
    });

    card.querySelector(".save-note").addEventListener("click", async () => {
      const note = state.notes.find((item) => item.id === id);
      if (!note) return;
      const memo = card.querySelector(".note-edit").value;
      try {
        const payload = await requestJson("/api/notes/save", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ ...note, memo }),
        });
        replaceNote(payload.note);
        render();
        setStatus("メモを保存しました。", "success");
      } catch (error) {
        setStatus(`保存できませんでした: ${error.message}`, "error");
      }
    });

    card.querySelector(".delete-note").addEventListener("click", async () => {
      const ok = window.confirm("このメモを削除します。よろしいですか？");
      if (!ok) return;
      await deleteNotes([id]);
    });
  });

  updateSelectionUI();
}

function replaceNote(note) {
  const index = state.notes.findIndex((item) => item.id === note.id);
  if (index >= 0) state.notes[index] = note;
  else state.notes.unshift(note);
}

function updateSelectionUI() {
  document.getElementById("noteSelectionCount").textContent =
    `${state.selected.size}件選択`;
  document.getElementById("deleteSelectedNotes").disabled =
    state.selected.size === 0;
}

async function deleteNotes(ids) {
  try {
    const payload = await requestJson("/api/notes/delete", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ids }),
    });
    const deleted = new Set(payload.deleted || []);
    state.notes = state.notes.filter((note) => !deleted.has(note.id));
    deleted.forEach((id) => state.selected.delete(id));
    render();
    setStatus(`${deleted.size}件のメモを削除しました。`, "success");
  } catch (error) {
    setStatus(`削除できませんでした: ${error.message}`, "error");
  }
}

document.getElementById("reloadNotes").addEventListener("click", loadNotes);
document.getElementById("notesSearch").addEventListener("input", (event) => {
  state.query = event.target.value;
  render();
});
document.getElementById("notesKind").addEventListener("change", (event) => {
  state.kind = event.target.value;
  render();
});
document.getElementById("notesSort").addEventListener("change", (event) => {
  state.sort = event.target.value;
  render();
});
document.getElementById("selectVisibleNotes").addEventListener("click", () => {
  filteredNotes().forEach((note) => state.selected.add(note.id));
  render();
});
document.getElementById("clearNoteSelection").addEventListener("click", () => {
  state.selected.clear();
  render();
});
document.getElementById("deleteSelectedNotes").addEventListener("click", async () => {
  if (!state.selected.size) return;
  const ok = window.confirm(
    `選択したメモ ${state.selected.size}件を削除します。よろしいですか？`,
  );
  if (!ok) return;
  await deleteNotes([...state.selected]);
});

loadNotes();
