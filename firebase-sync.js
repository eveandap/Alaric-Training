(function(){
  const KEY_PREFIXES = ["apb_", "ap_parent_", "ap_coin_"];
  const HISTORY_KEY = "apb_full_history";
  const SESSION_KEY = "apb_full_active_session";
  let app = null, db = null, auth = null, syncTimer = null, readyPromise = null;

  function hasFirebaseConfig(){
    const c = window.AP_FIREBASE_CONFIG || {};
    return !!(c.apiKey && c.projectId && c.appId);
  }

  function enabled(){
    return !!(window.AP_FIREBASE_ENABLED && hasFirebaseConfig());
  }

  function backupId(){
    return window.AP_FIREBASE_BACKUP_ID || "padron-family-live";
  }

  function athleteId(){
    return window.AP_FIREBASE_ATHLETE_ID || "alaric-padron";
  }

  function collectionRoot(){
    return window.AP_FIREBASE_COLLECTION_ROOT || "apCloudBackups";
  }

  function status(){
    if(!window.AP_FIREBASE_ENABLED) return "local-only";
    if(!hasFirebaseConfig()) return "config-missing";
    if(!window.firebase) return "sdk-missing";
    if(!navigator.onLine) return "offline";
    if(db) return "connected";
    return "connecting";
  }

  function shouldSyncKey(key){
    return KEY_PREFIXES.some(prefix => key.startsWith(prefix));
  }

  function safeJSON(value, fallback){
    try { return value ? JSON.parse(value) : fallback; }
    catch(e){ return fallback; }
  }

  function normalizeState(state){
    const next = { ...(state || {}) };
    const history = safeJSON(next[HISTORY_KEY], {});
    const session = safeJSON(next[SESSION_KEY], null);

    // If a completed day and an active session disagree, do not let the cloud resurrect
    // an old running workout. Keep a closed marker instead; index.html will ignore it.
    if(session && (session.ended || session.completed || session.clearedAt || (session.iso && history[session.iso]?.completed))){
      const now = new Date().toISOString();
      const completed = session.iso ? history[session.iso] : null;
      next[SESSION_KEY] = JSON.stringify({
        ...session,
        ended: true,
        completed: true,
        status: session.status || completed?.status || "Completed",
        clearedAt: session.clearedAt || completed?.finishedAt || now,
        finishedAt: session.finishedAt || completed?.finishedAt || now,
        stoppedAt: session.stoppedAt || completed?.stoppedAt || completed?.finishedAt || now,
        endedAt: session.endedAt || completed?.endedAt || completed?.finishedAt || now
      });
    }

    return next;
  }

  function captureLocalState(){
    const state = {};
    for(let i=0;i<localStorage.length;i++){
      const key = localStorage.key(i);
      if(shouldSyncKey(key)) state[key] = localStorage.getItem(key);
    }
    return normalizeState(state);
  }

  function applyLocalState(state){
    const incoming = normalizeState(state || {});

    // A cloud restore should be a true restore, not a merge that leaves stale
    // local AP keys behind. Remove synced AP keys missing from the cloud state.
    const keysToRemove = [];
    for(let i=0;i<localStorage.length;i++){
      const key = localStorage.key(i);
      if(shouldSyncKey(key) && !Object.prototype.hasOwnProperty.call(incoming, key)){
        keysToRemove.push(key);
      }
    }
    keysToRemove.forEach(key => localStorage.removeItem(key));

    Object.entries(incoming).forEach(([key, value]) => {
      if(value === null || typeof value === "undefined") localStorage.removeItem(key);
      else localStorage.setItem(key, String(value));
    });
  }

  function athleteDoc(){
    return db.collection(collectionRoot()).doc(backupId()).collection("athletes").doc(athleteId());
  }

  function notifyEventsCollection(){
    return athleteDoc().collection("notificationEvents");
  }

  function deviceInfo(){
    return {
      userAgent: navigator.userAgent,
      language: navigator.language,
      platform: navigator.platform || "",
      online: navigator.onLine
    };
  }

  async function init(){
    if(readyPromise) return readyPromise;
    readyPromise = (async () => {
      if(!enabled()) return { ok:false, mode:status() };
      if(!window.firebase) return { ok:false, mode:"sdk-missing" };

      if(!firebase.apps.length) app = firebase.initializeApp(window.AP_FIREBASE_CONFIG);
      else app = firebase.app();

      auth = firebase.auth();
      db = firebase.firestore();

      if(window.AP_FIREBASE_USE_ANON_AUTH !== false && !auth.currentUser){
        await auth.signInAnonymously();
      }

      // If the device is fresh and cloud data exists, restore once automatically.
      const localHistory = localStorage.getItem("apb_full_history");
      if((!localHistory || localHistory === "{}") && !localStorage.getItem("ap_cloud_autorestored_v1")){
        try {
          const restored = await pullFromCloud({ force:false, silent:true });
          if(restored.restored) localStorage.setItem("ap_cloud_autorestored_v1", "done");
        } catch(e){
          console.warn("AP Firestore restore skipped:", e);
        }
      }

      return { ok:true, mode:"connected" };
    })().catch(err => {
      console.warn("AP Firestore init failed:", err);
      return { ok:false, mode:"init-failed", error:String(err) };
    });

    return readyPromise;
  }

  async function syncAll(reason="manual-sync"){
    await init();
    if(!db) return { ok:false, mode:status() };

    const state = captureLocalState();
    const payload = {
      backupId: backupId(),
      athleteId: athleteId(),
      updatedAt: firebase.firestore.FieldValue.serverTimestamp(),
      updatedAtMs: Date.now(),
      reason,
      device: deviceInfo(),
      state
    };

    await athleteDoc().set(payload);
    localStorage.setItem("ap_cloud_last_sync_at", new Date().toISOString());
    return { ok:true, mode:"connected", keys:Object.keys(state).length };
  }

  async function pullFromCloud({ force=false, silent=false } = {}){
    await init();
    if(!db) return { ok:false, mode:status(), reason:"not-connected" };

    const snap = await athleteDoc().get();
    if(!snap.exists) return { ok:false, mode:"connected", reason:"no-cloud-backup" };

    const data = snap.data() || {};
    const state = normalizeState(data.state || {});
    const localHistory = localStorage.getItem("apb_full_history");

    if(!force && localHistory && localHistory !== "{}"){
      return { ok:true, restored:false, mode:"connected", reason:"local-data-present" };
    }

    applyLocalState(state);
    localStorage.setItem("ap_cloud_last_pull_at", new Date().toISOString());
    return { ok:true, restored:true, mode:"connected", keys:Object.keys(state).length };
  }

  function queueSync(reason="auto-sync"){
    if(!(enabled() && window.AP_FIREBASE_AUTO_SYNC !== false)) return;
    clearTimeout(syncTimer);
    syncTimer = setTimeout(() => {
      syncAll(reason).catch(err => console.warn("AP Firestore sync failed:", err));
    }, 1200);
  }

  function debugSummary(){
    return {
      enabled: enabled(),
      status: status(),
      backupId: backupId(),
      athleteId: athleteId(),
      collectionRoot: collectionRoot()
    };
  }

  window.AP_SYNC = {
    enabled,
    status,
    init,
    syncAll,
    pullFromCloud,
    queueSync,
    debugSummary
  };

  window.AP_NOTIFY = {
    async sendEvent(event) {
      // Local preview store remains for this device.
      const key = "ap_parent_notification_events";
      const events = JSON.parse(localStorage.getItem(key) || "[]");
      events.push({ ...event, createdAt: new Date().toISOString(), mode: window.AP_SYNC.status() });
      localStorage.setItem(key, JSON.stringify(events));

      // Firestore event write for future parent alert functions.
      try {
        await init();
        if(db){
          await notifyEventsCollection().add({
            ...event,
            createdAt: firebase.firestore.FieldValue.serverTimestamp(),
            createdAtMs: Date.now(),
            backupId: backupId(),
            athleteId: athleteId()
          });
        }
      } catch(e){
        console.warn("AP parent notify cloud write failed:", e);
      }

      return { ok:true, mode: window.AP_SYNC.status(), event };
    }
  };

  window.addEventListener("load", () => {
    if(enabled()) init().catch(console.warn);
  });

  window.addEventListener("online", () => {
    if(enabled()) queueSync("online");
  });
})();
