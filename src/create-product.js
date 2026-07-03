import { initializeApp } from 'firebase/app';
import { connectAuthEmulator, getAuth, onAuthStateChanged } from 'firebase/auth';
import { getFirestore, collection, getDocs, query, where } from 'firebase/firestore';
import { getFunctions, httpsCallable } from 'firebase/functions';

const firebaseConfig = {
  apiKey: 'AIzaSyBacr58gJ0TMqP4gkV2TD1j--nslIIx3Gk',
  authDomain: 'osweb-140a8.firebaseapp.com',
  projectId: 'osweb-140a8',
  storageBucket: 'osweb-140a8.firebasestorage.app',
  messagingSenderId: '939475367267',
  appId: '1:939475367267:web:ae83ef6f5b26ea525f4f56',
  measurementId: 'G-GWDJ4TQSSY',
};

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);

if (__USE_AUTH_EMULATOR__) {
  connectAuthEmulator(auth, 'http://127.0.0.1:9099');
}

const db = getFirestore(app, 'travelingsalesman');
const functions = getFunctions(app);

const statusEl = document.getElementById('productStatus');
const formEl = document.getElementById('createProductForm');
const accountIdEl = document.getElementById('accountId');
const selectedCompanyNameEl = document.getElementById('selectedCompanyName');
const nameEl = document.getElementById('productName');
const descriptionEl = document.getElementById('productDescription');
const priceEl = document.getElementById('productPrice');
const currencyEl = document.getElementById('productCurrency');
const isRecurringEl = document.getElementById('isRecurring');
const recurringIntervalEl = document.getElementById('recurringInterval');
const submitBtn = document.getElementById('submitBtn');

let stripeAccountId = '';
let selectedCompanyName = '';
let stripeAccounts = [];

const setStatus = (message, level = 'info') => {
  if (!statusEl) {
    return;
  }
  statusEl.className = `alert alert-${level} mb-4`;
  statusEl.textContent = message;
};

const setFormEnabled = (enabled) => {
  if (!formEl || !submitBtn) {
    return;
  }

  const fields = formEl.querySelectorAll('input, textarea, select, button');
  fields.forEach((field) => {
    field.disabled = !enabled;
  });

  if (accountIdEl) {
    accountIdEl.disabled = !enabled;
  }

  if (recurringIntervalEl && isRecurringEl) {
    recurringIntervalEl.disabled = !enabled || !isRecurringEl.checked;
  }
};

const syncRecurringIntervalField = () => {
  if (!isRecurringEl || !recurringIntervalEl) {
    return;
  }

  recurringIntervalEl.disabled = !isRecurringEl.checked;
};

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

const setSelectedCompanyLabel = (companyName) => {
  if (!selectedCompanyNameEl) {
    return;
  }

  selectedCompanyNameEl.textContent = `Selected company: ${companyName || 'N/A'}`;
};

const applySelectedAccount = (accountId) => {
  const selectedAccount = stripeAccounts.find((account) => account.id === accountId);
  stripeAccountId = selectedAccount?.id || '';
  selectedCompanyName = selectedAccount?.companyName || '';

  if (accountIdEl) {
    accountIdEl.value = stripeAccountId;
  }

  setSelectedCompanyLabel(selectedCompanyName);
};

const renderStripeAccountOptions = (accounts) => {
  if (!accountIdEl) {
    return;
  }

  accountIdEl.innerHTML = '';

  if (accounts.length === 0) {
    const emptyOptionEl = document.createElement('option');
    emptyOptionEl.value = '';
    emptyOptionEl.textContent = 'No Stripe accounts available';
    accountIdEl.appendChild(emptyOptionEl);
    return;
  }

  for (const account of accounts) {
    const optionEl = document.createElement('option');
    optionEl.value = account.id;
    optionEl.textContent = `${account.companyName || 'Unknown company'} (${account.id})`;
    accountIdEl.appendChild(optionEl);
  }
};

const loadStripeAccounts = async (userId) => {
  const stripeQuery = query(
    collection(db, 'stripeAccounts'),
    where('userId', '==', userId),
    where('status', '!=', 'archived'),
  );

  const snapshot = await getDocs(stripeQuery);
  if (snapshot.empty) {
    return [];
  }

  return snapshot.docs
    .map((docSnapshot) => {
      const data = docSnapshot.data();
      return {
        id: docSnapshot.id,
        companyName: data.companyName || '',
        createdAt: data.createdAt,
        updatedAt: data.updatedAt,
      };
    })
    .sort((a, b) => {
      const aTimestamp = toMillis(a.createdAt) || toMillis(a.updatedAt);
      const bTimestamp = toMillis(b.createdAt) || toMillis(b.updatedAt);

      if (aTimestamp !== bTimestamp) {
        return bTimestamp - aTimestamp;
      }

      return a.id.localeCompare(b.id);
    });
};

const createStripeProduct = async (event) => {
  event.preventDefault();

  if (!stripeAccountId) {
    setStatus('No Stripe account found. Complete onboarding first.', 'warning');
    return;
  }

  const productName = nameEl?.value.trim() || '';
  const productDescription = descriptionEl?.value.trim() || '';
  const currency = (currencyEl?.value.trim() || 'usd').toLowerCase();
  const priceDollars = Number(priceEl?.value || 0);
  const isRecurring = !!isRecurringEl?.checked;
  const recurringInterval = recurringIntervalEl?.value || 'month';

  if (!productName || !productDescription || !Number.isFinite(priceDollars) || priceDollars <= 0) {
    setStatus('Please enter a valid product name, description, and positive price.', 'warning');
    return;
  }

  setFormEnabled(false);
  setStatus('Creating product...', 'info');

  try {
    const createProductCallable = httpsCallable(functions, 'createProduct');
    const result = await createProductCallable({
      accountId: stripeAccountId,
      name: productName,
      description: productDescription,
      price: priceDollars,
      currency,
      recurring: isRecurring,
      recurringInterval,
    });

    const productId = result?.data?.productId || 'unknown';
    const priceId = result?.data?.priceId || 'unknown';
    const companySuffix = selectedCompanyName ? ` for ${selectedCompanyName}` : '';
    setStatus(`Product created successfully${companySuffix}. Product ID: ${productId}, Price ID: ${priceId}`, 'success');

    if (formEl) {
      formEl.reset();
      if (currencyEl) {
        currencyEl.value = 'usd';
      }
      if (isRecurringEl) {
        isRecurringEl.checked = false;
      }
      if (recurringIntervalEl) {
        recurringIntervalEl.value = 'month';
      }
      syncRecurringIntervalField();
      applySelectedAccount(stripeAccountId);
    }
  } catch (error) {
    console.error('Error creating Stripe product:', error);
    setStatus(`Error creating product: ${error.message || 'Unknown error'}`, 'danger');
  } finally {
    setFormEnabled(true);
  }
};

onAuthStateChanged(auth, async (user) => {
  if (!user || user.isAnonymous) {
    setStatus('Please sign in to create a Stripe product.', 'warning');
    setFormEnabled(false);
    return;
  }

  try {
    setStatus('Loading account details...', 'info');
    stripeAccounts = await loadStripeAccounts(user.uid);

    if (stripeAccounts.length === 0) {
      setStatus('No Stripe account found. Please finish onboarding before creating products.', 'warning');
      setFormEnabled(false);
      return;
    }

    renderStripeAccountOptions(stripeAccounts);
    applySelectedAccount(stripeAccounts[0].id);

    setStatus('Stripe accounts loaded. Select an account and complete the form to create a product.', 'success');
    setFormEnabled(true);
  } catch (error) {
    console.error('Error loading Stripe account:', error);
    setStatus('Unable to load Stripe account details. Please try again.', 'danger');
    setFormEnabled(false);
  }
});

if (accountIdEl) {
  accountIdEl.addEventListener('change', () => {
    applySelectedAccount(accountIdEl.value);
  });
}

if (isRecurringEl) {
  isRecurringEl.addEventListener('change', syncRecurringIntervalField);
  syncRecurringIntervalField();
}

if (formEl) {
  formEl.addEventListener('submit', createStripeProduct);
}
