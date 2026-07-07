(() => {
  "use strict";

  const STORAGE_KEY = "perseusUiLanguage";
  const MESSAGE_HANDLER = "plrLanguage";
  const SUPPORTED = new Set(["en", "ja"]);

  const requested = new URL(window.location.href).searchParams.get("lang");
  const stored = window.localStorage.getItem(STORAGE_KEY);
  let language = SUPPORTED.has(requested)
    ? requested
    : SUPPORTED.has(stored)
      ? stored
      : "en";

  window.localStorage.setItem(STORAGE_KEY, language);

  const exact = new Map([
    ["Perseus Digital Library のギリシア語テキストと英訳を、手元で検索して読む", "Search and read Greek texts and English translations from the Perseus Digital Library locally"],
    ["メモ — Perseus Local Reader", "Notes — Perseus Local Reader"],
    ["保存データの管理 — Perseus Local Reader", "Manage Saved Data — Perseus Local Reader"],
    ["メモ", "Notes"],
    ["保存データを管理", "Manage Saved Data"],
    ["著者名・作品名で検索 (例: Plato, Apology, Ὅμηρος)", "Search by author or work (e.g. Plato, Apology, Ὅμηρος)"],
    ["ダウンロード済みの作品", "Downloaded Works"],
    ["著者から探す", "Browse by Author"],
    ["検索結果", "Search Results"],
    ["ダウンロード中", "Downloading"],
    ["この作品の全ての版(原文と翻訳)をまとめて取得しています。\n完了すると、以後この作品はインターネットなしで読めます。", "Downloading every available version of this work (original text and translations).\nAfter completion, this work can be read offline."],
    ["閉じる", "Close"],
    ["キャンセル", "Cancel"],
    ["← ライブラリへ戻る", "← Back to Library"],
    ["読み込み中...", "Loading..."],
    ["◀ 前", "◀ Previous"],
    ["次 ▶", "Next ▶"],
    ["この作品の中を検索", "Search within this work"],
    ["検索", "Search"],
    ["本文の文字サイズを変えます", "Change the text size"],
    ["小", "Small"],
    ["標準", "Standard"],
    ["大", "Large"],
    ["特大", "Extra Large"],
    ["カスタム", "Custom"],
    ["本文のカスタム文字サイズ", "Custom text size"],
    ["適用", "Apply"],
    ["形態解析データの取得メニューを開きます", "Open the morphology download menu"],
    ["この作品全体", "Entire Work"],
    ["全語形をPerseusから取得", "Fetch All Forms from Perseus"],
    ["この作品に現れる未取得の語形をPerseusから順番に取得します", "Fetch uncached forms occurring in this work from Perseus"],
    ["ここまでで停止", "Stop After Current Form"],
    ["現在の語形の取得が終わり次第、一括取得を停止します", "Stop the batch after the current form finishes"],
    ["選択範囲", "Selection"],
    ["選択範囲を取得", "Fetch Selection"],
    ["本文で選択した範囲に含まれる未取得の語形だけをPerseusから取得します", "Fetch only uncached forms contained in the selected passage"],
    ["選択取得を停止", "Stop Selection Fetch"],
    ["現在の語形の取得が終わり次第、選択範囲の取得を停止します", "Stop selection fetching after the current form finishes"],
    ["本文をドラッグして選択すると、その範囲の語形をまとめて取得できます。", "Drag across the text to fetch the forms in that selection."],
    ["★ 選択範囲をメモ", "★ Add Selection to Notes"],
    ["蛍光マーカーを付ける範囲", "Highlight Scope"],
    ["クリックしたこの箇所だけ", "Only this occurrence"],
    ["この作品内の同じ語形すべて", "Every identical form in this work"],
    ["空欄のままでも、蛍光マーカーとして保存できます。", "You may leave this blank and save it as a highlight or favorite."],
    ["メモを削除", "Delete Note"],
    ["保存", "Save"],
    ["本文の語句や選択範囲に付けたメモを、検索・編集・削除できます。", "Search, edit, and delete notes attached to words or selected passages."],
    ["再読み込み", "Reload"],
    ["すべて", "All"],
    ["単語", "Word"],
    ["文章", "Passage"],
    ["語句・見出し語・作品名・メモ内容で検索", "Search quotation, lemma, work, or note text"],
    ["メモの種類", "Note type"],
    ["並び順", "Sort order"],
    ["更新日時が新しい順", "Recently updated first"],
    ["作成日時が新しい順", "Recently created first"],
    ["作品順", "By work"],
    ["表示中をすべて選択", "Select All Visible"],
    ["選択解除", "Clear Selection"],
    ["選択したメモを削除", "Delete Selected Notes"],
    ["0件選択", "0 selected"],
    ["該当するメモはありません。", "No matching notes."],
    ["ダウンロード済みの本文と、取得済みの単語解析データを確認・検索・削除できます。", "Inspect, search, and delete downloaded texts and cached morphology data."],
    ["本文データ", "Text Data"],
    ["単語データ", "Morphology Data"],
    ["合計", "Total"],
    ["ダウンロード済みの本文", "Downloaded Texts"],
    ["本文の削除に加えて、選択した作品だけで使われている単語解析データを削除できます。他のダウンロード済み作品でも使われる語形は保持されます。", "Delete downloaded texts or remove morphology used only by the selected works. Forms shared with other downloaded works are preserved."],
    ["選択した作品専用の単語を削除", "Delete Forms Exclusive to Selected Works"],
    ["選択した本文を削除", "Delete Selected Texts"],
    ["著者名・作品名・作品ID・言語で検索", "Search by author, work, work ID, or language"],
    ["該当する本文データはありません。", "No matching text data."],
    ["取得済みの単語解析データ", "Cached Morphology Data"],
    ["削除した単語は、本文中で再度クリックすると必要に応じて取得されます。", "Deleted forms are fetched again when needed after you click them in the text."],
    ["選択した単語を削除", "Delete Selected Forms"],
    ["語形・正規化形・見出し語・短い語義で検索", "Search by form, normalized form, lemma, or short definition"],
    ["該当する単語データはありません。", "No matching morphology data."],
    ["前へ", "Previous"],
    ["次へ", "Next"],
    ["本文の単語リンクをクリックすると、ここにローカル morph 情報を表示します。", "Click a word in the text to display its local morphology here."],
    ["元サイト", "Source"],
    ["開発者向け情報", "Developer Information"],
    ["ローカル lemma 候補", "Local Lemma Candidates"],
    ["データ解釈上の注意", "Data Interpretation Notes"],
    ["取得後に表示されます", "Shown after retrieval"],
    ["Perseus で確認", "Check in Perseus"],
    ["ローカル lemma 候補はありません。", "No local lemma candidates."],
    ["short definitionなし", "no short definition"],
    ["未取得", "Not fetched"],
    ["単語のメモ", "Word Note"],
    ["文章メモを編集", "Edit Passage Note"],
    ["文章をメモに追加", "Add Passage to Notes"],
    ["メモを読み込んでいます…", "Loading notes…"],
    ["メモを読み込みました。", "Notes loaded."],
    ["保存データを読み込んでいます…", "Loading saved data…"],
    ["保存データを読み込みました。", "Saved data loaded."],
    ["未取得の語形だけを取得します。", "Only uncached forms will be fetched."],
    ["この作品の語形を確認しています...", "Checking forms in this work..."],
    ["別の作品の一括取得が進行中です。完了までお待ちください。", "A batch fetch for another work is in progress. Wait for it to finish."],
    ["この語形の Perseus morph キャッシュはまだありません。", "No Perseus morphology cache exists for this form yet."],
    ["Perseus からこの語形だけ取得中です...", "Fetching this form from Perseus..."],
    ["取得できませんでした。", "Could not fetch the data."],
    ["見出し語なし", "No lemma"],
    ["無題", "Untitled"],
    ["著者名なし", "No author"],
    ["ギリシア語", "Greek"],
    ["英訳", "English Translation"],
    ["ラテン語", "Latin"],
    ["フランス語", "French"],
    ["ドイツ語", "German"],
    ["イタリア語", "Italian"],
    ["アラビア語", "Arabic"],
    ["取得済み", "Downloaded"],
    ["確認", "Confirm"],
    ["入力", "Input"],
    ["不明なエラー", "Unknown error"],
    ["メモ済み", "Noted"],
    ["文章メモ", "Passage note"],
  ]);

  const patterns = [
    [/^全 (\d+) 作品$/, "All $1 works"],
    [/^(\d+) 作品が見つかりました$/, "$1 works found"],
    [/^(\d+) 作品$/, "$1 works"],
    [/^(\d+)作品$/, "$1 works"],
    [/^(\d+)件選択$/, "$1 selected"],
    [/^(\d+)件$/, "$1 items"],
    [/^(\d+)語形$/, "$1 forms"],
    [/^(\d+)解析$/, "$1 analyses"],
    [/^(\d+)候補$/, "$1 candidates"],
    [/^(\d+)版$/, "$1 versions"],
    [/^単語 (\d+)語形$/, "Morphology: $1 forms"],
    [/^専用 (\d+)$/, "Exclusive: $1"],
    [/^共通 (\d+)$/, "Shared: $1"],
    [/^(\d+)作品・(.+)$/, "$1 works · $2"],
    [/^(\d+)語形・(.+)$/, "$1 forms · $2"],
    [/^(\d+)–(\d+) \/ (\d+)件$/, "$1–$2 / $3 items"],
    [/^ダウンロード中: (.+)$/, "Downloading: $1"],
    [/^ダウンロードに失敗しました: (.+)$/, "Download failed: $1"],
    [/^進捗を確認できませんでした: (.+)$/, "Could not check progress: $1"],
    [/^メモを読み込めませんでした: (.+)$/, "Could not load notes: $1"],
    [/^保存できませんでした: (.+)$/, "Could not save: $1"],
    [/^削除できませんでした: (.+)$/, "Could not delete: $1"],
    [/^保存データを読み込めませんでした: (.+)$/, "Could not load saved data: $1"],
    [/^作品専用の単語データを削除できませんでした: (.+)$/, "Could not delete work-exclusive morphology: $1"],
    [/^開始できませんでした: (.+)$/, "Could not start: $1"],
    [/^停止を要求できませんでした: (.+)$/, "Could not request stop: $1"],
    [/^進捗を取得できませんでした: (.+)$/, "Could not retrieve progress: $1"],
    [/^読み込みに失敗しました: (.+)$/, "Loading failed: $1"],
    [/^Failed to load local morph data: (.+)$/, "Failed to load local morphology data: $1"],
    [/^選択範囲に (\d+) 種類の語形があります。未取得分だけを取得します。$/, "The selection contains $1 distinct forms. Only uncached forms will be fetched."],
    [/^選択範囲を取得（(\d+)語形）$/, "Fetch Selection ($1 forms)"],
    [/^選択範囲を確認中: (.+)$/, "Checking selection: $1"],
    [/^選択範囲をPerseusから取得中: (.+)$/, "Fetching selection from Perseus: $1"],
    [/^Perseusから取得中: (.+)$/, "Fetching from Perseus: $1"],
    [/^停止要求済みです。現在の語形が終わり次第停止します: (.+)$/, "Stop requested. The batch will stop after the current form: $1"],
    [/^停止しました: (.+)。再開すると未取得分から続行します。$/, "Stopped: $1. Restarting will continue with uncached forms."],
    [/^停止しました: (.+)語形を確認し、(.+)語形を新たに取得しました。$/, "Stopped after checking $1 forms and fetching $2 new forms."],
    [/^完了: (.+)語形を確認し、(.+)語形を新たに取得しました。$/, "Complete: checked $1 forms and fetched $2 new forms."],
    [/^完了: (.+)語形を確認し、(.+)語形を新たに取得、(.+)語形は取得済み(.*)です。$/, "Complete: checked $1 forms, fetched $2 new forms, and found $3 already cached$4."],
    [/^取得を中断しました: (.+)$/, "Fetching stopped: $1"],
    [/^(.+)件のメモを削除しました。$/, "Deleted $1 notes."],
    [/^(.+)件を削除しました。(.*)$/, "Deleted $1 items. $2"],
    [/^(.+)語形を削除しました。(.+)語形は他のダウンロード済み作品でも使われるため保持しました。(.*)$/, "Deleted $1 forms. Preserved $2 forms because they are used by other downloaded works. $3"],
    [/^「(.+)」: (\d+) 件 \((\d+) 箇所\)$/, "“$1”: $2 matches in $3 sections"],
    [/^「(.+)」は見つかりませんでした。ヒント: ギリシア語はアクセントなし・ラテン文字転写でも検索できます。$/, "“$1” was not found. Tip: Greek can also be searched without accents or with Latin transliteration."],
    [/^Section (.+) \/ local morph page$/, "Section $1 / local morphology"],
  ];

  const fragments = [
    ["ダウンロードを開始できませんでした", "Could not start the download"],
    ["ローカルサーバー(Open Perseus Local Reader)が起動しているか、インターネット接続を確認してください。", "Check that the Perseus Local Reader server is running and that you have an internet connection."],
    ["この作品の全ての版(原文と翻訳)を取得します。作品の大きさによって数秒〜数分かかります。", "Every available version of this work (original text and translations) will be downloaded. Depending on the work, this may take from several seconds to several minutes."],
    ["一度ダウンロードすれば、以後はインターネットなしで読めます。開始しますか？", "After downloading, it can be read offline. Start now?"],
    ["をダウンロードします。", " will be downloaded."],
    ["この作品に現れる未取得の語形を、Perseusから順番に取得します。", "Uncached forms occurring in this work will be fetched from Perseus in sequence."],
    ["語形数とPerseus側の応答状況によっては、数分から数十分かかります。開始しますか？", "Depending on the number of forms and Perseus response times, this may take several minutes or longer. Start now?"],
    ["選択範囲に含まれる", "For the"],
    ["種類の語形について、未取得分だけをPerseusから取得します。開始しますか？", "distinct forms in the selection, fetch only uncached forms from Perseus. Start now?"],
    ["Perseusのアクセス制限に達したため停止します", "Stopping because the Perseus rate limit was reached"],
    ["現在の語形の取得が終わり次第、選択範囲の取得を停止します...", "Selection fetching will stop after the current form finishes..."],
    ["取得失敗", "failed to fetch"],
    ["開始しています...", "Starting..."],
    ["取得中:", "Fetching:"],
    ["変換中:", "Converting:"],
    ["保存中", "Saving"],
    ["ダウンロードの状態を追跡できませんでした。ローカルサーバーが途中で再起動された可能性があります。もう一度お試しください。", "The download state could not be tracked. The local server may have restarted. Try again."],
    ["ダウンロードが", "The download has made no progress for"],
    ["秒以上進んでいません。インターネット接続を確認して、もう一度お試しください。", "seconds. Check the internet connection and try again."],
    ["この操作は取り消せません。必要になったデータは後から再取得できます。続けますか？", "This action cannot be undone. The data can be downloaded again later. Continue?"],
    ["本文データを削除しています…", "Deleting text data…"],
    ["単語解析データを削除しています…", "Deleting morphology data…"],
    ["作品専用の単語解析データを確認して削除しています…", "Checking and deleting work-exclusive morphology data…"],
    ["件は処理中などの理由で削除されませんでした。", "items were not deleted because they are active or unavailable."],
    ["件は対象を確認できなかったため処理していません。", "items were skipped because their targets could not be verified."],
    ["他作品と共通する語形、本文データ、メモ、蛍光マーカーは削除されません。", "Forms shared with other works, text data, notes, and highlights will not be deleted."],
    ["必要な単語解析は本文から再取得できます。続けますか？", "Required morphology can be fetched again from the text. Continue?"],
    ["選択した", "Selected "],
    ["本文データ", "text data"],
    ["単語解析データ", "morphology data"],
    ["を削除します。", " will be deleted."],
    ["このメモを削除します。よろしいですか？", "Delete this note?"],
    ["選択したメモ", "Selected notes: "],
    ["件を削除します。よろしいですか？", " items will be deleted. Continue?"],
    ["メモを保存しました。", "Note saved."],
    ["見つかりません", "Not found"],
    ["処理中です", "In progress"],
    ["本文が見つかりません", "Text not found"],
    ["安全のため削除を中止しました。", "Deletion was stopped for safety."],
    ["この作品はまだダウンロードされていません。ライブラリから開いてください。", "This work has not been downloaded. Open it from the library."],
    ["この作品の本文ファイルを取得できませんでした。", "No text file could be downloaded for this work."],
    ["この作品の本文を変換できませんでした。", "The downloaded text could not be converted."],
    ["作品がまだダウンロードされていません。", "The work has not been downloaded."],
    ["メモファイルを読み込めません", "Could not read the notes file"],
    ["メモファイルの形式が正しくありません。", "The notes file format is invalid."],
    ["メモ数の上限に達しています。", "The maximum number of notes has been reached."],
    ["Perseus Hopper の短い定義は辞書的な gloss であり、この文脈における訳語とは限りません。", "Perseus Hopper short definitions are dictionary glosses and may not be the appropriate translation in this context."],
    ["Perseus Hopper は可能な解析候補を列挙します。複数候補がある場合、この本文中の正解を自動的に一意化しているわけではありません。", "Perseus Hopper lists possible analyses. When several candidates exist, this application does not automatically determine the unique correct analysis for the passage."],
    ["ローカル lemma 候補は hib_lemmas.sql 由来です。完全一致がない場合は prefix fallback を含むため、確定した形態解析ではありません。", "Local lemma candidates come from hib_lemmas.sql. When no exact match exists, prefix fallback may be used, so these are not definitive morphological analyses."],
    ["Bare key と Beta Code は、検索・通信のためにこのアプリが生成した内部表現です。", "Bare key and Beta Code are internal representations generated by this application for search and communication."],
    ["short definitionなし は、データに短い語義がないことを示すUI上の表示です。", "“no short definition” means that the source data contains no short gloss."],
    ["再開すると未取得分から続行します。", "Restarting continues with uncached forms."],
  ];

  function translateCore(value) {
    if (language !== "en" || !value) return value;
    if (exact.has(value)) return exact.get(value);

    for (const [pattern, replacement] of patterns) {
      if (pattern.test(value)) return value.replace(pattern, replacement);
    }

    let result = value;
    for (const [source, target] of fragments) {
      if (result.includes(source)) {
        result = result.split(source).join(target);
      }
    }
    return result;
  }

  function translateTextNode(node) {
    const original = node.nodeValue;
    if (!original || !original.trim()) return;
    const match = original.match(/^(\s*)([\s\S]*?)(\s*)$/);
    const translated = translateCore(match[2]);
    const next = `${match[1]}${translated}${match[3]}`;
    if (next !== original) node.nodeValue = next;
  }

  function translateElement(element) {
    if (!(element instanceof Element)) return;
    if (element.closest("[data-no-i18n]")) return;

    for (const attribute of ["placeholder", "title", "aria-label"]) {
      if (element.hasAttribute(attribute)) {
        const original = element.getAttribute(attribute);
        const translated = translateCore(original);
        if (translated !== original) element.setAttribute(attribute, translated);
      }
    }

    if (
      element instanceof HTMLInputElement &&
      ["button", "submit", "reset"].includes(element.type) &&
      element.value
    ) {
      element.value = translateCore(element.value);
    }

    for (const child of element.childNodes) {
      if (child.nodeType === Node.TEXT_NODE) translateTextNode(child);
    }
  }

  function translateSubtree(root) {
    if (language !== "en") return;
    if (root.nodeType === Node.TEXT_NODE) {
      translateTextNode(root);
      return;
    }
    if (!(root instanceof Element) && root !== document) return;

    if (root instanceof Element) translateElement(root);
    const walker = document.createTreeWalker(
      root,
      NodeFilter.SHOW_ELEMENT | NodeFilter.SHOW_TEXT,
    );
    while (walker.nextNode()) {
      const node = walker.currentNode;
      if (node.nodeType === Node.TEXT_NODE) translateTextNode(node);
      else translateElement(node);
    }
  }

  function setLanguage(nextLanguage) {
    if (!SUPPORTED.has(nextLanguage)) return;
    window.localStorage.setItem(STORAGE_KEY, nextLanguage);

    try {
      window.webkit?.messageHandlers?.[MESSAGE_HANDLER]?.postMessage(nextLanguage);
    } catch {
      // External browsers do not expose the WebKit message handler.
    }

    const url = new URL(window.location.href);
    url.searchParams.set("lang", nextLanguage);
    window.location.replace(url.toString());
  }

  function installSelector() {
    if (!document.body?.classList.contains("library-body")) return;
    if (document.getElementById("plrLanguageSelect")) return;

    const wrapper = document.createElement("label");
    wrapper.className = "plr-language-switch";
    wrapper.setAttribute("data-no-i18n", "true");

    const label = document.createElement("span");
    label.textContent = language === "ja" ? "表示言語" : "Language";

    const select = document.createElement("select");
    select.id = "plrLanguageSelect";
    select.setAttribute("aria-label", language === "ja" ? "表示言語" : "Interface language");

    const english = document.createElement("option");
    english.value = "en";
    english.textContent = "English";

    const japanese = document.createElement("option");
    japanese.value = "ja";
    japanese.textContent = "日本語";

    select.append(english, japanese);
    select.value = language;
    select.addEventListener("change", () => setLanguage(select.value));
    wrapper.append(label, select);

    const host = document.querySelector(".library-header-actions");
    if (!host) return;
    host.appendChild(wrapper);
  }

  function installStyle() {
    if (document.getElementById("plrI18nStyle")) return;
    const style = document.createElement("style");
    style.id = "plrI18nStyle";
    style.textContent = `
      .plr-language-switch {
        display: inline-flex;
        align-items: center;
        gap: 0.45rem;
        margin-left: auto;
        font: inherit;
        white-space: nowrap;
      }
      .plr-language-switch span {
        font-size: 0.82rem;
        color: var(--muted, #6d6a63);
      }
      .plr-language-switch select {
        min-height: 2rem;
        border: 1px solid var(--line, #c8c3b8);
        border-radius: 0.4rem;
        background: var(--paper, #fffdf8);
        color: inherit;
        padding: 0.2rem 1.8rem 0.2rem 0.55rem;
        font: inherit;
      }
      @media (max-width: 760px) {
        .plr-language-switch {
          margin-left: 0;
        }
      }
    `;
    document.head.appendChild(style);
  }

  const nativeAlert = window.alert.bind(window);
  const nativeConfirm = window.confirm.bind(window);
  const nativePrompt = window.prompt.bind(window);

  window.alert = (message) => nativeAlert(translateCore(String(message ?? "")));
  window.confirm = (message) => nativeConfirm(translateCore(String(message ?? "")));
  window.prompt = (message, defaultValue) =>
    nativePrompt(translateCore(String(message ?? "")), defaultValue);

  function initialize() {
    document.documentElement.lang = language;
    installStyle();
    installSelector();

    if (language === "en") {
      document.title = translateCore(document.title);
      translateSubtree(document);
      const observer = new MutationObserver((mutations) => {
        for (const mutation of mutations) {
          if (mutation.type === "characterData") {
            translateTextNode(mutation.target);
          }
          for (const node of mutation.addedNodes) {
            translateSubtree(node);
          }
          if (mutation.type === "attributes" && mutation.target instanceof Element) {
            translateElement(mutation.target);
          }
        }
      });
      observer.observe(document.documentElement, {
        childList: true,
        subtree: true,
        characterData: true,
        attributes: true,
        attributeFilter: ["placeholder", "title", "aria-label", "value"],
      });
    }
  }

  window.PerseusI18n = {
    get language() {
      return language;
    },
    t: translateCore,
    setLanguage,
  };

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", initialize, { once: true });
  } else {
    initialize();
  }
})();
