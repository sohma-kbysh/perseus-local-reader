async function main() {
  const params = new URLSearchParams(window.location.search);
  const form = params.get("form");
  const bare = params.get("bare");
  const section = params.get("section");
  if (!form || !bare) {
    return;
  }

  const response = await fetch("./data/apology.json");
  const data = await response.json();
  const morphData = await loadMorphData();
  const word = { form, bare, section };
  document.getElementById("morph").innerHTML = renderMorph(data, morphData, word);
  if (!morphData.forms?.[form]?.analyses?.length) {
    await fetchAdHocMorph(data, morphData, word);
  }
}

async function loadMorphData() {
  try {
    const response = await fetch("./data/morph.json");
    if (!response.ok) {
      return { forms: {} };
    }
    return response.json();
  } catch {
    return { forms: {} };
  }
}

async function fetchAdHocMorph(data, morphData, word) {
  const target = document.getElementById("adHocFetch");
  if (!target) {
    return;
  }
  target.innerHTML = `<p class="note">Perseus からこの語形だけ取得中です...</p>`;
  try {
    const response = await fetch(
      `/api/morph?form=${encodeURIComponent(word.form)}&bare=${encodeURIComponent(word.bare)}`,
    );
    const payload = await response.json();
    if (!response.ok || payload.error) {
      target.innerHTML = `<p class="note">${escapeHtml(payload.error || "取得できませんでした。")}</p>`;
      return;
    }
    morphData.forms = morphData.forms || {};
    morphData.forms[word.form] = payload.entry;
    document.getElementById("morph").innerHTML = renderMorph(data, morphData, word);
  } catch (error) {
    target.innerHTML = `<p class="note">ad hoc 取得には <code>python3 scripts/server.py 8000</code> で起動したローカルサーバが必要です。</p>`;
  }
}

function renderMorph(data, morphData, word) {
  const wordInfo = data.words[word.bare] || { forms: [word.form], count: 1 };
  const localMorph = morphData.forms?.[word.form];
  const beta = localMorph?.beta || "";
  const lemmas = data.lemmas[word.bare] || [];
  const parseBlock = localMorph?.analyses?.length
    ? renderAnalyses(localMorph)
    : `<div id="adHocFetch"><p class="note">この語形の Perseus morph キャッシュはまだありません。</p></div>`;
  const lemmaBlock = lemmas.length
    ? `<div class="lemma-list">${lemmas
        .map(
          (lemma) => `
            <div class="lemma">
              <strong>${escapeHtml(lemma.lemma)}</strong>
              <span>${escapeHtml(lemma.shortDef || "No short definition")}</span>
            </div>
          `,
        )
        .join("")}</div>`
    : `<p class="note">ローカル lemma 候補が見つかりませんでした。</p>`;

  return `
    <h2 lang="grc">${escapeHtml(word.form)}</h2>
    <div class="meta">Section ${escapeHtml(word.section || "-")} / local morph page</div>
    <div class="row"><div class="label">Bare key</div><div><code>${escapeHtml(word.bare)}</code></div></div>
    <div class="row"><div class="label">Beta Code</div><div><code>${escapeHtml(beta || "-")}</code></div></div>
    <div class="row"><div class="label">元サイト</div><div>${renderPerseusLink(beta)}</div></div>
    <div class="row"><div class="label">Forms here</div><div lang="grc">${wordInfo.forms.map(escapeHtml).join(", ")}</div></div>
    <div class="row"><div class="label">Count</div><div>${wordInfo.count}</div></div>
    <div class="row"><div class="label">Lemmas</div><div>${lemmaBlock}</div></div>
    ${parseBlock}
  `;
}

function renderPerseusLink(beta) {
  if (!beta) {
    return `<span class="note-inline">取得後に表示されます</span>`;
  }
  const url = `https://www.perseus.tufts.edu/hopper/morph?l=${encodeURIComponent(beta)}&la=greek`;
  return `<a class="external-link" href="${escapeHtml(url)}" target="_blank" rel="noopener noreferrer">Perseus で確認</a>`;
}

function renderAnalyses(localMorph) {
  return `
    <div class="analysis-list">
      ${localMorph.analyses
        .map(
          (analysis) => `
            <section class="morph-analysis">
              <h3 lang="grc">${escapeHtml(analysis.lemma || analysis.lemmaId || "Analysis")}</h3>
              <p>${escapeHtml(analysis.definition || "")}</p>
              <table>
                <tbody>
                  ${analysis.parses
                    .map(
                      (parse) => `
                        <tr>
                          <td lang="grc">${escapeHtml(parse.form)}</td>
                          <td>${escapeHtml(parse.parse)}</td>
                        </tr>
                      `,
                    )
                    .join("")}
                </tbody>
              </table>
            </section>
          `,
        )
        .join("")}
    </div>
  `;
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
  document.getElementById("morph").textContent = `Failed to load local morph data: ${error.message}`;
});
