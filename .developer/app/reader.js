let fetchAllPollTimer = null;
let lastFetchAllState = null;
let bulkMorphFetchActive = false;
let selectedMorphWords = [];
let selectedMorphFetchRunning = false;
let selectedMorphStopRequested = false;

async function main() {
  const response = await fetch("./data/apology.json");
  const data = await response.json();
  renderNav(data.sections);
  renderText(data.sections);
  bindWords(data);
  await setupFetchAllMorphs();
  setupSelectedMorphFetch();
}

function renderNav(sections) {
  const nav = document.getElementById("sectionNav");
  nav.innerHTML = sections
    .map((section) => `<a href="#section-${section.section}">${section.section}</a>`)
    .join("");
}

function renderText(sections) {
  const text = document.getElementById("text");
  text.innerHTML = sections
    .map(
      (section) => `
        <section class="section" id="section-${section.section}">
          <h2>Section ${section.section}</h2>
          <p>${section.html}</p>
        </section>
      `,
    )
    .join("");
}

function bindWords(data) {
  document.querySelectorAll(".word").forEach((button) => {
    button.addEventListener("click", () => {
      document.querySelectorAll(".word.active").forEach((el) => el.classList.remove("active"));
      button.classList.add("active");
    });
  });
}

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
    "本文に現れる未取得の語形を、Perseusから順番に取得します。\n\n" +
      "語形数とPerseus側の応答状況によっては、数分から数十分かかります。開始しますか？",
  );
  if (!confirmed) {
    return;
  }

  const button = document.getElementById("fetchAllMorphs");
  button.disabled = true;
  setFetchAllMessage("一括取得を開始しています...");

  try {
    const response = await fetch("/api/morph/fetch-all", {
      method: "POST",
      cache: "no-store",
    });
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

  bulkMorphFetchActive = active;
  button.disabled = active || selectedMorphFetchRunning;
  stopButton.hidden = !active;
  stopButton.disabled = status.state === "stopping";

  if (status.total > 0) {
    progress.hidden = false;
    progress.max = status.total;
    progress.value = Math.min(status.completed || 0, status.total);
  } else {
    progress.hidden = true;
  }

  if (status.state === "idle") {
    setFetchAllMessage("未取得の語形だけを取得します。");
  } else if (status.state === "starting") {
    setFetchAllMessage("本文中の語形を確認しています...");
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
    const frame = document.getElementById("morphFrame");
    try {
      frame.contentWindow.location.reload();
    } catch {
      // The next word click will load the newly cached data.
    }
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

    const form = element.dataset.form;
    const bare = element.dataset.bare || "";
    if (form && !unique.has(form)) {
      unique.set(form, { form, bare });
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
  document.getElementById("text").textContent = `Failed to load local data: ${error.message}`;
});
