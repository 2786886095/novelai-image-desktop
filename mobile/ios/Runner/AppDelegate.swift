import Flutter
import UIKit
import CFNetwork

@main
@objc class AppDelegate: FlutterAppDelegate {
  private static let incomingBackupPending = "__incoming_backup_pending__"
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
