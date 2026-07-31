// ===== firebase-config.js =====
// Firebase initialization + Google Sign-In for PayDay

const firebaseConfig = {
  apiKey: "AIzaSyBeqSwXhYjFmHpUcoR8e_EB0NV0l0zLG94",
  // Same-origin auth handler (served by Firebase Hosting at /__/auth/*).
  // Cross-origin firebaseapp.com breaks redirect sign-in under third-party
  // storage partitioning (Safari ITP etc.).
  authDomain: "payday-daf05.web.app",
  databaseURL: "https://payday-daf05-default-rtdb.firebaseio.com",
  projectId: "payday-daf05",
  storageBucket: "payday-daf05.firebasestorage.app",
  messagingSenderId: "98725941274",
  appId: "1:98725941274:web:345d950573aa694ce6c1a3",
  measurementId: "G-8QFG277BJZ"
};

// Initialize Firebase
firebase.initializeApp(firebaseConfig);

// References
const auth = firebase.auth();
const db = firebase.database();
const googleProvider = new firebase.auth.GoogleAuthProvider();

// Sign in with Google. Popup first (keeps SPA state); fall back to a full
// redirect where popups can't work — installed PWAs and in-app browsers.
function signInWithGoogle() {
  return auth.signInWithPopup(googleProvider).catch(err => {
    if (err && (err.code === 'auth/popup-blocked' ||
                err.code === 'auth/operation-not-supported-in-this-environment')) {
      return auth.signInWithRedirect(googleProvider);
    }
    throw err;
  });
}

// Sign out
function signOutUser() {
  return auth.signOut();
}

// Get the household ID for a user (returns a promise)
function getHouseholdId(uid) {
  return db.ref('userHouseholds/' + uid).once('value').then(snap => snap.val());
}

// Create a new household for this user
function createHousehold(uid, email) {
  const updates = {};
  updates['households/' + uid + '/members/' + uid] = email;
  updates['userHouseholds/' + uid] = uid;
  return db.ref().update(updates);
}

// Join an existing household.
// No existence pre-read: security rules deny reads to non-members, and they
// also reject this update unless the household exists (or is our own), so a
// PERMISSION_DENIED here doubles as "not found".
function joinHousehold(uid, email, householdId) {
  const updates = {};
  updates['households/' + householdId + '/members/' + uid] = email;
  updates['userHouseholds/' + uid] = householdId;
  return db.ref().update(updates).catch(err => {
    if (/permission.denied/i.test((err && err.code) || (err && err.message) || '')) {
      throw new Error('Household not found. Check the code and try again.');
    }
    throw err;
  });
}

// Get the state reference for a household
function getStateRef(householdId) {
  return db.ref('households/' + householdId + '/state');
}
