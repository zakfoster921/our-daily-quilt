import UIKit
import WebKit
import Capacitor
import FirebaseCore

/// Exposes delegate methods to the Objective‑C runtime for Firebase / GoogleUtilities swizzling (`I-SWZ001014`).
@UIApplicationMain
@objcMembers
class AppDelegate: UIResponder, UIApplicationDelegate, WKScriptMessageHandler {

    private let launchBackgroundColor = UIColor(
        red: 246.0 / 255.0,
        green: 244.0 / 255.0,
        blue: 241.0 / 255.0,
        alpha: 1.0
    )
    private var launchBridgeHandlerInstalled = false
    private var launchCoverWindow: UIWindow?
    private var launchSpinnerDismissed = false
    /// Wall-clock ms (Unix epoch) when the process started launching; injected into WKWebView for perf reports.
    private var nativeLaunchUnixMs: Double = Date().timeIntervalSince1970 * 1000
    private var nativeLaunchScriptInstalled = false
    var window: UIWindow? {
        didSet {
            window?.backgroundColor = launchBackgroundColor
            showLaunchCoverWindow()
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
        showLaunchCoverWindow()
        configureNativeLaunchBridge()
        return true
    }

    /// Transparent overlay — only the ring. Text stays on LaunchScreen / Capacitor splash (no duplicate label).
    private func showLaunchCoverWindow(retryCount: Int = 0) {
        guard !launchSpinnerDismissed, launchCoverWindow == nil else { return }

        let scene =
            window?.windowScene
            ?? UIApplication.shared.connectedScenes
                .compactMap { $0 as? UIWindowScene }
                .first(where: { $0.activationState == .foregroundActive || $0.activationState == .foregroundInactive })
            ?? UIApplication.shared.connectedScenes.compactMap { $0 as? UIWindowScene }.first

        guard let scene else {
            if retryCount < 40 {
                DispatchQueue.main.asyncAfter(deadline: .now() + 0.025) {
                    self.showLaunchCoverWindow(retryCount: retryCount + 1)
                }
            }
            return
        }

        let coverWindow = UIWindow(windowScene: scene)
        coverWindow.windowLevel = UIWindow.Level.statusBar + 1
        coverWindow.backgroundColor = .clear
        coverWindow.isUserInteractionEnabled = false

        let rootVC = UIViewController()
        rootVC.view.backgroundColor = .clear

        // Invisible layout anchor — same constraints/font as LaunchScreen.storyboard odq-boot-msg.
        let layoutLabel = UILabel()
        layoutLabel.text = "Getting today's quilt ready"
        layoutLabel.textAlignment = .center
        layoutLabel.numberOfLines = 0
        layoutLabel.textColor = .clear
        layoutLabel.font = UIFont.monospacedSystemFont(ofSize: 22, weight: .regular)
        layoutLabel.translatesAutoresizingMaskIntoConstraints = false

        let spinner = OdqRingSpinnerView()
        spinner.translatesAutoresizingMaskIntoConstraints = false
        spinner.alpha = 0

        rootVC.view.addSubview(layoutLabel)
        rootVC.view.addSubview(spinner)

        NSLayoutConstraint.activate([
            layoutLabel.centerXAnchor.constraint(equalTo: rootVC.view.centerXAnchor),
            layoutLabel.centerYAnchor.constraint(equalTo: rootVC.view.centerYAnchor, constant: -18),
            layoutLabel.leadingAnchor.constraint(greaterThanOrEqualTo: rootVC.view.leadingAnchor, constant: 32),
            layoutLabel.trailingAnchor.constraint(lessThanOrEqualTo: rootVC.view.trailingAnchor, constant: -32),
            layoutLabel.widthAnchor.constraint(lessThanOrEqualToConstant: 352),
            spinner.centerXAnchor.constraint(equalTo: rootVC.view.centerXAnchor),
            spinner.topAnchor.constraint(equalTo: layoutLabel.bottomAnchor, constant: 20)
        ])

        coverWindow.rootViewController = rootVC
        coverWindow.isHidden = false
        launchCoverWindow = coverWindow

        DispatchQueue.main.async {
            rootVC.view.layoutIfNeeded()
            UIView.animate(withDuration: 0.22, delay: 0, options: [.curveEaseOut]) {
                spinner.alpha = 0.72
            }
        }
    }

    private func dismissLaunchCoverWindow() {
        guard !launchSpinnerDismissed else { return }
        launchSpinnerDismissed = true
        launchCoverWindow?.isHidden = true
        launchCoverWindow = nil
    }

    private func configureNativeLaunchBridge(retryCount: Int = 0) {
        guard let bridgeViewController = window?.rootViewController as? CAPBridgeViewController else {
            if retryCount < 20 {
                DispatchQueue.main.asyncAfter(deadline: .now() + 0.05) {
                    self.configureNativeLaunchBridge(retryCount: retryCount + 1)
                }
            }
            return
        }

        bridgeViewController.view.backgroundColor = launchBackgroundColor
        bridgeViewController.webView?.isOpaque = false
        bridgeViewController.webView?.backgroundColor = launchBackgroundColor
        bridgeViewController.webView?.scrollView.backgroundColor = launchBackgroundColor

        if launchBridgeHandlerInstalled, bridgeViewController.webView != nil {
            return
        }
        if let webView = bridgeViewController.webView {
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
            webView.configuration.userContentController.add(self, name: "odqLaunchCover")
            launchBridgeHandlerInstalled = true
        }
    }

    func userContentController(_ userContentController: WKUserContentController, didReceive message: WKScriptMessage) {
        if message.name == "odqLaunchCover" {
            DispatchQueue.main.async {
                self.dismissLaunchCoverWindow()
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

/// Matches `.color-submit-transition__spinner` — 34pt ring, 1.5pt stroke, gap at top, 0.9s spin.
@objc(OdqRingSpinnerView)
class OdqRingSpinnerView: UIView {

    private let ringLayer = CAShapeLayer()
    private let ringColor = UIColor(
        red: 63.0 / 255.0,
        green: 58.0 / 255.0,
        blue: 53.0 / 255.0,
        alpha: 1.0
    )

    override init(frame: CGRect) {
        super.init(frame: frame)
        setup()
    }

    required init?(coder: NSCoder) {
        super.init(coder: coder)
        setup()
    }

    private func setup() {
        isOpaque = false
        backgroundColor = .clear
        ringLayer.fillColor = UIColor.clear.cgColor
        ringLayer.strokeColor = ringColor.cgColor
        ringLayer.lineWidth = 1.5
        ringLayer.lineCap = .butt
        ringLayer.opacity = 0.72
        layer.addSublayer(ringLayer)
    }

    override var intrinsicContentSize: CGSize {
        CGSize(width: 34, height: 34)
    }

    override func layoutSubviews() {
        super.layoutSubviews()
        ringLayer.frame = bounds
        let inset = ringLayer.lineWidth / 2
        let radius = (min(bounds.width, bounds.height) - ringLayer.lineWidth) / 2
        let center = CGPoint(x: bounds.midX, y: bounds.midY)
        // Gap at top, same idea as border-top-color: transparent.
        let path = UIBezierPath(
            arcCenter: center,
            radius: radius,
            startAngle: CGFloat.pi * 0.06 - CGFloat.pi / 2,
            endAngle: CGFloat.pi * 1.94 - CGFloat.pi / 2,
            clockwise: true
        )
        ringLayer.path = path.cgPath
    }

    override func didMoveToWindow() {
        super.didMoveToWindow()
        guard window != nil else { return }
        startAnimating()
    }

    private func startAnimating() {
        guard layer.animation(forKey: "odqRingSpin") == nil else { return }
        let animation = CABasicAnimation(keyPath: "transform.rotation.z")
        animation.fromValue = 0
        animation.toValue = Double.pi * 2
        animation.duration = 0.9
        animation.repeatCount = .infinity
        animation.isRemovedOnCompletion = false
        layer.add(animation, forKey: "odqRingSpin")
    }
}
