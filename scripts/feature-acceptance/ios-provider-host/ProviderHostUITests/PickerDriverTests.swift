import XCTest
import Foundation

// No Runner launch/reset/reinstall, supplied folder path or acceptance CHECK.
// Native client assertions must still prove the picker grant, bytes and history.
@MainActor
final class PickerDriverTests: XCTestCase {
  private var deadline = Date()
  private func require(_ value: Bool, _ message: String) throws {
    if !value { XCTFail(message); throw NSError(domain: "ProviderDriver", code: 1) }
  }
  private func only(_ query: XCUIElementQuery) throws -> XCUIElement {
    while Date() < deadline {
      if query.count == 1, query.element.isHittable { return query.element }
      if query.count > 1 { break }
      Thread.sleep(forTimeInterval: 0.1)
    }
    try require(false, "Missing, ambiguous or non-hittable expected native picker control")
    return query.element
  }
  func testSelectNonceFolderInActualSystemPicker() throws {
    let e = ProcessInfo.processInfo.environment
    let source = e["FEATURE_SOURCE_SHA"] ?? "", profile = e["FEATURE_PROFILE_SHA"] ?? ""
    let nonce = e["FEATURE_FOLDER_NONCE"] ?? "", rawPID = e["FEATURE_RUNNER_PID"] ?? ""
    try require(e["GITHUB_ACTIONS"] == "true" && e["FEATURE_DISPOSABLE_DEVICE"] == "true" && e["FEATURE_PICKER_LOCALE"] == "en", "Explicit disposable English simulator required")
    try require(source.range(of: "^[a-f0-9]{40}$", options: .regularExpression) != nil && profile.range(of: "^[a-f0-9]{64}$", options: .regularExpression) != nil, "Source/profile required")
    guard let runnerPID = Int32(rawPID), runnerPID > 0 else { throw NSError(domain: "ProviderDriver", code: 2) }
    try require(nonce.range(of: "^[1-9][0-9]{0,9}-[1-9][0-9]{10,19}$", options: .regularExpression) != nil && nonce.hasPrefix("\(runnerPID)-"), "Native request nonce/PID mismatch")
    let runner = XCUIApplication(bundleIdentifier: "com.codex.novelai.novelaiMobile")
    try require(runner.state == .runningForeground || runner.state == .runningBackground, "Already-running native Runner required; no implicit launch")
    let host = XCUIApplication(bundleIdentifier: "org.langbai.nativefixture.providerhost")
    host.launchEnvironment = ["GITHUB_ACTIONS": "true", "FEATURE_DISPOSABLE_DEVICE": "true", "FEATURE_SOURCE_SHA": source, "FEATURE_PROFILE_SHA": profile, "FEATURE_FOLDER_NONCE": nonce, "FEATURE_RUNNER_PID": rawPID]
    host.launch()
    try require(host.staticTexts["provider-host-ready"].waitForExistence(timeout: 10), "Exclusive provider host preparation failed")
    let readyText = host.staticTexts["provider-host-ready"].label
    guard let readyData = readyText.data(using: .utf8),
          let ready = try JSONSerialization.jsonObject(with: readyData) as? [String: Any] else { throw NSError(domain: "ProviderDriver", code: 3) }
    try require(ready["sourceSha"] as? String == source && ready["profileSha"] as? String == profile && ready["nonce"] as? String == nonce && (ready["expectedRunnerPid"] as? NSNumber)?.int32Value == runnerPID, "Provider host identity differs")
    // activate() can launch a stopped app, so check running state BEFORE it.
    try require(runner.state == .runningForeground || runner.state == .runningBackground, "Runner stopped during provider preparation")
    runner.activate()
    try require(runner.state == .runningForeground, "Runner did not resume")
    deadline = Date().addingTimeInterval(45)
    let cancel = runner.buttons.matching(identifier: "Cancel")
    try require(cancel.count == 1 && cancel.element.exists, "Actual system document picker required")
    let browseTab = runner.tabBars.buttons.matching(identifier: "Browse")
    if browseTab.count == 1 && browseTab.element.isHittable { browseTab.element.tap() }
    let browseBack = runner.navigationBars.buttons.matching(identifier: "Browse")
    if browseBack.count == 1 && browseBack.element.isHittable { browseBack.element.tap() }
    try only(runner.cells.containing(.staticText, identifier: "On My iPhone")).tap()
    try only(runner.cells.containing(.staticText, identifier: "Langbai Provider Fixture")).tap()
    let folder = "NativeOutput-" + nonce
    try only(runner.cells.containing(.staticText, identifier: folder)).tap()
    // A row containing the nonce is not permission to select its parent tree.
    try require(runner.navigationBars.matching(identifier: folder).count == 1, "Nonce folder must be the current picker breadcrumb")
    let finish = runner.buttons.matching(NSPredicate(format: "label == %@ OR label == %@", "Open", "Done"))
    try only(finish).tap()
    try require(runner.wait(for: .runningForeground, timeout: 5), "Native client not foreground after folder selection")
    let record: [String: Any] = ["sourceSha": source, "profileSha": profile, "nonce": nonce,
      "expectedRunnerPid": runnerPID, "interaction": "system-picker-selected-separate-local-host-folder",
      "kind": "diagnostic", "acceptanceCredit": false]
    let bytes = try JSONSerialization.data(withJSONObject: record, options: [.sortedKeys])
    print("IOS_PROVIDER_DRIVER_OBSERVATION:" + String(data: bytes, encoding: .utf8)!)
  }
}
