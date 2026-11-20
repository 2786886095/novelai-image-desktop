import UIKit
import UniformTypeIdentifiers
@main
final class App: UIResponder, UIApplicationDelegate {
 var window:UIWindow?
 func application(_ application:UIApplication,didFinishLaunchingWithOptions opts:[UIApplication.LaunchOptionsKey:Any]?=nil)->Bool {
  let w=UIWindow(frame:UIScreen.main.bounds);window=w;let vc=Root();w.rootViewController=vc;w.makeKeyAndVisible();return true
 }
}
final class Root:UIViewController {
 override func viewDidLoad(){super.viewDidLoad();view.backgroundColor = .white;let b=UIButton(type:.system);b.setTitle("Choose output folder",for:.normal);b.accessibilityIdentifier="control.choose";b.frame=CGRect(x:25,y:140,width:270,height:66);b.addTarget(self,action:#selector(openFolder),for:.touchUpInside);view.addSubview(b)}
 @objc func openFolder(){view.endEditing(true);let p=UIDocumentPickerViewController(forOpeningContentTypes:[.folder],asCopy:false);p.allowsMultipleSelection=false;p.modalPresentationStyle = .fullScreen;present(p,animated:true)}
}
