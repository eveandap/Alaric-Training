const functions = require("firebase-functions/v2");
const { onDocumentCreated } = require("firebase-functions/v2/firestore");
const admin = require("firebase-admin");

admin.initializeApp();

exports.sendParentWorkoutNotification = onDocumentCreated(
  "users/{uid}/athletes/alaric-padron/notificationEvents/{eventId}",
  async (event) => {
    const data = event.data.data();
    const uid = event.params.uid;

    const tokensSnap = await admin.firestore()
      .collection(`users/${uid}/notificationTokens`)
      .get();

    const tokens = tokensSnap.docs.map(doc => doc.id);
    if (!tokens.length) return;

    const message = {
      notification: {
        title: data.title || "AP Baseball",
        body: data.body || "Workout update received."
      },
      data: {
        type: data.type || "",
        iso: data.iso || ""
      },
      tokens
    };

    const result = await admin.messaging().sendEachForMulticast(message);

    const stale = [];
    result.responses.forEach((r, i) => {
      if (!r.success) {
        const code = r.error && r.error.code;
        if (code === "messaging/registration-token-not-registered" || code === "messaging/invalid-registration-token") {
          stale.push(tokens[i]);
        }
      }
    });

    await Promise.all(stale.map(token =>
      admin.firestore().doc(`users/${uid}/notificationTokens/${token}`).delete()
    ));
  }
);
