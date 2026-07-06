/*
Firestore + parent notification integration hook.

Current PWA behavior:
- Works offline using localStorage.
- Service worker caches the app shell.
- Notification preferences are saved locally.
- Start Workout and Stop / Save Session call window.AP_NOTIFY.sendEvent(...).

Production Firebase behavior:
1. Parent device opens the PWA and enables notifications.
2. App requests browser notification permission and obtains a Firebase Cloud Messaging token.
3. Token is saved to Firestore, for example:
   users/{parentUid}/notificationTokens/{tokenId}
4. Alaric starts or completes a workout.
5. App writes a notification event:
   athletes/alaric-padron/notificationEvents/{eventId}
6. Firebase Cloud Function sends FCM push to the parent token(s).

Suggested Firestore structure:
users/{uid}/athletes/alaric-padron/profile
users/{uid}/athletes/alaric-padron/sessions/{yyyy-mm-dd}
users/{uid}/athletes/alaric-padron/achievements/{achievementId}
users/{uid}/athletes/alaric-padron/milestones/{milestoneId}
users/{uid}/athletes/alaric-padron/notificationEvents/{eventId}
users/{uid}/notificationTokens/{tokenId}
*/

window.AP_SYNC = {
  enabled: () => Boolean(window.AP_FIREBASE_ENABLED && window.AP_FIREBASE_CONFIG && window.AP_FIREBASE_CONFIG.projectId),
  status: () => window.AP_SYNC.enabled() ? "firestore-ready" : "local-only",
  async syncAll() {
    return { ok: true, mode: window.AP_SYNC.status() };
  }
};

window.AP_NOTIFY = {
  async sendEvent(event) {
    // Local preview: store notification event until Firestore is enabled.
    const key = "ap_parent_notification_events";
    const events = JSON.parse(localStorage.getItem(key) || "[]");
    events.push({ ...event, createdAt: new Date().toISOString(), mode: window.AP_SYNC.status() });
    localStorage.setItem(key, JSON.stringify(events));

    // Production Firestore implementation will write event here.
    // A Cloud Function will send the actual push notification to the parent device.
    return { ok: true, mode: window.AP_SYNC.status(), event };
  }
};

window.addEventListener("online", () => {
  if (window.AP_SYNC?.enabled()) window.AP_SYNC.syncAll().catch(console.error);
});
