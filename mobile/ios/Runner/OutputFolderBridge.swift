import Flutter
import UIKit
import Foundation
import Darwin

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
      case "probe": self.read(call.arguments, result, probeOnly: true)
      case "describe", "copyForRename", "deleteFile": self.mutate(call.method, call.arguments, result)
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

  private func canonicalAppURL(_ raw: String) -> URL? {
    guard raw.hasPrefix("/"), !raw.contains("\\"),
          raw.rangeOfCharacter(from: .controlCharacters) == nil,
          !raw.dropFirst().split(separator: "/", omittingEmptySubsequences: false).contains(where: { $0.isEmpty || $0 == "." || $0 == ".." }) else { return nil }
    let url = URL(fileURLWithPath: raw).standardizedFileURL
    let home = URL(fileURLWithPath: NSHomeDirectory(), isDirectory: true).standardizedFileURL
    let realHome = home.resolvingSymlinksInPath()
    // /var -> /private/var is a system alias ABOVE the container. A symlink
    // within the app tree, even one that points back inside, is not authorized.
    for spelling in [home, realHome] where url == spelling || beneath(url, spelling) {
      let suffix = String(url.path.dropFirst(spelling.path.count))
      let expected = URL(fileURLWithPath: realHome.path + suffix).standardizedFileURL
      if url.resolvingSymlinksInPath().path == expected.path { return url }
    }
    return nil
  }

  private func authorizedRoot(_ root: String) -> URL? {
    if let granted = grants[root] { return granted }
    // App-owned Documents/Library/tmp are actual sandbox resources, not an
    // external grant. Keeping their original path also supports session imports.
    return canonicalAppURL(root)
  }

  private func write(_ arguments: Any?, _ result: @escaping FlutterResult) {
    guard let args = arguments as? [String: Any], let root = args["root"] as? String,
          let url = authorizedRoot(root) else {
      result(FlutterError(code: "output_folder_permission", message: "Output root is neither an active folder grant nor an app-owned directory", details: nil)); return
    }
    guard let folders = args["folders"] as? [String], folders.count <= 2, folders.allSatisfy(component),
          let stem = args["stem"] as? String, component(stem) else {
      result(FlutterError(code: "output_folder_invalid", message: "Invalid output subfolder or image name", details: nil)); return
    }
    guard let typed = args["bytes"] as? FlutterStandardTypedData,
          typed.data.count >= 8, typed.data.count <= 64 * 1024 * 1024,
          Array(typed.data.prefix(8)) == [137, 80, 78, 71, 13, 10, 26, 10] else {
      result(FlutterError(code: "output_folder_invalid", message: "Output requires a bounded PNG", details: nil)); return
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

  // Resolve authorization on the main thread before queueing IO. A remembered
  // but inactive grant is NOT a missing file, and never falls back to a sandbox
  // copy. App-container URLs are legitimate image-picker/import/session files.
  private func read(_ arguments: Any?, _ result: @escaping FlutterResult, probeOnly: Bool = false) {
    guard let args = arguments as? [String: Any], let raw = args["path"] as? String,
          raw.hasPrefix("/"), !raw.contains("\\"),
          raw.rangeOfCharacter(from: .controlCharacters) == nil,
          !raw.dropFirst().split(separator: "/", omittingEmptySubsequences: false).contains(where: { $0.isEmpty || $0 == "." || $0 == ".." }) else {
      result(FlutterError(code: "output_folder_invalid", message: "Invalid image path", details: nil)); return
    }
    let limit = args["maxBytes"] as? Int ?? 64 * 1024 * 1024
    guard limit > 0, limit <= 64 * 1024 * 1024 else {
      result(FlutterError(code: "output_folder_invalid", message: "Invalid image size limit", details: nil)); return
    }
    let file = URL(fileURLWithPath: raw).standardizedFileURL
    let remembered = records.compactMap { $0["path"] as? String }.sorted(by: { $0.count > $1.count })
      .first(where: { raw.hasPrefix($0 + "/") })
    let base: URL
    let external: Bool
    if let root = remembered {
      guard let granted = grants[root] else {
        result(FlutterError(code: "output_folder_permission", message: "Output folder access expired; reselect the folder. History was retained", details: nil)); return
      }
      base = granted; external = true
    } else {
      guard canonicalAppURL(raw) != nil else {
        result(FlutterError(code: "output_folder_permission", message: "Image has no active saved folder grant", details: nil)); return
      }
      base = URL(fileURLWithPath: NSHomeDirectory(), isDirectory: true); external = false
    }
    guard file.path == raw, beneath(file.resolvingSymlinksInPath(), base.resolvingSymlinksInPath()) else {
      result(FlutterError(code: "output_folder_invalid", message: "Image path left its authorized folder", details: nil)); return
    }
    worker.async {
      var error: NSError?, bytes: Data?, readError: Error?, probed = false
      NSFileCoordinator().coordinate(readingItemAt: file, options: [], error: &error) { coordinated in
        do {
          guard self.beneath(coordinated.resolvingSymlinksInPath(), base.resolvingSymlinksInPath()) else { throw self.problem("Coordinated image left authorized folder") }
          let values = try coordinated.resourceValues(forKeys: [.isRegularFileKey, .isSymbolicLinkKey, .fileSizeKey])
          guard values.isRegularFile == true, values.isSymbolicLink != true, let count = values.fileSize,
                count > 0, count <= limit else { throw self.problem("Invalid or oversized image") }
          if probeOnly { probed = true; return }
          // POSIX read reports errno on iOS 12 instead of raising an ObjC
          // FileHandle exception. All IO stays inside this coordinated grant.
          let descriptor = Darwin.open(coordinated.path, O_RDONLY | O_NOFOLLOW | O_NONBLOCK)
          guard descriptor >= 0 else { throw NSError(domain: NSPOSIXErrorDomain, code: Int(errno), userInfo: nil) }
          defer { _ = Darwin.close(descriptor) }
          var descriptorValues = stat()
          if Darwin.fstat(descriptor, &descriptorValues) != 0 {
            throw NSError(domain: NSPOSIXErrorDomain, code: Int(errno), userInfo: nil)
          }
          guard (descriptorValues.st_mode & mode_t(S_IFMT)) == mode_t(S_IFREG),
                descriptorValues.st_size > 0, descriptorValues.st_size <= off_t(limit) else { throw self.problem("Invalid or oversized image descriptor") }
          var data = Data()
          var buffer = [UInt8](repeating: 0, count: 64 * 1024)
          while data.count <= limit {
            let requested = min(buffer.count, limit + 1 - data.count)
            let count = buffer.withUnsafeMutableBytes { Darwin.read(descriptor, $0.baseAddress!, requested) }
            if count < 0 {
              let code = errno
              if code == EINTR { continue }
              throw NSError(domain: NSPOSIXErrorDomain, code: Int(code), userInfo: nil)
            }
            if count == 0 { break }
            data.append(contentsOf: buffer.prefix(count))
          }
          guard !data.isEmpty, data.count <= limit else { throw self.problem("Image changed size during read") }
          bytes = data
        } catch { readError = error }
      }
      DispatchQueue.main.async {
        if let failure = error ?? (readError as NSError?) {
          // Provider offline/permission/materialization failures can resemble a
          // missing file. Only a local app-container no-such-file is deletable.
          let missing = !external && ((failure.domain == NSCocoaErrorDomain &&
            [NSFileNoSuchFileError, NSFileReadNoSuchFileError].contains(failure.code)) ||
            (failure.domain == NSPOSIXErrorDomain && failure.code == Int(ENOENT)))
          result(FlutterError(code: missing ? "output_image_missing" : "output_folder_read",
            message: "Image unavailable; reconnect or reselect its folder. Original history was retained", details: nil))
        } else if probeOnly && probed { result(["available": true, "coordinated": true]) }
        else if let data = bytes { result(FlutterStandardTypedData(bytes: data)) }
        else { result(FlutterError(code: "output_folder_read", message: "Image unavailable; original history was retained", details: nil)) }
      }
    }
  }
  // Receipts are bounded, process-local identities, not persisted permissions or
  // proof that every remembered grant is a current managed output directory.
  private struct MutationContext {
    let base: URL
    let external: Bool
    let managedRoot: String?
  }
  private struct MutationRecord {
    let file: URL
    let context: MutationContext
    let identity: String
    let created: Bool
  }
  private var mutationReceipts: [String: MutationRecord] = [:]
  private var mutationOrder: [String] = []

  private func mutationContext(_ raw: String, _ roots: [String]) throws -> MutationContext {
    guard raw.hasPrefix("/"), !raw.contains("\\"),
          raw.rangeOfCharacter(from: .controlCharacters) == nil,
          !raw.dropFirst().split(separator: "/", omittingEmptySubsequences: false).contains(where: { $0.isEmpty || $0 == "." || $0 == ".." }),
          roots.count <= 2 else { throw problem("Invalid mutation path") }
    let file = URL(fileURLWithPath: raw).standardizedFileURL
    let remembered = records.compactMap { $0["path"] as? String }.sorted(by: { $0.count > $1.count }).first(where: { raw.hasPrefix($0 + "/") })
    let base: URL
    let external: Bool
    if let root = remembered {
      guard let grant = grants[root] else { throw problem("Directory permission unavailable; history retained") }
      base = grant; external = true
    } else {
      guard canonicalAppURL(raw) != nil else { throw problem("No current native access to image") }
      base = URL(fileURLWithPath: NSHomeDirectory(), isDirectory: true); external = false
    }
    // Ownership is the caller's CURRENT managed-root policy, not grants.keys.
    let owned = roots.first(where: { root in
      guard let authorized = authorizedRoot(root), beneath(file, authorized) else { return false }
      return authorized.standardizedFileURL.path == root
    })
    return MutationContext(base: base, external: external, managedRoot: owned)
  }
  private func checkedMutationURL(_ original: URL, _ coordinated: URL, _ context: MutationContext) throws {
    let base = context.base.standardizedFileURL
    guard beneath(original, base) else { throw problem("Mutation left its authorized root") }
    let realBase = base.resolvingSymlinksInPath()
    let suffix = String(original.path.dropFirst(base.path.count))
    let expected = URL(fileURLWithPath: realBase.path + suffix).standardizedFileURL
    guard coordinated.resolvingSymlinksInPath().path == expected.path,
          beneath(expected, realBase) else { throw problem("Coordinator changed file identity or root") }
    // Permit only system aliases above root, never links within its subtree.
    var cursor = realBase
    for part in suffix.split(separator: "/") {
      cursor.appendPathComponent(String(part))
      var info = stat()
      if Darwin.lstat(cursor.path, &info) == 0 {
        guard (info.st_mode & mode_t(S_IFMT)) != mode_t(S_IFLNK) else { throw problem("Nested links cannot authorize mutation") }
      } else if errno != ENOENT { throw NSError(domain: NSPOSIXErrorDomain, code: Int(errno), userInfo: nil) }
    }
  }
  private func mutationIdentity(_ file: URL) throws -> (String, stat) {
    var info = stat()
    guard Darwin.lstat(file.path, &info) == 0 else { throw NSError(domain: NSPOSIXErrorDomain, code: Int(errno), userInfo: nil) }
    return (mutationIdentityValue(info), info)
  }
  private func mutationIdentityValue(_ info: stat) -> String {
    "\(info.st_dev):\(info.st_ino):\(info.st_size):\(info.st_mtimespec.tv_sec):\(info.st_mtimespec.tv_nsec):\(info.st_ctimespec.tv_sec):\(info.st_ctimespec.tv_nsec)"
  }
  private func regularMutationFile(_ info: stat) -> Bool {
    (info.st_mode & mode_t(S_IFMT)) == mode_t(S_IFREG) && info.st_size > 0 && info.st_size <= 64 * 1024 * 1024
  }
  private func mutationDescription(_ file: URL, _ context: MutationContext, _ state: String,
                                   identity: String? = nil, created: Bool = false) -> [String: Any] {
    var value: [String: Any] = ["path":file.path, "root":context.base.path, "state":state,
      "coordinated":true, "available":true, "created":created]
    if let managed = context.managedRoot { value["managedRoot"] = managed }
    if let identity = identity {
      let token = UUID().uuidString.lowercased()
      mutationReceipts[token] = MutationRecord(file:file, context:context, identity:identity, created:created)
      mutationOrder.append(token)
      if mutationOrder.count > 512 { mutationReceipts.removeValue(forKey: mutationOrder.removeFirst()) }
      value["receipt"] = token
    }
    return value
  }
  private func readMutationBytes(_ file: URL, _ expected: String) throws -> Data {
    let fd = Darwin.open(file.path, O_RDONLY | O_NOFOLLOW | O_NONBLOCK)
    guard fd >= 0 else { throw NSError(domain: NSPOSIXErrorDomain, code:Int(errno), userInfo:nil) }
    defer { _ = Darwin.close(fd) }
    var before = stat()
    guard Darwin.fstat(fd, &before) == 0, regularMutationFile(before), mutationIdentityValue(before) == expected, try mutationIdentity(file).0 == expected else { throw problem("Image identity changed before copy") }
    var data = Data(), buffer = [UInt8](repeating:0, count:64 * 1024)
    while data.count <= 64 * 1024 * 1024 {
      let requested = min(buffer.count, 64 * 1024 * 1024 + 1 - data.count)
      let count = buffer.withUnsafeMutableBytes { Darwin.read(fd, $0.baseAddress!, requested) }
      if count < 0 { if errno == EINTR { continue }; throw NSError(domain:NSPOSIXErrorDomain, code:Int(errno), userInfo:nil) }
      if count == 0 { break }
      data.append(contentsOf:buffer.prefix(count))
    }
    guard data.count == Int(before.st_size), try mutationIdentity(file).0 == expected else { throw problem("Image identity changed during copy") }
    return data
  }
  private func mutate(_ method: String, _ arguments: Any?, _ result: @escaping FlutterResult) {
    guard let args = arguments as? [String: Any], let path = args["path"] as? String else {
      result(FlutterError(code:"output_folder_invalid", message:"Invalid mutation request", details:nil)); return
    }
    let context: MutationContext
    do {
      let roots: [String]
      if method == "describe" { guard let selected = args["managedRoots"] as? [String] else { throw problem("Managed roots required") }; roots = selected }
      else { roots = [] }
      context = try mutationContext(path, roots)
    } catch { result(FlutterError(code:"output_folder_permission", message:"Image provider unavailable; history retained", details:nil)); return }
    let file = URL(fileURLWithPath:path).standardizedFileURL
    worker.async {
      do {
        var coordinationError: NSError?, operationError: Error?, output: [String: Any]?
        if method == "describe" {
          NSFileCoordinator().coordinate(readingItemAt:file, options:[], error:&coordinationError) { actual in
            do {
              try self.checkedMutationURL(file, actual, context)
              do {
                let (identity, info) = try self.mutationIdentity(actual)
                output = self.mutationDescription(file, context, self.regularMutationFile(info) ? "file" : "other", identity:self.regularMutationFile(info) ? identity : nil)
              } catch let error as NSError where !context.external && error.domain == NSPOSIXErrorDomain && error.code == Int(ENOENT) {
                // Only an accessible app-container parent may establish missing.
                _ = try FileManager.default.contentsOfDirectory(atPath:actual.deletingLastPathComponent().path)
                output = self.mutationDescription(file, context, "missing")
              }
            } catch { operationError = error }
          }
        } else {
          guard let token = args["receipt"] as? String, let record = self.mutationReceipts[token],
                record.file.path == path, record.context.base.path == context.base.path else { throw self.problem("Mutation identity receipt expired") }
          if method == "copyForRename" {
            guard let stem = args["stem"] as? String, self.component(stem) else { throw self.problem("Invalid image name") }
            let parent = file.deletingLastPathComponent()
            let ext = file.pathExtension.isEmpty ? "png" : file.pathExtension
            var copied = false
            var cachedBytes: Data?
            // Coordinate each exact candidate item, not just its parent (a
            // parent-directory writer does not wait for every child reader).
            for index in 1...10000 {
              let name = stem + (index == 1 ? "" : "-\(index)") + "." + ext
              let logical = parent.appendingPathComponent(name)
              var collision = false
              NSFileCoordinator().coordinate(readingItemAt:file, options:[], writingItemAt:logical, options:[], error:&coordinationError) { actual, destination in
                do {
                  try self.checkedMutationURL(file, actual, record.context)
                  try self.checkedMutationURL(logical, destination, record.context)
                  guard try self.mutationIdentity(actual).0 == record.identity else { throw self.problem("Source identity changed during rename") }
                  let bytes: Data
                  if let cached = cachedBytes { bytes = cached }
                  else { bytes = try self.readMutationBytes(actual, record.identity); cachedBytes = bytes }
                  do { try bytes.write(to:destination, options:.withoutOverwriting) }
                  catch let error as NSError where error.domain == NSCocoaErrorDomain && error.code == NSFileWriteFileExistsError { collision = true; return }
                  let (identity, info) = try self.mutationIdentity(destination)
                  guard self.regularMutationFile(info) else { throw self.problem("Created file identity unavailable") }
                  output = ["sourcePath":path,"sourceReceipt":token,"coordinated":true,"createdExclusive":true,
                    "destination":self.mutationDescription(logical,record.context,"file",identity:identity,created:true)]
                  copied = true
                } catch { operationError = error }
              }
              if coordinationError != nil || operationError != nil || copied { break }
              guard collision else { throw self.problem("No exclusive destination was created") }
            }
            if coordinationError == nil && operationError == nil && !copied { throw self.problem("Unique rename limit reached") }
          } else {
            guard method == "deleteFile", record.created || record.context.managedRoot != nil else { throw self.problem("Access permission is not ownership") }
            NSFileCoordinator().coordinate(writingItemAt:file, options:.forDeleting, error:&coordinationError) { actual in
              do {
                try self.checkedMutationURL(file, actual, record.context)
                let (identity, info) = try self.mutationIdentity(actual)
                guard identity == record.identity, self.regularMutationFile(info) else { throw self.problem("File was concurrently replaced; retained") }
                try FileManager.default.removeItem(at:actual)
                self.mutationReceipts.removeValue(forKey:token)
                output = ["path":path,"receipt":token,"coordinated":true,"identityVerified":true,"deleted":true]
              } catch { operationError = error }
            }
          }
        }
        if let error = coordinationError { throw error }
        if let error = operationError { throw error }
        guard let output = output else { throw self.problem("No coordinated mutation result") }
        DispatchQueue.main.async { result(output) }
      } catch {
        DispatchQueue.main.async { result(FlutterError(code:"output_folder_mutation", message:"Coordinated image mutation failed; no fallback was used. Reconnect or reselect its folder", details:nil)) }
      }
    }
  }

}
