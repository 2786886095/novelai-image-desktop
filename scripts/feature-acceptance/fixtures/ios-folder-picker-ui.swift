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
  // DocumentManager's bar has a generic identifier; the directory name is
  // a direct StaticText child. Never accept a cached browsingRoot, sidebar,
  // or a descendant text inside a back button as the current title.
  private func currentNavigationTitle(_ app: XCUIApplication) throws -> String? {
    let viewFrame = app.frame
    var visibleTitles: [XCUIElement] = []
    for bar in app.navigationBars.allElementsBoundByIndex {
      guard bar.exists else { continue }
      let barFrame = bar.frame
      guard !barFrame.isEmpty && viewFrame.intersects(barFrame) else { continue }
      let directTitles = bar.children(matching: .staticText).allElementsBoundByIndex.filter { title in
        guard title.exists else { return false }
        let titleFrame = title.frame
        return !titleFrame.isEmpty &&
          barFrame.contains(titleFrame) && viewFrame.contains(titleFrame)
      }
      guard directTitles.count <= 1 else {
        throw fail("Ambiguous visible direct navigation titles")
      }
      visibleTitles.append(contentsOf: directTitles)
    }
    guard visibleTitles.count <= 1 else {
      throw fail("Ambiguous current visible navigation bars")
    }
    return visibleTitles.first?.label
  }
  // Identity text is observed, not tapped. Record hit state independently on
  // exit, with no waits/retries and bounded records; never affects acceptance.
  private func captureCurrentTitleObservation(_ app: XCUIApplication) {
    func rect(_ r: CGRect) -> [Double] { [Double(r.origin.x), Double(r.origin.y), Double(r.width), Double(r.height)] }
    let bars = app.navigationBars.allElementsBoundByIndex
    var observations: [[String: Any]] = []
    for bar in bars.prefix(3) {
      guard bar.exists else { continue }
      let titles = bar.children(matching: .staticText).allElementsBoundByIndex
      var directTitles: [[String: Any]] = []
      for title in titles.prefix(3) {
        guard title.exists else { continue }
        directTitles.append(["label": title.label, "exists": true,
          "isHittable": title.isHittable, "isEnabled": title.isEnabled,
          "frame": rect(title.frame)])
      }
      observations.append(["frame": rect(bar.frame), "directTitles": directTitles,
        "directTitleCount": titles.count, "titlesTruncated": titles.count > 3])
    }
    let payload: [String: Any] = ["observationOnly": true, "acceptanceDependent": false,
      "phase": "final-defer", "appFrame": rect(app.frame), "rawBarCount": bars.count,
      "barsTruncated": bars.count > 3, "bars": observations]
    let text: String
    do {
      text = String(decoding: try JSONSerialization.data(withJSONObject: payload,
        options: [.sortedKeys]), as: UTF8.self)
    } catch {
      // Only an observation encoding failure is recorded here. The original
      // test error/success remains unchanged; no acceptance exception is caught.
      text = "Title observation JSON encoding failed: " + String(describing: error)
    }
    let attachment = XCTAttachment(string: text)
    attachment.name = "final-current-title-observation-only"
    attachment.lifetime = .keepAlways
    add(attachment)
  }
  private func waitForNavigationTitle(_ app: XCUIApplication, _ labels: [String]) throws -> Bool {
    // A bounded transition wait, not an extension of the outer UI140/Dart180.
    let deadline = Date().addingTimeInterval(5)
    repeat {
      if let title = try currentNavigationTitle(app), labels.contains(title) { return true }
      if Date() >= deadline { return false }
      Thread.sleep(forTimeInterval: 0.15)
    } while true
  }
  private struct FolderNameControl {
    let field: XCUIElement
    let isInline: Bool
    let modalCommit: XCUIElement?
  }
  private func usable(_ element: XCUIElement, _ app: XCUIApplication) -> Bool {
    guard element.exists && element.isHittable && element.isEnabled else { return false }
    let frame = element.frame
    return !frame.isEmpty && app.frame.contains(frame)
  }
  private func isSearchField(_ element: XCUIElement) -> Bool {
    let search = ["search", "搜索", "搜尋"]
    return search.contains(element.identifier.lowercased()) || search.contains(element.label.lowercased())
  }
  private func currentKeyboardDone(_ app: XCUIApplication) throws -> XCUIElement? {
    let keyboards = app.keyboards.allElementsBoundByIndex.filter { keyboard in
      guard keyboard.exists else { return false }
      return !keyboard.frame.isEmpty && app.frame.intersects(keyboard.frame)
    }
    guard keyboards.count <= 1 else { throw fail("Ambiguous current system keyboards") }
    guard let keyboard = keyboards.first else { return nil }
    let done = keyboard.buttons.allElementsBoundByIndex.filter { button in
      return button.identifier == "Done" && ["done", "Done", "完成"].contains(button.label) &&
        usable(button, app) && keyboard.frame.contains(button.frame)
    }
    guard done.count <= 1 else { throw fail("Ambiguous prepared keyboard Done controls") }
    return done.first
  }
  private func currentFolderNameControl(_ app: XCUIApplication, _ providerLabels: [String]) throws -> FolderNameControl? {
    var prepared: [FolderNameControl] = []
    let inline = app.textViews.allElementsBoundByIndex.filter { field in
      field.identifier == "DOC.inlineRenameField" && !isSearchField(field) && usable(field, app)
    }
    guard inline.count <= 1 else { throw fail("Ambiguous visible inline folder naming controls") }
    if let field = inline.first, let title = try currentNavigationTitle(app),
       providerLabels.contains(title), try currentKeyboardDone(app) != nil {
      prepared.append(FolderNameControl(field: field, isInline: true, modalCommit: nil))
    }
    // Preserve the actual modal TextField/Create flow, but only within the
    // same visible alert/sheet. Never search arbitrary app text fields or a
    // global Done/Create button behind the picker.
    for modal in app.alerts.allElementsBoundByIndex + app.sheets.allElementsBoundByIndex {
      guard modal.exists && !modal.frame.isEmpty && app.frame.intersects(modal.frame) else { continue }
      let fields = modal.textFields.allElementsBoundByIndex.filter { field in
        !isSearchField(field) && usable(field, app) && modal.frame.contains(field.frame)
      }
      let commits = modal.buttons.allElementsBoundByIndex.filter { button in
        // A modal Create can be disabled before a name is typed. Bind the
        // same visible control now; tap() still requires enabled at commit.
        ["Create", "Done", "创建", "建立", "完成"].contains(button.label) &&
          button.exists && button.isHittable && !button.frame.isEmpty &&
          app.frame.contains(button.frame) && modal.frame.contains(button.frame)
      }
      guard fields.count <= 1 && commits.count <= 1 else { throw fail("Ambiguous modal folder naming controls") }
      if let field = fields.first, let commit = commits.first {
        prepared.append(FolderNameControl(field: field, isInline: false, modalCommit: commit))
      }
    }
    guard prepared.count <= 1 else { throw fail("Multiple prepared folder naming flows") }
    return prepared.first
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
    defer { capture("final-picker-state"); captureCurrentTitleObservation(app) }
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
    for attempt in 0..<6 {
      for (canonical, labels) in providers {
        if let title = try currentNavigationTitle(app), labels.contains(title) {
          localProvider = canonical
          break
        }
        if let location = find(app, labels) {
          try tap(location, "open-observed-external-local-provider")
          Thread.sleep(forTimeInterval: 0.25)
          capture("provider-tap-\(attempt)-\(canonical)")
          if try waitForNavigationTitle(app, labels) {
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
      throw fail("External provider navigation title was not verified; availability is undetermined and app Documents is forbidden")
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
    let namingDeadline = Date().addingTimeInterval(5)
    capture("after-new-folder-action")
    let providerLabels = providers.flatMap { $0.1 }
    var naming = try currentFolderNameControl(app, providerLabels)
    while naming == nil {
      if Date() >= namingDeadline { throw fail("No unique prepared inline or modal folder naming control within original5s") }
      Thread.sleep(forTimeInterval: 0.15)
      naming = try currentFolderNameControl(app, providerLabels)
    }
    // Reject even a nonnil first result if capture/snapshot work exhausted5s.
    if Date() >= namingDeadline { throw fail("Prepared naming control arrived after original5s deadline") }
    guard let control = naming else { throw fail("Prepared folder naming control disappeared") }
    let field = control.field
    // The observed inline editor already has focus/selection. Do not collapse
    // that selection by tapping it. typeText fails if keyboard focus is absent.
    if !control.isInline { field.tap() }
    if let value = field.value as? String, !value.isEmpty {
      field.typeText(String(repeating: XCUIKeyboardKey.delete.rawValue, count: value.count))
    }
    field.typeText(folder)
    guard let exact = field.value as? String, exact == folder else {
      throw fail("Folder naming control does not contain the exact bound nonce")
    }
    guard let current = try currentFolderNameControl(app, providerLabels),
          current.isInline == control.isInline,
          let confirmed = current.field.value as? String, confirmed == folder else {
      throw fail("Current prepared naming flow or exact nonce changed before commit")
    }
    if current.isInline {
      guard let done = try currentKeyboardDone(app) else { throw fail("Unique prepared system keyboard Done disappeared") }
      try tap(done, "create-exact-nonce-folder")
    } else {
      guard let commit = current.modalCommit else { throw fail("Prepared modal Create disappeared") }
      try tap(commit, "create-exact-nonce-folder")
    }
    let createDeadline = Date().addingTimeInterval(10)
    capture("after-folder-name-commit")
    while try currentNavigationTitle(app) != folder {
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
    while try currentNavigationTitle(app) != nil ||
          find(app, cancelLabels) != nil || find(app, openLabels) != nil {
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
