import { initializeApp } from 'firebase/app';
import { connectAuthEmulator, getAuth, onAuthStateChanged, signOut } from 'firebase/auth';
import { connectFirestoreEmulator, getFirestore, collection, getDocs, query, where } from 'firebase/firestore';

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

if (__USE_AUTH_EMULATOR__) {
  connectAuthEmulator(auth, 'http://127.0.0.1:9099');
}
const isFirestoreEmulator = __USE_AUTH_EMULATOR__;
const firestoreDatabase = isFirestoreEmulator ? "(default)" : "travelingsalesman";
const db = getFirestore(app, firestoreDatabase);
if (__USE_AUTH_EMULATOR__) {
  connectFirestoreEmulator(db, "127.0.0.1", 8080);
}


const loadingEl = document.getElementById('loadingStatus');
const signedOutEl = document.getElementById('signedOutState');
const signedInEl = document.getElementById('signedInState');
const userInfoEl = document.getElementById('userInfo');
const profileAvatarEl = document.getElementById('profileAvatar');
const profileHeadingEl = document.getElementById('profileHeading');
const profileSubheadingEl = document.getElementById('profileSubheading');
const signOutBtn = document.getElementById('signOutBtn');
const profileLinkNav = document.getElementById('profileNavLink');
const stripeAccountCardEl = document.getElementById('stripeAccountCard');
const stripeAccountLoadingEl = document.getElementById('stripeAccountLoading');
const stripeAccountEmptyEl = document.getElementById('stripeAccountEmpty');
const stripeAccountsListEl = document.getElementById('stripeAccountsList');

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
  if (profileHeadingEl) {
    profileHeadingEl.textContent = user.displayName || user.email || 'Signed In User';
  }

  if (profileSubheadingEl) {
    profileSubheadingEl.textContent = user.email || 'No email on this account';
  }

  if (profileAvatarEl) {
    if (user.photoURL) {
      profileAvatarEl.innerHTML = `<img src="${user.photoURL}" alt="Profile photo" class="w-100 h-100 rounded-circle" style="object-fit:cover;">`;
    } else {
      const source = user.displayName || user.email || 'User';
      profileAvatarEl.textContent = source.charAt(0).toUpperCase();
    }
  }

  const rows = [
    ['Email', user.email || 'Not available'],
    ['Display Name', user.displayName || 'Not available'],
    ['Phone', user.phoneNumber || 'Not available'],
    ['Email Verified', user.emailVerified ? 'Yes' : 'No'],
    ['Anonymous', user.isAnonymous ? 'Yes' : 'No'],
  ];

  userInfoEl.innerHTML = rows
    .map(([label, value]) => `
      <tr>
        <th scope="row" class="text-nowrap" style="width: 36%;">${label}</th>
        <td>${value}</td>
      </tr>
    `)
    .join('');
}

const escapeHtml = (value) => {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
};

function setStripeCardState(state) {
  if (!stripeAccountCardEl || !stripeAccountLoadingEl || !stripeAccountEmptyEl || !stripeAccountsListEl) {
    return;
  }

  stripeAccountCardEl.style.display = 'block';
  stripeAccountLoadingEl.style.display = state === 'loading' ? 'block' : 'none';
  stripeAccountEmptyEl.style.display = state === 'empty' ? 'block' : 'none';
  stripeAccountsListEl.style.display = state === 'ready' ? 'flex' : 'none';
}

function renderStripeAccounts(accountDocs) {
  if (!stripeAccountsListEl) {
    return;
  }

  const toMillis = (value) => {
    if (!value) {
      return 0;
    }

    if (typeof value.toMillis === 'function') {
      return value.toMillis();
    }

    if (typeof value.toDate === 'function') {
      return value.toDate().getTime();
    }

    if (value instanceof Date) {
      return value.getTime();
    }

    if (typeof value === 'object' && Number.isFinite(value.seconds)) {
      const nanos = Number.isFinite(value.nanoseconds) ? value.nanoseconds : 0;
      return (value.seconds * 1000) + Math.floor(nanos / 1000000);
    }

    const parsed = Date.parse(value);
    return Number.isFinite(parsed) ? parsed : 0;
  };

  const sortedDocs = [...accountDocs].sort((a, b) => {
    const aData = a.data();
    const bData = b.data();
    const aTimestamp = toMillis(aData.createdAt) || toMillis(aData.updatedAt);
    const bTimestamp = toMillis(bData.createdAt) || toMillis(bData.updatedAt);

    if (aTimestamp !== bTimestamp) {
      return bTimestamp - aTimestamp;
    }

    return a.id.localeCompare(b.id);
  });

  stripeAccountsListEl.innerHTML = sortedDocs
    .map((accountDoc) => {
      const accountData = accountDoc.data();
      const accountId = escapeHtml(accountDoc.id || 'N/A');
      const companyName = escapeHtml(accountData.display_name || 'N/A');
      const email = escapeHtml(accountData.contact_email || 'N/A');
      const status = escapeHtml(accountData.status || 'N/A');

      return `
        <div class="col-12">
          <div class="card border-0 shadow-sm">
            <div class="card-body">
              <div class="table-responsive">
                <table class="table table-sm align-middle mb-0">
                  <tbody>
                    <tr>
                      <th scope="row" class="text-nowrap" style="width: 36%;">Account ID</th>
                      <td>${accountId}</td>
                    </tr>
                    <tr>
                      <th scope="row" class="text-nowrap">Company Name</th>
                      <td>${companyName}</td>
                    </tr>
                    <tr>
                      <th scope="row" class="text-nowrap">Email</th>
                      <td>${email}</td>
                    </tr>
                    <tr>
                      <th scope="row" class="text-nowrap">Status</th>
                      <td>${status}</td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        </div>
      `;
    })
    .join('');
}

async function loadStripeAccounts(userId) {
  setStripeCardState('loading');

  try {
    const stripeQuery = query(
      collection(db, 'stripeAccounts'),
      where('userId', '==', userId),
    );
    const snapshot = await getDocs(stripeQuery);

    if (snapshot.empty) {
      setStripeCardState('empty');
      return;
    }

    renderStripeAccounts(snapshot.docs);
    setStripeCardState('ready');
  } catch (error) {
    console.error('Error loading Stripe accounts:', error);
    if (stripeAccountEmptyEl) {
      stripeAccountEmptyEl.textContent = 'Unable to load Stripe account details right now.';
    }
    setStripeCardState('empty');
  }
}

function showSignedOutState() {
  loadingEl.style.display = 'none';
  signedInEl.style.display = 'none';
  signedOutEl.style.display = 'block';
  if (stripeAccountCardEl) {
    stripeAccountCardEl.style.display = 'none';
  }
}

function showSignedInState() {
  loadingEl.style.display = 'none';
  signedOutEl.style.display = 'none';
  signedInEl.style.display = 'block';
  if (profileLinkNav) {
    profileLinkNav.classList.add('active');
  }
}

function loadProfile(user) {
  renderUserInfo(user);
  loadStripeAccounts(user.uid);
}

onAuthStateChanged(auth, async (user) => {
  if (user && !user.isAnonymous) {
    showSignedInState();
    loadProfile(user);
  } else {
    showSignedOutState();
  }
});
