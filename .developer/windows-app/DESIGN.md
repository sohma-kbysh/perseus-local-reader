# Perseus Local Reader — Windows 対応設計書

Status: v1 実装中(2026-07-08 起工)
Owner: sohma / 実装: Claude(Fable 5 が根幹、定型部は Sonnet/Opus に委託可)

## 1. 目的と方針

macOS 版と同じ「解凍したフォルダ内で完結するローカル読書環境」を Windows で動かす。

- Python バックエンド(`server.py` / `text_store.py` / `tei_convert.py` / `fetch_morph.py`)と
  Web UI(`.developer/app/`)は **無改造で共有**する。監査の結果、OS 依存は
  `server.py` の親 PID 監視(旧 `os.kill(pid, 0)`)のみで、これはクロスプラットフォーム化済み。
  `open()` / `write_text()` は全箇所 `encoding="utf-8"` 明示済みで cp1252 問題はない。
- macOS の Swift シェル(`main.swift`)に相当する部分を **pywebview 製シェル
  `.developer/windows-app/shell.py`** で置き換える。pywebview は
  Windows では Edge WebView2、macOS では WKWebView を使うため、
  シェル自体は macOS 上でも開発・検証できる。
- 利用者に Python のインストールを要求しない。初回起動時に
  python.org の Windows embeddable package をフォルダ内にブートストラップする。

### 非目標(v1 ではやらない)

- Windows での自己更新(`apply_swift_update.sh` 相当)。v1 ではメニューから
  GitHub ページを開くだけ。更新は ZIP の取り直し(ユーザーデータ保全手順は README 参照)。
- コード署名 / SmartScreen 回避。README に「詳細情報 → 実行」の手順を記載して対応。
- macOS 版 Swift シェルの置き換え。macOS は従来どおり `.app` を使う。

## 2. 構成

```text
perseus-local-reader-main/
+-- Perseus Local Reader.bat        # Windows 用起動ランチャー(ダブルクリック起点)
+-- Perseus Local Reader.app        # macOS 用(従来どおり)
+-- .developer/
    +-- windows-app/
    |   +-- DESIGN.md               # 本書
    |   +-- shell.py                # pywebview シェル本体(クロスプラットフォーム)
    |   +-- bootstrap.ps1           # 初回起動時の Python ランタイム構築
    |   +-- requirements.txt        # ピン留めした依存(pywebview)
    +-- scripts/server.py           # 共有バックエンド(親PID監視をOS分岐化済み)
    +-- data/vendor/windows-runtime/
        +-- python/                 # ブートストラップされた embeddable Python
                                    # (data/vendor/ 配下なので .gitignore 済み・更新時保全対象)
```

起動フロー(Windows):

1. `Perseus Local Reader.bat` をダブルクリック。
2. `.developer/data/vendor/windows-runtime/python/python.exe` が無ければ
   `bootstrap.ps1` を実行(embeddable Python 展開 → pip 導入 → `requirements.txt` を
   ランタイムへインストール → WebView2 Runtime の存在確認)。
3. `pythonw.exe .developer/windows-app/shell.py` を起動(コンソール窓なし)。
4. shell.py がローカルサーバーを子プロセスとして起動し、Reader を表示。

## 3. shell.py の契約(main.swift からの移植対応表)

| macOS 版 | shell.py |
|---|---|
| Reader ルート特定(`NSOpenPanel` あり) | `Path(__file__).parents[2]` 固定。`scripts/server.py` と `app/data/catalog.json` の存在検証のみ。フォルダ選択 UI は不要(シェル自体がフォルダ内に居るため) |
| `/usr/bin/python3` でサーバー起動 | `sys.executable` で `server.py` を `subprocess.Popen`(Windows は `CREATE_NO_WINDOW`)。`--parent-pid` に自 PID を渡す |
| ポート 8000–8010 昇順試行、HTTP 200 待ち | 同一仕様。事前に socket bind で空きを確認 → 起動 → 200 をポーリング(30 秒でタイムアウト) |
| サーバーログ `swift-app-server-*.log` | `.developer/data/build/pyshell-server-<port>.log` |
| `UserDefaults`(`readerOpenTarget`, `uiLanguage`) | `.developer/data/user/shell_settings.json`(スキーマは §4) |
| 埋め込み WKWebView + ツールバー | pywebview ウィンドウ + アプリメニュー(戻る/進む/再読込/ライブラリ/外部ブラウザで開く/設定)。ラベルは「English / 日本語」併記で言語切替時のメニュー再構築を回避 |
| 既定ブラウザ・特定ブラウザで開く | `webbrowser.open()`(既定ブラウザのみ。ブラウザ列挙は Windows では廃止)。browser モード時は小さなステータス窓を残し「窓を閉じるとサーバー停止」 |
| `localStorage` への UI 言語同期(`perseusUiLanguage`) | ページ `loaded` 時に `evaluate_js` で同期(差分があれば setItem + reload) |
| 外部 URL は外部ブラウザへ | `loaded` 時に click インターセプタを注入し、非同一オリジンの `http(s)` リンクを `js_api.open_external`(= `webbrowser.open`)へ |
| JS alert/confirm/prompt のネイティブブリッジ | WebView2 / WKWebView が自前ダイアログを出すため pywebview 側の実装不要(要 Windows 実機確認) |
| 自己更新 | v1 では「更新を確認 / GitHub を開く」メニュー → リポジトリページを外部ブラウザで開くのみ |

CLI: `shell.py [--check] [--target embedded|browser]`
`--check` は GUI を開かずに「ルート検証 → サーバー起動 → HTTP 200 → /api/works 取得 → 停止」を行い
終了コードで結果を返す(CI・非 Windows 環境での回帰確認用)。

## 4. shell_settings.json スキーマ

```json
{
  "version": 1,
  "openTarget": "embedded",   // "embedded" | "browser"
  "uiLanguage": ""            // "" (未設定) | "en" | "ja"
}
```

- 置き場所: `.developer/data/user/shell_settings.json`(更新時保全パス内・gitignore 済み)
- 書き込みは一時ファイル経由の `os.replace`(notes.json と同じ流儀)

## 5. server.py への変更(実施済み)

`start_parent_shutdown_watch` の生存確認を `pid_is_alive()` に分離。
POSIX は従来どおり `os.kill(pid, 0)`、Windows は
`OpenProcess(PROCESS_QUERY_LIMITED_INFORMATION)` + `GetExitCodeProcess == STILL_ACTIVE`。
旧実装の `os.kill(pid, 0)` は Windows では **TerminateProcess として働き親を殺す**ため、
この分岐なしに Windows で `--parent-pid` を渡してはならない。

## 6. bootstrap.ps1 の仕様(委託タスク)

- 対象: Windows 10/11 x64。`-NoProfile -ExecutionPolicy Bypass` で .bat から呼ばれる。
- ピン留め: Python 3.12 系 embeddable amd64(python.org 公式 URL)、`requirements.txt` は `pywebview` をバージョン固定。
- 手順: TLS1.2 強制 → embeddable zip をダウンロード → `windows-runtime/python/` に展開 →
  `python3XX._pth` の `#import site` を有効化 → `get-pip.py`(bootstrap.pypa.io)で pip 導入 →
  `python -m pip install -r requirements.txt` → WebView2 Runtime をレジストリで確認、
  無ければ案内メッセージと Microsoft 公式ページ誘導。
- 冪等であること(再実行しても壊れない)。進捗メッセージは英日併記。
- 失敗時は原因と対処を表示して非ゼロ終了。.bat 側はそれを検知して pause。

## 7. Windows 実機での検証チェックリスト(未実施)

- [ ] bootstrap.ps1 がクリーンな Windows 11 で完走する
- [ ] `Perseus Local Reader.bat` → Reader 表示まで到達する
- [ ] 作品ダウンロード・語形解析・メモ保存(ギリシャ語含む)が UTF-8 で往復する
- [ ] シェル強制終了(タスクマネージャ)後、サーバーが数秒で自動終了する(親PID監視)
- [ ] JS confirm/alert(メモ削除確認など)が WebView2 で表示される
- [ ] 範囲選択メモ(mouseup 依存)がマウス操作で動く(タッチは対象外)
- [ ] `openTarget: "browser"` モードでステータス窓を閉じるとサーバーが止まる
- [ ] パスにスペース・日本語を含むフォルダでも起動する

## 8. 将来タスク(委託可能な粒度で)

| タスク | 難度 | 前提 |
|---|---|---|
| Windows 自己更新(ZIP 取得→ユーザーデータ退避→置換)を Python で実装し macOS と共通化 | 中 | §2 のパス契約 |
| shell.py の言語切替をメニュー再構築で完全対応 | 小 | pywebview の menu API 制約確認 |
| 範囲選択メモの `mouseup` → `selectionchange` 統一(タッチ・将来の iOS 対応の布石) | 小 | reader-notes.js:207 |
| PyInstaller 等での単一 exe 化(ブートストラップ廃止) | 中 | 配布サイズと SmartScreen の兼ね合い |
