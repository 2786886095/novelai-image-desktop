import XCTest
import Foundation

// Built in an external host project. It never launches/terminates Runner,
// invokes its bridge, edits defaults/bookmarks, or supplies a synthetic grant.
final class FolderPickerUITests: XCTestCase {
  private var target: XCUIApplication?
  private var actions: [[String: String]] = []

  private func fail(_ message: String) -> NSError {
    NSError(domain: "RealIOSFolderPicker", code: 1,
            userInfo: [NSLocalizedDescriptionKey: message])
  }
  private func capture(_ label: String) {
    if let app = target {
      let tree = XCTAttachment(string: app.debugDescription)
      tree.name = label + "-actual-accessibility-tree"
      tree.lifetime = .keepAlways
      add(tree)
    }
    let screen = XCTAttachment(screenshot: XCUIScreen.main.screenshot())
    screen.name = label + "-actual-simulator-screen"
    screen.lifetime = .keepAlways
    add(screen)
  }
  private func find(_ app: XCUIApplication, _ labels: [String]) -> XCUIElement? {
    let predicate = NSPredicate(format: "label IN %@ OR identifier IN %@", labels, labels)
    for query in [app.buttons, app.cells, app.staticTexts] {
      let matches = query.matching(predicate)
      for index in 0..<matches.count {
        let element = matches.element(boundBy: index)
        if element.exists && element.isHittable { return element }
      }
    }
    return nil
  }
  private func tap(_ element: XCUIElement, _ action: String) throws {
    guard element.exists && element.isHittable && element.isEnabled else {
      throw fail("Observed UI control unavailable: " + action)
    }
    actions.append(["action": action, "label": element.label,
                    "identifier": element.identifier])
    element.tap()
  }

  @MainActor
  func testSelectRealExternalNonceFolder() throws {
    continueAfterFailure = false
    let env = ProcessInfo.processInfo.environment
    func required(_ key: String) throws -> String {
      guard let value = env[key], !value.isEmpty else { throw fail("Missing " + key) }
      return value
    }
    let bundle = try required("STUDIO_APP_ID")
    let source = try required("STUDIO_SOURCE_SHA")
    let profile = try required("STUDIO_PROFILE_SHA")
    let nativePID = try required("STUDIO_NATIVE_PID")
    let nonce = try required("STUDIO_NONCE")
    let folder = try required("STUDIO_FOLDER_NAME")
    guard folder == "NativeOutput-" + nonce, nonce.hasPrefix(nativePID + "-"),
          Int(nativePID) != nil, source.count == 40, profile.count == 64 else {
      throw fail("Malformed runner-bound picker identity")
    }
    let app = XCUIApplication(bundleIdentifier: bundle)
    target = app
    defer { capture("final-picker-state") }
    guard app.state == .runningForeground || app.state == .runningBackground else {
      throw fail("The current Flutter process must already be running")
    }
    if app.state == .runningBackground { app.activate() }
    let cancelLabels = ["Cancel", "取消"]
    let openLabels = ["Open", "Choose", "Select", "打开", "選擇", "选择"]
    let readyDeadline = Date().addingTimeInterval(15)
    while find(app, cancelLabels) == nil || find(app, openLabels) == nil {
      if Date() >= readyDeadline { throw fail("Actual UIDocumentPicker controls did not appear") }
      Thread.sleep(forTimeInterval: 0.15)
    }
    capture("actual-system-picker-present")

    let providers: [(String, [String])] = [
      ("On My iPhone", ["On My iPhone", "我的 iPhone", "在我的 iPhone 上"]),
      ("On My iPad", ["On My iPad", "我的 iPad", "在我的 iPad 上"])
    ]
    var localProvider: String?
    for _ in 0..<6 {
      for (canonical, labels) in providers {
        if labels.contains(where: { app.navigationBars[$0].exists }) {
          localProvider = canonical
          break
        }
        if let location = find(app, labels) {
          try tap(location, "open-observed-external-local-provider")
          Thread.sleep(forTimeInterval: 0.25)
          if labels.contains(where: { app.navigationBars[$0].exists }) {
            localProvider = canonical
            break
          }
        }
      }
      if localProvider != nil { break }
      if let browse = find(app, ["Browse", "浏览", "瀏覽", "Locations", "位置"]) {
        try tap(browse, "browse-system-provider-locations")
      } else { Thread.sleep(forTimeInterval: 0.3) }
    }
    guard let provider = localProvider else {
      throw fail("No real external On My iPhone/iPad provider; app Documents is forbidden")
    }
    capture("observed-external-local-provider")
    let newFolderLabels = ["New Folder", "New folder", "Create Folder", "新建文件夹", "新增檔案夾"]
    var create = find(app, newFolderLabels)
    if create == nil, let more = find(app, ["More", "More Actions", "更多", "更多操作", "ellipsis"]) {
      try tap(more, "open-observed-provider-actions")
      Thread.sleep(forTimeInterval: 0.25)
      create = find(app, newFolderLabels)
    }
    guard let newFolder = create else { throw fail("System provider did not expose New Folder") }
    try tap(newFolder, "new-folder-via-system-picker")
    let field = app.textFields.firstMatch
    guard field.waitForExistence(timeout: 5), field.isHittable else {
      throw fail("Real New Folder naming field did not appear")
    }
    field.tap()
    if let value = field.value as? String, !value.isEmpty {
      field.typeText(String(repeating: XCUIKeyboardKey.delete.rawValue, count: value.count))
    }
    field.typeText(folder)
    guard let commit = find(app, ["Create", "Done", "创建", "建立", "完成"]) else {
      throw fail("Real New Folder confirmation was unavailable")
    }
    try tap(commit, "create-exact-nonce-folder")
    let createDeadline = Date().addingTimeInterval(10)
    while !app.navigationBars[folder].exists {
      if let item = find(app, [folder]) {
        try tap(item, "open-created-exact-nonce-folder")
      }
      if Date() >= createDeadline { throw fail("The new nonce directory was not opened") }
      Thread.sleep(forTimeInterval: 0.2)
    }
    capture("exact-nonce-folder-open-in-system-picker")
    guard let confirm = find(app, openLabels) else {
      throw fail("Real open-directory confirmation was unavailable")
    }
    try tap(confirm, "confirm-system-directory-selection")
    let closeDeadline = Date().addingTimeInterval(10)
    while app.navigationBars[folder].exists {
      if Date() >= closeDeadline { throw fail("System picker did not dismiss after selection") }
      Thread.sleep(forTimeInterval: 0.15)
    }
    let result: [String: Any] = [
      "sourceSha": source, "profileSha": profile,
      "nativePid": Int(nativePID)!, "nonce": nonce,
      "requiredFolderName": folder, "appId": bundle,
      "actualSystemPicker": true, "localProvider": provider,
      "createdExactNonceFolder": true, "confirmedSelection": true,
      "targetAppNotLaunchedOrTerminated": true, "actions": actions
    ]
    let data = try JSONSerialization.data(withJSONObject: result, options: [.sortedKeys])
    print("IOS_FOLDER_PICKER_UI_RESULT:" + String(decoding: data, as: UTF8.self))
    // The real native Dart scenario, not this support driver, subsequently
    // asserts the persisted security bookmark, outside-container path, exact
    // PNG bytes and fresh-history linkage before emitting its scenario CHECK.
  }
}
