let workUrn = "";
let workData = null;
let versionIndex = 0;
let chunkIndex = 0;
let activeQuery = "";

let fetchAllPollTimer = null;
let lastFetchAllState = null;
let bulkMorphFetchActive = false;
let selectedMorphWords = [];
let selectedMorphFetchRunning = false;
let selectedMorphStopRequested = false;

const LANG_LABELS = {
  grc: "ギリシア語",
  eng: "英訳",
  lat: "ラテン語",
  fre: "フランス語",
  deu: "ドイツ語",
  ger: "ドイツ語",
  ita: "イタリア語",
  ara: "アラビア語",
};

const READER_BAR_COLLAPSED_KEY = "perseusReaderBarCollapsed";
const TEXT_SIZE_KEY = "perseusReaderTextSize";
const CUSTOM_TEXT_SIZE_KEY = "perseusReaderCustomTextSize";
const TEXT_SIZES = new Set(["small", "medium", "large", "xlarge", "custom"]);
const MIN_CUSTOM_TEXT_SIZE = 8;
const MAX_CUSTOM_TEXT_SIZE = 120;
const DEFAULT_CUSTOM_TEXT_SIZE = 21;

function workIdOf(urn) {
  return urn.split(":").pop();
}

function normalizeText(text) {
  return text
    .normalize("NFD")
    .replace(/[̀-ͯ᪰-᫿᷀-᷿]/g, "")
    .toLowerCase();
}

const GREEK_TO_BARE = {
  α: "a", β: "b", γ: "g", δ: "d", ε: "e", ζ: "z", η: "h",
  θ: "q", ι: "i", κ: "k", λ: "l", μ: "m", ν: "n", ξ: "c",
  ο: "o", π: "p", ρ: "r", σ: "s", ς: "s", τ: "t", υ: "u",
  φ: "f", χ: "x", ψ: "y", ω: "w",
};

function greekToBare(word) {
  const stripped = normalizeText(word).replace(/[᾿ʼ’']/g, "");
  let bare = "";
  for (const ch of stripped) {
    bare += GREEK_TO_BARE[ch] || "";
  }
  return bare;
}

function isAsciiQuery(text) {
  return /^[a-z]+$/i.test(text);
}

function versionSourceUrl(version) {
  return `https://scaife.perseus.org/reader/${encodeURI(version.urn)}/`;
}

async function main() {
  const params = new URLSearchParams(window.location.search);
  workUrn = params.get("urn") || "";
  if (!workUrn) {
    window.location.replace("./index.html");
    return;
  }

  const response = await fetch(`./data/texts/${workIdOf(workUrn)}.json`);
  if (!response.ok) {
    throw new Error("この作品はまだダウンロードされていません。ライブラリから開いてください。");
  }
  workData = await response.json();

  document.title = `${workData.group}, ${workData.title} — Perseus Local Reader`;
  document.getElementById("workTitle").textContent =
    `${workData.group}, ${workData.title}`;
  setupReaderBarToggle();
  setupTextSizeControls();

  const requestedVersion = params.get("version");
  versionIndex = Math.max(
    0,
    workData.versions.findIndex((v) => v.urn === requestedVersion),
  );
  if (versionIndex === -1) {
    versionIndex = 0;
  }

  renderVersionTabs();
  selectVersion(versionIndex, Number(params.get("chunk")) || 0);
  setupWorkSearch();
  await setupFetchAllMorphs();
  setupSelectedMorphFetch();
}

function normalizeCustomTextSize(value) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) {
    return DEFAULT_CUSTOM_TEXT_SIZE;
  }
  return Math.min(
    MAX_CUSTOM_TEXT_SIZE,
    Math.max(MIN_CUSTOM_TEXT_SIZE, Math.round(parsed)),
  );
}

function setupTextSizeControls() {
  const customInput = document.getElementById("customTextSize");
  const customButton = document.getElementById("applyCustomTextSize");
  const savedCustom = normalizeCustomTextSize(
    window.localStorage.getItem(CUSTOM_TEXT_SIZE_KEY) ||
      DEFAULT_CUSTOM_TEXT_SIZE,
  );
  customInput.value = String(savedCustom);

  const saved = window.localStorage.getItem(TEXT_SIZE_KEY) || "medium";
  setTextSize(TEXT_SIZES.has(saved) ? saved : "medium", savedCustom);

  document
    .querySelectorAll(".text-size-option[data-size]")
    .forEach((button) => {
      button.addEventListener("click", () => {
        const size = button.dataset.size;
        setTextSize(size);
        window.localStorage.setItem(TEXT_SIZE_KEY, size);
        document.getElementById("textSizeMenu").open = false;
      });
    });

  const applyCustomSize = () => {
    const size = normalizeCustomTextSize(customInput.value);
    customInput.value = String(size);
    window.localStorage.setItem(CUSTOM_TEXT_SIZE_KEY, String(size));
    window.localStorage.setItem(TEXT_SIZE_KEY, "custom");
    setTextSize("custom", size);
    document.getElementById("textSizeMenu").open = false;
  };

  customButton.addEventListener("click", applyCustomSize);
  customInput.addEventListener("keydown", (event) => {
    if (event.key === "Enter") {
      event.preventDefault();
      applyCustomSize();
    }
  });
}

function setTextSize(size, customSize = null) {
  const normalized = TEXT_SIZES.has(size) ? size : "medium";
  document.body.dataset.textSize = normalized;

  if (normalized === "custom") {
    const pixels = normalizeCustomTextSize(
      customSize ??
        window.localStorage.getItem(CUSTOM_TEXT_SIZE_KEY) ??
        DEFAULT_CUSTOM_TEXT_SIZE,
    );
    document.documentElement.style.setProperty(
      "--reader-custom-font-size",
      `${pixels}px`,
    );
    document.getElementById("customTextSize").value = String(pixels);
  }

  document
    .querySelectorAll(".text-size-option[data-size]")
    .forEach((button) => {
      const active = button.dataset.size === normalized;
      button.classList.toggle("active", active);
      button.setAttribute("aria-pressed", active ? "true" : "false");
    });

  const customButton = document.getElementById("applyCustomTextSize");
  const customActive = normalized === "custom";
  customButton.classList.toggle("active", customActive);
  customButton.setAttribute(
    "aria-pressed",
    customActive ? "true" : "false",
  );
}

function setupReaderBarToggle() {
  const params = new URLSearchParams(window.location.search);
  const button = document.getElementById("toggleReaderBar");
  const collapsed =
    params.get("bar") === "collapsed" ||
    window.localStorage.getItem(READER_BAR_COLLAPSED_KEY) === "1";
  setReaderBarCollapsed(collapsed);
  button.addEventListener("click", () => {
    const next = !document.body.classList.contains("reader-bar-collapsed");
    setReaderBarCollapsed(next);
    window.localStorage.setItem(READER_BAR_COLLAPSED_KEY, next ? "1" : "0");
  });
}

function setReaderBarCollapsed(collapsed) {
  const button = document.getElementById("toggleReaderBar");
  document.body.classList.toggle("reader-bar-collapsed", collapsed);
  button.setAttribute("aria-expanded", collapsed ? "false" : "true");
  button.title = collapsed ? "上部バーを開く" : "上部バーをしまう";
  button.textContent = collapsed ? "↓" : "↑";
}

function currentVersion() {
  return workData.versions[versionIndex];
}

function currentChunk() {
  return currentVersion().chunks[chunkIndex];
}

function renderVersionTabs() {
  const tabs = document.getElementById("versionTabs");
  const langTotals = {};
  for (const version of workData.versions) {
    langTotals[version.lang] = (langTotals[version.lang] || 0) + 1;
  }
  const langSeen = {};
  tabs.innerHTML = workData.versions
    .map((version, index) => {
      langSeen[version.lang] = (langSeen[version.lang] || 0) + 1;
      let langLabel = LANG_LABELS[version.lang] || version.lang;
      if (langTotals[version.lang] > 1) {
        langLabel += ` ${langSeen[version.lang]}`;
      }
      const extra =
        version.label && version.label !== workData.title
          ? ` <span class="tab-sub" lang="${version.lang === "grc" ? "grc" : ""}">${escapeHtml(version.label)}</span>`
          : "";
      return `
        <button
          class="version-tab${index === versionIndex ? " active" : ""}"
          type="button"
          role="tab"
          data-index="${index}"
          title="${escapeHtml(version.description || "")}"
        >${escapeHtml(langLabel)}${extra}</button>
      `;
    })
    .join("");
  tabs.querySelectorAll(".version-tab").forEach((tab) => {
    tab.addEventListener("click", () => selectVersion(Number(tab.dataset.index), 0));
  });
}

function selectVersion(index, chunk) {
  versionIndex = index;
  chunkIndex = Math.min(Math.max(chunk, 0), currentVersion().chunks.length - 1);
  document
    .querySelectorAll(".version-tab")
    .forEach((tab) =>
      tab.classList.toggle("active", Number(tab.dataset.index) === versionIndex),
    );

  const isGreek = currentVersion().lang === "grc";
  document.getElementById("morphPanel").hidden = !isGreek;
  document.getElementById("morphMenu").hidden = !isGreek;
  document
    .getElementById("readerActionTools")
    .classList.toggle("download-hidden", !isGreek);
  document.getElementById("layout").classList.toggle("no-panel", !isGreek);
  document.getElementById("text").setAttribute(
    "lang",
    currentVersion().lang === "ger" ? "de" : currentVersion().lang,
  );
  const meta = document.getElementById("workMeta");
  const description = currentVersion().description || "";
  const sourceUrl = versionSourceUrl(currentVersion());
  meta.innerHTML = description
    ? `<a href="${escapeHtml(sourceUrl)}" target="_blank" rel="noopener noreferrer">${escapeHtml(description)}</a>`
    : "";

  renderChunkControls();
  renderChunk();
}

function renderChunkControls() {
  const controls = document.getElementById("chunkControls");
  const select = document.getElementById("chunkSelect");
  const chunks = currentVersion().chunks;
  controls.hidden = chunks.length <= 1;
  if (chunks.length <= 1) {
    return;
  }
  select.innerHTML = chunks
    .map(
      (chunk, index) =>
        `<option value="${index}"${index === chunkIndex ? " selected" : ""}>${escapeHtml(chunk.label || `Part ${chunk.n}`)}</option>`,
    )
    .join("");
  select.onchange = () => {
    chunkIndex = Number(select.value);
    renderChunk();
  };
  document.getElementById("prevChunk").onclick = () => stepChunk(-1);
  document.getElementById("nextChunk").onclick = () => stepChunk(1);
}

function stepChunk(delta) {
  const next = chunkIndex + delta;
  if (next < 0 || next >= currentVersion().chunks.length) {
    return;
  }
  chunkIndex = next;
  document.getElementById("chunkSelect").value = String(chunkIndex);
  renderChunk();
  window.scrollTo(0, 0);
}

function renderChunk() {
  const chunk = currentChunk();
  const text = document.getElementById("text");
  text.innerHTML = chunk.html;
  renderAnchorNav(chunk);
  bindWords();
  updateChunkButtons();
  if (activeQuery) {
    highlightMatches(text, activeQuery);
  }
}

function updateChunkButtons() {
  const chunks = currentVersion().chunks;
  const prev = document.getElementById("prevChunk");
  const next = document.getElementById("nextChunk");
  prev.disabled = chunkIndex === 0;
  next.disabled = chunkIndex >= chunks.length - 1;
}

function renderAnchorNav(chunk) {
  const nav = document.getElementById("sectionNav");
  const anchors = chunk.anchors || [];
  const maxShown = 400;
  const seen = new Set();
  const compactAnchors = [];
  for (const anchor of anchors.slice(0, maxShown)) {
    const label = compactAnchorLabel(anchor.label);
    if (!label || seen.has(label)) {
      continue;
    }
    seen.add(label);
    compactAnchors.push({ ...anchor, label });
  }
  nav.innerHTML = compactAnchors
    .map(
      (anchor) =>
        `<a href="#${escapeHtml(anchor.id)}" title="${escapeHtml(anchor.label)}">${escapeHtml(anchor.label)}</a>`,
    )
    .join("");
}

function compactAnchorLabel(label) {
  const text = String(label || "").trim();
  const match = text.match(/\d+/);
  if (match) {
    return match[0];
  }
  return text.length <= 3 ? text : "";
}

function bindWords() {
  document.querySelectorAll("#text .word").forEach((link) => {
    link.addEventListener("click", () => {
      document
        .querySelectorAll("#text .word.active")
        .forEach((el) => el.classList.remove("active"));
      link.classList.add("active");
      const form = link.textContent;
      const frame = document.getElementById("morphFrame");
      frame.src =
        `./morph.html?form=${encodeURIComponent(form)}` +
        `&bare=${encodeURIComponent(greekToBare(form))}` +
        `&urn=${encodeURIComponent(workUrn)}`;
    });
  });
}

/* ---------------- in-work search ---------------- */

const plainTextCache = new Map();

function chunkPlainText(vIndex, cIndex) {
  const key = `${vIndex}:${cIndex}`;
  if (!plainTextCache.has(key)) {
    const html = workData.versions[vIndex].chunks[cIndex].html;
    const doc = new DOMParser().parseFromString(`<div>${html}</div>`, "text/html");
    plainTextCache.set(key, doc.body.textContent.replace(/\s+/g, " "));
  }
  return plainTextCache.get(key);
}

function setupWorkSearch() {
  const box = document.getElementById("workSearchBox");
  const button = document.getElementById("workSearchButton");
  const run = () => executeWorkSearch(box.value.trim());
  button.addEventListener("click", run);
  box.addEventListener("keydown", (event) => {
    if (event.key === "Enter") {
      run();
    }
  });
}

function executeWorkSearch(rawQuery) {
  const container = document.getElementById("searchResults");
  activeQuery = rawQuery;
  if (!rawQuery) {
    container.hidden = true;
    container.innerHTML = "";
    renderChunk();
    return;
  }

  const query = normalizeText(rawQuery);
  const bareQuery = query.replace(/[^a-z]/g, "");
  const useBareGreekSearch = currentVersion().lang === "grc" && isAsciiQuery(bareQuery);
  const chunks = currentVersion().chunks;
  const results = [];
  let total = 0;

  chunks.forEach((chunk, cIndex) => {
    const plain = chunkPlainText(versionIndex, cIndex);
    const normalized = normalizeText(plain);
    const bare = useBareGreekSearch ? greekToBare(plain) : "";
    let count = 0;
    const snippets = [];
    let position = normalized.indexOf(query);
    while (position !== -1) {
      count += 1;
      if (snippets.length < 3) {
        const start = Math.max(0, position - 40);
        const end = Math.min(plain.length, position + query.length + 40);
        snippets.push(plain.slice(start, end));
      }
      position = normalized.indexOf(query, position + query.length);
    }
    if (useBareGreekSearch && count === 0) {
      let barePosition = bare.indexOf(bareQuery);
      while (barePosition !== -1) {
        count += 1;
        if (snippets.length < 3) {
          snippets.push(plain.slice(0, 120));
        }
        barePosition = bare.indexOf(bareQuery, barePosition + bareQuery.length);
      }
    }
    if (count > 0) {
      total += count;
      results.push({ cIndex, count, snippets, label: chunk.label || "本文" });
    }
  });

  if (!results.length) {
    container.hidden = false;
    container.innerHTML = `<p class="search-summary">「${escapeHtml(rawQuery)}」は見つかりませんでした。<em>ヒント: ギリシア語はアクセントなし・ラテン文字転写でも検索できます。</em></p>`;
    renderChunk();
    return;
  }

  container.hidden = false;
  container.innerHTML = `
    <p class="search-summary">
      「${escapeHtml(rawQuery)}」: ${total} 件 (${results.length} 箇所)
      <button id="clearSearch" class="tool-button" type="button">検索を解除</button>
    </p>
    <ul class="search-hits">
      ${results
        .map(
          (result) => `
            <li>
              <a href="#" data-chunk="${result.cIndex}" class="search-hit">
                <strong>${escapeHtml(result.label)}</strong>
                <span class="hit-count">${result.count} 件</span>
              </a>
              <span class="hit-snippet">…${escapeHtml(result.snippets[0] || "")}…</span>
            </li>
          `,
        )
        .join("")}
    </ul>
  `;

  container.querySelectorAll(".search-hit").forEach((link) => {
    link.addEventListener("click", (event) => {
      event.preventDefault();
      chunkIndex = Number(link.dataset.chunk);
      const select = document.getElementById("chunkSelect");
      if (select) {
        select.value = String(chunkIndex);
      }
      renderChunk();
      const firstMark = document.querySelector("#text mark.search-match, #text .word.search-match-word");
      if (firstMark) {
        firstMark.scrollIntoView({ behavior: "smooth", block: "center" });
      }
    });
  });
  document.getElementById("clearSearch").addEventListener("click", () => {
    document.getElementById("workSearchBox").value = "";
    executeWorkSearch("");
  });

  renderChunk();
  const firstMark = document.querySelector("#text mark.search-match, #text .word.search-match-word");
  if (firstMark) {
    firstMark.scrollIntoView({ behavior: "smooth", block: "center" });
  }
}

function highlightMatches(rootElement, rawQuery) {
  const query = normalizeText(rawQuery);
  if (!query) {
    return;
  }
  rootElement
    .querySelectorAll(".word.search-match-word")
    .forEach((word) => word.classList.remove("search-match-word"));
  const walker = document.createTreeWalker(rootElement, NodeFilter.SHOW_TEXT);
  const textNodes = [];
  while (walker.nextNode()) {
    textNodes.push(walker.currentNode);
  }
  for (const node of textNodes) {
    const original = node.nodeValue;
    // Map normalized characters back to original string indexes.
    const map = [];
    let normalized = "";
    for (let index = 0; index < original.length; index += 1) {
      const decomposed = original[index].normalize("NFD");
      for (const ch of decomposed) {
        if (/[̀-ͯ᪰-᫿᷀-᷿]/.test(ch)) {
          continue;
        }
        normalized += ch.toLowerCase();
        map.push(index);
      }
    }
    const ranges = [];
    let position = normalized.indexOf(query);
    while (position !== -1) {
      const startOriginal = map[position];
      const endNormalized = position + query.length - 1;
      const endOriginal = map[endNormalized];
      ranges.push([startOriginal, endOriginal + 1]);
      position = normalized.indexOf(query, position + query.length);
    }
    if (!ranges.length) {
      continue;
    }
    const fragment = document.createDocumentFragment();
    let cursor = 0;
    for (const [start, end] of ranges) {
      if (start > cursor) {
        fragment.appendChild(document.createTextNode(original.slice(cursor, start)));
      }
      const mark = document.createElement("mark");
      mark.className = "search-match";
      mark.textContent = original.slice(start, end);
      fragment.appendChild(mark);
      cursor = end;
    }
    if (cursor < original.length) {
      fragment.appendChild(document.createTextNode(original.slice(cursor)));
    }
    node.parentNode.replaceChild(fragment, node);
  }
  const bareQuery = query.replace(/[^a-z]/g, "");
  if (currentVersion().lang === "grc" && isAsciiQuery(bareQuery)) {
    rootElement.querySelectorAll(".word").forEach((word) => {
      if (greekToBare(word.textContent).includes(bareQuery)) {
        word.classList.add("search-match-word");
      }
    });
  }
}

/* ---------------- morphology download (per work) ---------------- */

async function setupFetchAllMorphs() {
  const button = document.getElementById("fetchAllMorphs");
  const stopButton = document.getElementById("stopFetchAllMorphs");
  if (!button || !stopButton) {
    return;
  }
  button.addEventListener("click", startFetchAllMorphs);
  stopButton.addEventListener("click", stopFetchAllMorphs);
  try {
    await refreshFetchAllStatus();
  } catch {
    setFetchAllMessage("一括取得には、このアプリのローカルサーバー起動が必要です。");
  }
}

async function startFetchAllMorphs() {
  const confirmed = window.confirm(
    "この作品に現れる未取得の語形を、Perseusから順番に取得します。\n\n" +
      "語形数とPerseus側の応答状況によっては、数分から数十分かかります。開始しますか？",
  );
  if (!confirmed) {
    return;
  }

  const button = document.getElementById("fetchAllMorphs");
  button.disabled = true;
  setFetchAllMessage("一括取得を開始しています...");

  try {
    const response = await fetch(
      `/api/morph/fetch-all?urn=${encodeURIComponent(workUrn)}`,
      {
        method: "POST",
        cache: "no-store",
      },
    );
    const payload = await response.json();
    if (!response.ok) {
      throw new Error(payload.error || `HTTP ${response.status}`);
    }
    applyFetchAllStatus(payload.status);
  } catch (error) {
    button.disabled = false;
    setFetchAllMessage(`開始できませんでした: ${error.message}`);
  }
}

async function stopFetchAllMorphs() {
  const stopButton = document.getElementById("stopFetchAllMorphs");
  stopButton.disabled = true;
  setFetchAllMessage("現在の語形の取得が終わり次第、停止します...");

  try {
    const response = await fetch("/api/morph/fetch-all/stop", {
      method: "POST",
      cache: "no-store",
    });
    const payload = await response.json();
    if (!response.ok) {
      throw new Error(payload.error || `HTTP ${response.status}`);
    }
    applyFetchAllStatus(payload.status);
  } catch (error) {
    stopButton.disabled = false;
    setFetchAllMessage(`停止を要求できませんでした: ${error.message}`);
  }
}

async function refreshFetchAllStatus() {
  const response = await fetch("/api/morph/fetch-all/status", {
    cache: "no-store",
  });
  if (!response.ok) {
    throw new Error(`HTTP ${response.status}`);
  }
  const status = await response.json();
  applyFetchAllStatus(status);
}

function applyFetchAllStatus(status) {
  const button = document.getElementById("fetchAllMorphs");
  const stopButton = document.getElementById("stopFetchAllMorphs");
  const progress = document.getElementById("fetchAllProgress");
  const previousState = lastFetchAllState;
  const active = ["starting", "running", "stopping"].includes(status.state);
  const isThisWork = !status.urn || status.urn === workUrn;

  bulkMorphFetchActive = active;
  button.disabled = active || selectedMorphFetchRunning;
  stopButton.hidden = !active || !isThisWork;
  stopButton.disabled = status.state === "stopping";

  if (status.total > 0 && isThisWork) {
    progress.hidden = false;
    progress.max = status.total;
    progress.value = Math.min(status.completed || 0, status.total);
  } else {
    progress.hidden = true;
  }

  if (active && !isThisWork) {
    setFetchAllMessage("別の作品の一括取得が進行中です。完了までお待ちください。");
  } else if (status.state === "idle") {
    setFetchAllMessage("未取得の語形だけを取得します。");
  } else if (status.state === "starting") {
    setFetchAllMessage("この作品の語形を確認しています...");
  } else if (status.state === "running") {
    const current = status.current ? ` — ${status.current}` : "";
    setFetchAllMessage(
      `Perseusから取得中: ${status.completed}/${status.total}${current}`,
    );
  } else if (status.state === "stopping") {
    const current = status.current ? ` — ${status.current}` : "";
    setFetchAllMessage(
      `停止要求済みです。現在の語形が終わり次第停止します: ${status.completed}/${status.total}${current}`,
    );
  } else if (status.state === "stopped") {
    setFetchAllMessage(
      `停止しました: ${status.completed}/${status.total}。再開すると未取得分から続行します。`,
    );
  } else if (status.state === "done") {
    setFetchAllMessage(
      `完了: ${status.total}語形を確認し、${status.fetched}語形を新たに取得しました。`,
    );
  } else if (status.state === "error") {
    setFetchAllMessage(`取得を中断しました: ${status.error || "不明なエラー"}`);
  }

  if (active) {
    beginFetchAllPolling();
  } else {
    stopFetchAllPolling();
  }

  if (
    ["done", "stopped"].includes(status.state) &&
    ["starting", "running", "stopping"].includes(previousState)
  ) {
    reloadMorphFrame();
  }

  lastFetchAllState = status.state;
  updateSelectedMorphControls();
}

function beginFetchAllPolling() {
  if (fetchAllPollTimer !== null) {
    return;
  }
  fetchAllPollTimer = window.setInterval(() => {
    refreshFetchAllStatus().catch((error) => {
      stopFetchAllPolling();
      const button = document.getElementById("fetchAllMorphs");
      bulkMorphFetchActive = false;
      button.disabled = selectedMorphFetchRunning;
      updateSelectedMorphControls();
      setFetchAllMessage(`進捗を取得できませんでした: ${error.message}`);
    });
  }, 1000);
}

function stopFetchAllPolling() {
  if (fetchAllPollTimer === null) {
    return;
  }
  window.clearInterval(fetchAllPollTimer);
  fetchAllPollTimer = null;
}

function setFetchAllMessage(message) {
  const target = document.getElementById("fetchAllStatus");
  if (target) {
    target.textContent = message;
  }
}

function setupSelectedMorphFetch() {
  const button = document.getElementById("fetchSelectedMorphs");
  const stopButton = document.getElementById("stopSelectedMorphs");
  if (!button || !stopButton) {
    return;
  }

  document.addEventListener("selectionchange", () => {
    if (!selectedMorphFetchRunning) {
      captureSelectedMorphWords();
    }
  });

  // Capture the range before clicking the toolbar can collapse the browser selection.
  button.addEventListener("pointerdown", () => captureSelectedMorphWords(true));
  button.addEventListener("click", startSelectedMorphFetch);
  stopButton.addEventListener("click", stopSelectedMorphFetch);
  captureSelectedMorphWords();
}

function captureSelectedMorphWords(preserveIfEmpty = false) {
  const words = collectSelectedMorphWords();
  if (!words.length && preserveIfEmpty) {
    return;
  }
  selectedMorphWords = words;
  updateSelectedMorphControls();
  if (words.length) {
    setSelectedMorphMessage(
      `選択範囲に ${words.length} 種類の語形があります。未取得分だけを取得します。`,
    );
  } else {
    setSelectedMorphMessage(
      "本文をドラッグして選択すると、その範囲の語形をまとめて取得できます。",
    );
  }
}

function collectSelectedMorphWords() {
  const selection = window.getSelection();
  const text = document.getElementById("text");
  if (!selection || selection.rangeCount === 0 || selection.isCollapsed || !text) {
    return [];
  }

  const range = selection.getRangeAt(0);
  try {
    if (!range.intersectsNode(text)) {
      return [];
    }
  } catch {
    return [];
  }

  const unique = new Map();
  text.querySelectorAll(".word").forEach((element) => {
    let selected = false;
    try {
      selected = range.intersectsNode(element);
    } catch {
      selected = false;
    }
    if (!selected) {
      return;
    }

    const form = element.textContent;
    if (form && !unique.has(form)) {
      unique.set(form, { form, bare: greekToBare(form) });
    }
  });
  return Array.from(unique.values());
}

function updateSelectedMorphControls() {
  const button = document.getElementById("fetchSelectedMorphs");
  const stopButton = document.getElementById("stopSelectedMorphs");
  if (!button || !stopButton) {
    return;
  }

  const count = selectedMorphWords.length;
  button.textContent = count ? `選択範囲を取得（${count}語形）` : "選択範囲を取得";
  button.disabled = !count || selectedMorphFetchRunning || bulkMorphFetchActive;
  stopButton.hidden = !selectedMorphFetchRunning;
  stopButton.disabled = selectedMorphStopRequested;
}

async function startSelectedMorphFetch() {
  captureSelectedMorphWords(true);
  const words = [...selectedMorphWords];
  if (!words.length || selectedMorphFetchRunning || bulkMorphFetchActive) {
    return;
  }

  const confirmed = window.confirm(
    `選択範囲に含まれる ${words.length} 種類の語形について、未取得分だけをPerseusから取得します。開始しますか？`,
  );
  if (!confirmed) {
    return;
  }

  selectedMorphFetchRunning = true;
  selectedMorphStopRequested = false;
  updateSelectedMorphControls();

  const allButton = document.getElementById("fetchAllMorphs");
  const progress = document.getElementById("fetchSelectedProgress");
  allButton.disabled = true;
  progress.hidden = false;
  progress.max = words.length;
  progress.value = 0;

  let processed = 0;
  let cached = 0;
  let fetched = 0;
  let failed = 0;

  try {
    const morphData = await loadCurrentMorphData();
    morphData.forms = morphData.forms || {};

    for (const word of words) {
      if (selectedMorphStopRequested) {
        break;
      }

      const local = morphData.forms[word.form];
      if (local?.analyses?.length) {
        cached += 1;
        processed += 1;
        progress.value = processed;
        setSelectedMorphMessage(
          `選択範囲を確認中: ${processed}/${words.length} — ${word.form}（取得済み）`,
        );
        continue;
      }

      setSelectedMorphMessage(
        `選択範囲をPerseusから取得中: ${processed}/${words.length} — ${word.form}`,
      );

      try {
        const response = await fetch(
          `/api/morph?form=${encodeURIComponent(word.form)}&bare=${encodeURIComponent(word.bare)}`,
          { cache: "no-store" },
        );
        const payload = await response.json();
        if (!response.ok || payload.error) {
          failed += 1;
          if (response.status === 429 || payload.status === 429) {
            selectedMorphStopRequested = true;
            setSelectedMorphMessage(
              `Perseusのアクセス制限に達したため停止します: ${payload.error || "429 Too Many Requests"}`,
            );
          }
        } else {
          morphData.forms[word.form] = payload.entry;
          fetched += 1;
        }
      } catch {
        failed += 1;
      }

      processed += 1;
      progress.value = processed;
      if (!selectedMorphStopRequested) {
        await sleep(1000);
      }
    }

    if (selectedMorphStopRequested) {
      setSelectedMorphMessage(
        `停止しました: ${processed}/${words.length}語形を確認し、${fetched}語形を新たに取得しました。`,
      );
    } else {
      const failureText = failed ? `、${failed}語形は取得失敗` : "";
      setSelectedMorphMessage(
        `完了: ${processed}語形を確認し、${fetched}語形を新たに取得、${cached}語形は取得済み${failureText}です。`,
      );
    }
  } finally {
    selectedMorphFetchRunning = false;
    selectedMorphStopRequested = false;
    allButton.disabled = bulkMorphFetchActive;
    updateSelectedMorphControls();
    reloadMorphFrame();
  }
}

function stopSelectedMorphFetch() {
  if (!selectedMorphFetchRunning) {
    return;
  }
  selectedMorphStopRequested = true;
  updateSelectedMorphControls();
  setSelectedMorphMessage("現在の語形の取得が終わり次第、選択範囲の取得を停止します...");
}

async function loadCurrentMorphData() {
  try {
    const response = await fetch(`./data/morph.json?time=${Date.now()}`, {
      cache: "no-store",
    });
    if (!response.ok) {
      return { forms: {} };
    }
    return response.json();
  } catch {
    return { forms: {} };
  }
}

function reloadMorphFrame() {
  const frame = document.getElementById("morphFrame");
  try {
    frame.contentWindow.location.reload();
  } catch {
    // The next word click will load the updated cache.
  }
}

function setSelectedMorphMessage(message) {
  const target = document.getElementById("fetchSelectedStatus");
  if (target) {
    target.textContent = message;
  }
}

function sleep(milliseconds) {
  return new Promise((resolve) => window.setTimeout(resolve, milliseconds));
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

main().catch((error) => {
  document.getElementById("text").textContent = `読み込みに失敗しました: ${error.message}`;
});
