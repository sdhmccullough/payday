import { initializeApp } from 'firebase/app';
import { getAuth, connectAuthEmulator } from 'firebase/auth';
import { getDatabase, connectDatabaseEmulator } from 'firebase/database';

const firebaseConfig = {
  apiKey: 'AIzaSyBeqSwXhYjFmHpUcoR8e_EB0NV0l0zLG94',
  // Same-origin auth handler (Hosting serves /__/auth/*); the cross-origin
  // firebaseapp.com domain breaks redirect sign-in under storage partitioning.
  authDomain: 'payday-daf05.web.app',
  databaseURL: 'https://payday-daf05-default-rtdb.firebaseio.com',
  projectId: 'payday-daf05',
  storageBucket: 'payday-daf05.firebasestorage.app',
  messagingSenderId: '98725941274',
  appId: '1:98725941274:web:345d950573aa694ce6c1a3',
};

export const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const db = getDatabase(app);

if (import.meta.env.VITE_USE_EMULATORS === '1') {
  connectAuthEmulator(auth, 'http://localhost:9099', { disableWarnings: true });
  connectDatabaseEmulator(db, 'localhost', 9000);
}
