#!/bin/bash
set -euo pipefail
src="$PWD/scripts/diagnostic-uikit"
root="$RUNNER_TEMP/uikit-control"
mkdir -p "$root/Control.app" "$root/FolderPicker.xcodeproj/xcshareddata/xcschemes"
node --input-type=module - "$root" <<'NODE'
import fs from 'node:fs';
import {iosPickerProject,iosPickerScheme} from './scripts/feature-acceptance/ios-folder-picker-driver.mjs';
const r=process.argv[2],p=r+'/FolderPicker.xcodeproj';
fs.writeFileSync(p+'/project.pbxproj',iosPickerProject());fs.writeFileSync(p+'/xcshareddata/xcschemes/FolderPickerUITests.xcscheme',iosPickerScheme);
const src=fs.readFileSync('scripts/feature-acceptance/fixtures/ios-folder-picker-ui.swift','utf8');
const start=src.indexOf('    let cancelLabels = ['),end=src.indexOf('    capture("after-new-folder-action")',start);
if(start<0||end<0)throw Error('real observation block missing');
const header=src.slice(0,src.indexOf('  @MainActor\n  func testSelectRealExternalNonceFolder'));
fs.writeFileSync(r+'/FolderPickerUITests.swift',header+
'  @MainActor\n  func testMinimalUIKitControl() async throws {\n    let app=XCUIApplication(bundleIdentifier:"com.langbai.controlfiles"); app.launch(); let button=app.buttons["control.choose"]; XCTAssertTrue(button.waitForExistence(timeout:10));button.tap(); target = app\n'+(src.slice(start,src.indexOf('    try recordNamingEditorWitness([',start))+'    print("UIKIT_CONTROL_ONLY", elapsed, withinAppearanceDeadline, namingProbeTimes)\n'+src.slice(src.indexOf('    guard withinAppearanceDeadline else',start),end))+'\n    XCTAssertTrue(witness.isInline || witness.modalOwner != nil)\n  }\n}\n');
NODE
cd "$root"
python3 - <<'PY'
import plistlib
with open("Control.app/Info.plist","wb") as f:plistlib.dump(dict(CFBundleExecutable="Control",CFBundleIdentifier="com.langbai.controlfiles",CFBundleName="Control",CFBundlePackageType="APPL",CFBundleInfoDictionaryVersion="6.0",CFBundleVersion="1",CFBundleShortVersionString="1.0",MinimumOSVersion="15.0",UIDeviceFamily=[1,2],UILaunchScreen={}),f)
PY
sdk="$(xcrun --sdk iphonesimulator --show-sdk-path)"
xcrun --sdk iphonesimulator swiftc -parse-as-library -target "$(uname -m)-apple-ios15.0-simulator" -sdk "$sdk" "$src/Control.swift" -o Control.app/Control
codesign --force --sign - Control.app
xcrun simctl install "$FEATURE_SIMULATOR" Control.app
xcodebuild test -project FolderPicker.xcodeproj -scheme FolderPickerUITests -configuration Debug -sdk iphonesimulator -destination "id=$FEATURE_SIMULATOR" -derivedDataPath DerivedData -only-testing:FolderPickerUITests/FolderPickerUITests/testMinimalUIKitControl -resultBundlePath Control.xcresult -testLanguage en -testRegion US -parallel-testing-enabled NO CODE_SIGNING_ALLOWED=NO |tee xctest.log
