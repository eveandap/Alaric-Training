# AP Baseball Training — Adaptive Overlay Revision

This revision continues from the language cleanup build.

## Changes
- Added a true adaptive training overlay while keeping the base workout visible.
- The app now looks at the most recent completed similar workout and recommends one of three paths:
  - base workout,
  - +10% on eligible controlled skill reps,
  - -10% on eligible controlled skill reps.
- Adaptive increases are conservative and avoid protected work such as arm care, throwing, sand bucket work, lower-leg/calf work, warm-up work, and assessment/test rows.
- Eligible adjusted rows display a small note under the original target instead of silently replacing the base workout.
- Current body check-in values can block increases when arms or legs are sore/hurting.
- Saved sessions now include the adaptive recommendation for that day in the local backup data.
- Kept the Today’s Standard popup behavior unchanged.
- Workout programming was not changed.
- Bumped the service worker cache.

## Rollback
The previous active baseline was `ap_baseball_training_language_cleanup_revision.zip`.


## AP coin intro
- Added the uploaded AP coin `.glb` as a first-open intro experience.
- On the first app open, the coin appears full screen, rotates from front to back, and then lets the athlete enter the app.
- The intro is stored as seen after dismissal and does not repeat on every open.
- Standard popup behavior remains intact and waits until the intro has been dismissed.

## AP coin loading screen update
- Changed the AP coin intro from an interactive entry screen to an automatic loading-style screen.
- The coin shows the front, spins quickly to the back, pauses briefly, and then automatically opens into the app.
- Removed the Enter App button and user interaction from the coin intro.
- Today’s Standard popup behavior remains intact after the loading screen finishes.

## AP coin loading screen seamless view update
- Removed the card/box around the 3D coin intro.
- Expanded the 3D viewer to a full-screen loading screen layout.
- Pulled the camera back and widened the field of view so the full coin stays visible during the flip.
- Kept the automatic front-to-back spin and fade into the app.
- Workout logic was not changed.


## Dark seamless coin intro refinement
- Darkened the background further to keep focus on the coin.
- Removed all intro text except the loading bar.
- Adjusted timing to hold the front for 2.5 seconds, spin quickly, hold the back for 3 seconds, then fade into the app.

## Daily dark coin intro refinement
- Darkened the background further so the coin is the sole focus.
- Removed all intro text, leaving only the loading bar.
- Intro now plays once per day based on the local date, resetting after midnight.
- Timing updated to: front 2 seconds, smooth spin, back 2.5 seconds, then fade into the app.
- Added pre-paint suppression so the app content does not flash before the coin screen appears.

## Instant coin poster refinement
- Added an immediate front-face coin poster using the app icon while the 3D `.glb` loads.
- The loading bar is no longer the first/only visual; the coin face appears immediately.
- Once the `.glb` is ready, the poster crossfades into the 3D coin and the timed flip begins.
- Daily intro behavior remains unchanged.


## Custom coin poster alignment refinement
- Replaced the temporary poster with the user-provided AP five-tools coin artwork.
- Cropped it into a circular transparent poster so it sits on the intro background more cleanly.
- Adjusted poster sizing and 3D camera settings to make the poster-to-GLB transition less noticeable.


## Poster replacement update
- Replaced the temporary intro poster with the newly cropped standalone coin PNG.
- Kept the existing intro timing and transition behavior intact.


## Poster size/alignment refinement
- Converted the cropped poster into a transparent circular PNG so the visible coin diameter better matches the 3D coin.
- Slightly tuned the poster sizing and crossfade timing to smooth the poster-to-GLB transition.


## No-poster black fade refinement
- Removed the temporary poster image from the intro.
- The intro now uses a darker black-to-scene fade while the `.glb` loads.
- Once the model is ready, the coin fades in directly instead of switching from a poster.

## Equipment separation + fade timing update
- Separated Insider Bat and One-hand bat in the equipment list instead of showing “Insider Bat or one-hand bat (optional).”
- Lengthened the initial black fade and delayed the coin movement slightly so the intro feels less abrupt.
- Removed the unused poster PNG from the package.
- Workout programming was not changed.

## App content reveal fade
- Added a slight fade/slide reveal into the app content after the coin intro finishes.
- The Today’s Standard popup now waits a little longer so it does not interrupt the app reveal.
- Workout programming was not changed.

## Week 6 history import
- Added detailed completed records from emailed results for Monday, June 29, 2026 and Tuesday, June 30, 2026.
- June 29 is saved as a completed 76-minute session, difficulty 4 - Hard.
- June 30 is saved as a completed 58-minute session, difficulty 4 - Hard, with fielding actuals captured in the record.
- July 1-3, 2026 are treated as missed/not completed and are cleared once during migration if old test records exist.
- Added “Not feeling it” to the mood dropdown so the imported records display accurately.
- Workout programming was not changed.

## Brick Wall optional mini game
- Added optional Wall Ball / Brick Wall mini game as a bonus challenge, separate from required workouts.
- Challenge appears using date-stable random offer logic and can also show as an optional card on eligible days.
- Modes included: Rookie Wall, Quick Hands, Backhand Wall, Switch Wall, and Streak Wall.
- No Chaos Wall mode is included.
- Challenge uses a 60-second timer, then records total clean catches and best streak.
- Wall Ball completions do not count as workout sessions and do not affect adaptive workout programming.
- Brick Wall badge tiers are hidden and unlock at 5 / 10 / 20 / 35 / 50 completed challenges.

## Brick Wall score reminder update
- Added a pre-start reminder to track total clean catches and best streak without a drop.
- Added a post-timer score reminder with an example before entering results.
- Updated the best-streak field label for clarity.

## Live launch: achievements paused
- Added ACHIEVEMENTS_ENABLED=false.
- Hall of Fame and Dashboard badge display now show a paused state.
- Badge unlock popups are disabled.
- Brick Wall mini game tracking remains active, but Brick Wall badge unlocks are paused.
- Stored badge data is not deleted, so achievements can be re-enabled later.

## Firestore cloud backup pass
This revision wires in Firestore cloud backup support.

### What was added
- Firebase web SDK loading in `index.html`
- Real Firestore sync implementation in `firebase-sync.js`
- Auto-sync hooks after workout saves, session saves, wall ball saves, and alert-setting saves
- Cloud Backup card in the **Data & Backup** page
- Manual **Sync to Cloud** and **Restore from Cloud** buttons
- Firestore rules template: `firestore.rules`
- Firestore indexes placeholder: `firestore.indexes.json`

### Setup steps
1. Create a Firebase project.
2. In Firebase Console, create a **Web App** and copy its config into `firebase-config.js`.
3. Enable **Authentication → Anonymous**.
4. Enable **Firestore Database**.
5. In `firebase-config.js`, set:
   - `window.AP_FIREBASE_ENABLED = true`
   - `window.AP_FIREBASE_BACKUP_ID = "padron-family-live"` (or your preferred shared backup ID)
6. Deploy the rules in `firestore.rules`.
7. Redeploy the PWA to GitHub Pages.

### How this Firestore pass works
- Local app data remains the source of truth on the device.
- The app writes a Firestore backup bundle containing the relevant local storage keys.
- On a fresh device, if the local history is empty, the app will try one automatic restore from Firestore.
- You can also manually use **Sync to Cloud** and **Restore from Cloud** from the Data page.

### Important note
This first pass uses **anonymous auth + a shared backup ID** for convenience.
That is enough for practical cloud backup, but it is not the final/strongest security model.
If you want stronger cloud ownership later, the next pass can add parent sign-in and tighter Firestore rules.

## Firestore sync repair — July 18, 2026
- Fixed the manual **Sync to Cloud** button so failures no longer disappear silently.
- Added visible `Syncing`, success, timeout, authentication, permission, and payload-size messages.
- Corrected the green `Connected` status so it requires an authenticated Firebase user rather than only a Firestore object.
- Anonymous authentication now retries instead of remaining permanently stuck after one failed initialization.
- Fixed the immediate save path so a returned `{ ok: false }` result is not incorrectly reported as a successful cloud sync.
- Removed the recursive initialization/auto-restore deadlock on fresh devices.
- Added a 25-second Firestore timeout while keeping local phone data intact after failure.
- Added local build/version and last-attempt diagnostics to the Data page.
- Reworked the service worker so a missing optional icon, badge, or incorrectly named rules file cannot block an update.
- App HTML and cloud JavaScript now use network-first caching, preventing an old cached sync file from remaining active indefinitely.

### Deployment note
Overwrite the repository files with this revision while keeping the existing `icons/` and `badges/` folders. After GitHub Pages finishes deploying, open the PWA once with internet access. The repaired service worker may reload the page once as it takes control.
