import UIKit
import Foundation
import Darwin

// Simulator-only second app. Its Documents are external to Runner, exposed by
// the system local Files provider. This is not a remote File Provider extension.
@main
final class AppDelegate: UIResponder, UIApplicationDelegate {
  var window: UIWindow?
  func application(_ application: UIApplication, didFinishLaunchingWithOptions options: [UIApplication.LaunchOptionsKey: Any]?) -> Bool {
    let screen = UIViewController()
    screen.view.backgroundColor = .white
    let label = UILabel()
    label.numberOfLines = 0
    label.textColor = .black
    label.translatesAutoresizingMaskIntoConstraints = false
    screen.view.addSubview(label)
    NSLayoutConstraint.activate([label.leadingAnchor.constraint(equalTo: screen.view.safeAreaLayoutGuide.leadingAnchor, constant: 20), label.trailingAnchor.constraint(equalTo: screen.view.safeAreaLayoutGuide.trailingAnchor, constant: -20), label.centerYAnchor.constraint(equalTo: screen.view.centerYAnchor)])
    window = UIWindow(frame: UIScreen.main.bounds)
    window?.rootViewController = screen
    window?.makeKeyAndVisible()
    do {
      let record = try prepare()
      label.accessibilityIdentifier = "provider-host-ready"
      label.text = String(data: try JSONSerialization.data(withJSONObject: record, options: [.sortedKeys]), encoding: .utf8)
    } catch {
      label.accessibilityIdentifier = "provider-host-rejected"
      label.text = "Disposable provider fixture rejected input or existing content; no fallback."
    }
    return true
  }

  private func matches(_ value: String, _ pattern: String) -> Bool {
    value.range(of: pattern, options: .regularExpression) != nil
  }
  private func prepare() throws -> [String: Any] {
    #if !targetEnvironment(simulator)
    throw NSError(domain: "ProviderFixture", code: 1)
    #else
    let e = ProcessInfo.processInfo.environment
    let source = e["FEATURE_SOURCE_SHA"] ?? "", profile = e["FEATURE_PROFILE_SHA"] ?? ""
    let nonce = e["FEATURE_FOLDER_NONCE"] ?? "", rawPID = e["FEATURE_RUNNER_PID"] ?? ""
    guard e["GITHUB_ACTIONS"] == "true", e["FEATURE_DISPOSABLE_DEVICE"] == "true",
          matches(source, "^[a-f0-9]{40}$"), matches(profile, "^[a-f0-9]{64}$"),
          let runnerPID = Int32(rawPID), runnerPID > 0,
          matches(nonce, "^[1-9][0-9]{0,9}-[1-9][0-9]{10,19}$"), nonce.hasPrefix("\(runnerPID)-"),
          Bundle.main.object(forInfoDictionaryKey: "FixtureSourceSha") as? String == source,
          Bundle.main.object(forInfoDictionaryKey: "FixtureProfileSha") as? String == profile,
          Bundle.main.bundleIdentifier == "org.langbai.nativefixture.providerhost" else {
      throw NSError(domain: "ProviderFixture", code: 2)
    }
    let documents = FileManager.default.urls(for: .documentDirectory, in: .userDomainMask)[0].standardizedFileURL
    let home = URL(fileURLWithPath: NSHomeDirectory(), isDirectory: true).standardizedFileURL
    guard documents.path == home.appendingPathComponent("Documents", isDirectory: true).path,
          documents.resolvingSymlinksInPath().path == documents.path else { throw NSError(domain: "ProviderFixture", code: 3) }
    let folder = documents.appendingPathComponent("NativeOutput-" + nonce, isDirectory: true)
    // mkdir is exclusive. Existing data is never reused, overwritten or deleted.
    guard Darwin.mkdir(folder.path, mode_t(S_IRWXU)) == 0 else { throw NSError(domain: "ProviderFixture", code: 4) }
    let values = try folder.resourceValues(forKeys: [.isDirectoryKey, .isSymbolicLinkKey])
    guard values.isDirectory == true, values.isSymbolicLink != true else { throw NSError(domain: "ProviderFixture", code: 5) }
    let record: [String: Any] = ["schema": "ios-provider-host/v1", "sourceSha": source, "profileSha": profile,
      "nonce": nonce, "expectedRunnerPid": runnerPID, "hostPid": getpid(), "hostBundleId": Bundle.main.bundleIdentifier!,
      "folderName": folder.lastPathComponent, "scope": "separate app local Files provider only; not a client grant or acceptance pass"]
    let bytes = try JSONSerialization.data(withJSONObject: record, options: [.sortedKeys])
    try bytes.write(to: folder.appendingPathComponent("provider-marker.json"), options: .withoutOverwriting)
    return record
    #endif
  }
}
