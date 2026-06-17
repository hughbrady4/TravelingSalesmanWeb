import { initializeApp } from 'firebase/app';
import { getAuth, onAuthStateChanged, signOut } from 'firebase/auth';
import { getFirestore, doc, getDoc } from 'firebase/firestore';

const firebaseConfig = {
  apiKey: "AIzaSyBacr58gJ0TMqP4gkV2TD1j--nslIIx3Gk",
  authDomain: "osweb-140a8.firebaseapp.com",
  projectId: "osweb-140a8",
  storageBucket: "osweb-140a8.firebasestorage.app",
  messagingSenderId: "939475367267",
  appId: "1:939475367267:web:ae83ef6f5b26ea525f4f56",
  measurementId: "G-GWDJ4TQSSY",
};

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app, 'travelingsalesman');

const loadingEl = document.getElementById('loadingStatus');
const signedOutEl = document.getElementById('signedOutState');
const signedInEl = document.getElementById('signedInState');
const userInfoEl = document.getElementById('userInfo');
const firestoreInfoEl = document.getElementById('firestoreUserInfo');
const signOutBtn = document.getElementById('signOutBtn');
const profileLinkNav = document.getElementById('profileNavLink');

if (signOutBtn) {
  signOutBtn.addEventListener('click', async () => {
    try {
      await signOut(auth);
      window.location.href = '/';
    } catch (error) {
      console.error('Sign out failed:', error);
      alert('Sign out failed. Please try again.');
    }
  });
}

function renderUserInfo(user) {
  const lines = [
    // `<p><strong>UID:</strong> ${user.uid}</p>`,
    `<p><strong>Email:</strong> ${user.email || 'Not available'}</p>`,
    `<p><strong>Display Name:</strong> ${user.displayName || 'Not available'}</p>`,
    `<p><strong>Phone:</strong> ${user.phoneNumber || 'Not available'}</p>`,
    `<p><strong>Email Verified:</strong> ${user.emailVerified ? 'Yes' : 'No'}</p>`,
    `<p><strong>Anonymous:</strong> ${user.isAnonymous ? 'Yes' : 'No'}</p>`,
  ];
  if (user.photoURL) {
    lines.unshift(`<div class="mb-3"><img src="${user.photoURL}" alt="Profile photo" class="rounded-circle" style="max-width:96px;"></div>`);
  }
  userInfoEl.innerHTML = `
    <h2 class="h5">Firebase Auth Profile</h2>
    ${lines.join('')}
  `;
}

function renderFirestoreUser(docSnap) {
  if (!docSnap.exists()) {
    firestoreInfoEl.innerHTML = `
      <h2 class="h5">Firestore User Document</h2>
      <div class="alert alert-warning">No user document found in <code>users/${docSnap.ref.id}</code>.</div>
    `;
    return;
  }

  const docData = docSnap.data();
  const rows = Object.entries(docData).map(([key, value]) => {
    return `<tr><th scope="row">${key}</th><td>${sanitize(value)}</td></tr>`;
  }).join('');

  firestoreInfoEl.innerHTML = `
    <h2 class="h5">Firestore User Document</h2>
    <p class="text-muted mb-3">Document ID: <code>${docSnap.id}</code></p>
    <div class="table-responsive">
      <table class="table table-sm table-striped">
        <tbody>${rows}</tbody>
      </table>
    </div>
  `;
}

function sanitize(value) {
  if (value === undefined || value === null) {
    return 'null';
  }
  if (typeof value === 'object') {
    try {
      return JSON.stringify(value, null, 2);
    } catch (error) {
      return String(value);
    }
  }
  return String(value);
}

function showSignedOutState() {
  loadingEl.style.display = 'none';
  signedInEl.style.display = 'none';
  signedOutEl.style.display = 'block';
}

function showSignedInState() {
  loadingEl.style.display = 'none';
  signedOutEl.style.display = 'none';
  signedInEl.style.display = 'block';
  if (profileLinkNav) {
    profileLinkNav.classList.add('active');
  }
}

async function loadProfile(user) {
  renderUserInfo(user);
  const usersDocRef = doc(db, 'users', user.uid);
  try {
    const userDoc = await getDoc(usersDocRef);
    renderFirestoreUser(userDoc);
  } catch (error) {
    console.error('Error loading Firestore user document:', error);
    firestoreInfoEl.innerHTML = `
      <h2 class="h5">Firestore User Document</h2>
      <div class="alert alert-danger">Unable to load Firestore user document. See console for details.</div>
    `;
  }
}

onAuthStateChanged(auth, async (user) => {
  if (user && !user.isAnonymous) {
    showSignedInState();
    await loadProfile(user);
  } else {
    showSignedOutState();
  }
});
