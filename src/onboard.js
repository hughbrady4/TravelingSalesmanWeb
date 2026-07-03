// Import Firebase modules
import { initializeApp } from 'firebase/app';
import { 
  connectAuthEmulator,
  getAuth, 
  onAuthStateChanged, 
  signInWithEmailAndPassword, 
  signOut
} from 'firebase/auth';
import { 
  getFirestore, 
  collection, 
  addDoc, 
  query, 
  where, 
  getDocs,
  doc,
  setDoc,
  getDoc,
  onSnapshot
} from 'firebase/firestore';
import { getAnalytics, logEvent } from 'firebase/analytics';
import { getFunctions, httpsCallable } from 'firebase/functions';

const firebaseConfig = {
    apiKey: "AIzaSyBacr58gJ0TMqP4gkV2TD1j--nslIIx3Gk",
    authDomain: "osweb-140a8.firebaseapp.com",
    projectId: "osweb-140a8",
    storageBucket: "osweb-140a8.firebasestorage.app",
    messagingSenderId: "939475367267",
    appId: "1:939475367267:web:ae83ef6f5b26ea525f4f56",
    measurementId: "G-GWDJ4TQSSY",
};


// Initialize Firebase
const app = initializeApp(firebaseConfig);

// Initialize Firebase Authentication and get a reference to the service
export const auth = getAuth(app);

if (__USE_AUTH_EMULATOR__) {
  connectAuthEmulator(auth, 'http://127.0.0.1:9099');
}

// Initialize Cloud Firestore and get a reference to the service
export const db = getFirestore(app, "travelingsalesman");

// Initialize Firebase Analytics and get a reference to the service
export const analytics = getAnalytics(app);

// Initialize Cloud Functions and get a reference to the service
export const functions = getFunctions(app);

// ===== AUTHENTICATION FUNCTIONS =====

/**
 * Sign out the current user
 * @returns {Promise} void
 */
export const signOutUser = async () => {
  try {
    await signOut(auth);
    logEvent(analytics, 'logout');
  } catch (error) {
    console.error('Error signing out:', error);
    throw error;
  }
};

/**
 * Monitor authentication state changes
 * Updates UI and logs analytics events accordingly
 */

onAuthStateChanged(auth, (user) => {
  if (user && !user.isAnonymous) {
    logEvent(analytics, 'user_logged_in');

    // Update UI for logged-in user
    const signInLink = document.getElementById('signInLink');
    if (signInLink) {
      signInLink.classList.add('disabled');
      signInLink.setAttribute('aria-disabled', 'true');
      signInLink.style.pointerEvents = 'none';
    }
    const signOutLink = document.getElementById('signOutLink');
    if (signOutLink) {
      signOutLink.classList.remove('disabled');
      signOutLink.removeAttribute('aria-disabled');
      signOutLink.style.pointerEvents = 'auto';
    }


    logCustomEvent('auth_state_changed', {
      user_logged_in: true,
      user_id: user.uid
    });

    // Listen for Stripe account data
    const stripeQuery = query(collection(db, 'stripeAccounts'), where('userId', '==', user.uid), where('status', '!=', 'archived'));
    const unsubscribe = onSnapshot(stripeQuery, (querySnapshot) => {
      if (!querySnapshot.empty) {
        // Stripe account exists
        const doc = querySnapshot.docs[0];
        const accountData = doc.data();
        console.log('Stripe account found:', accountData);
        
        // Hide CTA container, show Stripe account container
        const ctaContainer = document.getElementById('ctaContainer');
        const stripeAccountContainer = document.getElementById('stripeAccountContainer');
        
        if (ctaContainer) ctaContainer.style.display = 'none';
        if (stripeAccountContainer) {
          stripeAccountContainer.style.display = 'block';
          
          // Update account information in container
          const accountIdEl = document.getElementById('stripeAccountId');
          const companyNameEl = document.getElementById('stripeCompanyName');
          const emailEl = document.getElementById('stripeEmail');
          const statusEl = document.getElementById('stripeStatus');
          
          if (accountIdEl) accountIdEl.textContent = doc.id || 'N/A';
          if (companyNameEl) companyNameEl.textContent = accountData.companyName || 'N/A';
          if (emailEl) emailEl.textContent = accountData.email || 'N/A';
          if (statusEl) statusEl.textContent = accountData.status || 'N/A';
        }
      } else {
        // No Stripe account yet
        console.log('No Stripe account found');
        const ctaContainer = document.getElementById('ctaContainer');
        const stripeAccountContainer = document.getElementById('stripeAccountContainer');

        if (ctaContainer) ctaContainer.style.display = 'block';
        if (stripeAccountContainer) stripeAccountContainer.style.display = 'none';


        const pendingCTA = window.localStorage.getItem('pendingCTA');
        if (pendingCTA) {
          logCustomEvent('pending_cta_redirect', {
            user_id: user.uid
          });
          window.localStorage.removeItem('pendingCTA');
          // Redirect to onboarding page
          handleGetStarted(new Event('click'));
        }

      }
    });

    // Clean up listener when user signs out
    window.currentSnapshotUnsubscribe = unsubscribe;
  } else {
    logEvent(analytics, 'user_logged_out');


            const ctaContainer = document.getElementById('ctaContainer');
    if (ctaContainer) ctaContainer.style.display = 'block';

    // Update UI for logged-out user
    const signInLink = document.getElementById('signInLink');
    if (signInLink) {
      signInLink.classList.remove('disabled');
      signInLink.removeAttribute('aria-disabled');
      signInLink.style.pointerEvents = 'auto';
    }
    const signOutLink = document.getElementById('signOutLink');
    if (signOutLink) {
      signOutLink.classList.add('disabled');
      signOutLink.setAttribute('aria-disabled', 'true');
    signOutLink.style.pointerEvents = 'none';
    }



    logCustomEvent('auth_state_changed', {
      user_logged_in: false
    });

    // Hide Stripe account container when logged out
    const stripeAccountContainer = document.getElementById('stripeAccountContainer');
    if (stripeAccountContainer) stripeAccountContainer.style.display = 'none';

    // Unsubscribe from Stripe account listener
    if (window.currentSnapshotUnsubscribe) {
      window.currentSnapshotUnsubscribe();
    }
  }
});



// ===== FIRESTORE FUNCTIONS =====

/**
 * Create a new user profile in Firestore
 * @param {string} userId - User's ID
 * @param {object} userData - User data object
 * @returns {Promise} void
 */
export const createUserProfile = async (userId, userData) => {
  try {
    await setDoc(doc(db, 'users', userId), {
      ...userData,
      createdAt: new Date(),
      updatedAt: new Date()
    });
    logEvent(analytics, 'user_profile_created');
  } catch (error) {
    console.error('Error creating user profile:', error);
    throw error;
  }
};

/**
 * Get stripe account info from Firestore
 * @param {string} userId - User's ID
 * @returns {Promise} Stripe account data
 */
export const getStripeAccountInfo = async (userId) => {
  try {
    const q = query(collection(db, 'stripeAccounts'), where('userId', '==', userId), where('status', '!=', 'archived'));
    const querySnapshot = await getDocs(q);
    if (!querySnapshot.empty) {
      return querySnapshot.docs[0].data();
    } else {
      console.log('No stripe account found');
      return null;
    }
  } catch (error) {
    console.error('Error getting stripe account info:', error);
    throw error;
  }
};

/**
 * Add a new document to a Firestore collection
 * @param {string} collectionName - Name of the collection
 * @param {object} data - Data to add
 * @returns {Promise} Document reference
 */
export const addDocument = async (collectionName, data) => {
  try {
    const docRef = await addDoc(collection(db, collectionName), {
      ...data,
      createdAt: new Date(),
      updatedAt: new Date()
    });
    logEvent(analytics, 'document_added', {
      collection: collectionName
    });
    return docRef;
  } catch (error) {
    console.error('Error adding document:', error);
    throw error;
  }
};

/**
 * Query documents from Firestore
 * @param {string} collectionName - Name of the collection
 * @param {string} fieldPath - Field to query
 * @param {string} operator - Query operator (==, <, >, etc.)
 * @param {*} value - Value to compare
 * @returns {Promise} Array of documents
 */
export const queryDocuments = async (collectionName, fieldPath, operator, value) => {
  try {
    const q = query(collection(db, collectionName), where(fieldPath, operator, value));
    const querySnapshot = await getDocs(q);
    const documents = [];
    querySnapshot.forEach((doc) => {
      documents.push({
        id: doc.id,
        ...doc.data()
      });
    });
    logEvent(analytics, 'query_executed', {
      collection: collectionName
    });
    return documents;
  } catch (error) {
    console.error('Error querying documents:', error);
    throw error;
  }
};

// ===== CLOUD FUNCTIONS =====

/**
 * Create a Stripe connected account
 * @param {string} companyName - Name of the company
 * @param {string} email - Contact email for the account
 * @returns {Promise} Object containing the account ID
 */
export const createStripeConnectedAccount = async (companyName, email) => {
  try {
    const createConnectedAccount = httpsCallable(functions, 'createConnectedAccount');
    const result = await createConnectedAccount({
      companyName,
      email
    });
    logEvent(analytics, 'stripe_account_created', {
      companyName
    });
    gtag_report_conversion();
    return result.data;
  } catch (error) {
    console.error('Error creating connected account:', error);
    logEvent(analytics, 'stripe_account_creation_failed', {
      error: error.message
    });
    throw error;
  }
};


// ===== ANALYTICS FUNCTIONS =====

/**
 * Log a custom analytics event
 * @param {string} eventName - Name of the event
 * @param {object} eventParams - Event parameters
 */
export const logCustomEvent = (eventName, eventParams = {}) => {
  try {
    logEvent(analytics, eventName, eventParams);
  } catch (error) {
    console.error('Error logging event:', error);
  }
};

/**
 * Log a page view event
 * @param {string} pageName - Name of the page
 * @param {string} pageTitle - Title of the page
 */
export const logPageView = (pageName, pageTitle) => {
  try {
    logEvent(analytics, 'page_view', {
      page_name: pageName,
      page_title: pageTitle
    });
  } catch (error) {
    console.error('Error logging page view:', error);
  }
};

/**
 * Show or hide progress spinner and message
 * @param {boolean} show - True to show, false to hide
 * @param {string} message - Message to display
 */
const showProgressSpinner = (show, message = '') => {
  let spinner = document.getElementById('progressSpinner');
  if (!spinner) {
    // Create spinner element if it doesn't exist
    spinner = document.createElement('div');
    spinner.id = 'progressSpinner';
    spinner.className = 'position-fixed top-50 start-50 translate-middle text-center p-5 bg-white rounded shadow';
    spinner.style.zIndex = '9999';
    spinner.style.display = 'none';
    document.body.appendChild(spinner);
  }

  if (show) {
    spinner.innerHTML = `
      <div class="spinner-border text-primary mb-3" role="status">
        <span class="visually-hidden">Loading...</span>
      </div>
      <p class="text-dark fw-bold">${message}</p>
    `;
    spinner.style.display = 'block';
  } else {
    spinner.style.display = 'none';
  }
};

/**
 * Handle Get Started button click - Redirect to detailed form
 * @param {Event} event - Click event
 */
const handleGetStarted = async (event) => {
  event.preventDefault();
  try {
    const currentUser = auth.currentUser;
    
    if (currentUser && !currentUser.isAnonymous) {
      // User is signed in - redirect to Get Started form
      logCustomEvent('get_started_clicked', {
        action: 'onboarding_initiated',
        user_signed_in: true,
        user_id: currentUser.uid
      });
      console.log('User is signed in:', currentUser.email);
      
      // Redirect to the Get Started form page
      window.location.href = '/getstarted.html';
    } else {
      // User is not signed in
      logCustomEvent('get_started_clicked', {
        action: 'onboarding_initiated',
        user_signed_in: false
      });
      console.log('User is not signed in');
      window.localStorage.setItem('pendingCTA', true);
      // Redirect to sign-in page
      // window.location.assign('auth.html');
      signIn();
    }
  } catch (error) {
    console.error('Error in handleGetStarted:', error);
    
    // Re-enable button on error
    const getStartedBtn = document.getElementById('getStartedBtn');
    if (getStartedBtn) {
      getStartedBtn.disabled = false;
      getStartedBtn.textContent = 'Get Started with Onboarding';
    }
  }
};

const handleManageAccount =  async (event) => {

  showProgressSpinner(true, 'Setting up account link...');

  const accountIdEl = document.getElementById('stripeAccountId');
  const accountId = accountIdEl ? accountIdEl.textContent : null;

  if (accountId) {
    const stripeAccountLink = httpsCallable(functions, 'createAccountLink');
    const accountLinkResult = await stripeAccountLink({ accountId: accountId });
    console.log('Stripe account link:', accountLinkResult.data.url);
    logCustomEvent('stripe_account_link_created', {
      account_id: accountId
    });
    // Redirect to Stripe onboarding
    window.location.href = accountLinkResult.data.url;
  } else {
    alert('No Stripe account found. Please contact support.');
  }
}

const handleCreateProduct = (event) => {
  event.preventDefault();
  window.location.href = '/create-product.html';
};

const manageAccountBtn = document.getElementById('manageAccountBtn');
if (manageAccountBtn) {
  manageAccountBtn.addEventListener('click', handleManageAccount);
}

const createProductBtn = document.getElementById('createProductBtn');
if (createProductBtn) {
  createProductBtn.addEventListener('click', handleCreateProduct);
}

function signIn() {
      // Unsubscribe from Stripe account listener
    if (window.currentSnapshotUnsubscribe) {
      window.currentSnapshotUnsubscribe();
    }
    window.location.href = '/auth.html';
}


window.signOutUser = signOutUser;
window.signIn = signIn;
window.handleGetStarted = handleGetStarted;

// Attach handleGetStarted to Bootstrap button/link when page loads
const getStartedBtn = document.getElementById('getStartedBtn');
if (getStartedBtn) {
  getStartedBtn.addEventListener('click', handleGetStarted);
}
    
// Attach signIn to nav link
const signInLink = document.getElementById('signInLink');
if (signInLink) {
  signInLink.addEventListener('click', (event) => {
    event.preventDefault();
    signIn();
  });
}

const signOutLink = document.getElementById('signOutLink');
if (signOutLink) {
  signOutLink.addEventListener('click', (event) => {
    event.preventDefault();
        // Unsubscribe from Stripe account listener
    if (window.currentSnapshotUnsubscribe) {
      window.currentSnapshotUnsubscribe();
    }
    signOutUser();
  });
}

const contactLink = document.getElementById('contactLink');
if (contactLink) {
  contactLink.addEventListener('click', (event) => {
    event.preventDefault();
        // Unsubscribe from Stripe account listener
    if (window.currentSnapshotUnsubscribe) {
      window.currentSnapshotUnsubscribe();
    }
    window.location.href = '/contact.html';
  }
)};


export default app;
