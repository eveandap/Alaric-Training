// Fill in your Firebase web app config from Firebase Console.
// After filling this in, set AP_FIREBASE_ENABLED = true.
//
// IMPORTANT:
// - Use the same AP_FIREBASE_BACKUP_ID on every device that should share the same cloud backup.
// - This first Firestore pass uses anonymous auth + a shared backup ID for convenience.
// - You can tighten security later with stronger authentication if desired.

window.AP_FIREBASE_CONFIG = {
  apiKey: "",
  authDomain: "",
  projectId: "",
  storageBucket: "",
  messagingSenderId: "",
  appId: ""
};

window.AP_FIREBASE_ENABLED = false;

// Use the same backup ID on every device that should share the same cloud backup.
window.AP_FIREBASE_BACKUP_ID = "padron-family-live";

// Keep this aligned with the athlete slug used by the PWA.
window.AP_FIREBASE_ATHLETE_ID = "alaric-padron";

// Collection root in Firestore.
window.AP_FIREBASE_COLLECTION_ROOT = "apCloudBackups";

// Anonymous auth keeps Firestore rules from being fully public.
window.AP_FIREBASE_USE_ANON_AUTH = true;

// Auto-sync after saves.
window.AP_FIREBASE_AUTO_SYNC = true;
