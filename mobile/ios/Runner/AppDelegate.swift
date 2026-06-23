import Flutter
import UIKit

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
    }

    GeneratedPluginRegistrant.register(with: self)
    return super.application(application, didFinishLaunchingWithOptions: launchOptions)
  }
}
