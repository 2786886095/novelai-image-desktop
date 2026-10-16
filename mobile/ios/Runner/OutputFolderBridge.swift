import Flutter
import UIKit
import Foundation

// Actual document-picker grants, not arbitrary path permission. Bookmarks stay
// in this app's defaults; resolved grants live until this bridge/process ends so
// existing history FileImage readers can still read their real output paths.
// Coordinated native read/write is available for external provider operations.
final class OutputFolderBridge: NSObject, UIDocumentPickerDelegate, UIAdaptivePresentationControllerDelegate {
  private let key = "langbai.output-folder.bookmarks.v1"
  private let channel: FlutterMethodChannel
  private weak var controller: FlutterViewController?
  private var pending: FlutterResult?
  private var records: [[String: Any]] = []
  private var grants: [String: URL] = [:]
  private var failures: [String: String] = [:]
  private let worker = DispatchQueue(label: "langbai.output-folder.io")

  init(controller: FlutterViewController) {
    self.controller = controller
    channel = FlutterMethodChannel(name: "langbai.novelai/output_folder", binaryMessenger: controller.binaryMessenger)
    super.init()
    records = Array((UserDefaults.standard.array(forKey: key) as? [[String: Any]] ?? []).prefix(32))
    for record in records { restore(record) }
    channel.setMethodCallHandler { [weak self] call, result in
      guard let self = self else { result(FlutterError(code: "output_folder", message: "Folder bridge unavailable", details: nil)); return }
      switch call.method {
      case "pick": self.pick(result)
      case "status": result(self.status())
      case "write": self.write(call.arguments, result)
      case "read": self.read(call.arguments, result)
      default: result(FlutterMethodNotImplemented)
      }
    }
  }

  deinit { for url in grants.values { url.stopAccessingSecurityScopedResource() } }

  private func restore(_ record: [String: Any]) {
    guard let root = record["path"] as? String, let data = record["bookmark"] as? Data else { return }
    do {
      var stale = false
      let url = try URL(resolvingBookmarkData: data, options: .withoutUI, relativeTo: nil, bookmarkDataIsStale: &stale)
      guard url.isFileURL, url.startAccessingSecurityScopedResource() else { throw problem("Directory permission is unavailable; choose the folder again") }
      // A moved provider root needs an explicit re-selection/reconciliation.
      // Never silently relabel historical paths as a different directory.
      guard url.standardizedFileURL.path == root else {
        url.stopAccessingSecurityScopedResource()
        throw problem("Directory moved; choose it again before using its previous history paths")
      }
      grants[root] = url
      if stale, let refreshed = try? url.bookmarkData(options: .minimalBookmark, includingResourceValuesForKeys: nil, relativeTo: nil),
         let index = records.firstIndex(where: { $0["path"] as? String == root }) {
        records[index]["bookmark"] = refreshed
        UserDefaults.standard.set(records, forKey: key)
      }
    } catch { failures[root] = "Directory permission is unavailable or the folder moved; choose it again" }
  }

  private func status() -> [[String: Any]] {
    records.compactMap { row in
      guard let root = row["path"] as? String else { return nil }
      return ["path": root, "available": grants[root] != nil, "bookmarkSaved": row["bookmark"] is Data,
              "message": failures[root] ?? ""]
    }
  }

  private func pick(_ result: @escaping FlutterResult) {
    guard pending == nil, let controller = controller, controller.presentedViewController == nil else {
      result(FlutterError(code: "output_folder_busy", message: "Finish the current native dialog first", details: nil)); return
    }
    guard #available(iOS 13.0, *) else {
      result(FlutterError(code: "output_folder_version", message: "Directory selection requires iOS 13 or newer", details: nil)); return
    }
    pending = result
    let picker = UIDocumentPickerViewController(documentTypes: ["public.folder"], in: .open)
    picker.delegate = self
    picker.allowsMultipleSelection = false
    picker.presentationController?.delegate = self
    controller.present(picker, animated: true) {
      picker.presentationController?.delegate = self
    }
  }

  func documentPickerWasCancelled(_ controller: UIDocumentPickerViewController) { finish(nil) }
  func presentationControllerDidDismiss(_ presentationController: UIPresentationController) { finish(nil) }
  private func finish(_ value: Any?) { let result = pending; pending = nil; result?(value) }

  func documentPicker(_ controller: UIDocumentPickerViewController, didPickDocumentsAt urls: [URL]) {
    guard let url = urls.first, url.isFileURL, url.startAccessingSecurityScopedResource() else {
      finish(FlutterError(code: "output_folder_permission", message: "The folder did not grant access", details: nil)); return
    }
    let root = url.standardizedFileURL.path
    do {
      guard try url.resourceValues(forKeys: [.isDirectoryKey]).isDirectory == true else { throw problem("Selection is not a directory") }
      let data = try url.bookmarkData(options: .minimalBookmark, includingResourceValuesForKeys: nil, relativeTo: nil)
      if let index = records.firstIndex(where: { $0["path"] as? String == root }) { records[index] = ["path": root, "bookmark": data] }
      else {
        guard records.count < 32 else { throw problem("Too many remembered output folders; existing history grants were not removed") }
        records.append(["path": root, "bookmark": data])
      }
      grants[root]?.stopAccessingSecurityScopedResource()
      grants[root] = url
      failures.removeValue(forKey: root)
      UserDefaults.standard.set(records, forKey: key)
      finish(["path": root, "bookmarkSaved": true, "available": true])
    } catch {
      url.stopAccessingSecurityScopedResource()
      finish(FlutterError(code: "output_folder_permission", message: "Unable to remember this output folder", details: nil))
    }
  }

  private func problem(_ message: String) -> NSError { NSError(domain: "LangbaiOutputFolder", code: 1, userInfo: [NSLocalizedDescriptionKey: message]) }
  private func component(_ value: String) -> Bool {
    !value.isEmpty && value != "." && value != ".." && value.utf8.count <= 240 &&
      value.rangeOfCharacter(from: CharacterSet(charactersIn: "/\\\0").union(.controlCharacters)) == nil
  }
  private func beneath(_ url: URL, _ root: URL) -> Bool {
    let base = root.standardizedFileURL.path
    return url.standardizedFileURL.path.hasPrefix(base + "/")
  }

  private func authorizedRoot(_ root: String) -> URL? {
    if let granted = grants[root] { return granted }
    // Existing app-managed output and isolated acceptance directories remain
    // valid without an external grant. A supplied external path never creates
    // permission, and symlinks must not turn this into an escape hatch.
    guard let docs = FileManager.default.urls(for: .documentDirectory, in: .userDomainMask).first else { return nil }
    let url = URL(fileURLWithPath: root).standardizedFileURL
    guard url.path == root, url == docs.standardizedFileURL || beneath(url, docs),
          url.resolvingSymlinksInPath() == docs.resolvingSymlinksInPath() ||
          beneath(url.resolvingSymlinksInPath(), docs.resolvingSymlinksInPath()) else { return nil }
    return url
  }

  private func write(_ arguments: Any?, _ result: @escaping FlutterResult) {
    guard let args = arguments as? [String: Any], let root = args["root"] as? String, let url = authorizedRoot(root),
          let folders = args["folders"] as? [String], folders.count <= 2, folders.allSatisfy(component),
          let stem = args["stem"] as? String, component(stem), let typed = args["bytes"] as? FlutterStandardTypedData,
          typed.data.count >= 8, typed.data.count <= 64 * 1024 * 1024,
          Array(typed.data.prefix(8)) == [137, 80, 78, 71, 13, 10, 26, 10] else {
      result(FlutterError(code: "output_folder_invalid", message: "A currently authorized folder and bounded PNG are required", details: nil)); return
    }
    let bytes = typed.data
    worker.async {
      do {
        var coordinationError: NSError?, saved: URL?, writeError: Error?
        NSFileCoordinator().coordinate(writingItemAt: url, options: .forMerging, error: &coordinationError) { coordinated in
          do {
            var directory = coordinated
            for folder in folders {
              directory.appendPathComponent(folder, isDirectory: true)
              guard self.beneath(directory, coordinated) else { throw self.problem("Output left selected folder") }
              if (try? directory.resourceValues(forKeys: [.isSymbolicLinkKey]).isSymbolicLink) == true { throw self.problem("Output subfolder is a symlink") }
              try FileManager.default.createDirectory(at: directory, withIntermediateDirectories: true, attributes: nil)
            }
            for index in 0..<10000 {
              let name = stem + (index == 0 ? "" : "-\(index)") + ".png"
              let file = directory.appendingPathComponent(name)
              guard self.beneath(file, coordinated) else { throw self.problem("Output left selected folder") }
              do { try bytes.write(to: file, options: .withoutOverwriting); saved = file; break }
              catch let error as NSError where error.domain == NSCocoaErrorDomain && error.code == NSFileWriteFileExistsError { continue }
            }
            guard saved != nil else { throw self.problem("Unique image name limit reached") }
          } catch { writeError = error }
        }
        if let error = coordinationError { throw error }
        if let error = writeError { throw error }
        guard let file = saved else { throw self.problem("No output file was written") }
        DispatchQueue.main.async { result(["path": file.path, "root": root, "coordinated": true]) }
      } catch {
        DispatchQueue.main.async { result(FlutterError(code: "output_folder_write", message: "Selected output folder is unavailable; previous images were not replaced", details: nil)) }
      }
    }
  }

  private func read(_ arguments: Any?, _ result: @escaping FlutterResult) {
    guard let args = arguments as? [String: Any], let raw = args["path"] as? String,
          let root = grants.keys.sorted(by: { $0.count > $1.count }).first(where: { raw.hasPrefix($0 + "/") }),
          let base = grants[root] else {
      result(FlutterError(code: "output_folder_permission", message: "History file has no active saved folder grant", details: nil)); return
    }
    let file = URL(fileURLWithPath: raw).standardizedFileURL
    guard file.path == raw, beneath(file, base),
          beneath(file.resolvingSymlinksInPath(), base.resolvingSymlinksInPath()),
          file.pathExtension.lowercased() == "png" else {
      result(FlutterError(code: "output_folder_invalid", message: "Invalid output image path", details: nil)); return
    }
    worker.async {
      var error: NSError?, bytes: Data?, readError: Error?
      NSFileCoordinator().coordinate(readingItemAt: file, options: [], error: &error) { coordinated in
        do {
          let values = try coordinated.resourceValues(forKeys: [.isRegularFileKey, .isSymbolicLinkKey, .fileSizeKey])
          guard values.isRegularFile == true, values.isSymbolicLink != true, let count = values.fileSize, count <= 64 * 1024 * 1024 else { throw self.problem("Invalid output image") }
          bytes = try Data(contentsOf: coordinated)
        } catch { readError = error }
      }
      DispatchQueue.main.async {
        if error != nil || readError != nil || bytes == nil { result(FlutterError(code: "output_folder_read", message: "History output is unavailable; choose its folder again", details: nil)) }
        else { result(FlutterStandardTypedData(bytes: bytes!)) }
      }
    }
  }
}
