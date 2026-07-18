(function(){
  "use strict";

  const BUILD_ID = "2026-07-18-sync-repair-v13.2";
  const KEY_PREFIXES = ["apb_", "ap_parent_", "ap_coin_"];
  const HISTORY_KEY = "apb_full_history";
  const SESSION_KEY = "apb_full_active_session";
  const LAST_SYNC_KEY = "ap_cloud_last_sync_at";
  const LAST_PULL_KEY = "ap_cloud_last_pull_at";
  const LAST_ATTEMPT_KEY = "ap_cloud_last_attempt_at";
  const LAST_ERROR_KEY = "ap_cloud_last_error";
  const MAX_STATE_BYTES = 850000;
  const AUTH_TIMEOUT_MS = 15000;
  const WRITE_TIMEOUT_MS = 25000;
  const READ_TIMEOUT_MS = 25000;

  let app = null;
  let db = null;
  let auth = null;
  let sdkInitPromise = null;
  let authPromise = null;
  let syncPromise = null;
  let syncTimer = null;
  let autoRestoreAttempted = false;
  let activeOperation = "";
  let lastRuntimeError = null;

  function hasFirebaseConfig(){
    const c = window.AP_FIREBASE_CONFIG || {};
    return !!(c.apiKey && c.projectId && c.appId);
  }

  function enabled(){
    return !!(window.AP_FIREBASE_ENABLED && hasFirebaseConfig());
  }

  function usesAnonymousAuth(){
    return window.AP_FIREBASE_USE_ANON_AUTH !== false;
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
    if(activeOperation === "sync") return "syncing";
    if(activeOperation === "restore") return "restoring";
    if(!db || !auth) return "connecting";
    if(usesAnonymousAuth() && !auth.currentUser) return lastRuntimeError ? "error" : "auth-required";
    if(lastRuntimeError) return "error";
    return "connected";
  }

  function emitStatus(extra={}){
    try {
      window.dispatchEvent(new CustomEvent("ap-cloud-status", {
        detail: { status: status(), buildId: BUILD_ID, ...extra }
      }));
    } catch(e) {}
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

    // Do not let an old active-session record reopen a workout that history says is complete.
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
    for(let i=0; i<localStorage.length; i++){
      const key = localStorage.key(i);
      if(key && shouldSyncKey(key)) state[key] = localStorage.getItem(key);
    }
    return normalizeState(state);
  }

  function applyLocalState(state){
    const incoming = normalizeState(state || {});
    const keysToRemove = [];

    for(let i=0; i<localStorage.length; i++){
      const key = localStorage.key(i);
      if(key && shouldSyncKey(key) && !Object.prototype.hasOwnProperty.call(incoming, key)){
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

  function utf8Bytes(value){
    try { return new TextEncoder().encode(value).length; }
    catch(e){ return unescape(encodeURIComponent(value)).length; }
  }

  function timeoutError(label){
    const error = new Error(label);
    error.code = "ap/timeout";
    return error;
  }

  function withTimeout(promise, milliseconds, label){
    let timer;
    const timeout = new Promise((_, reject) => {
      timer = setTimeout(() => reject(timeoutError(label)), milliseconds);
    });
    return Promise.race([promise, timeout]).finally(() => clearTimeout(timer));
  }

  function describeError(error){
    const code = String(error?.code || "");
    const raw = String(error?.message || error || "Unknown cloud error");

    if(code.includes("permission-denied")) return "Firestore rejected the write. Confirm the deployed rules allow authenticated access to the AP backup path.";
    if(code.includes("unauthenticated")) return "Firebase authentication was not ready. The app will retry anonymous sign-in on the next sync.";
    if(code.includes("network-request-failed") || code.includes("unavailable")) return "Firebase could not be reached. Check the connection and try again.";
    if(code === "ap/timeout") return raw;
    if(code === "ap/backup-too-large") return raw;
    if(code.includes("failed-precondition")) return "Firestore reported a configuration or connection problem: " + raw;
    return raw;
  }

  function rememberError(error, context){
    const record = {
      at: new Date().toISOString(),
      context: context || "cloud",
      code: String(error?.code || "unknown"),
      message: describeError(error)
    };
    lastRuntimeError = record;
    try { localStorage.setItem(LAST_ERROR_KEY, JSON.stringify(record)); } catch(e) {}
    emitStatus({ error: record });
    return record;
  }

  function clearError(){
    lastRuntimeError = null;
    try { localStorage.removeItem(LAST_ERROR_KEY); } catch(e) {}
  }

  async function initializeSdk(){
    if(db && auth) return { app, db, auth };
    if(sdkInitPromise) return sdkInitPromise;

    sdkInitPromise = (async () => {
      if(!enabled()) throw Object.assign(new Error("Firebase cloud backup is disabled or incomplete."), { code:"ap/disabled" });
      if(!window.firebase) throw Object.assign(new Error("Firebase SDK did not load."), { code:"ap/sdk-missing" });

      if(!firebase.apps.length) app = firebase.initializeApp(window.AP_FIREBASE_CONFIG);
      else app = firebase.app();

      auth = firebase.auth();
      db = firebase.firestore();

      // Prefer durable anonymous-auth persistence, but do not block cloud use if the browser rejects it.
      try {
        await auth.setPersistence(firebase.auth.Auth.Persistence.LOCAL);
      } catch(e) {
        console.warn("AP Firebase auth persistence warning:", e);
      }

      return { app, db, auth };
    })().catch(error => {
      sdkInitPromise = null;
      db = null;
      auth = null;
      throw error;
    });

    return sdkInitPromise;
  }

  async function ensureAuthenticated(){
    await initializeSdk();
    if(!usesAnonymousAuth()) return auth.currentUser || null;
    if(auth.currentUser) return auth.currentUser;
    if(authPromise) return authPromise;

    authPromise = withTimeout(
      auth.signInAnonymously().then(result => result.user || auth.currentUser),
      AUTH_TIMEOUT_MS,
      "Anonymous Firebase sign-in timed out. Try Sync to Cloud again."
    ).finally(() => {
      authPromise = null;
    });

    const user = await authPromise;
    if(!user) throw Object.assign(new Error("Anonymous Firebase sign-in did not produce a user."), { code:"ap/no-auth-user" });
    return user;
  }

  async function pullFromCloudInternal({ force=false } = {}){
    const snap = await withTimeout(
      athleteDoc().get(),
      READ_TIMEOUT_MS,
      "Cloud restore timed out before Firestore responded."
    );

    if(!snap.exists) return { ok:false, restored:false, mode:status(), reason:"no-cloud-backup" };

    const data = snap.data() || {};
    const state = normalizeState(data.state || {});
    const localHistory = localStorage.getItem(HISTORY_KEY);

    if(!force && localHistory && localHistory !== "{}"){
      return { ok:true, restored:false, mode:status(), reason:"local-data-present" };
    }

    applyLocalState(state);
    localStorage.setItem(LAST_PULL_KEY, new Date().toISOString());
    return { ok:true, restored:true, mode:"connected", keys:Object.keys(state).length };
  }

  async function init({ skipAutoRestore=false } = {}){
    if(!enabled()) return { ok:false, mode:status(), error:"Cloud backup is disabled." };

    try {
      await initializeSdk();
      await ensureAuthenticated();
      clearError();

      if(!skipAutoRestore && !autoRestoreAttempted){
        autoRestoreAttempted = true;
        const localHistory = localStorage.getItem(HISTORY_KEY);
        if((!localHistory || localHistory === "{}") && !localStorage.getItem("ap_cloud_autorestored_v1")){
          try {
            const restored = await pullFromCloudInternal({ force:false });
            if(restored.restored) localStorage.setItem("ap_cloud_autorestored_v1", "done");
          } catch(error) {
            console.warn("AP Firestore automatic restore skipped:", error);
          }
        }
      }

      emitStatus();
      return { ok:true, mode:"connected", authenticated:!!auth.currentUser };
    } catch(error) {
      const record = rememberError(error, "init");
      return { ok:false, mode:"error", error:record.message, code:record.code };
    }
  }

  async function syncAll(reason="manual-sync"){
    if(syncPromise) return syncPromise;

    syncPromise = (async () => {
      activeOperation = "sync";
      localStorage.setItem(LAST_ATTEMPT_KEY, new Date().toISOString());
      emitStatus({ reason });

      if(!navigator.onLine){
        const error = new Error("This phone is offline. The workout is still saved locally; reconnect and try Sync to Cloud again.");
        error.code = "ap/offline";
        throw error;
      }

      const ready = await init({ skipAutoRestore:true });
      if(!ready.ok){
        return { ok:false, mode:ready.mode || "error", error:ready.error || "Firebase is not ready.", code:ready.code || "ap/not-ready" };
      }

      const state = captureLocalState();
      const stateBytes = utf8Bytes(JSON.stringify(state));
      if(stateBytes > MAX_STATE_BYTES){
        const error = new Error(`The AP backup is ${Math.round(stateBytes/1024)} KB, which is too large for the current single-document backup format.`);
        error.code = "ap/backup-too-large";
        throw error;
      }

      const completedAt = new Date().toISOString();
      const payload = {
        backupId: backupId(),
        athleteId: athleteId(),
        schemaVersion: 2,
        buildId: BUILD_ID,
        updatedAt: firebase.firestore.FieldValue.serverTimestamp(),
        updatedAtMs: Date.now(),
        clientUpdatedAt: completedAt,
        reason,
        stateBytes,
        stateKeyCount: Object.keys(state).length,
        device: deviceInfo(),
        state
      };

      await withTimeout(
        athleteDoc().set(payload),
        WRITE_TIMEOUT_MS,
        "Cloud sync timed out before Firestore confirmed the write. Your workout remains saved on this phone."
      );

      localStorage.setItem(LAST_SYNC_KEY, completedAt);
      clearError();
      return { ok:true, mode:"connected", keys:Object.keys(state).length, bytes:stateBytes, syncedAt:completedAt };
    })().catch(error => {
      const record = rememberError(error, "sync");
      return { ok:false, mode:"error", error:record.message, code:record.code };
    }).finally(() => {
      activeOperation = "";
      syncPromise = null;
      emitStatus();
    });

    return syncPromise;
  }

  async function pullFromCloud({ force=false } = {}){
    activeOperation = "restore";
    emitStatus();

    try {
      const ready = await init({ skipAutoRestore:true });
      if(!ready.ok) return { ok:false, restored:false, mode:ready.mode || "error", reason:ready.error || "not-connected" };
      const result = await pullFromCloudInternal({ force });
      clearError();
      return result;
    } catch(error) {
      const record = rememberError(error, "restore");
      return { ok:false, restored:false, mode:"error", reason:record.message, error:record.message, code:record.code };
    } finally {
      activeOperation = "";
      emitStatus();
    }
  }

  function queueSync(reason="auto-sync"){
    if(!(enabled() && window.AP_FIREBASE_AUTO_SYNC !== false)) return;
    clearTimeout(syncTimer);
    syncTimer = setTimeout(async () => {
      const result = await syncAll(reason);
      if(!result.ok) console.warn("AP Firestore sync failed:", result.error || result);
    }, 1200);
  }

  function debugSummary(){
    return {
      enabled: enabled(),
      status: status(),
      authenticated: !!auth?.currentUser,
      backupId: backupId(),
      athleteId: athleteId(),
      collectionRoot: collectionRoot(),
      buildId: BUILD_ID,
      lastError: lastRuntimeError || safeJSON(localStorage.getItem(LAST_ERROR_KEY), null)
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
      const key = "ap_parent_notification_events";
      const events = safeJSON(localStorage.getItem(key), []);
      events.push({ ...event, createdAt:new Date().toISOString(), mode:status() });
      localStorage.setItem(key, JSON.stringify(events));

      try {
        const ready = await init({ skipAutoRestore:true });
        if(ready.ok && db){
          await withTimeout(
            notifyEventsCollection().add({
              ...event,
              createdAt: firebase.firestore.FieldValue.serverTimestamp(),
              createdAtMs: Date.now(),
              backupId: backupId(),
              athleteId: athleteId()
            }),
            WRITE_TIMEOUT_MS,
            "Parent notification cloud write timed out."
          );
        }
      } catch(error) {
        console.warn("AP parent notify cloud write failed:", error);
      }

      return { ok:true, mode:status(), event };
    }
  };

  window.addEventListener("load", () => {
    if(enabled()) init().catch(error => console.warn("AP Firebase load init failed:", error));
  });

  window.addEventListener("online", () => {
    if(enabled()) queueSync("online");
  });
})();
