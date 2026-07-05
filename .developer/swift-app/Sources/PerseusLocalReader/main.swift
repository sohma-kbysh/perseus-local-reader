import AppKit
import Foundation
import Darwin
import WebKit

private let repositoryOwner = "sohma-kbysh"
private let repositoryName = "perseus-local-reader"
private let updateBranch = "main"
private let repositoryURLString =
    "https://github.com/\(repositoryOwner)/\(repositoryName)"
private let defaultPort = 8000
private let readerOpenTargetKey = "readerOpenTarget"
private let embeddedReaderTarget = "embedded"
private let defaultBrowserTarget = "default-browser"
private let browserTargetPrefix = "browser:"

private let uiLanguageKey = "uiLanguage"
private let englishUILanguage = "en"
private let japaneseUILanguage = "ja"
private let webLanguageMessageName = "plrLanguage"

private let nativeLocalizationPairs: [(String, String)] = [
    ("Perseus Local Reader について", "About Perseus Local Reader"),
    ("設定…", "Settings…"),
    ("コントローラを表示", "Show Controller"),
    ("Readerを開く", "Open Reader"),
    ("アップデートを確認…", "Check for Updates…"),
    ("GitHub リポジトリを開く", "Open GitHub Repository"),
    ("Perseus Local Readerを隠す", "Hide Perseus Local Reader"),
    ("ほかを隠す", "Hide Others"),
    ("すべてを表示", "Show All"),
    ("Perseus Local Readerを終了", "Quit Perseus Local Reader"),
    ("ウインドウ", "Window"),
    ("しまう", "Minimize"),
    ("すべてを手前に移動", "Bring All to Front"),
    ("不明", "Unknown"),
    ("Perseus Digital Library の公開データを利用した、古典ギリシア語のローカル読書環境です。", "A local reading environment for Classical Greek using public data from the Perseus Digital Library."),
    ("Perseus Local Reader 設定", "Perseus Local Reader Settings"),
    ("表示言語", "Interface Language"),
    ("アプリとReaderの表示言語を選択します。初期設定は英語です。", "Choose the interface language for the application and Reader. English is the default."),
    ("Readerを開く場所", "Where to Open the Reader"),
    ("標準ではアプリ内のReaderで開きます。既定のブラウザ、またはこのMacにインストールされている特定のブラウザ・URL対応アプリを選択できます。", "By default, the Reader opens inside the application. You may instead choose the default browser or a specific installed browser or URL-capable application."),
    ("アプリ内で開く（推奨）", "Open Inside the App (Recommended)"),
    ("既定のブラウザで開く", "Open in the Default Browser"),
    ("言語設定はすぐに反映され、次回起動時にも保持されます。Readerの表示先は次回起動時と「Readerを開く」に反映されます。外部ブラウザを選んだ場合、そのブラウザのタブはPerseus Local Reader終了時に自動では閉じません。", "The language setting is applied immediately and retained for future launches. The Reader destination is applied on the next launch and when you choose ‘Open Reader.’ Tabs opened in an external browser are not closed automatically when Perseus Local Reader quits."),
    ("閉じる", "Close"),
    ("選択したブラウザが見つかりません", "The selected browser could not be found"),
    ("既定のブラウザで開きます。設定も既定のブラウザへ変更しました。", "The page will open in the default browser, and the setting has been changed to the default browser."),
    ("選択したブラウザで開けませんでした", "The page could not be opened in the selected browser"),
    ("戻る", "Back"),
    ("進む", "Forward"),
    ("再読み込み", "Reload"),
    ("ライブラリ", "Library"),
    ("設定", "Settings"),
    ("外部ブラウザで開く", "Open in External Browser"),
    ("確認", "Confirm"),
    ("キャンセル", "Cancel"),
    ("入力", "Input"),
    ("起動準備中…", "Preparing to start…"),
    ("更新を確認", "Check for Updates"),
    ("終了", "Quit"),
    ("読書環境フォルダを選択", "Select the Reader Folder"),
    ("ZIPを解凍してできた一番外側のフォルダを選んでください。\n通常は “perseus-local-reader-main” です。", "Select the outermost folder created by extracting the ZIP archive.\nIt is normally named “perseus-local-reader-main”."),
    ("このフォルダを選択", "Select This Folder"),
    ("読書環境が見つかりません", "Reader environment not found"),
    ("Perseus Local Reader.app、README.md、.developer が入っている\n一番外側のフォルダを選んでください。", "Select the outermost folder containing Perseus Local Reader.app, README.md, and .developer."),
    ("ローカルサーバーを起動中…", "Starting the local server…"),
    ("ログ用フォルダを作成できませんでした", "Could not create the log directory"),
    ("ローカルサーバーを起動できませんでした", "Could not start the local server"),
    ("8000〜8010番ポートを利用できませんでした。", "None of ports 8000 through 8010 were available."),
    ("サーバーの起動を確認できませんでした", "Could not confirm that the server started"),
    ("更新を確認中…", "Checking for updates…"),
    ("更新を確認できませんでした。オフラインでも読書は続けられます。", "Could not check for updates. You can continue reading offline."),
    ("更新を確認できませんでした", "Could not check for updates"),
    ("オフラインでも、保存済みの内容はそのまま読めます。", "Saved content remains available offline."),
    ("最新版です", "Up to date"),
    ("更新する", "Update"),
    ("あとで", "Later"),
    ("更新処理を開始できませんでした", "Could not start the update process"),
    ("更新ヘルパーが見つかりません", "Update helper not found"),
    ("更新を開始します…", "Starting the update…")
]

private let nativeLocalizationFragments: [(String, String)] = [
    ("最新版です（", "Up to date ("),
    ("）", ")"),
    (" を使用しています。", " is installed."),
    ("新しいバージョン ", "Version "),
    (" が利用できます", " is available"),
    ("現在のバージョンは ", "Current version: "),
    (" です。今すぐ更新しますか？", ". Update now?")
]

final class AppDelegate: NSObject, NSApplicationDelegate, NSWindowDelegate,
    WKNavigationDelegate, WKUIDelegate, WKScriptMessageHandler {
    private var window: NSWindow!
    private var statusLabel: NSTextField!
    private var addressLabel: NSTextField!
    private var openButton: NSButton!
    private var updateButton: NSButton!
    private var serverProcess: Process?
    private var serverLogHandle: FileHandle?
    private var readerRoot: URL?
    private var readerURL: URL?
    private var webView: WKWebView?
    private var readerWindow: NSWindow?
    private var settingsWindow: NSWindow?
    private var browserPopup: NSPopUpButton?
    private var languagePopup: NSPopUpButton?

    func applicationDidFinishLaunching(_ notification: Notification) {
        NSApp.setActivationPolicy(.regular)
        buildApplicationMenu()
        buildWindow()
        applyNativeLanguage()
        NSApp.activate(ignoringOtherApps: true)

        guard let root = locateReaderRoot() else {
            NSApp.terminate(nil)
            return
        }

        readerRoot = root
        UserDefaults.standard.set(root.path, forKey: "readerRoot")
        startServer()
    }

    func applicationShouldTerminateAfterLastWindowClosed(_ sender: NSApplication) -> Bool {
        true
    }

    func applicationWillTerminate(_ notification: Notification) {
        stopServer()
    }

    func windowWillClose(_ notification: Notification) {
        guard let closingWindow = notification.object as? NSWindow else {
            return
        }

        if closingWindow === readerWindow {
            NSApp.terminate(nil)
            return
        }

        // 外部ブラウザ表示ではコントローラが唯一のメインウィンドウ。
        if readerWindow == nil && closingWindow === window {
            NSApp.terminate(nil)
        }
    }


    private func currentUILanguage() -> String {
        let stored = UserDefaults.standard.string(forKey: uiLanguageKey)
        return stored == japaneseUILanguage
            ? japaneseUILanguage
            : englishUILanguage
    }

    private func L(_ value: String) -> String {
        let useJapanese = currentUILanguage() == japaneseUILanguage

        for (japanese, english) in nativeLocalizationPairs {
            if value == japanese || value == english {
                return useJapanese ? japanese : english
            }
        }

        var result = value
        for (japanese, english) in nativeLocalizationFragments {
            if useJapanese {
                result = result.replacingOccurrences(of: english, with: japanese)
            } else {
                result = result.replacingOccurrences(of: japanese, with: english)
            }
        }
        return result
    }

    private func localizedReaderURL(_ url: URL) -> URL {
        guard var components = URLComponents(
            url: url,
            resolvingAgainstBaseURL: false
        ) else {
            return url
        }

        var queryItems = components.queryItems ?? []
        queryItems.removeAll { $0.name == "lang" }
        queryItems.append(
            URLQueryItem(name: "lang", value: currentUILanguage())
        )
        components.queryItems = queryItems
        return components.url ?? url
    }

    private func relocalizeMenu(_ menu: NSMenu?) {
        guard let menu else { return }
        menu.title = L(menu.title)
        for item in menu.items {
            item.title = L(item.title)
            relocalizeMenu(item.submenu)
        }
    }

    private func relocalizeView(_ view: NSView) {
        if let popup = view as? NSPopUpButton {
            relocalizeMenu(popup.menu)
        } else if let button = view as? NSButton {
            button.title = L(button.title)
            if let toolTip = button.toolTip {
                button.toolTip = L(toolTip)
            }
        } else if let label = view as? NSTextField, !label.isEditable {
            label.stringValue = L(label.stringValue)
        }

        for subview in view.subviews {
            relocalizeView(subview)
        }
    }

    private func relocalizeWindow(_ target: NSWindow?) {
        guard let target else { return }
        target.title = L(target.title)
        if let contentView = target.contentView {
            relocalizeView(contentView)
        }
    }

    private func applyNativeLanguage() {
        relocalizeMenu(NSApp.mainMenu)
        relocalizeWindow(window)
        relocalizeWindow(readerWindow)
        relocalizeWindow(settingsWindow)
    }

    private func syncEmbeddedWebLanguage(_ language: String) {
        guard let webView else { return }
        let script = """
        localStorage.setItem('perseusUiLanguage', '\(language)');
        const url = new URL(window.location.href);
        url.searchParams.set('lang', '\(language)');
        window.location.replace(url.toString());
        """
        webView.evaluateJavaScript(script)
    }

    @objc private func uiLanguageChanged(_ sender: NSPopUpButton) {
        guard let language =
                sender.selectedItem?.representedObject as? String,
              language == englishUILanguage ||
                language == japaneseUILanguage
        else {
            return
        }

        UserDefaults.standard.set(language, forKey: uiLanguageKey)
        applyNativeLanguage()
        syncEmbeddedWebLanguage(language)
    }

    func userContentController(
        _ userContentController: WKUserContentController,
        didReceive message: WKScriptMessage
    ) {
        guard message.name == webLanguageMessageName,
              let language = message.body as? String,
              language == englishUILanguage ||
                language == japaneseUILanguage
        else {
            return
        }

        UserDefaults.standard.set(language, forKey: uiLanguageKey)
        applyNativeLanguage()
    }

    private func buildApplicationMenu() {
        let applicationName = "Perseus Local Reader"

        let mainMenu = NSMenu()
        let applicationMenuItem = NSMenuItem()
        mainMenu.addItem(applicationMenuItem)

        let applicationMenu = NSMenu(title: applicationName)

        let aboutItem = NSMenuItem(
            title: "\(applicationName) について",
            action: #selector(showAboutPanel),
            keyEquivalent: ""
        )
        aboutItem.target = self
        applicationMenu.addItem(aboutItem)

        applicationMenu.addItem(.separator())

        let settingsItem = NSMenuItem(
            title: "設定…",
            action: #selector(showSettings),
            keyEquivalent: ","
        )
        settingsItem.target = self
        applicationMenu.addItem(settingsItem)

        let controllerItem = NSMenuItem(
            title: "コントローラを表示",
            action: #selector(showControllerWindow),
            keyEquivalent: ""
        )
        controllerItem.target = self
        applicationMenu.addItem(controllerItem)

        applicationMenu.addItem(.separator())

        let openReaderItem = NSMenuItem(
            title: "Readerを開く",
            action: #selector(openReader),
            keyEquivalent: "o"
        )
        openReaderItem.target = self
        applicationMenu.addItem(openReaderItem)

        let updateItem = NSMenuItem(
            title: "アップデートを確認…",
            action: #selector(checkUpdatesManually),
            keyEquivalent: ""
        )
        updateItem.target = self
        applicationMenu.addItem(updateItem)

        let githubItem = NSMenuItem(
            title: "GitHub リポジトリを開く",
            action: #selector(openGitHubRepository),
            keyEquivalent: ""
        )
        githubItem.target = self
        applicationMenu.addItem(githubItem)

        applicationMenu.addItem(.separator())

        let hideItem = NSMenuItem(
            title: "\(applicationName)を隠す",
            action: #selector(NSApplication.hide(_:)),
            keyEquivalent: "h"
        )
        hideItem.target = NSApp
        applicationMenu.addItem(hideItem)

        let hideOthersItem = NSMenuItem(
            title: "ほかを隠す",
            action: #selector(NSApplication.hideOtherApplications(_:)),
            keyEquivalent: "h"
        )
        hideOthersItem.keyEquivalentModifierMask = [.command, .option]
        hideOthersItem.target = NSApp
        applicationMenu.addItem(hideOthersItem)

        let showAllItem = NSMenuItem(
            title: "すべてを表示",
            action: #selector(NSApplication.unhideAllApplications(_:)),
            keyEquivalent: ""
        )
        showAllItem.target = NSApp
        applicationMenu.addItem(showAllItem)

        applicationMenu.addItem(.separator())

        let quitItem = NSMenuItem(
            title: "\(applicationName)を終了",
            action: #selector(NSApplication.terminate(_:)),
            keyEquivalent: "q"
        )
        quitItem.target = NSApp
        applicationMenu.addItem(quitItem)

        applicationMenuItem.submenu = applicationMenu

        let windowMenuItem = NSMenuItem()
        mainMenu.addItem(windowMenuItem)

        let windowMenu = NSMenu(title: "ウインドウ")
        let minimizeItem = NSMenuItem(
            title: "しまう",
            action: #selector(NSWindow.performMiniaturize(_:)),
            keyEquivalent: "m"
        )
        windowMenu.addItem(minimizeItem)

        let bringAllToFrontItem = NSMenuItem(
            title: "すべてを手前に移動",
            action: #selector(NSApplication.arrangeInFront(_:)),
            keyEquivalent: ""
        )
        bringAllToFrontItem.target = NSApp
        windowMenu.addItem(bringAllToFrontItem)

        windowMenuItem.submenu = windowMenu
        NSApp.windowsMenu = windowMenu
        NSApp.mainMenu = mainMenu
    }

    @objc private func showAboutPanel() {
        let version =
            Bundle.main.object(forInfoDictionaryKey: "CFBundleShortVersionString")
            as? String ?? L("不明")

        let build =
            Bundle.main.object(forInfoDictionaryKey: "CFBundleVersion")
            as? String ?? version

        let credits = NSMutableAttributedString(
            string: L(
                "Perseus Digital Library の公開データを利用した、"
                + "古典ギリシア語のローカル読書環境です。"
            )
                + "\n\nVersion \(version)  (Build \(build))"
        )

        NSApp.orderFrontStandardAboutPanel(options: [
            .applicationName: "Perseus Local Reader",
            .applicationVersion: version,
            .version: "Version \(version)",
            .credits: credits,
        ])
        NSApp.activate(ignoringOtherApps: true)
    }

    @objc private func openGitHubRepository() {
        guard let url = URL(string: repositoryURLString) else {
            return
        }
        NSWorkspace.shared.open(url)
    }

    private func currentReaderOpenTarget() -> String {
        UserDefaults.standard.string(forKey: readerOpenTargetKey)
            ?? embeddedReaderTarget
    }

    private func availableBrowserApplications() -> [
        (name: String, bundleIdentifier: String, url: URL)
    ] {
        guard let probeURL = URL(string: "https://example.com/") else {
            return []
        }

        let ownBundleIdentifier = Bundle.main.bundleIdentifier
        var seen = Set<String>()
        var applications: [(String, String, URL)] = []

        for applicationURL in NSWorkspace.shared.urlsForApplications(
            toOpen: probeURL
        ) {
            guard let bundle = Bundle(url: applicationURL),
                  let bundleIdentifier = bundle.bundleIdentifier,
                  bundleIdentifier != ownBundleIdentifier,
                  seen.insert(bundleIdentifier).inserted
            else {
                continue
            }

            let displayName =
                bundle.object(
                    forInfoDictionaryKey: "CFBundleDisplayName"
                ) as? String
                ?? bundle.object(
                    forInfoDictionaryKey: "CFBundleName"
                ) as? String
                ?? applicationURL.deletingPathExtension().lastPathComponent

            applications.append(
                (displayName, bundleIdentifier, applicationURL)
            )
        }

        return applications.sorted {
            $0.0.localizedCaseInsensitiveCompare($1.0) == .orderedAscending
        }
    }

    @objc private func showControllerWindow() {
        window.makeKeyAndOrderFront(nil)
        NSApp.activate(ignoringOtherApps: true)
    }

    @objc private func showSettings() {
        if let settingsWindow {
            settingsWindow.makeKeyAndOrderFront(nil)
            NSApp.activate(ignoringOtherApps: true)
            return
        }

        let settings = NSWindow(
            contentRect: NSRect(x: 0, y: 0, width: 560, height: 390),
            styleMask: [.titled, .closable],
            backing: .buffered,
            defer: false
        )
        settings.title = "Perseus Local Reader 設定"
        settings.center()
        settings.isReleasedWhenClosed = false

        let languageHeading = NSTextField(labelWithString: "表示言語")
        languageHeading.font = .systemFont(ofSize: 17, weight: .semibold)

        let languageExplanation = NSTextField(
            wrappingLabelWithString:
                "アプリとReaderの表示言語を選択します。初期設定は英語です。"
        )
        languageExplanation.textColor = .secondaryLabelColor

        let languageSelector = NSPopUpButton(
            frame: .zero,
            pullsDown: false
        )
        languageSelector.addItem(withTitle: "English")
        languageSelector.lastItem?.representedObject = englishUILanguage
        languageSelector.addItem(withTitle: "日本語")
        languageSelector.lastItem?.representedObject = japaneseUILanguage

        if currentUILanguage() == japaneseUILanguage {
            languageSelector.selectItem(at: 1)
        } else {
            languageSelector.selectItem(at: 0)
        }

        languageSelector.target = self
        languageSelector.action = #selector(uiLanguageChanged(_:))
        languagePopup = languageSelector

        let separator = NSBox()
        separator.boxType = .separator

        let heading = NSTextField(labelWithString: "Readerを開く場所")
        heading.font = .systemFont(ofSize: 17, weight: .semibold)

        let explanation = NSTextField(
            wrappingLabelWithString:
                "標準ではアプリ内のReaderで開きます。"
                + "既定のブラウザ、またはこのMacにインストールされている"
                + "特定のブラウザ・URL対応アプリを選択できます。"
        )
        explanation.textColor = .secondaryLabelColor

        let popup = NSPopUpButton(frame: .zero, pullsDown: false)
        popup.addItem(withTitle: "アプリ内で開く（推奨）")
        popup.lastItem?.representedObject = embeddedReaderTarget

        popup.addItem(withTitle: "既定のブラウザで開く")
        popup.lastItem?.representedObject = defaultBrowserTarget

        let browserApplications = availableBrowserApplications()
        if !browserApplications.isEmpty {
            popup.menu?.addItem(.separator())
        }

        for application in browserApplications {
            popup.addItem(withTitle: application.name)
            popup.lastItem?.representedObject =
                browserTargetPrefix + application.bundleIdentifier
        }

        let currentTarget = currentReaderOpenTarget()
        if let matchingItem = popup.itemArray.first(where: {
            ($0.representedObject as? String) == currentTarget
        }) {
            popup.select(matchingItem)
        } else {
            popup.selectItem(at: 0)
            UserDefaults.standard.set(
                embeddedReaderTarget,
                forKey: readerOpenTargetKey
            )
        }

        popup.target = self
        popup.action = #selector(readerOpenTargetChanged(_:))
        browserPopup = popup

        let note = NSTextField(
            wrappingLabelWithString:
                "言語設定はすぐに反映され、次回起動時にも保持されます。"
                + "Readerの表示先は次回起動時と「Readerを開く」に反映されます。"
                + "外部ブラウザを選んだ場合、そのブラウザのタブは"
                + "Perseus Local Reader終了時に自動では閉じません。"
        )
        note.textColor = .secondaryLabelColor
        note.font = .systemFont(ofSize: 12)

        let closeButton = NSButton(
            title: "閉じる",
            target: settings,
            action: #selector(NSWindow.close)
        )

        let buttonRow = NSStackView(views: [NSView(), closeButton])
        buttonRow.orientation = .horizontal
        buttonRow.distribution = .fill

        let stack = NSStackView(views: [
            languageHeading,
            languageExplanation,
            languageSelector,
            separator,
            heading,
            explanation,
            popup,
            note,
            buttonRow,
        ])
        stack.orientation = .vertical
        stack.alignment = .leading
        stack.spacing = 12
        stack.translatesAutoresizingMaskIntoConstraints = false

        let content = NSView()
        content.addSubview(stack)
        settings.contentView = content

        NSLayoutConstraint.activate([
            stack.leadingAnchor.constraint(
                equalTo: content.leadingAnchor,
                constant: 22
            ),
            stack.trailingAnchor.constraint(
                equalTo: content.trailingAnchor,
                constant: -22
            ),
            stack.topAnchor.constraint(
                equalTo: content.topAnchor,
                constant: 22
            ),
            stack.bottomAnchor.constraint(
                lessThanOrEqualTo: content.bottomAnchor,
                constant: -22
            ),
            languageSelector.widthAnchor.constraint(
                greaterThanOrEqualToConstant: 220
            ),
            separator.widthAnchor.constraint(equalTo: stack.widthAnchor),
            popup.widthAnchor.constraint(greaterThanOrEqualToConstant: 300),
            buttonRow.widthAnchor.constraint(equalTo: stack.widthAnchor),
        ])

        settingsWindow = settings
        relocalizeWindow(settings)
        settings.makeKeyAndOrderFront(nil)
        NSApp.activate(ignoringOtherApps: true)
    }

    @objc private func readerOpenTargetChanged(_ sender: NSPopUpButton) {
        guard let target = sender.selectedItem?.representedObject as? String
        else {
            return
        }

        UserDefaults.standard.set(target, forKey: readerOpenTargetKey)
    }

    private func openReaderUsingPreference(_ url: URL) {
        let target = currentReaderOpenTarget()
        let localizedURL = localizedReaderURL(url)

        if target == embeddedReaderTarget {
            showEmbeddedReader(localizedURL)
        } else {
            openExternally(localizedURL, target: target)
        }
    }

    private func openExternally(_ url: URL, target: String) {
        guard target.hasPrefix(browserTargetPrefix) else {
            NSWorkspace.shared.open(url)
            return
        }

        let bundleIdentifier = String(
            target.dropFirst(browserTargetPrefix.count)
        )

        guard let applicationURL =
                NSWorkspace.shared.urlForApplication(
                    withBundleIdentifier: bundleIdentifier
                )
        else {
            UserDefaults.standard.set(
                defaultBrowserTarget,
                forKey: readerOpenTargetKey
            )

            let alert = NSAlert()
            alert.alertStyle = .warning
            alert.messageText = L("選択したブラウザが見つかりません")
            alert.informativeText = L(
                "既定のブラウザで開きます。設定も既定のブラウザへ変更しました。"
            )
            alert.runModal()

            NSWorkspace.shared.open(url)
            return
        }

        let configuration = NSWorkspace.OpenConfiguration()
        configuration.activates = true

        NSWorkspace.shared.open(
            [url],
            withApplicationAt: applicationURL,
            configuration: configuration
        ) { _, error in
            guard let error else { return }

            DispatchQueue.main.async {
                let alert = NSAlert(error: error)
                alert.messageText = self.L("選択したブラウザで開けませんでした")
                alert.runModal()
                NSWorkspace.shared.open(url)
            }
        }
    }

    private func showEmbeddedReader(_ url: URL) {
        if let webView {
            webView.load(URLRequest(url: url))
            window.orderOut(nil)
            readerWindow?.makeKeyAndOrderFront(nil)
            NSApp.activate(ignoringOtherApps: true)
            return
        }

        let configuration = WKWebViewConfiguration()
        configuration.websiteDataStore = .default()
        configuration.userContentController.add(
            self,
            name: webLanguageMessageName
        )

        let readerWebView = WKWebView(
            frame: .zero,
            configuration: configuration
        )
        readerWebView.navigationDelegate = self
        readerWebView.uiDelegate = self
        readerWebView.allowsMagnification = true
        readerWebView.translatesAutoresizingMaskIntoConstraints = false

        let backButton = NSButton(
            title: "←",
            target: self,
            action: #selector(goBackInReader)
        )
        backButton.toolTip = "戻る"

        let forwardButton = NSButton(
            title: "→",
            target: self,
            action: #selector(goForwardInReader)
        )
        forwardButton.toolTip = "進む"

        let reloadButton = NSButton(
            title: "再読み込み",
            target: self,
            action: #selector(reloadEmbeddedReader)
        )

        let homeButton = NSButton(
            title: "ライブラリ",
            target: self,
            action: #selector(openReaderHome)
        )

        let settingsButton = NSButton(
            title: "設定",
            target: self,
            action: #selector(showSettings)
        )

        let externalButton = NSButton(
            title: "外部ブラウザで開く",
            target: self,
            action: #selector(openCurrentPageExternally)
        )

        let toolbar = NSStackView(views: [
            backButton,
            forwardButton,
            reloadButton,
            homeButton,
            NSView(),
            settingsButton,
            externalButton,
        ])
        toolbar.orientation = .horizontal
        toolbar.alignment = .centerY
        toolbar.spacing = 8
        toolbar.edgeInsets = NSEdgeInsets(
            top: 7,
            left: 10,
            bottom: 7,
            right: 10
        )
        toolbar.translatesAutoresizingMaskIntoConstraints = false

        let container = NSView()
        container.addSubview(toolbar)
        container.addSubview(readerWebView)

        NSLayoutConstraint.activate([
            toolbar.leadingAnchor.constraint(
                equalTo: container.leadingAnchor
            ),
            toolbar.trailingAnchor.constraint(
                equalTo: container.trailingAnchor
            ),
            toolbar.topAnchor.constraint(
                equalTo: container.topAnchor
            ),
            toolbar.heightAnchor.constraint(greaterThanOrEqualToConstant: 42),

            readerWebView.leadingAnchor.constraint(
                equalTo: container.leadingAnchor
            ),
            readerWebView.trailingAnchor.constraint(
                equalTo: container.trailingAnchor
            ),
            readerWebView.topAnchor.constraint(
                equalTo: toolbar.bottomAnchor
            ),
            readerWebView.bottomAnchor.constraint(
                equalTo: container.bottomAnchor
            ),
        ])

        let reader = NSWindow(
            contentRect: NSRect(x: 0, y: 0, width: 1240, height: 820),
            styleMask: [.titled, .closable, .miniaturizable, .resizable],
            backing: .buffered,
            defer: false
        )
        reader.title = "Perseus Local Reader"
        reader.minSize = NSSize(width: 780, height: 560)
        reader.delegate = self
        reader.contentView = container
        reader.center()
        relocalizeWindow(reader)

        webView = readerWebView
        readerWindow = reader

        // 起動時の小さいコントローラは隠すが、メニューから再表示できる。
        window.orderOut(nil)
        reader.makeKeyAndOrderFront(nil)
        NSApp.activate(ignoringOtherApps: true)

        readerWebView.load(URLRequest(url: url))
    }

    @objc private func goBackInReader() {
        webView?.goBack()
    }

    @objc private func goForwardInReader() {
        webView?.goForward()
    }

    @objc private func reloadEmbeddedReader() {
        webView?.reload()
    }

    @objc private func openReaderHome() {
        guard let readerURL else { return }
        webView?.load(URLRequest(url: localizedReaderURL(readerURL)))
    }

    @objc private func openCurrentPageExternally() {
        guard let url = webView?.url ?? readerURL else { return }

        let target = currentReaderOpenTarget()
        let externalTarget =
            target == embeddedReaderTarget
            ? defaultBrowserTarget
            : target

        openExternally(url, target: externalTarget)
    }

    func webView(
        _ webView: WKWebView,
        runJavaScriptAlertPanelWithMessage message: String,
        initiatedByFrame frame: WKFrameInfo,
        completionHandler: @escaping () -> Void
    ) {
        let alert = NSAlert()
        alert.alertStyle = .informational
        alert.messageText = "Perseus Local Reader"
        alert.informativeText = message
        alert.addButton(withTitle: "OK")
        alert.runModal()
        completionHandler()
    }

    func webView(
        _ webView: WKWebView,
        runJavaScriptConfirmPanelWithMessage message: String,
        initiatedByFrame frame: WKFrameInfo,
        completionHandler: @escaping (Bool) -> Void
    ) {
        let alert = NSAlert()
        alert.alertStyle = .warning
        alert.messageText = L("確認")
        alert.informativeText = message
        alert.addButton(withTitle: "OK")
        alert.addButton(withTitle: L("キャンセル"))

        let response = alert.runModal()
        completionHandler(response == .alertFirstButtonReturn)
    }

    func webView(
        _ webView: WKWebView,
        runJavaScriptTextInputPanelWithPrompt prompt: String,
        defaultText: String?,
        initiatedByFrame frame: WKFrameInfo,
        completionHandler: @escaping (String?) -> Void
    ) {
        let alert = NSAlert()
        alert.alertStyle = .informational
        alert.messageText = L("入力")
        alert.informativeText = prompt
        alert.addButton(withTitle: "OK")
        alert.addButton(withTitle: L("キャンセル"))

        let input = NSTextField(
            frame: NSRect(x: 0, y: 0, width: 320, height: 24)
        )
        input.stringValue = defaultText ?? ""
        alert.accessoryView = input

        let response = alert.runModal()
        completionHandler(
            response == .alertFirstButtonReturn
                ? input.stringValue
                : nil
        )
    }

    private func isLocalReaderURL(_ url: URL) -> Bool {
        guard url.scheme == "http" || url.scheme == "https" else {
            return url.scheme == "about"
        }

        return url.host == "127.0.0.1" || url.host == "localhost"
    }

    func webView(
        _ webView: WKWebView,
        decidePolicyFor navigationAction: WKNavigationAction,
        decisionHandler:
            @escaping (WKNavigationActionPolicy) -> Void
    ) {
        guard let url = navigationAction.request.url else {
            decisionHandler(.cancel)
            return
        }

        if isLocalReaderURL(url) {
            decisionHandler(.allow)
            return
        }

        NSWorkspace.shared.open(url)
        decisionHandler(.cancel)
    }

    func webView(
        _ webView: WKWebView,
        createWebViewWith configuration: WKWebViewConfiguration,
        for navigationAction: WKNavigationAction,
        windowFeatures: WKWindowFeatures
    ) -> WKWebView? {
        guard navigationAction.targetFrame == nil,
              let url = navigationAction.request.url
        else {
            return nil
        }

        if isLocalReaderURL(url) {
            webView.load(navigationAction.request)
        } else {
            NSWorkspace.shared.open(url)
        }

        return nil
    }

    private func buildWindow() {
        window = NSWindow(
            contentRect: NSRect(x: 0, y: 0, width: 440, height: 230),
            styleMask: [.titled, .closable, .miniaturizable, .resizable],
            backing: .buffered,
            defer: false
        )
        window.title = "Perseus Local Reader"
        window.center()
        window.delegate = self

        let title = NSTextField(labelWithString: "Perseus Local Reader")
        title.font = .systemFont(ofSize: 22, weight: .semibold)

        statusLabel = NSTextField(labelWithString: L("起動準備中…"))
        statusLabel.font = .systemFont(ofSize: 14)
        statusLabel.textColor = .secondaryLabelColor

        addressLabel = NSTextField(labelWithString: "")
        addressLabel.font = .monospacedSystemFont(ofSize: 12, weight: .regular)
        addressLabel.textColor = .secondaryLabelColor

        openButton = NSButton(
            title: "Readerを開く",
            target: self,
            action: #selector(openReader)
        )
        openButton.isEnabled = false

        updateButton = NSButton(
            title: "更新を確認",
            target: self,
            action: #selector(checkUpdatesManually)
        )

        let quitButton = NSButton(
            title: "終了",
            target: self,
            action: #selector(quitApplication)
        )

        let buttons = NSStackView(views: [openButton, updateButton, quitButton])
        buttons.orientation = .horizontal
        buttons.spacing = 10
        buttons.distribution = .fillEqually

        let spacer = NSView()
        spacer.heightAnchor.constraint(equalToConstant: 8).isActive = true

        let stack = NSStackView(views: [
            title,
            statusLabel,
            addressLabel,
            spacer,
            buttons,
        ])
        stack.orientation = .vertical
        stack.alignment = .leading
        stack.spacing = 12
        stack.edgeInsets = NSEdgeInsets(top: 22, left: 24, bottom: 22, right: 24)

        buttons.widthAnchor.constraint(equalTo: stack.widthAnchor, constant: -48).isActive = true
        window.contentView = stack
        relocalizeWindow(window)
        window.makeKeyAndOrderFront(nil)
    }

    private func hasReader(at root: URL) -> Bool {
        let server = root.appendingPathComponent(".developer/scripts/server.py").path
        let catalog = root.appendingPathComponent(".developer/app/data/catalog.json").path
        return FileManager.default.fileExists(atPath: server)
            && FileManager.default.fileExists(atPath: catalog)
    }

    private func locateReaderRoot() -> URL? {
        var candidates: [URL] = []

        let appParent = Bundle.main.bundleURL.deletingLastPathComponent()
        candidates.append(appParent)

        if let saved = UserDefaults.standard.string(forKey: "readerRoot") {
            candidates.append(URL(fileURLWithPath: saved))
        }

        for candidate in candidates where hasReader(at: candidate) {
            return candidate
        }

        let panel = NSOpenPanel()
        panel.title = L("読書環境フォルダを選択")
        panel.message = L("""
        ZIPを解凍してできた一番外側のフォルダを選んでください。
        通常は “perseus-local-reader-main” です。
        """)
        panel.prompt = L("このフォルダを選択")
        panel.canChooseDirectories = true
        panel.canChooseFiles = false
        panel.allowsMultipleSelection = false

        guard panel.runModal() == .OK, let selected = panel.url else {
            return nil
        }

        guard hasReader(at: selected) else {
            let alert = NSAlert()
            alert.alertStyle = .critical
            alert.messageText = L("読書環境が見つかりません")
            alert.informativeText = L("""
            Perseus Local Reader.app、README.md、.developer が入っている
            一番外側のフォルダを選んでください。
            """)
            alert.runModal()
            return nil
        }

        return selected
    }

    private func startServer() {
        guard let root = readerRoot else { return }

        statusLabel.stringValue = L("ローカルサーバーを起動中…")
        openButton.isEnabled = false

        let serverPath = root.appendingPathComponent(".developer/scripts/server.py")
        let developerRoot = root.appendingPathComponent(".developer")
        let buildDirectory = developerRoot.appendingPathComponent("data/build", isDirectory: true)

        do {
            try FileManager.default.createDirectory(
                at: buildDirectory,
                withIntermediateDirectories: true
            )
        } catch {
            showError("ログ用フォルダを作成できませんでした", error)
            return
        }

        for port in defaultPort...(defaultPort + 10) {
            let process = Process()
            process.executableURL = URL(fileURLWithPath: "/usr/bin/python3")
            process.arguments = [
                serverPath.path,
                String(port),
                "--parent-pid",
                String(ProcessInfo.processInfo.processIdentifier),
            ]
            process.currentDirectoryURL = developerRoot

            let logURL = buildDirectory.appendingPathComponent("swift-app-server-\(port).log")
            FileManager.default.createFile(atPath: logURL.path, contents: nil)

            do {
                let handle = try FileHandle(forWritingTo: logURL)
                process.standardOutput = handle
                process.standardError = handle
                try process.run()

                Thread.sleep(forTimeInterval: 0.25)
                if process.isRunning {
                    serverProcess = process
                    serverLogHandle = handle
                    readerURL = URL(string: "http://127.0.0.1:\(port)/")
                    waitForServer()
                    return
                }

                try? handle.close()
            } catch {
                continue
            }
        }

        showError(
            "ローカルサーバーを起動できませんでした",
            NSError(
                domain: "PerseusLocalReader",
                code: 1,
                userInfo: [
                    NSLocalizedDescriptionKey:
                        "8000〜8010番ポートを利用できませんでした。"
                ]
            )
        )
    }

    private func waitForServer() {
        guard let url = readerURL else { return }

        Task {
            let configuration = URLSessionConfiguration.ephemeral
            configuration.timeoutIntervalForRequest = 0.5
            let session = URLSession(configuration: configuration)

            for _ in 0..<50 {
                if self.serverProcess?.isRunning != true {
                    break
                }

                do {
                    let (_, response) = try await session.data(from: url)
                    if let http = response as? HTTPURLResponse, http.statusCode == 200 {
                        await MainActor.run {
                            self.statusLabel.stringValue = "● Reader is running"
                            self.statusLabel.textColor = .systemGreen
                            self.addressLabel.stringValue = url.absoluteString
                            self.openButton.isEnabled = true
                            self.openReaderUsingPreference(url)
                            self.checkForUpdates(manual: false)
                        }
                        return
                    }
                } catch {
                    // 起動待ちなので次の試行へ進む。
                }

                try? await Task.sleep(nanoseconds: 150_000_000)
            }

            await MainActor.run {
                self.statusLabel.stringValue = self.L("サーバーの起動を確認できませんでした")
                self.statusLabel.textColor = .systemRed
            }
        }
    }

    private func stopServer() {
        guard let process = serverProcess else { return }

        if process.isRunning {
            process.terminate()

            let deadline = Date().addingTimeInterval(2)
            while process.isRunning && Date() < deadline {
                RunLoop.current.run(until: Date().addingTimeInterval(0.05))
            }

            if process.isRunning {
                kill(process.processIdentifier, SIGKILL)
            }
        }

        try? serverLogHandle?.close()
        serverLogHandle = nil
        serverProcess = nil
    }

    @objc private func openReader() {
        guard let url = readerURL else { return }
        openReaderUsingPreference(url)
    }

    @objc private func quitApplication() {
        NSApp.terminate(nil)
    }

    @objc private func checkUpdatesManually() {
        checkForUpdates(manual: true)
    }

    private func checkForUpdates(manual: Bool) {
        var versionComponents = URLComponents()
        versionComponents.scheme = "https"
        versionComponents.host = "raw.githubusercontent.com"
        versionComponents.path =
            "/\(repositoryOwner)/\(repositoryName)/\(updateBranch)/VERSION"
        versionComponents.queryItems = [
            URLQueryItem(
                name: "ts",
                value: String(Int(Date().timeIntervalSince1970))
            )
        ]

        guard let url = versionComponents.url else {
            return
        }

        updateButton.isEnabled = false
        if manual {
            statusLabel.stringValue = L("更新を確認中…")
            statusLabel.textColor = .secondaryLabelColor
        }

        var request = URLRequest(url: url)
        request.cachePolicy = .reloadIgnoringLocalAndRemoteCacheData
        request.timeoutInterval = 4
        request.setValue(
            "no-cache, no-store, max-age=0",
            forHTTPHeaderField: "Cache-Control"
        )
        request.setValue("no-cache", forHTTPHeaderField: "Pragma")

        URLSession.shared.dataTask(with: request) { data, response, error in
            DispatchQueue.main.async {
                self.updateButton.isEnabled = true

                guard error == nil,
                      let http = response as? HTTPURLResponse,
                      http.statusCode == 200,
                      let data,
                      let remoteText = String(data: data, encoding: .utf8)
                else {
                    if manual {
                        self.statusLabel.stringValue = self.L(
                            "更新を確認できませんでした。オフラインでも読書は続けられます。"
                        )
                        self.statusLabel.textColor = .secondaryLabelColor

                        let alert = NSAlert()
                        alert.alertStyle = .warning
                        alert.messageText = self.L("更新を確認できませんでした")
                        alert.informativeText = self.L(
                            "オフラインでも、保存済みの内容はそのまま読めます。"
                        )
                        alert.runModal()
                    }
                    return
                }

                let remote = remoteText.trimmingCharacters(in: .whitespacesAndNewlines)
                let local =
                    Bundle.main.object(forInfoDictionaryKey: "CFBundleShortVersionString")
                    as? String ?? "0.0.0"

                guard self.isVersion(remote, newerThan: local) else {
                    if manual {
                        self.statusLabel.stringValue = self.L("最新版です（\(local)）")
                        self.statusLabel.textColor = .systemGreen

                        let alert = NSAlert()
                        alert.alertStyle = .informational
                        alert.messageText = self.L("最新版です")
                        alert.informativeText = self.L("Version \(local) を使用しています。")
                        alert.runModal()
                    }
                    return
                }

                let alert = NSAlert()
                alert.alertStyle = .informational
                alert.messageText = self.L("新しいバージョン \(remote) が利用できます")
                alert.informativeText = self.L(
                    "現在のバージョンは \(local) です。今すぐ更新しますか？"
                )
                alert.addButton(withTitle: self.L("更新する"))
                alert.addButton(withTitle: self.L("あとで"))

                if alert.runModal() == .alertFirstButtonReturn {
                    self.beginUpdate()
                }
            }
        }.resume()
    }

    private func isVersion(_ remote: String, newerThan local: String) -> Bool {
        func parts(_ value: String) -> [Int] {
            value
                .split(separator: ".")
                .map { Int($0.prefix { $0.isNumber }) ?? 0 }
        }

        let lhs = parts(remote)
        let rhs = parts(local)
        let count = max(lhs.count, rhs.count)

        for index in 0..<count {
            let left = index < lhs.count ? lhs[index] : 0
            let right = index < rhs.count ? rhs[index] : 0

            if left != right {
                return left > right
            }
        }

        return false
    }

    private func beginUpdate() {
        guard let root = readerRoot else { return }

        let helper = root.appendingPathComponent(
            ".developer/scripts/apply_swift_update.sh"
        )
        guard FileManager.default.fileExists(atPath: helper.path) else {
            showError(
                "更新ヘルパーが見つかりません",
                NSError(
                    domain: "PerseusLocalReader",
                    code: 2,
                    userInfo: [NSLocalizedDescriptionKey: helper.path]
                )
            )
            return
        }

        let temporaryHelper = FileManager.default.temporaryDirectory
            .appendingPathComponent(
                "perseus-local-reader-update-\(UUID().uuidString).sh"
            )

        do {
            try FileManager.default.copyItem(at: helper, to: temporaryHelper)
            try FileManager.default.setAttributes(
                [.posixPermissions: 0o755],
                ofItemAtPath: temporaryHelper.path
            )

            let updater = Process()
            updater.executableURL = URL(fileURLWithPath: "/bin/zsh")
            updater.arguments = [
                temporaryHelper.path,
                String(ProcessInfo.processInfo.processIdentifier),
                root.path,
                Bundle.main.bundleURL.path,
                currentUILanguage(),
            ]

            let logURL = root.appendingPathComponent(
                ".developer/data/build/swift-update.log"
            )
            FileManager.default.createFile(atPath: logURL.path, contents: nil)
            let logHandle = try FileHandle(forWritingTo: logURL)
            updater.standardOutput = logHandle
            updater.standardError = logHandle
            try updater.run()

            statusLabel.stringValue = L("更新を開始します…")
            statusLabel.textColor = .secondaryLabelColor
            NSApp.terminate(nil)
        } catch {
            showError("更新処理を開始できませんでした", error)
        }
    }

    private func showError(_ title: String, _ error: Error) {
        let localizedTitle = L(title)
        statusLabel.stringValue = localizedTitle
        statusLabel.textColor = .systemRed

        let alert = NSAlert(error: error)
        alert.messageText = localizedTitle
        alert.runModal()
    }
}

let app = NSApplication.shared
let delegate = AppDelegate()
app.delegate = delegate
app.run()
