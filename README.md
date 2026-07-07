# Perseus Local Reader

**Current version: 0.1.9**

Perseus Local Reader is a macOS reading environment for Greek and other classical texts distributed through the Perseus ecosystem. It keeps the user-facing experience simple: open the app, search the library, download a work, and read it locally with morphology, notes, highlights, and saved-data controls.

> [!IMPORTANT]
> `Perseus Local Reader.app` is not a standalone bundle. It uses the adjacent `.developer/` runtime directory in the extracted folder. Keep the entire extracted folder together. Do not move only the `.app` to another place.

## 日本語ガイド

### このアプリでできること

Perseus Local Reader は、Perseus Digital Library 系の古典語テキストを Mac 上で読むためのローカル読書アプリです。作品を一度ダウンロードすると、本文・翻訳・取得済み語形解析・メモは手元のフォルダ内に保存されます。

主な用途:

- 著者名・作品名から古典語テキストを探す
- 原文・英訳など、同じ作品の複数版をまとめて取得する
- 取得済み作品をオフラインで読む
- ギリシア語本文の単語をクリックして語形解析を見る
- 作品全体または選択範囲の未取得語形をまとめて取得する
- 単語や本文範囲にメモ、蛍光マーカー、お気に入りを付ける
- 保存済み本文・語形解析・メモを検索、編集、削除する
- アプリ内 Reader、既定ブラウザ、指定ブラウザのいずれかで開く
- アプリから更新を確認する

初期表示は English です。ライブラリ画面の言語セレクタ、またはアプリの **Settings... / 設定...** から **日本語** に切り替えられます。Reader 画面には、表示崩れを避けるため言語セレクタを置いていません。

### 動作環境

- macOS 13 Ventura 以降
- Apple Silicon Mac または Intel Mac
- `/usr/bin/python3` として実行できる Python 3
- 初回取得、作品追加、未取得語形解析、更新確認、更新時のインターネット接続

配布 ZIP に含まれる `.app` を使うだけなら、利用者が Swift や Xcode を入れる必要はありません。

### インストール

1. GitHub のリポジトリ画面で **Code -> Download ZIP** を選びます。
2. ZIP を解凍します。
3. 解凍された `perseus-local-reader-main/` フォルダを、丸ごと好きな場所に置きます。
4. `Perseus Local Reader.app` をダブルクリックします。

想定される最上位構成:

```text
perseus-local-reader-main/
+-- Perseus Local Reader.app
+-- README.md
+-- VERSION
+-- .developer/                 Finder では通常非表示
```

`.developer/` には Reader 本体、ローカルサーバー、保存データが入っています。Finder で見えなくても正常です。`.app` だけを `Applications` に移すと、Reader 本体や保存データを見つけられなくなることがあります。

### 初回起動で macOS に止められた場合

このアプリは現在 Apple Developer ID による公証をしていません。ad-hoc 署名のため、初回起動時に macOS Gatekeeper が止める場合があります。

1. 警告を閉じます。
2. **システム設定 -> プライバシーとセキュリティ** を開きます。
3. `Perseus Local Reader.app` に関する表示で **このまま開く** を選びます。
4. Mac のパスワードまたは Touch ID で承認します。
5. もう一度 `Perseus Local Reader.app` を開きます。

表示文言は macOS のバージョンにより少し異なります。

### 読書環境フォルダを求められた場合

通常は自動で見つかります。見つからない場合は、ZIP を解凍してできた最上位フォルダ、つまり `perseus-local-reader-main/` を選んでください。

選ばないもの:

- `Perseus Local Reader.app` そのもの
- `.developer/` フォルダ
- ZIP ファイル
- Downloads フォルダ全体

有効な読書環境フォルダには、少なくとも次のファイルがあります。

```text
.developer/scripts/server.py
.developer/app/data/catalog.json
```

### 基本的な使い方

1. `Perseus Local Reader.app` を開きます。
2. Reader が開いたら、ライブラリ画面で著者名・作品名を検索します。
3. 読みたい作品の取得ボタンを押します。
4. ダウンロードが終わったら作品を開きます。
5. Reader で版を切り替えたり、節・行単位で移動したり、作品内検索を使ったりできます。

作品の取得では、その作品に含まれる利用可能な版をまとめて取得します。たとえばギリシア語原文と英訳が catalog にある作品では、両方を保存します。

### Reader 画面

Reader では次の操作ができます。

- 原文・翻訳などの版を切り替える
- 巻・節・行など、作品データに応じた単位で移動する
- 前後のチャンクへ移動する
- 作品内を検索する
- 上部ツールバーを折りたたむ
- 文字サイズを小・標準・大・特大・カスタム値に変更する
- ギリシア語本文の単語をクリックして語形解析を見る
- メモ一覧へ移動する
- 保存データ管理画面へ移動する

文字サイズのカスタム値は 8-120 px の範囲です。設定はブラウザ側の `localStorage` に保存されます。

### 語形解析

ギリシア語本文の単語をクリックすると、右側の morph パネルにローカル語形解析ページが表示されます。未取得語形の場合は Perseus Hopper から取得し、以後はローカルキャッシュを使います。

語形解析に含まれうる情報:

- 見出し語
- 短い語義
- 品詞
- 格
- 数
- 性
- 人称
- 時制
- 法
- 態

注意点:

- 形態解析は候補一覧です。文脈上の唯一の正解を自動判定するものではありません。
- Perseus 側に候補がない語形は、取得しても空または不完全な結果になることがあります。
- ローカル lemma 候補は `hib_lemmas.sql` 由来の補助情報を含む場合があり、確定解析ではありません。

まとめて取得できるもの:

- 表示中の作品全体に現れる未取得語形
- Reader でドラッグ選択した範囲に含まれる未取得語形

まとめ取得は途中停止できます。停止した場合でも、すでに取得済みの語形は保存されます。

### メモ・蛍光マーカー・お気に入り

メモは単語単位と本文範囲の両方に付けられます。

単語メモ:

- 本文の単語をクリックします。
- morph パネルからメモを追加します。
- 適用範囲を選びます。
- 「クリックした箇所だけ」または「その作品内にある同一の完全一致語形すべて」を選べます。

本文範囲メモ:

- Reader の本文をドラッグして範囲選択します。
- メモを追加します。

メモ本文を空欄のまま保存すると、蛍光マーカーやお気に入りとして使えます。

メモ一覧では次の操作ができます。

- 引用部分、メモ本文、著者名、作品名、引用位置、語形、見出し語、短い語義で検索
- すべて・単語・文章範囲で絞り込み
- 更新日時、作成日時、作品順で並び替え
- 元の本文位置へ移動
- 編集、保存、個別削除
- 表示中メモの一括選択、一括削除

メモデータは次に保存されます。

```text
.developer/data/user/notes.json
```

保存時は一時ファイルを経由して置換するため、通常の保存処理で既存 JSON を直接上書きしません。

### 保存データ管理

ライブラリ画面右上の **保存データを管理** から開けます。

確認できるもの:

- ダウンロード済み本文の作品数と容量
- 取得済み語形解析の語形数と容量
- 本文と語形解析の合計容量
- 作品ごとの版数、本文容量、キャッシュ済み語形数
- 作品ごとの専用語形数と、他作品でも使われる共通語形数

削除できるもの:

- 選択した本文データ
- 選択した語形解析データ
- 選択した作品だけで使われる語形解析データ

作品単位の語形削除では、他のダウンロード済み作品でも使われる完全一致語形を保持します。本文、メモ、蛍光マーカーは削除しません。削除した本文や語形解析は、必要になったときに再取得できます。

### ローカルに保存されるデータ

```text
.developer/app/data/catalog.json          作品カタログ
.developer/app/data/texts/               ダウンロード済み本文 JSON
.developer/app/data/morph.json           語形解析キャッシュ
.developer/data/vendor/texts/            取得元 XML キャッシュ
.developer/data/vendor/morph_html/       Perseus morph HTML キャッシュ
.developer/data/vendor/                  その他 vendor データ
.developer/data/user/notes.json          メモ・蛍光マーカー・お気に入り
.developer/data/build/                   ログ・一時バックアップ
```

これらは現時点では `~/Library/Application Support` ではなく、Reader フォルダ内部に保存されます。フォルダ全体を削除すると、ダウンロード済み本文、語形解析、メモも失われます。

### オフラインで使える範囲

インターネットなしで使えるもの:

- 取得済み作品の本文と翻訳
- 取得済み語形解析
- 保存済みメモ、蛍光マーカー、お気に入り
- 保存データ管理

インターネットが必要なもの:

- まだ取得していない作品のダウンロード
- まだ取得していない語形解析の取得
- 更新確認と更新
- GitHub または Perseus からの新規データ取得

### アプリ内 Reader とブラウザ設定

標準設定では、Reader はアプリ内の `WKWebView` で開きます。アプリメニューの **Settings... / 設定...** から次を選べます。

- アプリ内で開く
- 既定のブラウザで開く
- macOS が URL 対応アプリとして認識している特定のブラウザやアプリで開く

選択内容は macOS の `UserDefaults` に保存されます。外部ブラウザで開いたタブは、Perseus Local Reader を終了しても自動では閉じません。

アプリ内 Reader のツールバー:

- 戻る
- 進む
- 再読み込み
- ライブラリ
- 設定
- 外部ブラウザで開く

Reader 内の `127.0.0.1` または `localhost` のリンクはアプリ内で開きます。それ以外の外部 URL は macOS の外部ブラウザへ渡します。

### 起動と終了

起動時の処理:

1. Reader ルートを特定します。
2. `/usr/bin/python3` でローカルサーバーを起動します。
3. 8000-8010 番ポートを昇順に試します。
4. `127.0.0.1` の URL が HTTP 200 を返すまで待ちます。
5. 設定された表示先で Reader を開きます。
6. バックグラウンドで更新を確認します。

サーバー起動コマンドの形:

```text
/usr/bin/python3 .developer/scripts/server.py <port> --parent-pid <swift-pid>
```

URL 例:

```text
http://127.0.0.1:8000/
http://127.0.0.1:8001/
```

ローカルサーバーは `127.0.0.1` のみに bind します。通常は `Perseus Local Reader.app` が動作している間だけローカルポートが開きます。Python サーバーは親 Swift プロセスを監視し、アイドルタイムアウトは 8 時間です。

### 更新

起動後の自動確認と、アプリの **更新を確認** からの手動確認があります。

更新確認先:

```text
https://raw.githubusercontent.com/sohma-kbysh/perseus-local-reader/main/VERSION
```

更新時に保持されるデータ:

```text
.developer/app/data/morph.json
.developer/app/data/texts/
.developer/data/vendor/
.developer/data/user/
```

Git checkout で使っている場合、更新処理は `git fetch origin main` と `git pull --ff-only origin main` を使います。利用者データ以外の未コミット変更がある場合は、安全のため更新を中止します。

Download ZIP 版では、GitHub から `main.zip` を取得して一時ディレクトリに展開し、利用者データを退避・復元しながらプログラム部分を置き換えます。`.app` は既存バンドルへ上書きマージせず、新しいバンドルとして置き換えます。

### トラブルシューティング

起動中のアプリを確認:

```bash
ps ax -o pid=,command= | grep '[P]erseusLocalReader'
```

ローカルサーバーのポートを確認:

```bash
lsof -nP -iTCP:8000-8010 -sTCP:LISTEN
```

サーバーログ:

```bash
tail -n 100 .developer/data/build/swift-app-server-*.log
```

更新ログ:

```bash
tail -n 200 .developer/data/build/swift-update.log
```

アプリの署名確認:

```bash
codesign --verify --deep --strict --verbose=2 \
  "Perseus Local Reader.app"
```

Python 3 の確認:

```bash
/usr/bin/python3 --version
```

同じ Bundle ID のアプリを複数の場所に置くと、macOS Launch Services が意図しないコピーを起動する場合があります。テスト時は実行ファイルを直接指定できます。

```bash
"/path/to/Perseus Local Reader.app/Contents/MacOS/PerseusLocalReader"
```

### 困ったとき

この README と GitHub URL を任意の LLM サービスに渡して、「macOS で Perseus Local Reader を起動したい」「読書環境フォルダの選び方を知りたい」「保存データを消さずに更新したい」など、具体的な状況を添えて聞くと解決しやすくなります。

---

# English Developer Documentation

## Project Scope

Perseus Local Reader 0.1.9 is a local-first macOS reader for texts discoverable through `PerseusDL/canonical-greekLit`. It combines:

- a static browser UI under `.developer/app`;
- a Python HTTP server under `.developer/scripts`;
- an AppKit/WebKit controller under `.developer/swift-app`;
- a repository-local data store under `.developer/app/data` and `.developer/data`;
- a self-update path for both Git checkouts and GitHub Download ZIP copies.

The distributed `.app` is intentionally thin. It locates the adjacent repository/runtime root, launches the Python server, and opens the local web UI. It does not embed the full web runtime or user data.

## Runtime Layout

```text
.developer/
+-- app/
|   +-- index.html              Library UI
|   +-- reader.html             Work reader
|   +-- morph.html              Local morphology panel/page
|   +-- notes.html              Notes manager
|   +-- data-manager.html       Saved-data manager
|   +-- *.js, *.css             Client implementation
|   +-- data/
|       +-- catalog.json        Generated work/version catalog
|       +-- morph.json          Morphology cache
|       +-- texts/              Downloaded work JSON files
+-- scripts/
|   +-- server.py               Local HTTP API and static file server
|   +-- text_store.py           Work download/conversion/cache layer
|   +-- tei_convert.py          TEI-to-reader JSON converter
|   +-- fetch_morph.py          Perseus Hopper morph fetch/parser
|   +-- merge_morph_cache.py    Update-time morph cache merge
|   +-- apply_swift_update.sh   Self-update helper
+-- swift-app/
|   +-- Package.swift
|   +-- Sources/PerseusLocalReader/main.swift
|   +-- build_app.sh
+-- data/
    +-- build/                  Logs, temporary backups, build artifacts
    +-- user/                   User-authored data
    +-- vendor/                 Upstream XML, morph HTML, auxiliary caches
```

User-visible top level:

```text
Perseus Local Reader.app
README.md
VERSION
.developer/
```

`.developer/` is hidden in Finder by convention but is part of the application runtime.

## macOS Controller Contract

The Swift controller:

- requires macOS 13.0 or later;
- uses AppKit and WebKit;
- detects a valid reader root by checking `.developer/scripts/server.py` and `.developer/app/data/catalog.json`;
- remembers a previously selected root in `UserDefaults`;
- launches `/usr/bin/python3 .developer/scripts/server.py <port> --parent-pid <swift-pid>`;
- tries ports `8000` through `8010`;
- waits for a successful local HTTP response before opening the Reader;
- opens the Reader in embedded `WKWebView`, the default browser, or a specific URL-capable application;
- stores the open target in `UserDefaults` key `readerOpenTarget`;
- stores the UI language in `UserDefaults` and synchronizes it to web `localStorage` key `perseusUiLanguage`;
- checks updates against the raw GitHub `VERSION` file with no-cache request headers;
- passes non-local URLs to the system browser when using embedded WebKit.

The embedded WebKit toolbar provides back, forward, reload, library, settings, and external-browser actions. JavaScript `alert`, `confirm`, and `prompt` are bridged to native dialogs.

## Local HTTP Server

`server.py` serves static files from `.developer/app` and exposes JSON APIs on `127.0.0.1` only. It also monitors the parent Swift PID when provided. The idle timeout is 8 hours.

Important endpoints:

```text
GET  /api/works
GET  /api/work/download/status?urn=<workUrn>
GET  /api/morph?form=<surface>&bare=<normalized>
GET  /api/morph/fetch-all/status
GET  /api/data/manager
GET  /api/notes

POST /api/work/download?urn=<workUrn>
POST /api/work/cancel?urn=<workUrn>
POST /api/morph/fetch-all?urn=<workUrn>
POST /api/morph/fetch-all/stop
POST /api/data/delete
POST /api/data/delete-work-morphs
POST /api/notes/save
POST /api/notes/delete
```

Long-running work downloads and whole-work morphology fetches run in background threads. Writes to `morph.json` are serialized by the server to avoid clobbering concurrent individual and batch morphology updates.

## Text Catalog and Work Storage

`catalog.json` is generated from Perseus metadata by `build_catalog.py`. Each catalog work has a URN, display metadata, and a list of available version URNs. Versions without a retrievable XML path are dropped during catalog generation so that the UI does not offer known-missing downloads.

`text_store.ensure_work(work_urn)` downloads every available version of a work from:

```text
https://raw.githubusercontent.com/PerseusDL/canonical-greekLit/master/data
```

For each version it:

1. resolves the version URN to a raw XML URL;
2. caches XML under `.developer/data/vendor/texts/`;
3. converts TEI into reader JSON with `tei_convert.py`;
4. writes one work-level JSON file under `.developer/app/data/texts/<work-id>.json`.

The final work JSON contains:

```json
{
  "workUrn": "...",
  "group": "...",
  "title": "...",
  "source": "PerseusDL/canonical-greekLit",
  "versions": []
}
```

Temporary output is written first and then atomically replaced, so failed conversion does not intentionally leave a partial work JSON as the final file.

## Morphology Storage

The canonical morphology cache is:

```text
.developer/app/data/morph.json
```

Its top-level `forms` object is keyed by exact surface form. A typical entry includes:

```json
{
  "form": "surface form",
  "bare": "normalized form",
  "beta": "Beta Code query",
  "analyses": [],
  "source": "Perseus Hopper morph",
  "fetched": true
}
```

`fetch_morph.py` converts Greek to Beta Code, requests Perseus Hopper morph HTML, caches the raw HTML under `.developer/data/vendor/morph_html/`, parses lemma and parse-table candidates, and writes the normalized JSON cache.

The morphology layer is candidate-based. It does not perform contextual disambiguation. Client code and documentation must avoid claiming that it identifies the single correct parse for a passage.

## Notes and Highlight Model

User-authored notes are stored in:

```text
.developer/data/user/notes.json
```

The server exposes note CRUD through `/api/notes`, `/api/notes/save`, and `/api/notes/delete`. The notes document has versioned shape:

```json
{
  "version": 1,
  "notes": []
}
```

Notes support two principal kinds:

- word notes, keyed by version/work/chunk/word identity or exact-form work-wide identity;
- passage notes, keyed by version/work/chunk/start/end range.

An empty note body is valid and is used by the UI as a highlight or favorite. The notes file is written through a temporary file and replacement rather than direct in-place overwrite.

## Saved-Data Manager

The saved-data manager reads downloaded text JSON files and `morph.json`, computes byte counts and per-work morphology usage, and supports:

- deleting selected work JSON files;
- deleting selected exact-form morphology entries;
- deleting only morphology used by selected works and not used by other downloaded works.

Work-scoped morphology deletion preserves exact forms shared with any non-selected downloaded work. It does not delete notes or highlights.

## Network Model

The local server binds only to:

```text
127.0.0.1
```

External network calls are limited to:

- GitHub raw content for catalog-source XML and update metadata;
- GitHub archive download during ZIP-based self-update;
- Perseus Hopper for missing morphology entries.

Downloaded works, cached morphology, and user notes remain available offline.

## Self-Update Semantics

The update check reads:

```text
https://raw.githubusercontent.com/sohma-kbysh/perseus-local-reader/main/VERSION
```

Requests use a timestamp query and no-cache headers to avoid stale raw responses.

For Git checkouts, the updater runs:

```bash
git fetch origin main
git pull --ff-only origin main
```

The Git path refuses to proceed when non-user-data changes are present. User data paths are treated specially:

```text
.developer/app/data/morph.json
.developer/app/data/texts/
.developer/data/user/
```

For Download ZIP copies, the updater downloads `main.zip`, extracts it to a temporary directory, backs up user data, replaces program files, replaces the `.app` as a complete bundle, strips problematic extended attributes, verifies the ad-hoc signature, restores preserved data, and relaunches the app.

Data intended to survive supported updates:

```text
.developer/app/data/morph.json
.developer/app/data/texts/
.developer/data/vendor/
.developer/data/user/
```

## Build and Release

Build the universal macOS app:

```bash
.developer/swift-app/build_app.sh
```

The build script:

- reads `VERSION`;
- builds `arm64` and `x86_64` release executables with SwiftPM;
- combines them with `lipo`;
- writes `Info.plist` with `CFBundleShortVersionString` and `CFBundleVersion` set from `VERSION`;
- copies an icon when available;
- strips extended attributes;
- ad-hoc signs the staged app;
- verifies the signature;
- emits a clean app and ZIP under `${PERSEUS_BUILD_OUTPUT:-$HOME/LocalBuilds/PerseusLocalReader/$VERSION}`.

Current signing command:

```bash
codesign --force --deep --sign - "Perseus Local Reader.app"
```

This is ad-hoc signing, not Developer ID signing or notarization.

## Developer Checks

Recommended local checks before release:

```bash
python3 -m py_compile .developer/scripts/server.py
python3 -m py_compile .developer/scripts/text_store.py
python3 -m py_compile .developer/scripts/fetch_morph.py
python3 -m py_compile .developer/scripts/tei_convert.py

node --check .developer/app/library.js
node --check .developer/app/reader.js
node --check .developer/app/reader-notes.js
node --check .developer/app/morph.js
node --check .developer/app/morph-notes.js
node --check .developer/app/notes.js
node --check .developer/app/data-manager.js
node --check .developer/app/i18n.js

/bin/zsh -n .developer/scripts/apply_swift_update.sh
/bin/zsh -n .developer/swift-app/build_app.sh

swift build --package-path .developer/swift-app -c release

codesign --verify --deep --strict --verbose=2 \
  "Perseus Local Reader.app"

/usr/libexec/PlistBuddy \
  -c 'Print :CFBundleShortVersionString' \
  "Perseus Local Reader.app/Contents/Info.plist"

cat VERSION
git diff --check
```

The app bundle version and `VERSION` must match in the release commit.

## Repository/Cloud Consistency Check

Before editing this README on 2026-07-07, the local checkout was fetched from `origin` and compared with `origin/main`. `HEAD` and `origin/main` both resolved to:

```text
99b009062326756acb10b633bd9de2a03dc7dddc
```

Both directional diffs were empty at that point, so the tracked local data and the GitHub `origin/main` data were identical before this README revision.
