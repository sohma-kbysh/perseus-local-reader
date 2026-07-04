const PAGE_SIZE = 100;

const state = {
  works: [],
  morphs: [],
  selectedWorks: new Set(),
  selectedMorphs: new Set(),
  workQuery: "",
  morphQuery: "",
  morphPage: 1,
};

function normalize(value) {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f\u1ab0-\u1aff\u1dc0-\u1dff]/g, "")
    .toLowerCase();
}

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function formatBytes(bytes) {
  const n = Number(bytes || 0);
  if (n < 1024) return `${n} B`;
  if (n < 1024 ** 2) return `${(n / 1024).toFixed(1)} KB`;
  if (n < 1024 ** 3) return `${(n / 1024 ** 2).toFixed(1)} MB`;
  return `${(n / 1024 ** 3).toFixed(2)} GB`;
}

function setStatus(message, kind = "") {
  const target = document.getElementById("managerStatus");
  target.textContent = message;
  target.dataset.kind = kind;
}

async function loadData() {
  setStatus("保存データを読み込んでいます…");
  document.getElementById("reloadButton").disabled = true;
  try {
    const response = await fetch("/api/data/manager", { cache: "no-store" });
    const payload = await response.json();
    if (!response.ok) throw new Error(payload.error || `HTTP ${response.status}`);

    state.works = payload.works || [];
    state.morphs = payload.morphs || [];
    state.selectedWorks = new Set(
      [...state.selectedWorks].filter((id) => state.works.some((work) => work.id === id)),
    );
    state.selectedMorphs = new Set(
      [...state.selectedMorphs].filter((form) => state.morphs.some((entry) => entry.form === form)),
    );

    document.getElementById("workSummary").textContent =
      `${payload.summary.workCount}作品・${formatBytes(payload.summary.workBytes)}`;
    document.getElementById("morphSummary").textContent =
      `${payload.summary.morphCount}語形・${formatBytes(payload.summary.morphBytes)}`;
    document.getElementById("totalSummary").textContent =
      formatBytes(payload.summary.totalBytes);

    renderAll();
    setStatus("保存データを読み込みました。", "success");
  } catch (error) {
    setStatus(`保存データを読み込めませんでした: ${error.message}`, "error");
  } finally {
    document.getElementById("reloadButton").disabled = false;
  }
}

function filteredWorks() {
  const query = normalize(state.workQuery.trim());
  if (!query) return state.works;
  const terms = query.split(/\s+/).filter(Boolean);
  return state.works.filter((work) => {
    const haystack = normalize([work.group, work.title, work.id, ...(work.languages || [])].join(" "));
    return terms.every((term) => haystack.includes(term));
  });
}

function filteredMorphs() {
  const query = normalize(state.morphQuery.trim());
  if (!query) return state.morphs;
  const terms = query.split(/\s+/).filter(Boolean);
  return state.morphs.filter((entry) => {
    const haystack = normalize([
      entry.form,
      entry.bare,
      ...(entry.lemmas || []),
      ...(entry.definitions || []),
    ].join(" "));
    return terms.every((term) => haystack.includes(term));
  });
}

function renderAll() {
  renderWorks();
  renderMorphs();
  updateSelectionControls();
}

function renderWorks() {
  const works = filteredWorks();
  const list = document.getElementById("workList");
  document.getElementById("workEmpty").hidden = works.length !== 0;
  list.innerHTML = works.map((work) => {
    const checked = state.selectedWorks.has(work.id) ? "checked" : "";
    const languages = (work.languages || [])
      .map((lang) => `<span class="manager-badge">${escapeHtml(lang)}</span>`)
      .join("");
    return `
      <label class="manager-row">
        <input class="manager-checkbox work-checkbox" type="checkbox"
               data-id="${escapeHtml(work.id)}" ${checked} />
        <span class="manager-row-main">
          <span class="manager-row-title">${escapeHtml(work.title || "(無題)")}</span>
          <span class="manager-row-subtitle">
            ${escapeHtml(work.group || "(著者名なし)")} · ${escapeHtml(work.id)}
          </span>
        </span>
        <span class="manager-row-meta">
          <span>${languages}</span>
          <span>${work.versionCount}版</span>
          <span>${formatBytes(work.bytes)}</span>
        </span>
      </label>`;
  }).join("");

  list.querySelectorAll(".work-checkbox").forEach((checkbox) => {
    checkbox.addEventListener("change", () => {
      if (checkbox.checked) state.selectedWorks.add(checkbox.dataset.id);
      else state.selectedWorks.delete(checkbox.dataset.id);
      updateSelectionControls();
    });
  });
}

function visibleMorphs() {
  const matches = filteredMorphs();
  const maxPage = Math.max(1, Math.ceil(matches.length / PAGE_SIZE));
  state.morphPage = Math.min(Math.max(1, state.morphPage), maxPage);
  const start = (state.morphPage - 1) * PAGE_SIZE;
  return { matches, visible: matches.slice(start, start + PAGE_SIZE), start, maxPage };
}

function renderMorphs() {
  const { matches, visible, start, maxPage } = visibleMorphs();
  const list = document.getElementById("morphList");
  document.getElementById("morphEmpty").hidden = matches.length !== 0;

  list.innerHTML = visible.map((entry) => {
    const checked = state.selectedMorphs.has(entry.form) ? "checked" : "";
    const lemmas = (entry.lemmas || []).filter(Boolean).join("、") || "見出し語なし";
    const definitions = (entry.definitions || []).filter(Boolean).join(" / ");
    return `
      <label class="manager-row">
        <input class="manager-checkbox morph-checkbox" type="checkbox"
               data-form="${escapeHtml(entry.form)}" ${checked} />
        <span class="manager-row-main">
          <span class="manager-row-title greek-text" lang="grc">${escapeHtml(entry.form)}</span>
          <span class="manager-row-subtitle">${escapeHtml(lemmas)}</span>
          ${definitions ? `<span class="manager-row-note">${escapeHtml(definitions)}</span>` : ""}
        </span>
        <span class="manager-row-meta">
          <span>${entry.analysisCount}解析</span>
          <span>${entry.parseCount}候補</span>
          <span>${formatBytes(entry.bytes)}</span>
        </span>
      </label>`;
  }).join("");

  list.querySelectorAll(".morph-checkbox").forEach((checkbox) => {
    checkbox.addEventListener("change", () => {
      if (checkbox.checked) state.selectedMorphs.add(checkbox.dataset.form);
      else state.selectedMorphs.delete(checkbox.dataset.form);
      updateSelectionControls();
    });
  });

  document.getElementById("morphPageInfo").textContent =
    matches.length === 0
      ? "0件"
      : `${start + 1}–${Math.min(start + PAGE_SIZE, matches.length)} / ${matches.length}件`;
  document.getElementById("morphPrev").disabled = state.morphPage <= 1;
  document.getElementById("morphNext").disabled = state.morphPage >= maxPage;
}

function updateSelectionControls() {
  document.getElementById("workSelectionCount").textContent = `${state.selectedWorks.size}件選択`;
  document.getElementById("morphSelectionCount").textContent = `${state.selectedMorphs.size}件選択`;
  document.getElementById("deleteWorksButton").disabled = state.selectedWorks.size === 0;
  document.getElementById("deleteMorphsButton").disabled = state.selectedMorphs.size === 0;
}

async function deleteSelected(kind) {
  const isWorks = kind === "works";
  const selected = isWorks ? state.selectedWorks : state.selectedMorphs;
  const noun = isWorks ? "本文データ" : "単語解析データ";
  if (selected.size === 0) return;

  const confirmed = window.confirm(
    `選択した${noun} ${selected.size}件を削除します。\n\n` +
    "この操作は取り消せません。必要になったデータは後から再取得できます。続けますか？",
  );
  if (!confirmed) return;

  setStatus(`${noun}を削除しています…`);
  try {
    const response = await fetch("/api/data/delete", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      cache: "no-store",
      body: JSON.stringify(
        isWorks
          ? { works: [...selected], morphs: [] }
          : { works: [], morphs: [...selected] },
      ),
    });
    const payload = await response.json();
    if (!response.ok) throw new Error(payload.error || `HTTP ${response.status}`);

    selected.clear();
    const deleted =
      (payload.deletedWorks || []).length + (payload.deletedMorphs || []).length;
    const skipped = (payload.skipped || []).length;
    await loadData();
    setStatus(
      `${deleted}件を削除しました。${skipped ? `${skipped}件は処理中などの理由で削除されませんでした。` : ""}`,
      "success",
    );
  } catch (error) {
    setStatus(`削除できませんでした: ${error.message}`, "error");
  }
}

document.getElementById("reloadButton").addEventListener("click", loadData);
document.getElementById("workSearch").addEventListener("input", (event) => {
  state.workQuery = event.target.value;
  renderWorks();
});
document.getElementById("morphSearch").addEventListener("input", (event) => {
  state.morphQuery = event.target.value;
  state.morphPage = 1;
  renderMorphs();
});
document.getElementById("selectVisibleWorks").addEventListener("click", () => {
  filteredWorks().forEach((work) => state.selectedWorks.add(work.id));
  renderWorks();
  updateSelectionControls();
});
document.getElementById("clearWorks").addEventListener("click", () => {
  state.selectedWorks.clear();
  renderWorks();
  updateSelectionControls();
});
document.getElementById("selectVisibleMorphs").addEventListener("click", () => {
  visibleMorphs().visible.forEach((entry) => state.selectedMorphs.add(entry.form));
  renderMorphs();
  updateSelectionControls();
});
document.getElementById("clearMorphs").addEventListener("click", () => {
  state.selectedMorphs.clear();
  renderMorphs();
  updateSelectionControls();
});
document.getElementById("deleteWorksButton").addEventListener("click", () => deleteSelected("works"));
document.getElementById("deleteMorphsButton").addEventListener("click", () => deleteSelected("morphs"));
document.getElementById("morphPrev").addEventListener("click", () => {
  state.morphPage -= 1;
  renderMorphs();
});
document.getElementById("morphNext").addEventListener("click", () => {
  state.morphPage += 1;
  renderMorphs();
});

loadData();
