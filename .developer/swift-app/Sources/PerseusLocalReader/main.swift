import AppKit
import Foundation
import Darwin

private let repositoryOwner = "sohma-kbysh"
private let repositoryName = "perseus-local-reader"
private let updateBranch = "feature/swift-migration"
private let defaultPort = 8000

final class AppDelegate: NSObject, NSApplicationDelegate, NSWindowDelegate {
    private var window: NSWindow!
    private var statusLabel: NSTextField!
    private var addressLabel: NSTextField!
    private var openButton: NSButton!
    private var updateButton: NSButton!
    private var serverProcess: Process?
    private var serverLogHandle: FileHandle?
    private var readerRoot: URL?
    private var readerURL: URL?

    func applicationDidFinishLaunching(_ notification: Notification) {
        NSApp.setActivationPolicy(.regular)
        buildWindow()
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

    private func buildWindow() {
        window = NSWindow(
            contentRect: NSRect(x: 0, y: 0, width: 440, height: 230),
            styleMask: [.titled, .closable, .miniaturizable],
            backing: .buffered,
            defer: false
        )
        window.title = "Perseus Local Reader"
        window.center()
        window.delegate = self

        let title = NSTextField(labelWithString: "Perseus Local Reader")
        title.font = .systemFont(ofSize: 22, weight: .semibold)

        statusLabel = NSTextField(labelWithString: "起動準備中…")
        statusLabel.font = .systemFont(ofSize: 14)
        statusLabel.textColor = .secondaryLabelColor

        addressLabel = NSTextField(labelWithString: "")
        addressLabel.font = .monospacedSystemFont(ofSize: 12, weight: .regular)
        addressLabel.textColor = .secondaryLabelColor

        openButton = NSButton(
            title: "ブラウザで開く",
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
        panel.title = "読書環境フォルダを選択"
        panel.message = """
        ZIPを解凍してできた一番外側のフォルダを選んでください。
        通常は “perseus-local-reader-main” です。
        """
        panel.prompt = "このフォルダを選択"
        panel.canChooseDirectories = true
        panel.canChooseFiles = false
        panel.allowsMultipleSelection = false

        guard panel.runModal() == .OK, let selected = panel.url else {
            return nil
        }

        guard hasReader(at: selected) else {
            let alert = NSAlert()
            alert.alertStyle = .critical
            alert.messageText = "読書環境が見つかりません"
            alert.informativeText = """
            Perseus Local Reader.app、README.md、.developer が入っている
            一番外側のフォルダを選んでください。
            """
            alert.runModal()
            return nil
        }

        return selected
    }

    private func startServer() {
        guard let root = readerRoot else { return }

        statusLabel.stringValue = "ローカルサーバーを起動中…"
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
                            NSWorkspace.shared.open(url)
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
                self.statusLabel.stringValue = "サーバーの起動を確認できませんでした"
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
        NSWorkspace.shared.open(url)
    }

    @objc private func quitApplication() {
        NSApp.terminate(nil)
    }

    @objc private func checkUpdatesManually() {
        checkForUpdates(manual: true)
    }

    private func checkForUpdates(manual: Bool) {
        guard let url = URL(
            string:
                "https://raw.githubusercontent.com/\(repositoryOwner)/\(repositoryName)/\(updateBranch)/VERSION"
        ) else {
            return
        }

        updateButton.isEnabled = false
        if manual {
            statusLabel.stringValue = "更新を確認中…"
            statusLabel.textColor = .secondaryLabelColor
        }

        var request = URLRequest(url: url)
        request.cachePolicy = .reloadIgnoringLocalCacheData
        request.timeoutInterval = 4

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
                        self.statusLabel.stringValue =
                            "更新を確認できませんでした。オフラインでも読書は続けられます。"
                        self.statusLabel.textColor = .secondaryLabelColor
                    }
                    return
                }

                let remote = remoteText.trimmingCharacters(in: .whitespacesAndNewlines)
                let local =
                    Bundle.main.object(forInfoDictionaryKey: "CFBundleShortVersionString")
                    as? String ?? "0.0.0"

                guard self.isVersion(remote, newerThan: local) else {
                    if manual {
                        self.statusLabel.stringValue = "最新版です（\(local)）"
                        self.statusLabel.textColor = .systemGreen
                    }
                    return
                }

                let alert = NSAlert()
                alert.alertStyle = .informational
                alert.messageText = "新しいバージョン \(remote) が利用できます"
                alert.informativeText =
                    "現在のバージョンは \(local) です。今すぐ更新しますか？"
                alert.addButton(withTitle: "更新する")
                alert.addButton(withTitle: "あとで")

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
            ]

            let logURL = root.appendingPathComponent(
                ".developer/data/build/swift-update.log"
            )
            FileManager.default.createFile(atPath: logURL.path, contents: nil)
            let logHandle = try FileHandle(forWritingTo: logURL)
            updater.standardOutput = logHandle
            updater.standardError = logHandle
            try updater.run()

            statusLabel.stringValue = "更新を開始します…"
            statusLabel.textColor = .secondaryLabelColor
            NSApp.terminate(nil)
        } catch {
            showError("更新処理を開始できませんでした", error)
        }
    }

    private func showError(_ title: String, _ error: Error) {
        statusLabel.stringValue = title
        statusLabel.textColor = .systemRed

        let alert = NSAlert(error: error)
        alert.messageText = title
        alert.runModal()
    }
}

let app = NSApplication.shared
let delegate = AppDelegate()
app.delegate = delegate
app.run()
