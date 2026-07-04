let catalog = null;
let downloadedIds = new Set();
let pollTimer = null;
let activeDownloadUrn = null;

const STALL_TIMEOUT_MS = 45000; // no progress for this long -> treat as stuck

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

function workId(urn) {
  return urn.split(":").pop();
}

function normalize(text) {
  return text
    .normalize("NFD")
    .replace(/[̀-ͯ᪰-᫿᷀-᷿]/g, "")
    .toLowerCase();
}

async function main() {
  const response = await fetch("./data/catalog.json");
  catalog = await response.json();
  await refreshDownloaded();
  render("");

  const searchBox = document.getElementById("searchBox");
  searchBox.addEventListener("input", () => render(searchBox.value));

  document.getElementById("overlayCancel").addEventListener("click", async () => {
    stopPolling();
    document.getElementById("downloadOverlay").hidden = true;
    if (activeDownloadUrn) {
      // Also stop the server-side job so nothing keeps downloading.
      try {
        await fetch(`/api/work/cancel?urn=${encodeURIComponent(activeDownloadUrn)}`, {
          method: "POST",
          cache: "no-store",
        });
      } catch {
        // Server unreachable — nothing to cancel.
      }
      activeDownloadUrn = null;
    }
  });

  // If the browser restores this page from bfcache (e.g. pressing "back"
  // after a download was in progress), the overlay's last DOM state comes
  // back frozen — no polling interval is actually running, so it would
  // otherwise sit there forever looking stuck with zero progress. Treat any
  // restored page as fresh: drop the overlay and re-check what's downloaded.
  window.addEventListener("pageshow", (event) => {
    if (!event.persisted) {
      return;
    }
    stopPolling();
    document.getElementById("downloadOverlay").hidden = true;
    refreshDownloaded().then(() => render(document.getElementById("searchBox").value));
  });
}

async function refreshDownloaded() {
  try {
    const response = await fetch("/api/works", { cache: "no-store" });
    if (response.ok) {
      const payload = await response.json();
      downloadedIds = new Set(payload.downloaded || []);
    }
  } catch {
    downloadedIds = new Set();
  }
}

function matchWork(work, query) {
  if (!query) {
    return true;
  }
  const haystack = normalize(
    [
      work.group,
      work.title,
      ...work.versions.map((v) => v.label),
    ].join(" "),
  );
  return query
    .split(/\s+/)
    .filter(Boolean)
    .every((term) => haystack.includes(term));
}

function render(rawQuery) {
  const query = normalize(rawQuery.trim());
  const works = catalog.works.filter((work) => matchWork(work, query));

  const countTarget = document.getElementById("searchCount");
  countTarget.textContent = query
    ? `${works.length} 作品が見つかりました`
    : `全 ${catalog.works.length} 作品`;

  renderDownloadedShelf(query);
  renderAuthors(works, query);
}

function renderDownloadedShelf(query) {
  const shelf = document.getElementById("downloadedShelf");
  const list = document.getElementById("downloadedList");
  const works = catalog.works.filter(
    (work) => downloadedIds.has(workId(work.urn)) && matchWork(work, query),
  );
  shelf.hidden = works.length === 0;
  list.innerHTML = works.map((work) => workRow(work, true)).join("");
  bindWorkRows(list);
}

function renderAuthors(works, query) {
  const container = document.getElementById("authorList");
  const heading = document.getElementById("browseHeading");
  heading.textContent = query ? "検索結果" : "著者から探す";

  const byAuthor = new Map();
  for (const work of works) {
    const author = work.group || "(著者名なし)";
    if (!byAuthor.has(author)) {
      byAuthor.set(author, []);
    }
    byAuthor.get(author).push(work);
  }

  const authors = Array.from(byAuthor.keys()).sort((a, b) =>
    a.localeCompare(b, "en"),
  );

  const expand = Boolean(query) && authors.length <= 12;
  container.innerHTML = authors
    .map((author) => {
      const authorWorks = byAuthor.get(author);
      const rows = authorWorks.map((work) => workRow(work, false)).join("");
      return `
        <details class="author" ${expand ? "open" : ""}>
          <summary>
            <span class="author-name">${escapeHtml(author)}</span>
            <span class="author-count">${authorWorks.length} 作品</span>
          </summary>
          <div class="work-list">${rows}</div>
        </details>
      `;
    })
    .join("");
  bindWorkRows(container);
}

function workRow(work, inDownloadedShelf) {
  const id = workId(work.urn);
  const downloaded = downloadedIds.has(id);
  const langs = [];
  for (const version of work.versions) {
    const label = LANG_LABELS[version.lang] || version.lang;
    if (!langs.includes(label)) {
      langs.push(label);
    }
  }
  const greekLabel = work.versions.find(
    (v) => v.lang === "grc" && v.label && v.label !== work.title,
  )?.label;
  return `
    <button
      class="work-row"
      type="button"
      data-urn="${escapeHtml(work.urn)}"
      data-downloaded="${downloaded ? "1" : ""}"
    >
      <span class="work-main">
        <span class="work-title">${escapeHtml(work.title || "(無題)")}</span>
        ${
          greekLabel && !inDownloadedShelf
            ? `<span class="work-greek" lang="grc">${escapeHtml(greekLabel)}</span>`
            : ""
        }
        ${inDownloadedShelf ? `<span class="work-author">${escapeHtml(work.group)}</span>` : ""}
      </span>
      <span class="work-badges">
        ${langs.map((l) => `<span class="badge">${escapeHtml(l)}</span>`).join("")}
        ${downloaded ? '<span class="badge badge-downloaded">✓ 取得済み</span>' : ""}
      </span>
    </button>
  `;
}

function bindWorkRows(container) {
  container.querySelectorAll(".work-row").forEach((row) => {
    row.addEventListener("click", () => openWork(row.dataset.urn));
  });
}

function readerUrl(urn) {
  return `./reader.html?urn=${encodeURIComponent(urn)}`;
}

async function openWork(urn) {
  if (downloadedIds.has(workId(urn))) {
    window.location.href = readerUrl(urn);
    return;
  }
  const work = catalog.works.find((w) => w.urn === urn);
  const confirmed = window.confirm(
    `「${work.group}, ${work.title}」をダウンロードします。\n\n` +
      "この作品の全ての版(原文と翻訳)を取得します。作品の大きさによって数秒〜数分かかります。\n" +
      "一度ダウンロードすれば、以後はインターネットなしで読めます。開始しますか？",
  );
  if (!confirmed) {
    return;
  }
  showOverlay(`${work.group}, ${work.title}`);
  activeDownloadUrn = urn;
  try {
    const response = await fetch(
      `/api/work/download?urn=${encodeURIComponent(urn)}`,
      { method: "POST", cache: "no-store" },
    );
    if (!response.ok) {
      const payload = await response.json().catch(() => ({}));
      throw new Error(payload.error || `HTTP ${response.status}`);
    }
    pollDownload(urn);
  } catch (error) {
    failOverlay(
      `ダウンロードを開始できませんでした: ${error.message}\n` +
        "ローカルサーバー(Open Perseus Local Reader)が起動しているか、インターネット接続を確認してください。",
    );
  }
}

function pollDownload(urn) {
  stopPolling();
  const startedAt = Date.now();
  let lastProgressAt = Date.now();
  let lastProgressKey = "";

  pollTimer = window.setInterval(async () => {
    try {
      const response = await fetch(
        `/api/work/status?urn=${encodeURIComponent(urn)}`,
        { cache: "no-store" },
      );
      const status = await response.json();

      if (status.downloaded) {
        stopPolling();
        window.location.href = readerUrl(urn);
        return;
      }
      if (status.state === "done") {
        stopPolling();
        window.location.href = readerUrl(urn);
        return;
      }
      if (status.state === "error") {
        stopPolling();
        failOverlay(`ダウンロードに失敗しました: ${status.error || "不明なエラー"}`);
        return;
      }
      if (status.state === "canceled") {
        stopPolling();
        document.getElementById("downloadOverlay").hidden = true;
        return;
      }
      if (status.state === "running") {
        const key = `${status.label || ""}:${status.done || 0}/${status.total || 0}`;
        if (key !== lastProgressKey) {
          lastProgressKey = key;
          lastProgressAt = Date.now();
        }
        updateOverlay(status);
      }
      // Any other state (e.g. "idle") means the server has no record of this
      // job — most likely it restarted, or another server instance handled
      // the original request. Fall through to the stall check below rather
      // than silently spinning forever.

      const stalledFor = Date.now() - lastProgressAt;
      if (status.state !== "running" && Date.now() - startedAt > 3000) {
        // Never saw "running" within a few seconds of starting: the job
        // record is missing entirely.
        stopPolling();
        failOverlay(
          "ダウンロードの状態を追跡できませんでした。ローカルサーバーが" +
            "途中で再起動された可能性があります。もう一度お試しください。",
        );
        return;
      }
      if (stalledFor > STALL_TIMEOUT_MS) {
        stopPolling();
        failOverlay(
          `ダウンロードが ${Math.round(STALL_TIMEOUT_MS / 1000)} 秒以上進んでいません。` +
            "インターネット接続を確認して、もう一度お試しください。",
        );
        return;
      }
    } catch (error) {
      stopPolling();
      failOverlay(`進捗を確認できませんでした: ${error.message}`);
    }
  }, 700);
}

function stopPolling() {
  if (pollTimer !== null) {
    window.clearInterval(pollTimer);
    pollTimer = null;
  }
}

function showOverlay(title) {
  document.getElementById("overlayTitle").textContent = `ダウンロード中: ${title}`;
  document.getElementById("overlayDetail").textContent = "開始しています...";
  const progress = document.getElementById("overlayProgress");
  progress.max = 1;
  progress.value = 0;
  progress.removeAttribute("value");
  document.getElementById("overlayClose").hidden = true;
  document.getElementById("overlayCancel").hidden = false;
  document.getElementById("downloadOverlay").hidden = false;
}

function updateOverlay(status) {
  document.getElementById("overlayDetail").textContent = status.label || "";
  const progress = document.getElementById("overlayProgress");
  if (status.total > 0) {
    progress.max = status.total;
    progress.value = status.done || 0;
  }
}

function failOverlay(message) {
  document.getElementById("overlayTitle").textContent = "ダウンロードできませんでした";
  document.getElementById("overlayDetail").textContent = message;
  document.getElementById("overlayCancel").hidden = true;
  const closeButton = document.getElementById("overlayClose");
  closeButton.hidden = false;
  closeButton.onclick = () => {
    document.getElementById("downloadOverlay").hidden = true;
  };
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
  document.getElementById("authorList").textContent =
    `カタログを読み込めませんでした: ${error.message}`;
});
