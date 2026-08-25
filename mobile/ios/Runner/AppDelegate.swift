import Flutter
import UIKit
import CFNetwork

@main
@objc class AppDelegate: FlutterAppDelegate {
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
    }

    GeneratedPluginRegistrant.register(with: self)
    return super.application(application, didFinishLaunchingWithOptions: launchOptions)
  }
}
