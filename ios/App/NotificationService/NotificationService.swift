import UserNotifications

/// Downloads the image URL carried by a push (FCM `fcm_options.image` or data `imageUrl`)
/// and attaches it so it shows inside the notification.
class NotificationService: UNNotificationServiceExtension {
    private var contentHandler: ((UNNotificationContent) -> Void)?
    private var bestAttempt: UNMutableNotificationContent?

    override func didReceive(
        _ request: UNNotificationRequest,
        withContentHandler contentHandler: @escaping (UNNotificationContent) -> Void
    ) {
        self.contentHandler = contentHandler
        bestAttempt = (request.content.mutableCopy() as? UNMutableNotificationContent)
        guard let content = bestAttempt else { return contentHandler(request.content) }

        let info = request.content.userInfo
        var urlString: String?
        if let fcm = info["fcm_options"] as? [String: Any], let img = fcm["image"] as? String {
            urlString = img
        } else if let img = info["imageUrl"] as? String {
            urlString = img
        }
        guard let s = urlString, let url = URL(string: s) else { return contentHandler(content) }

        URLSession.shared.downloadTask(with: url) { tmp, response, _ in
            defer { contentHandler(content) }
            guard let tmp = tmp else { return }
            let ext = (response?.mimeType == "image/png") ? "png" : "jpg"
            let dest = URL(fileURLWithPath: NSTemporaryDirectory())
                .appendingPathComponent(UUID().uuidString + "." + ext)
            do {
                try FileManager.default.moveItem(at: tmp, to: dest)
                let attachment = try UNNotificationAttachment(identifier: "image", url: dest, options: nil)
                content.attachments = [attachment]
            } catch {}
        }.resume()
    }

    override func serviceExtensionTimeWillExpire() {
        if let handler = contentHandler, let content = bestAttempt { handler(content) }
    }
}
