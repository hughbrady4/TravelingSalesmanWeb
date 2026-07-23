import { initializeApp } from 'firebase/app';
import { connectAuthEmulator, getAuth, onAuthStateChanged } from 'firebase/auth';
import { connectFirestoreEmulator, getFirestore, collection, doc, getDocs, query, serverTimestamp, setDoc, where } from 'firebase/firestore';
import { connectFunctionsEmulator, getFunctions, httpsCallable } from 'firebase/functions';
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
const isFirestoreEmulator = __USE_AUTH_EMULATOR__;
const firestoreDatabase = isFirestoreEmulator ? "(default)" : "travelingsalesman";
const db = getFirestore(app, firestoreDatabase);
if (__USE_AUTH_EMULATOR__) {
  connectFirestoreEmulator(db, "127.0.0.1", 8080);
}

const functions = getFunctions(app);
if (__USE_AUTH_EMULATOR__) {
  connectFunctionsEmulator(functions, '127.0.0.1', 5001);
}

const loadingEl = document.getElementById('merchantLoading');
const signedOutEl = document.getElementById('signedOutState');
const signedInEl = document.getElementById('signedInState');
const merchantHeadingEl = document.getElementById('merchantHeading');
const merchantSubheadingEl = document.getElementById('merchantSubheading');
const accountsListEl = document.getElementById('accountsList');
const accountsEmptyEl = document.getElementById('accountsEmpty');
const accountsSummaryEl = document.getElementById('accountsSummary');
const pricesListEl = document.getElementById('pricesList');
const pricesEmptyEl = document.getElementById('pricesEmpty');
const pricesSummaryEl = document.getElementById('pricesSummary');
let currentSignedInUser = null;

const escapeHtml = (value) => String(value)
  .replace(/&/g, '&amp;')
  .replace(/</g, '&lt;')
  .replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;')
  .replace(/'/g, '&#39;');

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

const formatDate = (value) => {
  const millis = toMillis(value);
  if (!millis) {
    return 'Not available';
  }

  return new Intl.DateTimeFormat('en-US', {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(new Date(millis));
};

const formatPrice = (price) => {
  const unitAmount = Number.isFinite(price?.unit_amount) ? price.unit_amount : null;
  const currency = (price?.currency || 'usd').toUpperCase();

  if (unitAmount === null) {
    return currency;
  }

  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: (price?.currency || 'usd').toUpperCase(),
  }).format(unitAmount / 100);
};

const setLoadingState = (isLoading) => {
  if (loadingEl) {
    loadingEl.style.display = isLoading ? 'block' : 'none';
  }
};

const setSignedOutState = () => {
  setLoadingState(false);
  if (signedInEl) {
    signedInEl.style.display = 'none';
  }
  if (signedOutEl) {
    signedOutEl.style.display = 'block';
  }
};

const setSignedInState = () => {
  setLoadingState(false);
  if (signedOutEl) {
    signedOutEl.style.display = 'none';
  }
  if (signedInEl) {
    signedInEl.style.display = 'block';
  }
};

const setSectionState = (section, state) => {
  const loadingMap = {
    accounts: document.getElementById('accountsLoading'),
    prices: document.getElementById('pricesLoading'),
  };

  const emptyMap = {
    accounts: accountsEmptyEl,
    prices: pricesEmptyEl,
  };

  const listMap = {
    accounts: accountsListEl,
    prices: pricesListEl,
  };

  const loadingElForSection = loadingMap[section];
  const emptyElForSection = emptyMap[section];
  const listElForSection = listMap[section];

  if (loadingElForSection) {
    loadingElForSection.style.display = state === 'loading' ? 'block' : 'none';
  }

  if (emptyElForSection) {
    emptyElForSection.style.display = state === 'empty' ? 'block' : 'none';
  }

  if (listElForSection) {
    listElForSection.style.display = state === 'ready' ? 'block' : 'none';
  }
};

const loadStripeAccounts = async (userId) => {
  const stripeQuery = query(
    collection(db, 'stripeAccounts'),
    where('userId', '==', userId),
  );

  const snapshot = await getDocs(stripeQuery);

  return snapshot.docs
    .map((docSnapshot) => {
      const data = docSnapshot.data();
      return {
        id: docSnapshot.id,
        companyName: data.display_name || '',
        email: data.contact_email || '',
        status: data.status || 'unknown',
        createdAt: data.created,
        updatedAt: data.updated,
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

const loadStripeCatalogFromFirestore = async (accountId) => {
  const productsQuery = query(
    collection(db, 'products'),
    where('accountId', '==', accountId),
  );

  const pricesQuery = query(
    collection(db, 'prices'),
  );

  const [productsSnapshot, pricesSnapshot] = await Promise.all([
    getDocs(productsQuery),
    getDocs(pricesQuery),
  ]);

  const products = productsSnapshot.docs.map((doc) => ({
    id: doc.id,
    ...doc.data(),
  }));

  const prices = pricesSnapshot.docs
    .map((doc) => ({
      id: doc.id,
      ...doc.data(),
    }))
    .filter((price) => products.some((product) => product.id === price.product));

  return {
    products,
    prices,
  };
};

const renderAccounts = (accounts) => {
  if (!accountsListEl) {
    return;
  }

  if (accountsSummaryEl) {
    accountsSummaryEl.textContent = `${accounts.length} Stripe account${accounts.length === 1 ? '' : 's'}`;
  }

  if (accounts.length === 0) {
    setSectionState('accounts', 'empty');
    accountsListEl.innerHTML = '';
    return;
  }

  accountsListEl.innerHTML = accounts.map((account) => `
    <div class="col-12">
      <div class="card border-0 shadow-sm h-100">
        <div class="card-body">
          <div class="d-flex justify-content-between gap-2 mb-2">
            <h3 class="h6 mb-0">${escapeHtml(account.companyName || 'Unknown company')}</h3>
            <span class="badge text-bg-${account.status === 'active' ? 'success' : 'secondary'}">${escapeHtml(account.status)}</span>
          </div>
          <div class="small text-body-secondary mb-1">Account ID: ${escapeHtml(account.id)}</div>
          <div class="small text-body-secondary mb-1">Email: ${escapeHtml(account.email || 'Not available')}</div>
          <div class="small text-body-secondary">Created: ${escapeHtml(formatDate(account.createdAt))}</div>
        </div>
      </div>
    </div>
  `).join('');

  setSectionState('accounts', 'ready');
};

const renderPrices = (catalogs) => {
  if (!pricesListEl) {
    return;
  }

  const totalPrices = catalogs.reduce((count, catalog) => count + catalog.prices.length, 0);
  if (pricesSummaryEl) {
    pricesSummaryEl.textContent = `${totalPrices} active price${totalPrices === 1 ? '' : 's'}`;
  }

  if (catalogs.length === 0) {
    setSectionState('prices', 'empty');
    pricesListEl.innerHTML = '';
    return;
  }

  pricesListEl.innerHTML = catalogs.map((catalog) => {
    const productById = new Map(catalog.products.map((product) => [product.id, product]));
    const sortedPrices = [...catalog.prices].sort((a, b) => {
      const aTimestamp = toMillis(a.created);
      const bTimestamp = toMillis(b.created);

      if (aTimestamp !== bTimestamp) {
        return bTimestamp - aTimestamp;
      }

      return a.id.localeCompare(b.id);
    });

    const priceRows = sortedPrices.map((price) => {
      const product = productById.get(price.product) || {};
      const recurringLabel = price.recurring?.interval ? `Recurring ${escapeHtml(price.recurring.interval)}` : 'One-time';
      const billingMode = price.recurring?.interval ? 'Subscription' : 'Payment';

      return `
        <tr>
          <td>
            <div class="fw-semibold">${escapeHtml(product.name || 'Unknown product')}</div>
            <div class="small text-body-secondary">${escapeHtml(product.description || 'No description provided')}</div>
          </td>
          <td class="text-nowrap">${escapeHtml(formatPrice(price))}</td>
          <td>${escapeHtml(billingMode)}</td>
          <td>${escapeHtml(recurringLabel)}</td>
          <td class="text-nowrap">
            <button
              type="button"
              class="btn btn-sm btn-outline-secondary toggle-product-status-btn"
              data-price-id="${escapeHtml(price.id)}"
              data-product-id="${escapeHtml(product.id)}"
              data-account-id="${escapeHtml(catalog.account.id)}"

            >
              Payment Link
            </button>
          </td>
        </tr>
      `;
    }).join('');

    return `
      <div class="col-12">
        <div class="card border-0 shadow-sm h-100">
          <div class="card-body">
            <div class="mb-3">
              <h3 class="h6 mb-1">${escapeHtml(catalog.account.companyName || 'Unknown company')}</h3>
              <div class="small text-body-secondary">${escapeHtml(catalog.account.id)} · ${catalog.products.length} product${catalog.products.length === 1 ? '' : 's'}</div>
            </div>
            <div class="table-responsive">
              <table class="table table-sm align-middle mb-0">
                <thead>
                  <tr>
                    <th>Product</th>
                    <th>Price</th>
                    <th>Mode</th>
                    <th>Interval</th>
                    <th>Status</th>
                    <th></th>
                  </tr>
                </thead>
                <tbody>
                  ${priceRows || '<tr><td colspan="6" class="text-body-secondary">No active prices found for this account.</td></tr>'}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      </div>
    `;
  }).join('');

  setSectionState('prices', 'ready');
};

const generatePaymentLink = async (accountId, productId, priceId, buttonEl) => {
  if (!priceId || !currentSignedInUser) {
    return;
  }

  const relatedPrices = [{ id: priceId, quantity: 1 }];
  const paymentLinkCallable = httpsCallable(functions, 'getPaymentLink');
  const paymentLinkResult = await paymentLinkCallable({ accountId, productId, prices: relatedPrices });
  const productLinkUrl = paymentLinkResult.data?.paymentLink?.url || null;
  
  const previousText = buttonEl?.textContent || 'Updating...';

  if (buttonEl) {
    buttonEl.disabled = true;
    buttonEl.textContent = 'Updating...';
  }

  try {
    await setDoc(
      doc(db, 'prices', priceId),
      {
        url: productLinkUrl,
        updatedAt: serverTimestamp(),
      },
      { merge: true },
    );

    await loadMerchantDetails(currentSignedInUser);
  } catch (error) {
    console.error('Error updating price status:', error);
    alert(error.message || 'Unable to update price status right now.');

    if (buttonEl) {
      buttonEl.disabled = false;
      buttonEl.textContent = previousText;
    }
  }
};

const loadMerchantDetails = async (user) => {
  setLoadingState(true);

  try {
    const accounts = await loadStripeAccounts(user.uid);

    if (merchantHeadingEl) {
      merchantHeadingEl.textContent = user.displayName || user.email || 'Merchant details';
    }

    if (merchantSubheadingEl) {
      merchantSubheadingEl.textContent = user.email || 'Review connected Stripe accounts and product pricing';
    }

    renderAccounts(accounts);

    if (accounts.length === 0) {
      setSectionState('prices', 'empty');
      if (pricesSummaryEl) {
        pricesSummaryEl.textContent = '0 active prices';
      }
      return;
    }

    setSectionState('prices', 'loading');

    const catalogResults = await Promise.allSettled(
      accounts.map(async (account) => {
        const catalog = await loadStripeCatalogFromFirestore(account.id);
        return { account, ...catalog };
      }),
    );

    const catalogs = catalogResults.map((result, index) => {
      const account = accounts[index];
      if (result.status === 'fulfilled') {
        return result.value;
      }

      console.error(`Error loading Stripe catalog for account ${account.id}:`, result.reason);
      return {
        account,
        products: [],
        prices: [],
      };
    });

    renderPrices(catalogs);
  } catch (error) {
    console.error('Error loading merchant details:', error);
    if (accountsEmptyEl) {
      accountsEmptyEl.textContent = 'Unable to load Stripe account details right now.';
    }
    if (pricesEmptyEl) {
      pricesEmptyEl.textContent = 'Unable to load Stripe prices right now.';
    }
    setSectionState('accounts', 'empty');
    setSectionState('prices', 'empty');
  } finally {
    setLoadingState(false);
  }
};

if (pricesListEl) {
  pricesListEl.addEventListener('click', (event) => {
    const statusButtonEl = event.target.closest('.toggle-product-status-btn');
    if (statusButtonEl) {
      event.preventDefault();
      generatePaymentLink(
        statusButtonEl.dataset.accountId,
        statusButtonEl.dataset.productId,
        statusButtonEl.dataset.priceId,
        statusButtonEl,
      );
      return;
    }

    return;
  });
}

onAuthStateChanged(auth, async (user) => {
  if (user && !user.isAnonymous) {
    currentSignedInUser = user;
    setSignedInState();
    await loadMerchantDetails(user);
  } else {
    currentSignedInUser = null;
    setSignedOutState();
  }
});
