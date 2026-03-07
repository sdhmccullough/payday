// ===== firebase-config.js =====
// Firebase initialization + Google Sign-In for PayDay

const firebaseConfig = {
  apiKey: "AIzaSyBeqSwXhYjFmHpUcoR8e_EB0NV0l0zLG94",
  authDomain: "payday-daf05.firebaseapp.com",
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

// Sign in with Google — uses redirect (works on mobile)
function signInWithGoogle() {
  return auth.signInWithRedirect(googleProvider);
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

// Join an existing household
function joinHousehold(uid, email, householdId) {
  return db.ref('households/' + householdId).once('value').then(snap => {
    if (!snap.exists()) {
      throw new Error('Household not found. Check the code and try again.');
    }
    const updates = {};
    updates['households/' + householdId + '/members/' + uid] = email;
    updates['userHouseholds/' + uid] = householdId;
    return db.ref().update(updates);
  });
}

// Get the state reference for a household
function getStateRef(householdId) {
  return db.ref('households/' + householdId + '/state');
}
