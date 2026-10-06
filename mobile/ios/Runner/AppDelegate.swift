import Flutter
import UIKit
import CFNetwork
import MobileCoreServices

@main
@objc class AppDelegate: FlutterAppDelegate {
  private static let incomingBackupPending = "__incoming_backup_pending__"
  private var composerFiles: ComposerFiles?
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
      composerFiles = ComposerFiles(controller: controller)
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
