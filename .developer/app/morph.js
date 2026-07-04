async function main() {
  const params = new URLSearchParams(window.location.search);
  const form = params.get("form");
  const bare = params.get("bare");
  const section = params.get("section");
  const urn = params.get("urn");
  if (!form || !bare) {
    return;
  }

  const data = await loadWordData(urn);
  const morphData = await loadMorphData();
  const word = { form, bare, section };
  document.getElementById("morph").innerHTML = renderMorph(data, morphData, word);
  if (!morphData.forms?.[form]?.analyses?.length) {
    await fetchAdHocMorph(data, morphData, word);
  }
}

async function loadWordData(urn) {
  const empty = { words: {}, lemmas: {} };
  if (!urn) {
    return empty;
  }
  try {
    const workId = urn.split(":").pop();
    const response = await fetch(`./data/texts/${workId}.json`);
    if (!response.ok) {
      return empty;
    }
    const work = await response.json();
    const greek = work.versions.find((version) => version.lang === "grc");
    return {
      words: greek?.words || {},
      lemmas: greek?.lemmas || {},
    };
  } catch {
    return empty;
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
  const developerBlock = renderDeveloperDetails({
    bare: word.bare,
    beta,
    lemmas,
    localMorph,
  });

  return `
    <h2 lang="grc">${escapeHtml(word.form)}</h2>
    <div class="meta">${word.section ? `Section ${escapeHtml(word.section)} / ` : ""}local morph page</div>
    <div class="row"><div class="label">元サイト</div><div>${renderPerseusLink(beta)}</div></div>
    <div class="row"><div class="label">Forms here</div><div lang="grc">${wordInfo.forms.map(escapeHtml).join(", ")}</div></div>
    <div class="row"><div class="label">Count</div><div>${wordInfo.count}</div></div>
    ${parseBlock}
    ${developerBlock}
  `;
}

function renderDeveloperDetails({ bare, beta, lemmas, localMorph }) {
  const localLemmaBlock = lemmas.length
    ? `<div class="lemma-list">${lemmas
        .map(
          (lemma) => `
            <div class="lemma">
              <strong>${escapeHtml(lemma.lemma)}</strong>
              <span>${
                lemma.shortDef
                  ? escapeHtml(lemma.shortDef)
                  : "<em>short definitionなし</em>"
              }</span>
            </div>
          `,
        )
        .join("")}</div>`
    : `<p class="note">ローカル lemma 候補はありません。</p>`;

  return `
    <details class="developer-details">
      <summary>開発者向け情報</summary>
      <div class="developer-details-body">
        <div class="row developer-row">
          <div class="label">Bare key</div>
          <div><code>${escapeHtml(bare)}</code></div>
        </div>
        <div class="row developer-row">
          <div class="label">Beta Code</div>
          <div><code>${escapeHtml(beta || "-")}</code></div>
        </div>
        <div class="row developer-row">
          <div class="label">Morph source</div>
          <div>${escapeHtml(localMorph?.source || "未取得")}</div>
        </div>

        <section class="developer-lemmas">
          <h3>ローカル lemma 候補</h3>
          ${localLemmaBlock}
        </section>

        <section class="developer-note">
          <h3>データ解釈上の注意</h3>
          <ul>
            <li><code>Bare key</code> と <code>Beta Code</code> は、検索・通信のためにこのアプリが生成した内部表現です。</li>
            <li>ローカル lemma 候補は <code>hib_lemmas.sql</code> 由来です。完全一致がない場合は prefix fallback を含むため、確定した形態解析ではありません。</li>
            <li><em>short definitionなし</em> は、データに短い語義がないことを示すUI上の表示です。</li>
            <li>Perseus Hopper の短い定義は辞書的な gloss であり、この文脈における訳語とは限りません。</li>
            <li>Perseus Hopper は可能な解析候補を列挙します。複数候補がある場合、この本文中の正解を自動的に一意化しているわけではありません。</li>
          </ul>
        </section>
      </div>
    </details>
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
