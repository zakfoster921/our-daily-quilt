#import <FirebaseCore/FirebaseCore.h>

/// Runs when the app binary loads, before Swift `AppDelegate` init, so Firebase sees a default app
/// before any other static initializers log (addresses `I-COR000003` in typical cold starts).
static void ODQFirebaseEarlyConfigure(void) __attribute__((constructor(101)));
static void ODQFirebaseEarlyConfigure(void) {
  if ([FIRApp defaultApp] == nil) {
    [FIRApp configure];
  }
}
