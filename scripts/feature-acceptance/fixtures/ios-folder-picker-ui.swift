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
  // normally a direct StaticText child. iOS 26.2 Files can expose the
  // exact nonce directory as a direct, identifier-free title menu button.
  // Never use a cached root, sidebar, or back button as the current title.
  private func currentNavigationTitle(_ app: XCUIApplication, expectedFolder: String? = nil) throws -> String? {
    let viewFrame = app.frame
    var visibleTitles: [String] = []
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
      if let title = directTitles.first {
        visibleTitles.append(title.label)
      } else if let folder = expectedFolder,
                bar.identifier == "FullDocumentManagerViewControllerNavigationBar" {
        let exactTitle = folder + ", Actions Menu"
        let titlePredicate = NSPredicate(format: "label == %@", exactTitle)
        let menus = bar.children(matching: .button).matching(titlePredicate).allElementsBoundByAccessibilityElement.filter { menu in
          guard menu.exists, menu.identifier.isEmpty else { return false }
          let menuFrame = menu.frame
          return !menuFrame.isEmpty && barFrame.contains(menuFrame) && viewFrame.contains(menuFrame)
        }
        guard menus.count <= 1 else { throw fail("Ambiguous exact folder title menu buttons") }
        if !menus.isEmpty { visibleTitles.append(folder) }
      }
    }
    guard visibleTitles.count <= 1 else {
      throw fail("Ambiguous current visible navigation bars")
    }
    return visibleTitles.first
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
  private func usable(_ element: XCUIElement, _ viewFrame: CGRect) -> Bool {
    guard element.exists && element.isHittable && element.isEnabled else { return false }
    let frame = element.frame
    return !frame.isEmpty && viewFrame.contains(frame)
  }
  private func isSearchField(_ element: XCUIElement) -> Bool {
    let search = ["search", "搜索", "搜尋"]
    return search.contains(element.identifier.lowercased()) || search.contains(element.label.lowercased())
  }
  private func currentKeyboardDone(_ app: XCUIApplication) throws -> XCUIElement? {
    let viewFrame = app.frame
    let keyboards = app.keyboards.allElementsBoundByIndex.filter { keyboard in
      guard keyboard.exists else { return false }
      let frame = keyboard.frame
      return !frame.isEmpty && viewFrame.intersects(frame)
    }
    guard keyboards.count <= 1 else { throw fail("Ambiguous current system keyboards") }
    guard let keyboard = keyboards.first else { return nil }
    let keyboardFrame = keyboard.frame
    let donePredicate = NSPredicate(format: "identifier == %@ AND label IN %@", "Done", ["done", "Done", "完成"])
    let done = keyboard.buttons.matching(donePredicate).allElementsBoundByIndex.filter { button in
      usable(button, viewFrame) && keyboardFrame.contains(button.frame)
    }
    guard done.count <= 1 else { throw fail("Ambiguous prepared keyboard Done controls") }
    return done.first
  }
  private func currentFolderNameControl(_ app: XCUIApplication, _ providerLabels: [String]) throws -> FolderNameControl? {
    let viewFrame = app.frame
    var prepared: [FolderNameControl] = []
    let inlinePredicate = NSPredicate(format: "identifier == %@", "DOC.inlineRenameField")
    let inline = app.textViews.matching(inlinePredicate).allElementsBoundByIndex.filter { field in
      !isSearchField(field) && usable(field, viewFrame)
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
      guard modal.exists && !modal.frame.isEmpty && viewFrame.intersects(modal.frame) else { continue }
      let fields = modal.textFields.allElementsBoundByIndex.filter { field in
        !isSearchField(field) && usable(field, viewFrame) && modal.frame.contains(field.frame)
      }
      guard fields.count <= 1 else { throw fail("Ambiguous modal folder naming controls") }
      if fields.isEmpty { continue }
      let commitPredicate = NSPredicate(format: "label IN %@", ["Create", "Done", "创建", "建立", "完成"])
      let commits = modal.buttons.matching(commitPredicate).allElementsBoundByIndex.filter { button in
        // A modal Create can be disabled before a name is typed. Bind the
        // same visible control now; tap() still requires enabled at commit.
        button.exists && button.isHittable && !button.frame.isEmpty &&
          viewFrame.contains(button.frame) && modal.frame.contains(button.frame)
      }
      guard commits.count <= 1 else { throw fail("Ambiguous modal folder naming controls") }
      if let field = fields.first, let commit = commits.first {
        prepared.append(FolderNameControl(field: field, isInline: false, modalCommit: commit))
      }
    }
    guard prepared.count <= 1 else { throw fail("Multiple prepared folder naming flows") }
    return prepared.first
  }
  private struct NamingEditorWitness {
    // Actual accessibility elements, not an index that can later retarget.
    let field: XCUIElement
    let modalOwner: XCUIElement?
    let isInline: Bool
    let identifier: String
    let frame: [Double]
  }
  private func observedPickerFileView(_ app: XCUIApplication, _ viewFrame: CGRect) throws -> XCUIElement? {
    let fileViewID = NSPredicate(format: "identifier == %@", "File View")
    let visible = app.collectionViews.matching(fileViewID).allElementsBoundByAccessibilityElement.filter {
      guard $0.exists else { return false }
      let frame = $0.frame
      return !frame.isEmpty && viewFrame.intersects(frame)
    }
    guard visible.count <= 1 else { throw fail("Ambiguous real Files collection views") }
    return visible.first
  }

  private func currentNamingEditor(_ app: XCUIApplication, _ fileView: XCUIElement?, _ viewFrame: CGRect,
                                   includeModal: Bool, before deadline: Date) throws -> NamingEditorWitness? {
    func bound(_ field: XCUIElement, _ owner: XCUIElement?, _ inline: Bool,
               _ identifier: String, _ frame: CGRect) -> NamingEditorWitness {
      return NamingEditorWitness(field: field, modalOwner: owner, isInline: inline,
        identifier: identifier,
        frame: [Double(frame.origin.x), Double(frame.origin.y), Double(frame.width), Double(frame.height)])
    }
    let identifier = "DOC.inlineRenameField"
    let exactID = NSPredicate(format: "identifier == %@ AND enabled == YES", identifier)
    // Start the timed query from the retained system collection element.
    // An application-rooted query was still late in 42692894724. Keep
    // the actual binding and full pre-action checks.
    let matches = fileView?.descendants(matching: .textView)
      .matching(exactID).allElementsBoundByAccessibilityElement ?? []
    var inline: [NamingEditorWitness] = []
    for field in matches {
      guard Date() < deadline else { return nil }
      // Enumeration is the existence observation; the exact TextView ID and
      // enabled state are in that same snapshot. Read real hit-testing and
      // bounds now, and revalidate the held object before any action below.
      guard field.isHittable else { continue }
      let frame = field.frame
      if !frame.isEmpty && viewFrame.contains(frame) {
        inline.append(bound(field, nil, true, identifier, frame))
      }
    }
    guard inline.count <= 1 else { throw fail("Ambiguous usable inline editor witnesses") }
    // Appearance witness only: no typing is authorized, and competing modal
    // flows are still checked by the complete validation before any action.
    if let witness = inline.first { return witness }
    guard includeModal, Date() < deadline else { return nil }
    let alerts = app.alerts.allElementsBoundByAccessibilityElement
    guard Date() < deadline else { return nil }
    let sheets = app.sheets.allElementsBoundByAccessibilityElement
    var modalEditors: [NamingEditorWitness] = []
    for owner in alerts + sheets {
      guard Date() < deadline else { return nil }
      guard owner.exists && !owner.frame.isEmpty && viewFrame.intersects(owner.frame) else { continue }
      let fields = owner.textFields.allElementsBoundByAccessibilityElement.filter {
        !isSearchField($0) && usable($0, viewFrame) && owner.frame.contains($0.frame)
      }
      guard fields.count <= 1 else { throw fail("Ambiguous usable same-modal editor witnesses") }
      if let field = fields.first { modalEditors.append(bound(field, owner, false, field.identifier, field.frame)) }
    }
    guard modalEditors.count <= 1 else { throw fail("Multiple usable modal editor witnesses") }
    return modalEditors.first
  }
  private func validatedWitnessFlow(_ app: XCUIApplication, _ providerLabels: [String],
                                    _ witness: NamingEditorWitness) throws -> FolderNameControl {
    // First validate the held objects. Never substitute a newly matching
    // same-ID or same-kind field for the editor that earned the5s witness.
    let viewFrame = app.frame
    guard !isSearchField(witness.field), usable(witness.field, viewFrame) else {
      throw fail("The held editor witness disappeared or became unusable")
    }
    if witness.isInline {
      guard witness.modalOwner == nil, witness.field.identifier == "DOC.inlineRenameField" else {
        throw fail("Held inline witness literal identity changed")
      }
    } else {
      guard let owner = witness.modalOwner, owner.exists && !owner.frame.isEmpty &&
            viewFrame.intersects(owner.frame) && owner.frame.contains(witness.field.frame) else {
        throw fail("The held modal owner or its editor scope disappeared")
      }
      let fields = owner.textFields.allElementsBoundByAccessibilityElement.filter {
        !isSearchField($0) && usable($0, viewFrame) && owner.frame.contains($0.frame)
      }
      guard fields.count == 1 else { throw fail("The held modal no longer has one usable editor") }
    }
    // This complete, one-shot check includes all competing flows, current
    // provider identity, unique keyboard Done and same-modal commit controls.
    // It creates no wait/deadline and its candidate field is NEVER used to type.
    guard let complete = try currentFolderNameControl(app, providerLabels),
          complete.isInline == witness.isInline else {
      throw fail("Full naming safety validation failed after the editor witness")
    }
    if witness.isInline {
      guard usable(witness.field, viewFrame), witness.field.identifier == "DOC.inlineRenameField" else {
        throw fail("Held inline witness invalidated during full safety validation")
      }
      return FolderNameControl(field: witness.field, isInline: true, modalCommit: nil)
    }
    guard let owner = witness.modalOwner, owner.exists,
          usable(witness.field, viewFrame), owner.frame.contains(witness.field.frame) else {
      throw fail("Held modal witness invalidated during full safety validation")
    }
    let predicate = NSPredicate(format: "label IN %@", ["Create", "Done", "创建", "建立", "完成"])
    let commits = owner.buttons.matching(predicate).allElementsBoundByAccessibilityElement.filter {
      $0.exists && $0.isHittable && !$0.frame.isEmpty && viewFrame.contains($0.frame) && owner.frame.contains($0.frame)
    }
    guard commits.count == 1 else { throw fail("No unique commit in the same held modal owner") }
    return FolderNameControl(field: witness.field, isInline: false, modalCommit: commits[0])
  }
  private func recordNamingEditorWitness(_ payload: [String: Any]) throws {
    // Payload contains already read properties, never a new UI query that
    // could retroactively earn pre-deadline credit.
    let data = try JSONSerialization.data(withJSONObject: payload, options: [.sortedKeys])
    let text = String(decoding: data, as: UTF8.self)
    print("IOS_FOLDER_NAMING_EDITOR_WITNESS:" + text)
    let attachment = XCTAttachment(string: text)
    attachment.name = "naming-editor-witness-observation-only"
    attachment.lifetime = .keepAlways
    add(attachment)
  }
  private func finishInlineNameViaOwnedIcon(_ app: XCUIApplication, _ witness: NamingEditorWitness,
                                           _ providerLabels: [String], _ folder: String,
                                           _ deadline: Date, _ bindings: [String: String]) throws {
    // Only one caller attempt, in the already running10s open window. An editor
    // that has disappeared needs no fallback; never act on a replacement.
    guard witness.isInline && witness.field.exists else { return }
    guard Date() < deadline else { throw fail("Owned-icon action exceeded original10s window") }
    let viewFrame = app.frame
    // The held editor's exact value and live hit are revalidated immediately
    // before dispatch below. Do not issue those same AX RPCs twice.
    let title = try currentNavigationTitle(app)
    if title == folder { return }
    guard let title = title, providerLabels.contains(title) else {
      throw fail("Owned-icon action is not in the verified current provider")
    }
    let fieldPredicate = NSPredicate(format: "identifier == %@", "DOC.inlineRenameField")
    // Reject duplicate literal identities (even stale/non-hittable ones);
    // use the sole owning subtree to validate the editor's live properties.
    let global = app.textViews.matching(fieldPredicate).allElementsBoundByAccessibilityElement
    guard global.count == 1 else { throw fail("Owned-icon action lacks one global literal editor") }
    let cellPredicate = NSPredicate(format: "identifier == %@", "Folder")
    let cells = app.cells.matching(cellPredicate).containing(fieldPredicate).allElementsBoundByAccessibilityElement.filter { cell in
      // The carrier is read-only identity, not the interaction target.
      guard cell.exists else { return false }
      let frame = cell.frame
      return !frame.isEmpty && viewFrame.intersects(frame)
    }
    guard cells.count == 1 else { throw fail("Held editor has no unique actual Folder carrier cell") }
    let cell = cells[0]
    let scoped = cell.textViews.matching(fieldPredicate).allElementsBoundByAccessibilityElement.filter {
      !isSearchField($0) && usable($0, viewFrame)
    }
    guard scoped.count == 1, let scopedValue = scoped[0].value as? String, scopedValue == folder else {
      throw fail("Folder carrier does not contain one usable exact-nonce editor")
    }
    // Inline text can overflow its cell: ownership is the actual AX subtree,
    // not cell-frame containment of the editor. Only the image must fit both.
    let cellFrame = cell.frame
    let iconPredicate = NSPredicate(format: "identifier == %@", "Folder84pt")
    let namedIcons = cell.images.matching(iconPredicate).allElementsBoundByAccessibilityElement
    guard namedIcons.count <= 1 else { throw fail("Ambiguous literal Folder84pt icons in the held carrier") }
    // iOS can render the folder image without an AX identifier while renaming.
    // Only the unique image under the already bound exact-nonce carrier can
    // serve as a fallback. It must be above the same editor and contained in
    // that carrier, not just near a global search result or at a guessed point.
    let editorFrame = witness.field.frame
    let icons: [XCUIElement]
    if namedIcons.isEmpty {
      let carrierImages = cell.images.allElementsBoundByAccessibilityElement
      guard carrierImages.count <= 1 else { throw fail("Ambiguous image ownership in the held Folder carrier") }
      icons = carrierImages.filter { image in
        let frame = image.frame
        return image.identifier.isEmpty && image.label.isEmpty && image.exists && image.isEnabled &&
          !frame.isEmpty && viewFrame.contains(frame) && cellFrame.contains(frame) && frame.maxY <= editorFrame.minY &&
          editorFrame.minX <= frame.midX && frame.midX <= editorFrame.maxX
      }
    } else {
      icons = namedIcons.filter { usable($0, viewFrame) && cellFrame.contains($0.frame) }
    }
    // The real system can drop the icon as the commit settles. Never substitute
    // a second action, a different cell, or a guessed coordinate for absence.
    if icons.isEmpty { return }
    guard icons.count == 1 else { throw fail("Ambiguous usable owned folder images") }
    let icon = icons[0]
    let observedIconIdentifier = icon.identifier
    let observedIconFrame = icon.frame
    guard cell.exists, usable(witness.field, viewFrame),
          witness.field.identifier == "DOC.inlineRenameField",
          let confirmed = witness.field.value as? String, confirmed == folder,
          icon.exists, icon.isEnabled, !observedIconFrame.isEmpty,
          viewFrame.contains(observedIconFrame), cellFrame.contains(icon.frame) else {
      throw fail("Held editor/carrier/icon invalidated before the one owned action")
    }
    // This is an observed UI action, NOT a guarantee of commit or navigation.
    // The original exact nonce title, Open selection and native bookmark/bytes
    // checks still decide success. No second Done, newline or filesystem edit.
    if icon.isHittable {
      try tap(icon, "finish-inline-name-via-owned-folder-icon", before: deadline)
    } else {
      // iOS 26 can draw an image without an AX hit action. Only a currently
      // bound unlabeled image within this exact-nonce cell qualifies for one
      // real center hit. Never use a device/global coordinate or a second hit.
      guard namedIcons.isEmpty, observedIconIdentifier.isEmpty, icon.label.isEmpty,
            icon.frame == observedIconFrame, observedIconFrame.maxY <= editorFrame.minY else { return }
      let point = CGPoint(x: observedIconFrame.midX, y: observedIconFrame.midY)
      let overlays = app.keyboards.allElementsBoundByAccessibilityElement
      guard !overlays.contains(where: { $0.exists && $0.frame.contains(point) }) else { return }
      let ownedCenter = icon.coordinate(withNormalizedOffset: CGVector(dx: 0.5, dy: 0.5))
      guard Date() < deadline else { throw fail("Bound folder image hit exceeded original10s window") }
      actions.append(["action": "finish-inline-name-via-owned-folder-icon", "label": "", "identifier": ""])
      ownedCenter.tap()
    }
    print("IOS_FOLDER_OWNED_ICON_ACTION:" + String(decoding:
      try JSONSerialization.data(withJSONObject: ["bindings": bindings,
        "requiredFolderName": folder, "literalCellId": "Folder", "literalIconId": observedIconIdentifier, "imageSelection": namedIcons.isEmpty ? "unique-unlabeled-owned-image" : "literal-Folder84pt",
        "oneAttempt": true,           "secondsRemainingAfterAction": deadline.timeIntervalSinceNow,
"navigationOrCommitGuaranteed": false], options: [.sortedKeys]), as: UTF8.self))
  }
  // Warm UIKit’s software keyboard on the disposable picker before measuring
  // the separate New Folder action. Do not type into search or create anything.
  private func preparePickerKeyboard(_ app: XCUIApplication, _ providerLabels: [String]) throws {
    let viewFrame = app.frame
    let barID = NSPredicate(format: "identifier == %@", "FullDocumentManagerViewControllerNavigationBar")
    let bars = app.navigationBars.matching(barID).allElementsBoundByAccessibilityElement.filter {
      $0.exists && !$0.frame.isEmpty && viewFrame.contains($0.frame)
    }
    guard bars.count <= 1 else { throw fail("Ambiguous provider navigation bar during keyboard preparation") }
    guard let bar = bars.first else { return }
    let searches = bar.searchFields.allElementsBoundByAccessibilityElement.filter {
      isSearchField($0) && usable($0, viewFrame) && bar.frame.contains($0.frame)
    }
    guard searches.count <= 1 else { throw fail("Ambiguous provider search field during keyboard preparation") }
    guard let search = searches.first else { return }
    guard let providerTitle = try currentNavigationTitle(app), providerLabels.contains(providerTitle) else { return }
    try tap(search, "prepare-picker-software-keyboard")
    let keyboard = app.keyboards.firstMatch
    let keyboardAppeared = keyboard.waitForExistence(timeout: 4)
    // iOS exposes the active search scrim as an Other inside the exact
    // DocumentManager search container, not a generic Cancel button.
    let searchContainerID = NSPredicate(format: "identifier == %@", "DOCSearchControllerContainerViewIdentifier")
    let dismissLabel = NSPredicate(format: "label IN %@", ["Activate to dismiss", "轻点关闭", "啟用以關閉"])
    let searchContainers = app.otherElements.matching(searchContainerID).allElementsBoundByAccessibilityElement.filter {
      $0.exists && !$0.frame.isEmpty && viewFrame.contains($0.frame)
    }
    guard searchContainers.count == 1, let container = searchContainers.first else {
      throw fail("No unique active document search container")
    }
    let dismissers = container.children(matching: .other).matching(dismissLabel)
      .allElementsBoundByAccessibilityElement.filter { usable($0, viewFrame) && container.frame.contains($0.frame) }
    guard dismissers.count <= 1 else { throw fail("Ambiguous dismissal controls inside the active document search container") }
    if let dismiss = dismissers.first {
      try tap(dismiss, "leave-picker-search-without-editing")
    } else {
      // Some simulator runtimes expose the scrim in AX but not as hittable.
      // The same native navigation bar still exposes its real provider Back.
      let backID = NSPredicate(format: "identifier == %@", "BackButton")
      let backs = bar.children(matching: .button).matching(backID)
        .allElementsBoundByAccessibilityElement.filter { usable($0, viewFrame) && bar.frame.contains($0.frame) }
      guard backs.count == 1 else { throw fail("No unique provider Back while document search is active") }
      try tap(backs[0], "leave-picker-search-via-provider-back")
      guard container.waitForNonExistence(timeout: 3) else { throw fail("Document search stayed active after provider Back") }
      if try currentNavigationTitle(app) != providerTitle {
        guard let providerLocation = find(app, [providerTitle]) else { throw fail("Original local provider was not offered after provider Back") }
        try tap(providerLocation, "reopen-original-local-provider-after-keyboard-preparation")
      }
    }
    guard container.waitForNonExistence(timeout: 3) else { throw fail("Document search stayed active after dismissal") }
    guard try waitForNavigationTitle(app, providerLabels) else {
      throw fail("Provider navigation title was not restored after keyboard preparation")
    }
    print("IOS_FOLDER_PICKER_KEYBOARD_PREPARATION:\(keyboardAppeared)")
  }

  private func tap(_ element: XCUIElement, _ action: String, before deadline: Date? = nil) throws {
    guard element.exists && element.isHittable && element.isEnabled else {
      throw fail("Observed UI control unavailable: " + action)
    }
    let observedAction = ["action": action, "label": element.label,
                          "identifier": element.identifier]
    // Read real control properties before checking the command-dispatch bound.
    if let deadline = deadline, Date() >= deadline { throw fail("Actual action dispatch exceeded its original deadline") }
    actions.append(observedAction)
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
    let providerLabels = providers.flatMap { $0.1 }
    try preparePickerKeyboard(app, providerLabels)
    let namingViewFrame = app.frame
    let pickerFileView = try observedPickerFileView(app, namingViewFrame)
    let newFolderLabels = ["New Folder", "New folder", "Create Folder", "新建文件夹", "新增檔案夾"]
    var create = find(app, newFolderLabels)
    if create == nil, let more = find(app, ["More", "More Actions", "更多", "更多操作", "ellipsis"]) {
      try tap(more, "open-observed-provider-actions")
      Thread.sleep(forTimeInterval: 0.25)
      create = find(app, newFolderLabels)
    }
    guard let newFolder = create else { throw fail("System provider did not expose New Folder") }
    try tap(newFolder, "new-folder-via-system-picker")
    // Restore the original field-appearance stage: the editor itself must be
    // usable within one absolute5s; the later complete safety RPCs are not a
    // second appearance wait. No outer allowance or timeout is increased.
    let namingStarted = Date()
    let namingDeadline = namingStarted.addingTimeInterval(5)
    // Warm once, then let the keyboard/rename transition settle before
    // asking XCUI again. The recorded 1.70s snapshot was still empty and
    // held the runner until 4.0s (42674231725, attempt 2). Give the later
    // exact probes the remaining time without extending the 5s deadline.
    let namingPolls: [(offset: TimeInterval, includeModal: Bool)] = [
      (0.25, false), (2.10, false), (2.80, false), (3.35, false), (3.85, true)
    ]
    var naming: NamingEditorWitness?
    var namingQueryCount = 0
    var namingModalQueryCount = 0
    var namingProbeTimes: [[String: Double]] = []
    for poll in namingPolls {
      if naming != nil || Date() >= namingDeadline { break }
      let delay = namingStarted.addingTimeInterval(poll.offset).timeIntervalSinceNow
      if delay > 0 { Thread.sleep(forTimeInterval: delay) }
      if Date() >= namingDeadline { break }
      namingQueryCount += 1
      if poll.includeModal { namingModalQueryCount += 1 }
      let probeStartedAt = Date()
      naming = try currentNamingEditor(app, pickerFileView, namingViewFrame, includeModal: poll.includeModal, before: namingDeadline)
      let probeEndedAt = Date()
      namingProbeTimes.append(["scheduled": poll.offset,
        "started": probeStartedAt.timeIntervalSince(namingStarted),
        "ended": probeEndedAt.timeIntervalSince(namingStarted)])
    }
    let witnessObservedAt = Date()
    let withinAppearanceDeadline = witnessObservedAt < namingDeadline
    let elapsed = witnessObservedAt.timeIntervalSince(namingStarted)
    try recordNamingEditorWitness(["sourceSha": source, "profileSha": profile,
      "nativePid": Int(nativePID)!, "nonce": nonce, "appId": bundle,
      "elapsedSeconds": elapsed, "appearanceDeadlineSeconds": 5,
      "withinAppearanceDeadline": withinAppearanceDeadline,
      "queryCount": namingQueryCount, "modalQueryCount": namingModalQueryCount,
      "probeTimes": namingProbeTimes,
      "editorFound": naming != nil, "editorKind": naming?.isInline == true ? "inline" : "modal-or-absent",
      "editorIdentifier": naming?.identifier ?? "", "editorFrame": naming?.frame ?? [],
      "boundToAccessibilityElement": naming != nil, "modalOwnerHeld": naming?.modalOwner != nil,
      "witnessAloneAuthorizesActions": false])
    guard withinAppearanceDeadline else { throw fail("Usable naming editor witness arrived after original5s appearance deadline") }
    guard let witness = naming else { throw fail("No usable naming editor witness within original5s") }
    capture("after-new-folder-action")
    let control = try validatedWitnessFlow(app, providerLabels, witness)
    let field = witness.field
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
    let current = try validatedWitnessFlow(app, providerLabels, witness)
    guard current.isInline == control.isInline,
          let confirmed = witness.field.value as? String, confirmed == folder else {
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
    var ownedIconAttempted = false
    // Full tree/screenshot capture is after exact navigation below, not inside
    // this original10s commit/open window.
    while try currentNavigationTitle(app, expectedFolder: folder) != folder {
      if Date() >= createDeadline { throw fail("The new nonce directory was not opened") }
      // First prefer the actual exact-nonce item after the system Done. The
      // optional held-editor icon is not itself a precondition for navigation.
      if let item = find(app, [folder]) {
        try tap(item, "open-created-exact-nonce-folder", before: createDeadline)
      } else if witness.isInline && !ownedIconAttempted && Date() < createDeadline {
        ownedIconAttempted = true
        try finishInlineNameViaOwnedIcon(app, witness, providerLabels, folder, createDeadline,
          ["sourceSha": source, "profileSha": profile, "nativePid": nativePID, "nonce": nonce])
        if Date() >= createDeadline { throw fail("The new nonce directory was not opened") }
        continue // Re-read the actual navigation title; do not tap an old page.
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
    while try currentNavigationTitle(app, expectedFolder: folder) != nil ||
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
