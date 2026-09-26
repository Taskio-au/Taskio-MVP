import { initializeApp } from 'https://www.gstatic.com/firebasejs/12.0.0/firebase-app.js';
import {
  GoogleAuthProvider,
  getAuth,
  getIdTokenResult,
  inMemoryPersistence,
  setPersistence,
  signInWithPopup,
  signOut,
} from 'https://www.gstatic.com/firebasejs/12.0.0/firebase-auth.js';
import {
  ReCaptchaEnterpriseProvider,
  getToken,
  initializeAppCheck,
} from 'https://www.gstatic.com/firebasejs/12.0.0/firebase-app-check.js';
import { doc, getDoc, getFirestore } from 'https://www.gstatic.com/firebasejs/12.0.0/firebase-firestore.js';
import { getStorage, ref, uploadBytes } from 'https://www.gstatic.com/firebasejs/12.0.0/firebase-storage.js';

const firebaseConfig = Object.freeze({
  apiKey: 'AIzaSyAVmOP2j8VIMHWRz9o49JHKqyiszQ5qMOg',
  authDomain: 'taskio-v2.firebaseapp.com',
  projectId: 'taskio-v2',
  storageBucket: 'taskio-v2.firebasestorage.app',
  messagingSenderId: '848916998874',
  appId: '1:848916998874:web:718d57c9621cb15461d3e3',
});

const enterpriseSiteKey = '6LfNPM4tAAAAAA09u7lnPAZdTXyIxW2YtBlsfj5k';
const DATA_PROOF_CONTROLS_ENABLED = false;
const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const googleProvider = new GoogleAuthProvider();

let operator = null;
let appCheck = null;
let appCheckReady = false;
let persistenceReady = false;

const controls = {
  signIn: document.querySelector('#sign-in'),
  verifyAdmin: document.querySelector('#verify-admin'),
  acquireAppCheck: document.querySelector('#acquire-appcheck'),
  firestoreProof: document.querySelector('#firestore-proof'),
  storageProof: document.querySelector('#storage-proof'),
  signOut: document.querySelector('#sign-out'),
};

const statuses = {
  auth: document.querySelector('#auth-status'),
  admin: document.querySelector('#admin-status'),
  appCheck: document.querySelector('#appcheck-status'),
  firestore: document.querySelector('#firestore-status'),
  storage: document.querySelector('#storage-status'),
  message: document.querySelector('#operator-message'),
};

function setMessage(message) {
  statuses.message.textContent = message;
}

function resetProofState() {
  operator = null;
  appCheckReady = false;
  statuses.auth.textContent = 'SIGNED OUT';
  statuses.admin.textContent = 'NO';
  statuses.appCheck.textContent = 'NOT RUN';
  statuses.firestore.textContent = 'NOT RUN';
  statuses.storage.textContent = 'NOT RUN';
  controls.verifyAdmin.disabled = true;
  controls.acquireAppCheck.disabled = true;
  controls.firestoreProof.disabled = true;
  controls.storageProof.disabled = true;
  controls.signOut.disabled = true;
  controls.signIn.disabled = !persistenceReady;
}

function signInFailureMessage(error) {
  const code = error && error.code;
  if (code === 'auth/popup-blocked') {
    return 'Google sign-in was blocked. Allow popups for this site and try again.';
  }
  if (code === 'auth/popup-closed-by-user' || code === 'auth/cancelled-popup-request') {
    return 'Google sign-in was cancelled.';
  }
  if (code === 'auth/unauthorized-domain') {
    return 'Google sign-in is not authorized for this site.';
  }
  return 'Google sign-in failed.';
}

function continueWithGoogle() {
  if (!persistenceReady) return;
  controls.signIn.disabled = true;
  setMessage('Opening Google sign-in.');
  const popupResult = signInWithPopup(auth, googleProvider);
  popupResult.then((result) => {
    operator = result.user;
    statuses.auth.textContent = 'SIGNED IN';
    controls.verifyAdmin.disabled = false;
    controls.signOut.disabled = false;
    setMessage('Signed in. Verify the fresh admin session next.');
  }).catch((error) => {
    resetProofState();
    setMessage(signInFailureMessage(error));
  });
}

async function verifyAdminSession() {
  controls.verifyAdmin.disabled = true;
  statuses.admin.textContent = 'NO';
  try {
    if (!operator) throw new Error('missing operator');
    const tokenResult = await getIdTokenResult(operator, true);
    const provider = tokenResult.claims.firebase?.sign_in_provider;
    const valid = tokenResult.claims.aud === 'taskio-v2'
      && provider === 'google.com'
      && tokenResult.claims.admin === true;
    if (!valid) throw new Error('operator is not authorized');
    statuses.admin.textContent = 'YES';
    controls.acquireAppCheck.disabled = false;
    setMessage('Admin session verified. App Check token acquisition is now available.');
  } catch {
    statuses.admin.textContent = 'NO';
    controls.acquireAppCheck.disabled = true;
    setMessage('Admin verification failed. Proof operations remain disabled.');
  }
}

async function acquireAppCheckToken() {
  controls.acquireAppCheck.disabled = true;
  statuses.appCheck.textContent = 'READY';
  try {
    if (!operator || statuses.admin.textContent !== 'YES') throw new Error('admin required');
    appCheck ||= initializeAppCheck(app, {
      provider: new ReCaptchaEnterpriseProvider(enterpriseSiteKey),
      isTokenAutoRefreshEnabled: true,
    });
    const result = await getToken(appCheck, true);
    if (!result?.token) throw new Error('token unavailable');
    appCheckReady = true;
    statuses.appCheck.textContent = 'READY';
    controls.firestoreProof.disabled = !DATA_PROOF_CONTROLS_ENABLED;
    controls.storageProof.disabled = !DATA_PROOF_CONTROLS_ENABLED;
    setMessage(DATA_PROOF_CONTROLS_ENABLED
      ? 'App Check is ready. Data proof controls are available.'
      : 'App Check is ready. Data proof controls remain disabled for P05G2.');
  } catch {
    appCheckReady = false;
    statuses.appCheck.textContent = 'ERROR';
    setMessage('App Check verification failed. Data proof controls remain disabled.');
  }
}

async function runFirestoreProof() {
  if (!DATA_PROOF_CONTROLS_ENABLED || !appCheckReady || !operator) return;
  controls.firestoreProof.disabled = true;
  try {
    await getDoc(doc(getFirestore(app), 'adminDailyChecklist', 'appcheck-proof'));
    statuses.firestore.textContent = 'PASS';
    setMessage('Firestore proof completed. No document was created or changed.');
  } catch {
    statuses.firestore.textContent = 'ERROR';
    setMessage('Firestore proof failed.');
  }
}

function proofPng() {
  const binary = atob('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=');
  return new Uint8Array([...binary].map((character) => character.charCodeAt(0)));
}

async function runStorageProof() {
  if (!DATA_PROOF_CONTROLS_ENABLED || !appCheckReady || !operator) return;
  controls.storageProof.disabled = true;
  try {
    const objectRef = ref(getStorage(app), `profilePhotos/${operator.uid}/appcheck-proof.png`);
    await uploadBytes(objectRef, proofPng(), { contentType: 'image/png' });
    statuses.storage.textContent = 'PASS';
    setMessage('Storage proof completed. Cleanup requires the separately approved operator step.');
  } catch {
    statuses.storage.textContent = 'ERROR';
    setMessage('Storage proof failed.');
  }
}

async function endSession() {
  await signOut(auth);
  resetProofState();
  setMessage('Signed out. No token values were displayed or stored.');
}

controls.signIn.addEventListener('click', continueWithGoogle);
controls.verifyAdmin.addEventListener('click', verifyAdminSession);
controls.acquireAppCheck.addEventListener('click', acquireAppCheckToken);
controls.firestoreProof.addEventListener('click', runFirestoreProof);
controls.storageProof.addEventListener('click', runStorageProof);
controls.signOut.addEventListener('click', endSession);

resetProofState();
setMessage('Preparing Google sign-in. Data proof controls remain disabled.');
setPersistence(auth, inMemoryPersistence).then(() => {
  persistenceReady = true;
  controls.signIn.disabled = false;
  setMessage('Sign in to begin. Data proof controls remain disabled.');
}).catch(() => {
  persistenceReady = false;
  controls.signIn.disabled = true;
  setMessage('Google sign-in could not be prepared.');
});
