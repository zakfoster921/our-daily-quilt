# OUR DAILY QUILT App Store Checklist

## App Record

- App name: OUR DAILY QUILT
- Bundle ID: `com.zakfoster.ourdailyquilt`
- SKU: `our-daily-quilt-ios`
- Primary category: Lifestyle
- Content rights: The app includes quotes and artwork curated by the maker.
- Privacy Policy URL: `https://our-daily-quilt-production.up.railway.app/privacy.html`
- Support URL: `https://our-daily-quilt-production.up.railway.app/support.html`

## Description Draft

OUR DAILY QUILT is a small daily ritual for making something beautiful together.

Each day, everyone receives the same quote. Choose a color that feels true, add it to the shared quilt, and watch the day become a collaborative piece of textile-inspired art. Tomorrow, a new quote appears and a new quilt begins.

You can revisit past quilts, submit quote suggestions for review, share the daily quilt, and turn on optional notifications.

## Review Notes Draft

OUR DAILY QUILT does not require an account or login. The app creates an anonymous device identifier so a user can add one color to the daily quilt and keep local color history.

Quote submissions are optional and are reviewed before they appear in the app. Push notifications are optional and used for daily quote reminders. Hidden admin access and test console commands are disabled in the release configuration.

Core review flow:
1. Open the app.
2. Read the daily quote.
3. Choose a color and add it to the quilt.
4. Visit the About screen for Privacy Policy and Support links.
5. Optionally test quote submission, archive browsing, and sharing.

## App Privacy Answers

Likely data collected:
- User content: selected quilt colors and optional quote submissions.
- Identifiers: anonymous app-generated device ID and push notification token.
- Contact info: optional first name if the user enters one.
- Usage/diagnostics: technical logs handled by Firebase, Google Cloud, Railway, and Apple.

Likely data not collected:
- Location.
- Contacts.
- Health or fitness data.
- Financial information.
- Tracking across other companies' apps or websites.

## Screenshot Checklist

- First quote screen.
- Color picker / add-to-quilt flow.
- Completed daily quilt.
- Archive screen.
- About screen showing Privacy Policy and Support links.

## TestFlight QA Checklist

- First launch works on a clean install.
- Daily quote loads.
- Color selection and block submission work.
- Returning-user state works after force quit.
- Archive loads.
- Quote submission posts and shows success/failure clearly.
- Share/save flow works.
- Notification permission prompt is understandable.
- Privacy Policy and Support links open from the About screen.
- App still behaves acceptably with a weak or missing network connection.
