import Flutter
import UIKit
import CFNetwork
import MobileCoreServices
import WebKit

@main
@objc class AppDelegate: FlutterAppDelegate {
  private static let incomingBackupPending = "__incoming_backup_pending__"
  private var composerFiles: ComposerFiles?
  private var officialMetadata: OfficialMetadataBridge?
  private var outputFolders: OutputFolderBridge?
  private var incomingBackupChannel: FlutterMethodChannel?
  private var pendingIncomingBackupPaths: [String] = []
  private var incomingBackupCopiesInProgress = 0
  private var handledIncomingBackupSources: Set<String> = []

  override func application(
    _ application: UIApplication,
    didFinishLaunchingWithOptions launchOptions: [UIApplication.LaunchOptionsKey: Any]?
  ) -> Bool {
    // Mirror Android's MainActivity: a native GBK/GB18030 decoder for the
    // downloadable Chinese Danbooru tag library (the CSV is GBK-encoded, which
    // Dart's utf8 decoder can't read). Without this the offline tag library
    // would fail to parse on iOS.
    if let controller = window?.rootViewController as? FlutterViewController {
      officialMetadata = OfficialMetadataBridge(messenger: controller.binaryMessenger)
      composerFiles = ComposerFiles(controller: controller)
      outputFolders = OutputFolderBridge(controller: controller)
      // Read-only installed bundle identity; unsigned IPA downloads never install.
      let iosUpdateChannel = FlutterMethodChannel(
        name: "langbai.novelai/ios_update",
        binaryMessenger: controller.binaryMessenger
      )
      iosUpdateChannel.setMethodCallHandler { call, result in
        guard call.method == "status" else {
          result(FlutterMethodNotImplemented)
          return
        }
        let bundle = Bundle.main
        result([
          "state": "download_only",
          "downloadSupported": true,
          "installSupported": false,
          "bundleIdentifier": bundle.bundleIdentifier ?? "",
          "currentVersion": bundle.object(forInfoDictionaryKey: "CFBundleShortVersionString") as? String ?? "",
          "currentBuild": bundle.object(forInfoDictionaryKey: "CFBundleVersion") as? String ?? "",
          "appDisplayName": bundle.object(forInfoDictionaryKey: "CFBundleDisplayName") as? String ?? "",
          "documentsVisible": bundle.object(forInfoDictionaryKey: "UIFileSharingEnabled") as? Bool ?? false,
          "openDocumentsInPlace": bundle.object(forInfoDictionaryKey: "LSSupportsOpeningDocumentsInPlace") as? Bool ?? false
        ])
      }
      let channel = FlutterMethodChannel(
        name: "langbai.novelai/native_text",
        binaryMessenger: controller.binaryMessenger
      )
      channel.setMethodCallHandler { call, result in
        switch call.method {
        case "decodeGbk":
          guard let data = call.arguments as? FlutterStandardTypedData else {
            result(FlutterError(code: "invalid_bytes",
                                message: "GBK input is not a byte array",
                                details: nil))
            return
          }
          // GB_18030_2000 is a superset of GBK and the right CoreFoundation
          // encoding for these tag CSVs.
          let cfEncoding = CFStringConvertEncodingToNSStringEncoding(
            CFStringEncoding(CFStringEncodings.GB_18030_2000.rawValue)
          )
          if let decoded = String(data: data.data,
                                  encoding: String.Encoding(rawValue: cfEncoding)) {
            result(decoded)
          } else {
            result(FlutterError(code: "gbk_decode_failed",
                                message: "Unable to decode GB18030/GBK input",
                                details: nil))
          }
        default:
          result(FlutterMethodNotImplemented)
        }
      }

      let networkChannel = FlutterMethodChannel(
        name: "langbai.novelai/network",
        binaryMessenger: controller.binaryMessenger
      )
      networkChannel.setMethodCallHandler { call, result in
        guard call.method == "resolveProxy" else {
          result(FlutterMethodNotImplemented)
          return
        }
        let rawTarget = call.arguments as? String ?? "https://api.novelai.net"
        guard let target = URL(string: rawTarget),
              let unmanagedSettings = CFNetworkCopySystemProxySettings() else {
          result("")
          return
        }
        let settings = unmanagedSettings.takeRetainedValue()
        let entries = CFNetworkCopyProxiesForURL(target as CFURL, settings).takeRetainedValue() as NSArray
        for case let entry as NSDictionary in entries {
          guard let type = entry[kCFProxyTypeKey] as? String,
                type == (kCFProxyTypeHTTP as String) ||
                type == (kCFProxyTypeHTTPS as String) ||
                type == (kCFProxyTypeSOCKS as String),
                let host = entry[kCFProxyHostNameKey] as? String,
                let port = entry[kCFProxyPortNumberKey] as? NSNumber else { continue }
          let scheme = type == (kCFProxyTypeSOCKS as String) ? "socks5" : "http"
          let renderedHost = host.contains(":") ? "[\(host)]" : host
          result("\(scheme)://\(renderedHost):\(port.intValue)")
          return
        }
        result("")
      }

      let backupChannel = FlutterMethodChannel(
        name: "langbai.novelai/incoming_backup",
        binaryMessenger: controller.binaryMessenger
      )
      incomingBackupChannel = backupChannel
      backupChannel.setMethodCallHandler { [weak self] call, result in
        guard call.method == "takeInitialBackup" else {
          result(FlutterMethodNotImplemented)
          return
        }
        guard let self = self else {
          result(nil)
          return
        }
        if !self.pendingIncomingBackupPaths.isEmpty {
          result(self.pendingIncomingBackupPaths.removeFirst())
        } else if self.incomingBackupCopiesInProgress > 0 {
          result(Self.incomingBackupPending)
        } else {
          result(nil)
        }
      }

      if let initialURL = launchOptions?[.url] as? URL {
        _ = receiveIncomingBackup(initialURL)
      }
    }

    GeneratedPluginRegistrant.register(with: self)
    return super.application(application, didFinishLaunchingWithOptions: launchOptions)
  }

  override func application(
    _ app: UIApplication,
    open url: URL,
    options: [UIApplication.OpenURLOptionsKey: Any] = [:]
  ) -> Bool {
    if receiveIncomingBackup(url) {
      return true
    }
    return super.application(app, open: url, options: options)
  }

  private func receiveIncomingBackup(_ sourceURL: URL) -> Bool {
    let fileExtension = sourceURL.pathExtension.lowercased()
    guard fileExtension == "naisbackup" || fileExtension == "zip" else {
      return false
    }
    let sourceKey = sourceURL.standardizedFileURL.absoluteString
    if handledIncomingBackupSources.contains(sourceKey) {
      return true
    }
    handledIncomingBackupSources.insert(sourceKey)

    let hasScopedAccess = sourceURL.startAccessingSecurityScopedResource()
    incomingBackupCopiesInProgress += 1
    DispatchQueue.global(qos: .userInitiated).async { [weak self] in
      guard let self = self else {
        if hasScopedAccess {
          sourceURL.stopAccessingSecurityScopedResource()
        }
        return
      }
      let copiedPath: String?
      do {
        let fileManager = FileManager.default
        if let cacheRoot = fileManager.urls(
          for: .cachesDirectory,
          in: .userDomainMask
        ).first {
          let incomingDirectory = cacheRoot.appendingPathComponent(
            "incoming-backups",
            isDirectory: true
          )
          try fileManager.createDirectory(
            at: incomingDirectory,
            withIntermediateDirectories: true
          )

          let rawStem = sourceURL.deletingPathExtension().lastPathComponent
          let safeStem = rawStem
            .replacingOccurrences(of: "/", with: "_")
            .replacingOccurrences(of: ":", with: "_")
            .prefix(80)
          let normalizedExtension = fileExtension == "zip" ? "zip" : "naisbackup"
          let targetURL = incomingDirectory.appendingPathComponent(
            "\(safeStem.isEmpty ? "shared-backup" : String(safeStem))-\(UUID().uuidString).\(normalizedExtension)"
          )
          try fileManager.copyItem(at: sourceURL, to: targetURL)
          copiedPath = targetURL.path
        } else {
          copiedPath = nil
        }
      } catch {
        copiedPath = nil
      }

      if hasScopedAccess {
        sourceURL.stopAccessingSecurityScopedResource()
      }
      DispatchQueue.main.async {
        self.incomingBackupCopiesInProgress = max(
          0,
          self.incomingBackupCopiesInProgress - 1
        )
        guard let path = copiedPath else {
          self.handledIncomingBackupSources.remove(sourceKey)
          self.incomingBackupChannel?.invokeMethod(
            "backupReceiveFinished",
            arguments: nil
          )
          return
        }
        self.pendingIncomingBackupPaths.append(path)
        self.incomingBackupChannel?.invokeMethod(
          "backupReceived",
          arguments: path,
          result: { [weak self] _ in
            self?.pendingIncomingBackupPaths.removeAll { $0 == path }
          }
        )
      }
    }
    return true
  }
}

final class ComposerFiles: NSObject, UIDropInteractionDelegate {
  private let channel: FlutterMethodChannel
  private var region: CGRect?
  private let allowed=Set(["png","jpg","jpeg","webp","gif","bmp","avif","pdf","txt","md","json","jsonl","csv","tsv","yaml","yml"])
  init(controller: FlutterViewController) {
    channel=FlutterMethodChannel(name:"langbai.novelai/composer_files",binaryMessenger:controller.binaryMessenger)
    super.init()
    channel.setMethodCallHandler { [weak self] call,result in
      guard let self=self else {result(nil);return}
      if call.method=="region" {
        if let m=call.arguments as? [String:Double],let x=m["x"],let y=m["y"],let w=m["width"],let h=m["height"] {self.region=CGRect(x:x,y:y,width:w,height:h)} else {self.region=nil}
        result(nil)
      } else if call.method=="paste" {
        var paths=[String]();var total=0
        // Prefer encoded data. UIImage.pngData() would erase embedded parameters.
        let board = UIPasteboard.general
        for (index, item) in board.items.prefix(64).enumerated() {
          var copied = false
          for id in item.keys.sorted() where UTTypeConformsTo(id as CFString, kUTTypeImage) {
            guard let ext = self.preferredExtension(id), self.allowed.contains(ext),
                  let data = board.data(forPasteboardType: id, inItemSet: IndexSet(integer: index))?.first,
                  data.count <= 48*1024*1024, total+data.count <= 192*1024*1024,
                  let path = self.save(data, extension: ext) else {continue}
            paths.append(path); total += data.count; copied = true; break
          }
          // Some providers expose only a decoded UIImage; its original metadata is unavailable.
          if !copied, let image = item.values.compactMap({$0 as? UIImage}).first,
             let data = image.pngData(), total+data.count <= 192*1024*1024,
             let path = self.save(data, extension: "png") {paths.append(path);total += data.count}
        }
        for url in (UIPasteboard.general.urls ?? []).prefix(max(0,64-paths.count)) where url.isFileURL {
          let scoped=url.startAccessingSecurityScopedResource();defer{if scoped{url.stopAccessingSecurityScopedResource()}}
          let ext=url.pathExtension.lowercased()
          if self.allowed.contains(ext),let values=try? url.resourceValues(forKeys:[.fileSizeKey]),let count=values.fileSize,count<=48*1024*1024,total+count<=192*1024*1024,let data=try? Data(contentsOf:url),let path=self.save(data,extension:ext){paths.append(path);total+=data.count}
        }
        result(paths)
      } else if call.method == "copyImage" {
        guard let args = call.arguments as? [String: Any],
              let bytes = args["bytes"] as? FlutterStandardTypedData,
              !bytes.data.isEmpty, bytes.data.count <= 48*1024*1024,
              let mime = args["mime"] as? String,
              let type = UTTypeCreatePreferredIdentifierForTag(kUTTagClassMIMEType, mime as CFString, nil)?.takeRetainedValue(),
              UTTypeConformsTo(type, kUTTypeImage) else {
          result(FlutterError(code: "image_clipboard", message: "Unsupported image bytes", details: nil));return
        }
        // Encoded data rather than UIImage preserves the original file bytes.
        UIPasteboard.general.setItems([[type as String: bytes.data]], options: [:])
        result(true)
      } else {result(FlutterMethodNotImplemented)}
    }
    controller.view.addInteraction(UIDropInteraction(delegate:self))
  }
  private func preferredExtension(_ id:String)->String? {
    return UTTypeCopyPreferredTagWithClass(id as CFString,kUTTagClassFilenameExtension)?.takeRetainedValue() as String?
  }
  private func save(_ data:Data,extension ext:String)->String? {
    guard allowed.contains(ext),!data.isEmpty,data.count<=48*1024*1024 else{return nil}
    let folder=FileManager.default.temporaryDirectory.appendingPathComponent("composer-inputs",isDirectory:true)
    do {try FileManager.default.createDirectory(at:folder,withIntermediateDirectories:true);let file=folder.appendingPathComponent("\(UUID().uuidString).\(ext)");try data.write(to:file,options:.atomic);return file.path}catch{return nil}
  }
  private func representation(_ provider:NSItemProvider)->(id:String,ext:String)? {
    let suggested=provider.suggestedName.map {URL(fileURLWithPath:$0).pathExtension.lowercased()} ?? ""
    for id in provider.registeredTypeIdentifiers {
      let ext=preferredExtension(id) ?? suggested
      if allowed.contains(ext) && UTTypeConformsTo(id as CFString,kUTTypeData) {
        // A file named *.txt can be dropped; an ordinary dragged text selection stays text.
        if UTTypeConformsTo(id as CFString,kUTTypePlainText) && !allowed.contains(suggested) {continue}
        return (id,ext)
      }
    }
    return nil
  }
  func dropInteraction(_ interaction:UIDropInteraction,canHandle session:UIDropSession)->Bool {
    return region != nil && session.items.contains {representation($0.itemProvider) != nil}
  }
  func dropInteraction(_ interaction:UIDropInteraction,sessionDidUpdate session:UIDropSession)->UIDropProposal {
    guard let view=interaction.view else{return UIDropProposal(operation:.cancel)}
    let point=session.location(in:view)
    return UIDropProposal(operation:region?.contains(point)==true ? .copy:.cancel)
  }
  func dropInteraction(_ interaction:UIDropInteraction,performDrop session:UIDropSession) {
    guard let view=interaction.view,region?.contains(session.location(in:view))==true else{return}
    let group=DispatchGroup();var paths=[String]();var total=0
    for item in session.items.prefix(64) {
      let provider=item.itemProvider
      guard let selected=representation(provider) else{continue}
      let id=selected.id,ext=selected.ext
      group.enter()
      provider.loadDataRepresentation(forTypeIdentifier:id) { [weak self] data,_ in
        DispatchQueue.main.async {defer{group.leave()};if let self=self,let data=data,data.count<=48*1024*1024,total+data.count<=192*1024*1024,let path=self.save(data,extension:ext){paths.append(path);total+=data.count}}
      }
    }
    group.notify(queue:.main){ [weak self] in if !paths.isEmpty{self?.channel.invokeMethod("drop",arguments:paths)} }
  }
}


// Isolated memory-only official image parser. Downloaded factories execute in
// the dedicated Worker, never in this document. No JS/native bridge exists.
private final class OfficialMetadataBridge: NSObject, WKNavigationDelegate {
  private final class Session {
    let id: String
    let view: WKWebView
    let result: FlutterResult
    let payload: String
    let worker: String
    var timeout: DispatchWorkItem?
    var settled = false
    var initialNavigation = true
    init(_ id: String, _ view: WKWebView, _ result: @escaping FlutterResult, _ payload: String, _ worker: String) {
      self.id = id; self.view = view; self.result = result; self.payload = payload; self.worker = worker
    }
  }
  private let channel: FlutterMethodChannel
  private var active: Session?
  init(messenger: FlutterBinaryMessenger) {
    channel = FlutterMethodChannel(name: "langbai.novelai/official_metadata", binaryMessenger: messenger)
    super.init()
    channel.setMethodCallHandler { [weak self] call, result in
      guard let self = self else { result(FlutterError(code: "disposed", message: "Metadata sandbox disposed", details: nil)); return }
      let args = call.arguments as? [String: Any] ?? [:]
      if call.method == "cancel" {
        if let session = self.active, session.id == args["id"] as? String { self.finish(session, nil, "cancelled") }
        result(nil); return
      }
      guard call.method == "read" else { result(FlutterMethodNotImplemented); return }
      guard let id = args["id"] as? String, id.count <= 160,
            let host = args["host"] as? String, host.utf8.count <= 1024 * 1024,
            let worker = args["worker"] as? String, worker.utf8.count <= 1024 * 1024,
            let payload = args["payload"] as? String, payload.utf8.count <= 92 * 1024 * 1024 else {
        result(FlutterError(code: "invalid_input", message: "Metadata sandbox input exceeds safety limits", details: nil)); return
      }
      self.start(id, host, worker, payload, result)
    }
  }
  private func finish(_ session: Session, _ value: String?, _ error: String?) {
    if session.settled { return }
    session.settled = true
    session.timeout?.cancel()
    if active === session { active = nil }
    session.view.evaluateJavaScript("globalThis.naiMetadataCancel && naiMetadataCancel()", completionHandler: nil)
    session.view.navigationDelegate = nil
    session.view.stopLoading()
    session.view.loadHTMLString("", baseURL: nil) // destroy the document and its Worker
    if let error = error {
      session.result(FlutterError(code: error, message: "Isolated metadata reader failed; no offline fallback", details: nil))
    } else { session.result(value) }
  }
  private func start(_ id: String, _ host: String, _ worker: String, _ payload: String, _ result: @escaping FlutterResult) {
    if let old = active { finish(old, nil, "cancelled") }
    let configuration = WKWebViewConfiguration()
    configuration.websiteDataStore = .nonPersistent()
    configuration.processPool = WKProcessPool()
    configuration.preferences.javaScriptCanOpenWindowsAutomatically = false
    if #available(iOS 14.0, *) { configuration.defaultWebpagePreferences.allowsContentJavaScript = true }
    else { configuration.preferences.javaScriptEnabled = true }
    let view = WKWebView(frame: .zero, configuration: configuration)
    view.navigationDelegate = self
    let session = Session(id, view, result, payload, worker)
    active = session
    let timeout = DispatchWorkItem { [weak self, weak session] in
      if let self = self, let session = session { self.finish(session, nil, "sandbox_timeout") }
    }
    session.timeout = timeout
    DispatchQueue.main.asyncAfter(deadline: .now() + 40, execute: timeout)
    let csp = "default-src 'none'; script-src 'unsafe-inline' 'unsafe-eval' blob:; worker-src blob:; child-src blob:; connect-src 'none'; object-src 'none'; base-uri 'none'; form-action 'none'"
    let safeHost = host.replacingOccurrences(of: "</script", with: "<\\/script")
    view.loadHTMLString("<!doctype html><meta charset=\"utf-8\"><meta http-equiv=\"Content-Security-Policy\" content=\"\(csp)\"><script>\(safeHost)</script>", baseURL: URL(string: "https://metadata.invalid/"))
  }
  func webView(_ webView: WKWebView, decidePolicyFor navigationAction: WKNavigationAction, decisionHandler: @escaping (WKNavigationActionPolicy) -> Void) {
    guard let session = active, session.view === webView else { decisionHandler(.cancel); return }
    let url = navigationAction.request.url
    if session.initialNavigation && (url?.absoluteString == "about:blank" || url?.host == "metadata.invalid") {
      session.initialNavigation = false; decisionHandler(.allow)
    } else { decisionHandler(.cancel) }
  }
  func webView(_ webView: WKWebView, didFinish navigation: WKNavigation!) {
    guard let session = active, session.view === webView, !session.settled else { return }
    push(session, 0)
  }
  private func quote(_ string: String) -> String {
    let data = try! JSONSerialization.data(withJSONObject: [string])
    let array = String(data: data, encoding: .utf8)!
    return String(array.dropFirst().dropLast())
  }
  private func push(_ session: Session, _ offset: Int) {
    guard active === session, !session.settled else { return }
    // Payload is ASCII JSON/base64; bounded chunks avoid interprocess message limits.
    let payload = session.payload as NSString
    let expression: String
    let end = min(offset + 60000, payload.length)
    if offset < payload.length { expression = "naiMetadataChunk(\(quote(payload.substring(with: NSRange(location: offset, length: end - offset)))))" }
    else { expression = "naiMetadataStart(\(quote(session.worker)))" }
    session.view.evaluateJavaScript(expression) { [weak self] _, error in
      guard let self = self, self.active === session, !session.settled else { return }
      if error != nil { self.finish(session, nil, "sandbox_failed"); return }
      if offset < payload.length { self.push(session, end) } else { self.poll(session) }
    }
  }
  private func poll(_ session: Session) {
    guard active === session, !session.settled else { return }
    session.view.evaluateJavaScript("JSON.stringify(globalThis.naiMetadataResult)") { [weak self] value, error in
      guard let self = self, self.active === session, !session.settled else { return }
      if error != nil { self.finish(session, nil, "sandbox_failed"); return }
      if let text = value as? String, text != "null" {
        guard text.utf8.count <= 18 * 1024 * 1024, let data = text.data(using: .utf8),
              let object = try? JSONSerialization.jsonObject(with: data), object is [String: Any] else {
          self.finish(session, nil, "invalid_response"); return
        }
        self.finish(session, text, nil)
      } else { DispatchQueue.main.asyncAfter(deadline: .now() + 0.05) { [weak self] in self?.poll(session) } }
    }
  }
}
