# Perseus Local Reader

## 日本語版のガイド **(English explanation below)**

Perseus プロジェクトが公開しているデータを用いた、古典ギリシア語テキストのローカル読書環境です。Perseus Digital Library 所蔵のギリシア語作品(約800作品)とその翻訳を検索し、手元にダウンロードして読むことができます。**(English explanation below)**

## 使い方（使用者の方へ）

パソコンの専門知識がなくても使えます。プログラミングの知識も、何かを
インストールする作業も必要ありません。ここでは、はじめて使う方向けに
少していねいに手順を説明します。

### このアプリでできること

- **作品を探す**: 著者名や作品名で検索し(例: Plato, Homer, Ἀπολογία)、読みたい作品を選べます。
- **まとめてダウンロード**: 作品を開くと、その作品の全ての版(ギリシア語原文と英訳など)がまとめて保存されます。一度ダウンロードした作品は、以後インターネットなしで読めます。
- **原文と翻訳の切り替え**: 画面上部のタブで、ギリシア語原文と英訳を切り替えられます。
- **単語の文法情報**: ギリシア語の単語をクリックすると、その単語がどんな形(格・数・時制・人称など)で使われているのかがすぐに表示されます。紙の辞書や文法書をその都度引く手間を減らすための道具です。
- **作品内検索**: 開いている作品の中から単語や語句を検索できます。アクセント記号の有無は無視されるので、ἄνθρωπος は ανθρωπος でも見つかります。

最初から プラトン『ソクラテスの弁明』(*Apology*) がダウンロード済みで入っています。

### 1. アプリを開く

このフォルダの中にある、次のアプリを**ダブルクリック**してください。
（お使いの Mac の設定によっては、末尾の `.app` の部分が表示されず
「Open Perseus Local Reader」とだけ表示されることがあります。同じアプリです。）

```text
Open Perseus Local Reader.app
```


#### 「開発元を確認できないため開けません」と表示されたら

GitHub からダウンロードした ZIP を解凍して初めて起動する場合、通常は読書環境フォルダの選択画面より先に、macOS の安全確認が表示されます。

このアプリは Apple の審査を通っていない個人配布のアプリなので、初回起動時に
macOS が安全確認のためにブロックすることがあります。その場合は次の手順で開いてください。

1. 表示されたブロック画面（または通知）はそのまま閉じます。
2. Apple メニュー →「システム設定」→ 左側の「プライバシーとセキュリティ」を開きます。
3. 画面を下にスクロールし、「セキュリティ」欄にある
   「"Open Perseus Local Reader.app" がブロックされました」というメッセージの横の
   **「このまま開く」**ボタンをクリックします。
4. Mac のパスワード（または Touch ID）の入力を求められたら入力します。
5. もう一度 `Open Perseus Local Reader.app` をダブルクリックします。続いて、読書環境フォルダの選択画面が表示されます。

この確認は**最初の1回だけ**必要です。以降はダブルクリックだけで起動します。
`Update Perseus Local Reader.app` や `Close Perseus Local Reader.app` を初めて使うときも、
同様の手順が必要になる場合があります。

読書環境は `http://127.0.0.1:8000/` というアドレスで、あなたのパソコンの中だけで動作します。ダウンロードのとき以外、外部のサーバーにはデータを送信しません。

#### 初回起動時の「読書環境フォルダ」の選択

初めて `Open Perseus Local Reader.app` を開くと、**読書環境フォルダを選択する画面**が表示されます。これは正常な動作です。

この画面では、**GitHub からダウンロードした ZIP を解凍してできた、一番外側のフォルダを必ず選択してください。** 通常、フォルダ名は次のようになっています。

```text
perseus-local-reader-main
```

正しく選ぶフォルダは、開いたときに次のファイルが見えるフォルダです。

```text
perseus-local-reader-main/
├── Open Perseus Local Reader.app
├── Close Perseus Local Reader.app
├── Update Perseus Local Reader.app
├── README.md
└── .developer/                 （通常は Finder では非表示です）
```

**次のものを選ばないでください。**

- `Open Perseus Local Reader.app` そのもの
- `.developer` フォルダ
- `.developer` の中にある `app` や `scripts` フォルダ
- ZIP ファイルそのもの
- `Downloads` フォルダ全体

要するに、**解凍後にできた `perseus-local-reader-main` フォルダを、そのまま選択する**のが正解です。正しいフォルダを一度選ぶと、その場所が保存され、通常は次回以降もう一度選択する必要はありません。

ダブルクリックすると、あなたのパソコンの中だけで小さなプログラムが動き出し
（インターネット上のどこかにあるサーバーに接続するのではなく、いわば
あなたのパソコンの中に小さな図書館を一時的に開くようなイメージです）、
数秒後に自動的にブラウザ（Safari や Chrome など、ふだんウェブサイトを見る
のに使っているアプリ）が開きます。

もし数秒待ってもブラウザが開かない場合は、お使いのブラウザを自分で起動し、
アドレス欄に次のように入力してください。

```text
http://localhost:8000/
```

### 2. 作品を探して開く

最初に表示されるのは検索画面です。検索ボックスに著者名や作品名を入れるか、
著者の一覧から選んでください。

- **ダウンロード済みの作品**(緑の「✓ 取得済み」印)は、クリックするとすぐ開きます。
- **まだダウンロードしていない作品**は、クリックすると確認のうえダウンロードが始まります。
  作品の大きさによって数秒〜数分かかります。このときだけインターネット接続が必要です。

### 3. 本文を読み、単語を調べる

読書画面では、上部のタブで**ギリシア語原文と翻訳を切り替え**られます。
長い作品(ホメロスなど)は巻ごとに分かれており、「前/次」ボタンや巻の
選択メニューで移動できます。右上の番号は本文の節や行へのショートカットです。

ギリシア語本文では、意味や形がわからない**単語をクリック**してみてください。
画面の一部に小さなパネルが開き、その単語の見出し語(辞書に載っている基本形)や、
品詞・格・数・時制といった文法情報が表示されます。

その単語をこれまでに調べたことがあれば、パネルはすぐに開きます。まだ
一度も調べたことのない単語の場合は、情報を取りに行くために数秒かかったり、
一度だけインターネット接続が必要になったりすることがあります。一度調べた
単語は次からはすぐに表示されます(この記録は作品をまたいで共有されます)。

「Download」メニューから、開いている作品の全ての単語の文法情報を
まとめて取得しておくこともできます。取得しておけば、その作品は完全に
インターネットなしで学習に使えます。

### 4. 読み終えたら

ブラウザのタブやアプリのウィンドウは、好きなタイミングでそのまま閉じて
構いません。特別な終了操作は必要ありません。裏側で動いているプログラムは、
8時間ほど操作がないと自動的に止まるようになっているので、消し忘れを
心配する必要もありません。すぐに止めたい場合は `Close Perseus Local Reader.app` を
ダブルクリックしてください。

また読みたくなったら、もう一度 `Open Perseus Local Reader.app` をダブルクリック
するだけで大丈夫です。すでに開いていた場合にもう一度ダブルクリックしても、
問題は起きません。

### アップデートのしかた

GitHub 上の最新版に更新したいときは、次のアプリをダブルクリックしてください。

```text
Update Perseus Local Reader.app
```

これまでにダウンロードした作品と形態分析データ（単語の解析結果）はそのまま保持されつつ、GitHub から最新のファイル一式を取得し、読書環境を再度開いてくれます。

## いま何がローカルにあるか

- 作品カタログ(著者・作品・版の一覧)は `.developer/app/data/catalog.json` にローカル保存されています。
- ダウンロードした作品の本文は `.developer/app/data/texts/` に、作品ごとに1ファイルで保存されます(全言語版込み)。
- ギリシア語の単語をクリックすると、ローカルの「morph（形態）パネル」が開きます。調べた単語の解析結果は `.developer/app/data/morph.json` に蓄積され、全作品で共有されます。

---

以下は開発者向けの技術的な説明です（英語）。

# Perseus Local Reader (developer notes)

Local reading environment for the Greek texts (and their translations) of the
Perseus Digital Library, using openly distributed data from
`PerseusDL/canonical-greekLit`.

## For Readers

On macOS, double-click:

```text
Open Perseus Local Reader.app
```


On first launch, macOS may ask you to choose the reader environment folder.
Choose the **outermost folder created when you unzipped the download**—normally
`perseus-local-reader-main`, containing the three `.app` launchers, `README.md`,
and the hidden `.developer` folder. Do not choose the `.app` itself or the
`.developer` subfolder.

It starts the local reader and opens your browser. The reader stops itself
automatically after about 8 hours without access, or immediately via
`Close Perseus Local Reader.app`.

To update this folder from GitHub, double-click:

```text
Update Perseus Local Reader.app
```

The updater preserves downloaded works and locally cached morphology data,
pulls the latest files from GitHub, and opens the reader again.

The reader runs only on your own computer at `http://127.0.0.1:8000/` and
sends nothing anywhere else, except when downloading a work or an uncached
morphology entry.

## Architecture

- **Catalog** (`app/data/catalog.json`): generated at development time by
  `scripts/build_catalog.py` from the `__cts__.xml` metadata of
  `PerseusDL/canonical-greekLit` (sparse, blob-filtered clone — a few MB).
  Shipped with the repo; the library page searches it entirely offline.
- **Works on demand**: opening a work downloads *all* of its versions (Greek
  edition + translations) from raw.githubusercontent.com, converts each TEI
  XML with `scripts/tei_convert.py`, and stores one JSON per work under
  `app/data/texts/`. After that the work is fully offline. Plato's *Apology*
  (`tlg0059.tlg002.json`) ships pre-downloaded.
- **TEI conversion** handles prose (section; book.chapter.section), epic
  (book.line — one chunk per book), and drama (speakers, verse lines).
  Citation structure is read from the CTS `refsDecl`. Greek text gets
  word-level morph links; other languages render as plain text.
- **Morphology**: unchanged from the original design — Perseus Hopper morph
  pages fetched on demand (or in bulk per work), cached in
  `app/data/morph.json`, shared across works.

## Project Layout

```text
.developer/
  app/            static reader (served as-is)
    index.html    library: search / browse by author (catalog-driven)
    library.js
    reader.html   reader: version tabs, chunk nav, in-work search, morph panel
    reader.js
    morph.js/html/styles.css
    data/
      catalog.json     author/work/version catalog (build_catalog.py)
      texts/*.json     downloaded works (one file per work, all versions)
      morph.json       cached Perseus morphology, keyed by word form
  scripts/
    build_catalog.py       sparse-clones canonical-greekLit metadata and
                           regenerates catalog.json (development-time)
    tei_convert.py         generic TEI(EpiDoc) -> reader JSON converter
    text_store.py          on-demand download + convert + cache of works
    server.py              local server: static app + /api/work/* download
                           jobs + /api/morph/* lookups and per-work bulk fetch
    fetch_morph.py         morph fetch/cache; CLI: fetch_morph.py <work-id>
    merge_morph_cache.py   merges two morph.json caches (base + local)
    start_reader.sh / stop_reader.sh   background the server, track pid/log,
                           enforce the 8h idle shutdown
    update_reader.sh       git pull wrapper used by the updater app
    open_reader_app.jxa / stop_reader_app.jxa / update_reader_app.jxa
                           JXA sources compiled into the three .app launchers
  data/
    vendor/    (gitignored) canonical-greekLit-meta sparse clone, downloaded
               TEI XML cache (texts/), morph HTML cache, hib_lemmas.sql
    build/     (gitignored) runtime pid/log files
Open Perseus Local Reader.app/     end-user launcher at repo root
Close Perseus Local Reader.app/    stops the background server
Update Perseus Local Reader.app/   end-user updater at repo root
```

The `.app` bundles are thin JXA wrappers compiled with
`osacompile -l JavaScript -o "<Name>.app" <source>.jxa`; they locate this
checkout (handling the Gatekeeper quarantine/translocation case, using
`app/data/catalog.json` as the marker file) and shell out to the scripts
above. Recompile them after editing the `.jxa` sources.

## Running the Server

Preferred, matches what the `.app` launcher does (backgrounds the process,
writes a pid file, and self-terminates after 8h idle):

```sh
.developer/scripts/start_reader.sh 8000
.developer/scripts/stop_reader.sh
```

Or run it in the foreground for debugging:

```sh
python3 .developer/scripts/server.py 8000
```

Then open `http://localhost:8000/`.

## Regenerating the Catalog

```sh
python3 .developer/scripts/build_catalog.py          # clone/update metadata, rebuild
python3 .developer/scripts/build_catalog.py --no-fetch   # rebuild only
```

## Downloading a Work from the CLI

```sh
python3 .developer/scripts/text_store.py urn:cts:greekLit:tlg0012.tlg001
```

## Fetch Perseus Morph Data

When the reader is served with `server.py`, clicking an uncached word fetches
just that word form on demand. The Download menu in the reader can bulk-fetch
every form of the open work. From the CLI (work must be downloaded first):

```sh
python3 .developer/scripts/fetch_morph.py tlg0059.tlg002 --limit 20 --delay 2.0
```

Perseus may return `429 Too Many Requests`; the batch fetcher waits and
retries, and it is always safe to stop and resume — everything is cached in
`app/data/morph.json`.

To merge a morph cache built elsewhere (e.g. on another machine) back into
the tracked cache:

```sh
python3 .developer/scripts/merge_morph_cache.py .developer/app/data/morph.json path/to/local-morph.json
```

## Data Sources

- Texts and catalog metadata: `PerseusDL/canonical-greekLit` (TEI XML, CTS URNs)
- Morphology: Perseus Hopper morph service (cached per word form)
- Lemma short definitions: Perseus Hopper `hib_lemmas.sql` open-source dump
