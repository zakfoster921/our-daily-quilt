import UIKit
import WebKit
import Capacitor
import FirebaseCore
import AVFoundation

/// Exposes delegate methods to the Objective‑C runtime for Firebase / GoogleUtilities swizzling (`I-SWZ001014`).
@UIApplicationMain
@objcMembers
class AppDelegate: UIResponder, UIApplicationDelegate {

    private let launchBackgroundColor = UIColor(
        red: 246.0 / 255.0,
        green: 244.0 / 255.0,
        blue: 241.0 / 255.0,
        alpha: 1.0
    )
    /// Wall-clock ms (Unix epoch) when the process started launching; injected into WKWebView for perf reports.
    private var nativeLaunchUnixMs: Double = Date().timeIntervalSince1970 * 1000
    private var nativeLaunchScriptInstalled = false
    var window: UIWindow? {
        didSet {
            window?.backgroundColor = launchBackgroundColor
        }
    }

    override init() {
        super.init()
        if FirebaseApp.app() == nil {
            FirebaseApp.configure()
        }
    }

    /// Runs before `didFinishLaunching` so Firebase Messaging / other native hooks see a configured default app.
    func application(_ application: UIApplication, willFinishLaunchingWithOptions launchOptions: [UIApplication.LaunchOptionsKey: Any]?) -> Bool {
        nativeLaunchUnixMs = Date().timeIntervalSince1970 * 1000
        if FirebaseApp.app() == nil {
            FirebaseApp.configure()
        }
        return true
    }

    func application(_ application: UIApplication, didFinishLaunchingWithOptions launchOptions: [UIApplication.LaunchOptionsKey: Any]?) -> Bool {
        window?.backgroundColor = launchBackgroundColor
        DispatchQueue.main.asyncAfter(deadline: .now() + 1.0) {
            self.configureAudioSession()
        }
        configureNativeLaunchBridge()
        return true
    }

    private func configureAudioSession() {
        do {
            try AVAudioSession.sharedInstance().setCategory(.playback, mode: .default, options: [])
            try AVAudioSession.sharedInstance().setActive(true)
        } catch {
            NSLog("AVAudioSession configure failed: \(error.localizedDescription)")
        }
    }

    private func configureNativeLaunchBridge(retryCount: Int = 0) {
        guard let bridgeViewController = window?.rootViewController as? CAPBridgeViewController else {
            if retryCount < 160 {
                DispatchQueue.main.asyncAfter(deadline: .now() + 0.05) {
                    self.configureNativeLaunchBridge(retryCount: retryCount + 1)
                }
            }
            return
        }

        bridgeViewController.view.backgroundColor = launchBackgroundColor
        bridgeViewController.webView?.isOpaque = false
        bridgeViewController.webView?.backgroundColor = launchBackgroundColor
        if let scrollView = bridgeViewController.webView?.scrollView {
            scrollView.backgroundColor = launchBackgroundColor
            // CSS uses viewport-fit=cover + env(safe-area-inset-*); UIKit must not add a second horizontal inset.
            scrollView.contentInsetAdjustmentBehavior = .never
            scrollView.contentInset = .zero
            scrollView.scrollIndicatorInsets = .zero
            scrollView.automaticallyAdjustsScrollIndicatorInsets = false
        }

        if let webView = bridgeViewController.webView {
            webView.configuration.allowsInlineMediaPlayback = true
            if #available(iOS 10.0, *) {
                webView.configuration.mediaTypesRequiringUserActionForPlayback = []
            }
            if !nativeLaunchScriptInstalled {
                let source = "window.__ODQ_NATIVE_LAUNCH_MS__=\(nativeLaunchUnixMs);"
                let userScript = WKUserScript(
                    source: source,
                    injectionTime: .atDocumentStart,
                    forMainFrameOnly: true
                )
                webView.configuration.userContentController.addUserScript(userScript)
                nativeLaunchScriptInstalled = true
            }
        }
    }

    func applicationWillResignActive(_ application: UIApplication) {
        // Sent when the application is about to move from active to inactive state. This can occur for certain types of temporary interruptions (such as an incoming phone call or SMS message) or when the user quits the application and it begins the transition to the background state.
        // Use this method to pause ongoing tasks, disable timers, and invalidate graphics rendering callbacks. Games should use this method to pause the game.
    }

    func applicationDidEnterBackground(_ application: UIApplication) {
        // Use this method to release shared resources, save user data, invalidate timers, and store enough application state information to restore its current state in case it is terminated later.
        // If your application supports background execution, this method is called instead of applicationWillTerminate: when the user quits.
    }

    func applicationWillEnterForeground(_ application: UIApplication) {
        // Called as part of the transition from the background to the active state; here you can undo many of the changes made on entering the background.
    }

    func applicationDidBecomeActive(_ application: UIApplication) {
        // Restart any tasks that were paused (or not yet started) while the application was inactive. If the application was previously in the background, optionally refresh the user interface.
    }

    func applicationWillTerminate(_ application: UIApplication) {
        // Called when the application is about to terminate. Save data if appropriate. See also applicationDidEnterBackground:.
    }

    func application(_ app: UIApplication, open url: URL, options: [UIApplication.OpenURLOptionsKey: Any] = [:]) -> Bool {
        // Called when the app was launched with a url. Feel free to add additional processing here,
        // but if you want the App API to support tracking app url opens, make sure to keep this call
        return ApplicationDelegateProxy.shared.application(app, open: url, options: options)
    }

    func application(_ application: UIApplication, continue userActivity: NSUserActivity, restorationHandler: @escaping ([UIUserActivityRestoring]?) -> Void) -> Bool {
        // Called when the app was launched with an activity, including Universal Links.
        // Feel free to add additional processing here, but if you want the App API to support
        // tracking app url opens, make sure to keep this call
        return ApplicationDelegateProxy.shared.application(application, continue: userActivity, restorationHandler: restorationHandler)
    }

    func application(_ application: UIApplication, didRegisterForRemoteNotificationsWithDeviceToken deviceToken: Data) {
        NotificationCenter.default.post(name: .capacitorDidRegisterForRemoteNotifications, object: deviceToken)
    }

    func application(_ application: UIApplication, didFailToRegisterForRemoteNotificationsWithError error: Error) {
        NotificationCenter.default.post(name: .capacitorDidFailToRegisterForRemoteNotifications, object: error)
    }

    func application(_ application: UIApplication, didReceiveRemoteNotification userInfo: [AnyHashable: Any], fetchCompletionHandler completionHandler: @escaping (UIBackgroundFetchResult) -> Void) {
        NotificationCenter.default.post(name: Notification.Name("didReceiveRemoteNotification"), object: completionHandler, userInfo: userInfo)
    }

}

