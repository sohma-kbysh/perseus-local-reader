# Perseus Local Reader

**Current documented version: 0.1.9**

Perseus Local Reader は、Perseus Digital Library が公開している古典語テキストを、macOS 上のローカル環境で検索・取得・閲覧するための読書アプリです。

ギリシア語原文と翻訳の切り替え、作品内検索、節・行単位の移動、語形解析、メモ・お気に入り・蛍光マーカー、保存データ管理、アプリ内 Reader、自己更新を備えています。取得済みの本文・形態解析・メモはローカルに保存され、保存済みデータはオフラインでも利用できます。

> [!IMPORTANT]
> `Perseus Local Reader.app` は単独で完結するアプリではありません。解凍したフォルダ内の `.developer/` を実行時に使用します。原則として、解凍後のフォルダ全体を分離せず（つまりappだけ場所移動させたりとかしないで、何も動かさずに）保管してください。

**使い方がわかんなかったら、任意のAI(LLMサービス)にこのgithubのurlを添付して聞いてください。おそらく解決します。（詳細については以下の日本語ガイドの項目を参照されたい）**

## UI language / 表示言語

The interface defaults to **English**. Use the language selector in the Reader header or **Settings… → Interface Language** to switch between English and Japanese. Japanese mode preserves the pre-localization interface wording; this change adds English rather than further rewriting the Japanese UI.

初期表示は **English** です。Reader上部の言語セレクタ、または **Settings… → Interface Language** から English / 日本語を切り替えられます。日本語モードは従来のUI表記を維持し、今回の変更では追加の日本語化を行いません。

---

## 主な機能

### ライブラリと作品取得

- 著者名・作品名・版名による検索
- ギリシア語のアクセント・ダイアクリティカルマークを無視した検索
- 著者ごとの作品一覧
- ダウンロード済み作品の専用一覧
- 作品に含まれる原文・翻訳など、利用可能な全版の一括取得
- ダウンロード進捗表示、キャンセル、停止状態の検出
- 取得済み作品のオフライン閲覧

### Reader

- ギリシア語原文・英訳その他の版の切り替え
- 巻・節・行など、作品データに応じた単位での移動
- 前後チャンクへの移動
- 作品内全文検索
- 上部ツールバーの折りたたみ
- 本文文字サイズの変更
  - 小
  - 標準
  - 大
  - 特大
  - 8–120 px のカスタム値
- クリックしたギリシア語単語の形態解析表示
- 作品全体に現れる未取得語形の一括取得
- 選択範囲に含まれる未取得語形だけの取得
- 形態解析取得の途中停止

### メモ・お気に入り・蛍光マーカー

メモ機能は、単語単位と文章範囲の両方に対応しています。

- 単語をクリックし、形態解析パネルからメモを追加
- 単語マーカーの適用範囲を選択
  - クリックした箇所だけ
  - その作品内にある同一の完全一致語形すべて
- 本文をドラッグ選択して文章範囲へメモを追加
- メモを空欄で保存し、蛍光マーカー／お気に入りとして使用
- 保存済みメモの本文上での再表示
- メモ一覧から元の本文位置へ移動
- メモ一覧での検索
  - 引用部分
  - メモ本文
  - 著者名
  - 作品名
  - 引用位置
  - 語形
  - 見出し語
  - 短い語義
- 種類による絞り込み
  - すべて
  - 単語
  - 文章
- 並び替え
  - 更新日時が新しい順
  - 作成日時が新しい順
  - 作品順
- 一覧上での編集・保存・個別削除
- 表示中メモの一括選択・一括削除

メモデータは次に保存されます。

```text
.developer/data/user/notes.json
```

書き込みは一時ファイルを経由して置換されるため、通常の保存中に既存 JSON を直接上書きしません。

### 保存データ管理

ライブラリ画面右上の **保存データを管理** から利用できます。

- ダウンロード済み本文の作品数・容量を表示
- 取得済み語形解析の語形数・容量を表示
- 本文と語形解析の合計容量を表示
- 著者名・作品名・作品 ID・言語による本文検索
- 語形・正規化形・見出し語・短い語義による形態解析検索
- 表示中項目の一括選択・選択解除
- 選択した本文データの削除
- 選択した語形解析データの削除
- 形態解析一覧を 1 ページ 100 語形で表示
- 作品ごとの次の情報を表示
  - 版数
  - 使用中のキャッシュ済み語形数
  - その作品だけで使われる専用語形数
  - 他作品でも使われる共通語形数
  - 本文データ容量
- 選択した作品群で使われ、選択していないダウンロード済み作品では使われない語形だけを削除

作品単位の語形削除では、他のダウンロード済み作品でも使われる完全一致語形を保持します。本文、メモ、蛍光マーカーは削除しません。必要な本文・語形解析は後から再取得できます。

---

## macOS アプリ

### 表示先の選択

標準設定では、Reader をアプリ内の `WKWebView` で開きます。アプリメニューの **設定…** から次を選択できます。

- アプリ内で開く（推奨）
- 既定のブラウザで開く
- macOS が URL 対応アプリとして認識している特定のブラウザ／アプリで開く

選択内容は `UserDefaults` の `readerOpenTarget` に保存されます。

選択した外部ブラウザが見つからなくなった場合は、既定のブラウザへフォールバックし、設定も既定のブラウザへ戻します。

### アプリ内 Reader のツールバー

- 戻る
- 進む
- 再読み込み
- ライブラリ
- 設定
- 外部ブラウザで開く

ローカル Reader 内のリンクはアプリ内で開きます。`127.0.0.1` または `localhost` 以外の外部 URL は macOS の外部ブラウザへ渡します。

JavaScript の `alert`、`confirm`、`prompt` は、アプリ内 Reader でも macOS のダイアログとして表示されます。

### コントローラ

小型のコントローラ画面には次があります。

- **Readerを開く**
- **更新を確認**
- **終了**
- サーバー状態
- 現在のローカル URL

アプリ内 Reader を開くとコントローラは隠れますが、アプリメニューの **コントローラを表示** から再表示できます。

アプリ内 Reader のウィンドウを閉じると、アプリとローカルサーバーも終了します。外部ブラウザを選択した場合、ブラウザ側のタブはアプリ終了時に自動では閉じません。

---

# 日本語ガイド

## 1. 動作環境

- macOS 13 Ventura 以降
- Apple Silicon または Intel Mac
- `/usr/bin/python3` として実行できる Python 3
- 初回取得、作品追加、未取得形態解析、更新確認・更新時のインターネット接続

Swift コントローラは Swift tools version 5.9 を使用してビルドされています。配布 ZIP に含まれるビルド済み `.app` を使う場合、利用者が Swift をインストールする必要はありません。

## 2. インストール

GitHub のリポジトリ画面で **Code → Download ZIP** を選択し、ZIP を解凍します。

想定される最上位構成:

```text
perseus-local-reader-main/
├── Perseus Local Reader.app
├── README.md
├── VERSION
└── .developer/                 Finder では通常非表示
```

この最上位フォルダをそのまま保管してください。

## 3. 初回起動

`Perseus Local Reader.app` をダブルクリックします。

### Gatekeeper に拒否された場合

このアプリは現時点では Apple Developer ID による署名・公証を行っておらず、ad-hoc 署名です。そのため、初回起動時に macOS が拒否する場合があります。

1. 警告を閉じます。
2. **システム設定 → プライバシーとセキュリティ** を開きます。
3. `Perseus Local Reader.app` に関する表示で **このまま開く** を選びます。
4. Mac のパスワードまたは Touch ID で承認します。
5. もう一度アプリを開きます。

表示文言は macOS のバージョンにより異なります。

### 読書環境フォルダを求められた場合

アプリは起動時に次の順で Reader のルートを探します。

1. 実行中の `.app` が置かれているフォルダ
2. 前回 `UserDefaults` に保存した `readerRoot`

有効な Reader ルートには少なくとも次が必要です。

```text
.developer/scripts/server.py
.developer/app/data/catalog.json
```

自動検出に失敗した場合は、ZIP を解凍してできた最上位フォルダを選択してください。`.app` 自体、`.developer/`、ZIP ファイル、Downloads フォルダ全体は選択しません。

## 4. 起動時の処理

1. Reader ルートを特定します。
2. `/usr/bin/python3` でローカルサーバーを起動します。
3. 8000–8010 番ポートを昇順に試します。
4. `127.0.0.1` の URL が HTTP 200 を返すまで待機します。
5. 設定された表示先で Reader を開きます。
6. バックグラウンドで更新を確認します。

サーバー起動コマンド:

```text
/usr/bin/python3 .developer/scripts/server.py <port> --parent-pid <swift-pid>
```

表示 URL の例:

```text
http://127.0.0.1:8000/
http://127.0.0.1:8001/
```

## 5. 終了とローカルサーバー

サーバーは Swift アプリの子プロセスです。

- 通常終了時、Swift 側からサーバーへ終了要求を送信
- 一定時間終了しない場合は `SIGKILL`
- Python サーバー側でも親 Swift プロセスの PID を監視
- サーバーは `127.0.0.1` のみに bind
- アイドルタイムアウトは 8 時間

通常、`Perseus Local Reader.app` が動作している間だけローカルポートが開きます。

## 6. ローカル保存場所

### 作品カタログ

```text
.developer/app/data/catalog.json
```

### ダウンロード済み作品

```text
.developer/app/data/texts/
```

作品ごとの JSON に、取得済みの原文・翻訳などの版が保存されます。

### 形態解析キャッシュ

```text
.developer/app/data/morph.json
```

語形をキーとして保存され、複数作品間で共有されます。

### 取得元 XML・形態解析 HTML キャッシュ・メタデータ

```text
.developer/data/vendor/texts/
.developer/data/vendor/morph_html/
.developer/data/vendor/canonical-greekLit-meta/
```

### メモ・お気に入り・蛍光マーカー

```text
.developer/data/user/notes.json
```

### ログ・一時バックアップ

```text
.developer/data/build/
```

主なログ:

```text
swift-app-server-<port>.log
swift-update.log
```

これらは現時点では `~/Library/Application Support` ではなく、Reader ルートの内部に保存されます。フォルダ全体を削除すると、本文・形態解析・メモも失われます。

## 7. 形態解析の性質

形態解析は、対象語形に対して可能な解析候補を列挙するものです。文脈を使って唯一の解を確定する機能ではありません。

表示できる範囲で、次を含みます。

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

未取得語形は Perseus Hopper から取得し、以後ローカルキャッシュを利用します。

## 8. 自己更新

### 対応範囲

自己更新機構は 0.1.8 以降からの更新経路を対象として検証されています。0.1.6 以前の古いコピーは更新ヘルパー自体が旧版の可能性があるため、最新版 ZIP の再ダウンロードを推奨します。

### 更新確認

起動後の自動確認と、**更新を確認** による手動確認があります。

確認先:

```text
https://raw.githubusercontent.com/sohma-kbysh/perseus-local-reader/main/VERSION
```

GitHub Raw の古い応答を避けるため、実際のリクエストには毎回異なる時刻クエリを付け、次のキャッシュ制御を使用します。

```text
Cache-Control: no-cache, no-store, max-age=0
Pragma: no-cache
```

オフライン、タイムアウト、GitHub 障害時にも、保存済みデータによる読書は継続できます。

### 更新処理

更新を承認すると、更新ヘルパーを一時ディレクトリへコピーし、アプリ終了後も処理を継続します。

#### Git checkout の場合

```text
git fetch origin main
git pull --ff-only origin main
```

利用者データ以外の未コミット変更がある場合、安全のため更新を中止します。

#### Download ZIP の場合

1. GitHub から `main.zip` を取得
2. 一時ディレクトリへ展開
3. 利用者データを除外してプログラム部分を更新
4. `.app` は既存バンドルへ上書きマージせず、完全な別バンドルとしてコピー
5. FinderInfo、resource fork、quarantine などの拡張属性を除去
6. `codesign --verify --deep --strict` で検証
7. 旧アプリを一時退避
8. 新アプリへ置換
9. 失敗時は可能な範囲で旧アプリを復元
10. 配置後に再度署名検証
11. 更新後のアプリを再起動

### 更新時に保持されるデータ

```text
.developer/app/data/morph.json
.developer/app/data/texts/
.developer/data/vendor/
.developer/data/user/
```

`morph.json` とダウンロード済み本文は更新前に一時退避し、更新後に復元・統合します。`.developer/data/user/` も明示的に一時退避・復元します。

0.1.8 → 0.1.9 の ZIP 版更新試験では、アプリ更新、署名検証、`notes.json` および任意テストファイルのハッシュ一致を確認しています。

## 9. ネットワークとプライバシー

ローカル HTTP サーバーは次にのみ bind します。

```text
127.0.0.1
```

主な外部通信:

- GitHub から作品カタログ・メタデータ・更新情報を取得
- GitHub からアプリ更新 ZIP を取得
- Perseus から未取得本文または形態解析を取得

取得済みデータを読むだけの場合、外部通信は不要です。

## 10. トラブルシューティング

### 起動中のアプリを確認する

```bash
ps ax -o pid=,command= | grep '[P]erseusLocalReader'
```

同じ Bundle ID のアプリを複数場所に置くと、Launch Services が意図しないコピーを起動する場合があります。テスト時は実行ファイルを直接指定できます。

```bash
"/path/to/Perseus Local Reader.app/Contents/MacOS/PerseusLocalReader"
```

### サーバーのポートを確認する

```bash
lsof -nP -iTCP:8000-8010 -sTCP:LISTEN
```

### サーバーログ

```bash
tail -n 100 .developer/data/build/swift-app-server-*.log
```

### 更新ログ

```bash
tail -n 200 .developer/data/build/swift-update.log
```

### Git checkout で更新が拒否される

```bash
git status
```

利用者データ以外の未コミット変更を commit、stash、または破棄してください。

### アプリの署名を確認する

```bash
codesign --verify --deep --strict --verbose=2 \
  "Perseus Local Reader.app"
```

### Python 3 を確認する

```bash
/usr/bin/python3 --version
```

---

# 開発者向け

## 構成

```text
.developer/
├── app/                       Web UI とローカルデータ
├── scripts/                   Python サーバー、取得処理、更新処理
├── swift-app/                 AppKit / WebKit コントローラ
└── data/
    ├── build/                 ログ・一時バックアップ
    ├── user/                  メモ等の利用者データ
    └── vendor/                取得元データとキャッシュ
```

主要ファイル:

```text
.developer/app/index.html
.developer/app/library.js
.developer/app/reader.html
.developer/app/reader.js
.developer/app/reader-notes.js
.developer/app/morph.html
.developer/app/morph.js
.developer/app/morph-notes.js
.developer/app/notes.html
.developer/app/notes.js
.developer/app/data-manager.html
.developer/app/data-manager.js
.developer/scripts/server.py
.developer/scripts/apply_swift_update.sh
.developer/swift-app/Sources/PerseusLocalReader/main.swift
.developer/swift-app/build_app.sh
```

## ビルド

```bash
.developer/swift-app/build_app.sh
```

ビルドスクリプトは `VERSION` を読み、`CFBundleShortVersionString` と `CFBundleVersion` に設定し、リポジトリ直下の `Perseus Local Reader.app` を再生成します。

現時点の署名方式:

```text
codesign --force --deep --sign -
```

## 基本検査

```bash
python3 -m py_compile .developer/scripts/server.py

node --check .developer/app/library.js
node --check .developer/app/reader.js
node --check .developer/app/reader-notes.js
node --check .developer/app/morph.js
node --check .developer/app/morph-notes.js
node --check .developer/app/notes.js
node --check .developer/app/data-manager.js

/bin/zsh -n .developer/scripts/apply_swift_update.sh

swift build \
  --package-path .developer/swift-app \
  -c release

git diff --check
```

## リリース前確認

```bash
codesign --verify --deep --strict --verbose=2 \
  "Perseus Local Reader.app"

/usr/libexec/PlistBuddy \
  -c 'Print :CFBundleShortVersionString' \
  "Perseus Local Reader.app/Contents/Info.plist"

cat VERSION
```

アプリ内バージョンと `VERSION` を一致させ、同じ commit に含めてください。

---

# English summary

Perseus Local Reader 0.1.9 is a local macOS reading environment for classical texts distributed through the Perseus ecosystem.

Current features include:

- searchable author and work catalog;
- downloadable multi-version works;
- offline reading of downloaded content;
- version switching and citation-aware navigation;
- in-work search;
- clickable Greek morphology;
- whole-work and selection-based morphology fetching;
- adjustable text size;
- word and passage notes;
- empty-memo favorites/highlights;
- occurrence-only or work-wide exact-form word highlighting;
- searchable, editable, sortable, and bulk-deletable notes;
- saved-data inspection and deletion;
- work-scoped morphology deletion that preserves forms shared by other downloaded works;
- an embedded `WKWebView` reader;
- selectable embedded, default-browser, or specific-browser opening;
- local-only HTTP serving on `127.0.0.1`;
- signed-bundle verification during self-update;
- explicit preservation of downloaded texts, morphology, vendor caches, and user notes during supported updates.

The application is currently ad-hoc signed and not notarized with an Apple Developer ID. Keep the extracted repository folder intact because the `.app` uses the adjacent `.developer/` runtime directory.
