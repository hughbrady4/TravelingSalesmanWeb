// Import Firebase modules
import { initializeApp } from 'firebase/app';
import { 
  connectAuthEmulator,
  getAuth, 
  onAuthStateChanged, 
  signOut
} from 'firebase/auth';
import { 
  getFirestore
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
export const auth = getAuth(app);

if (__USE_AUTH_EMULATOR__) {
  connectAuthEmulator(auth, 'http://127.0.0.1:9099');
}

export const db = getFirestore(app, "travelingsalesman");
export const analytics = getAnalytics(app);
export const functions = getFunctions(app);

const GOOGLE_MAPS_API_KEY = 'AIzaSyBEE3PbSfTipC6WGZ3DMsGtWGU_LJVHYAc';

let mapsScriptPromise = null;
let businessAddressAutocomplete = null;
let selectedBusinessGeoLocation = null;

const loadGoogleMapsPlacesScript = () => {
  if (window.google?.maps?.places) {
    return Promise.resolve();
  }

  if (mapsScriptPromise) {
    return mapsScriptPromise;
  }

  mapsScriptPromise = new Promise((resolve, reject) => {
    const existingScript = document.querySelector('script[data-google-maps="places"]');
    if (existingScript) {
      existingScript.addEventListener('load', () => resolve(), { once: true });
      existingScript.addEventListener('error', () => reject(new Error('Failed to load Google Maps Places script.')), { once: true });
      return;
    }

    const script = document.createElement('script');
    script.src = `https://maps.googleapis.com/maps/api/js?key=${GOOGLE_MAPS_API_KEY}&libraries=places`;
    script.async = true;
    script.defer = true;
    script.dataset.googleMaps = 'places';
    script.onload = () => resolve();
    script.onerror = () => reject(new Error('Failed to load Google Maps Places script.'));
    document.head.appendChild(script);
  });

  return mapsScriptPromise;
};

const initializeBusinessAddressAutocomplete = async () => {
  const addressField = document.getElementById('businessAddress');
  const addressWidgetContainer = document.getElementById('businessAddressWidget');
  if (!addressField || !addressWidgetContainer) {
    return;
  }

  try {
    await loadGoogleMapsPlacesScript();
    await google.maps.importLibrary('places');

    businessAddressAutocomplete = new google.maps.places.PlaceAutocompleteElement();

    businessAddressAutocomplete.placeholder = 'Start typing your business address';
    businessAddressAutocomplete.style.width = '100%';
    businessAddressAutocomplete.setAttribute('aria-label', 'Business address');

    businessAddressAutocomplete.addEventListener('gmp-select', async ({ placePrediction }) => {
      const place = placePrediction.toPlace();
      await place.fetchFields({
        fields: ['displayName', 'formattedAddress', 'location']
      });

      addressField.value = place.formattedAddress ?? '';
      const lat = place.location?.lat?.();
      const lng = place.location?.lng?.();
      selectedBusinessGeoLocation = (typeof lat === 'number' && typeof lng === 'number')
        ? `${lat},${lng}`
        : null;
      addressField.setCustomValidity('');
    });

    addressWidgetContainer.replaceChildren(businessAddressAutocomplete);
  } catch (error) {
    console.error('Error initializing address autocomplete:', error);
    logCustomEvent('address_autocomplete_initialization_failed', {
      error: error.message
    });
  }
};

/**
 * Log a custom analytics event
 * @param {string} eventName - Name of the event
 * @param {object} eventParams - Event parameters
 */
const logCustomEvent = (eventName, eventParams = {}) => {
  try {
    logEvent(analytics, eventName, eventParams);
  } catch (error) {
    console.error('Error logging event:', error);
  }
};

/**
 * Show or hide progress spinner and message
 * @param {boolean} show - True to show, false to hide
 * @param {string} message - Message to display
 */
const showProgressSpinner = (show, message = '') => {
  const form = document.getElementById('getStartedForm');
  const loadingState = document.getElementById('loadingState');
  const loadingMessage = document.getElementById('loadingMessage');
  
  if (show) {
    form.style.display = 'none';
    loadingState.style.display = 'block';
    if (loadingMessage) loadingMessage.textContent = message;
  } else {
    form.style.display = 'block';
    loadingState.style.display = 'none';
  }
};

/**
 * Create a Stripe connected account
 * @param {string} companyName - Name of the company
 * @param {string} email - Contact email for the account
 * @returns {Promise} Object containing the account ID
 */
const createStripeConnectedAccount = async ({
  companyName,
  contactEmail,
  businessAddress,
  businessType,
  phoneNumber,
  userEmail,
  geoLocation
}) => {
  try {
    const createConnectedAccount = httpsCallable(functions, 'createConnectedAccount');
    const result = await createConnectedAccount({
      companyName,
      email: contactEmail,
      address: businessAddress,
      businessType: businessType || 'unknown',
      phoneNumber: phoneNumber || 'unknown',
      userEmail: userEmail || contactEmail,
      location: geoLocation || 'unknown'
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

/**
 * Handle form submission
 * @param {Event} event - Form submit event
 */
const handleFormSubmit = async (event) => {
  event.preventDefault();
  
  try {
    const currentUser = auth.currentUser;
    const form = document.getElementById('getStartedForm');
    const submitBtn = document.getElementById('submitBtn');
    
    // Validate form
    if (!form.checkValidity()) {
      event.stopPropagation();
    }
    form.classList.add('was-validated');

    if (!form.checkValidity()) {
      return;
    }

    // Get form values
    const companyName = document.getElementById('companyName').value.trim();
    const contactEmail = document.getElementById('contactEmail').value.trim();
    const businessAddressField = document.getElementById('businessAddress');
    const businessAddress = businessAddressField.value.trim() || businessAddressAutocomplete?.value?.trim?.() || '';
    const businessType = document.getElementById('businessType').value;
    const phoneNumber = document.getElementById('phoneNumber').value.trim();
    const userEmail = document.getElementById('userEmail')?.value?.trim?.() || '';

    if (!businessAddress) {
      businessAddressField.setCustomValidity('Please select a business address from the Google suggestions.');
      form.classList.add('was-validated');
      return;
    }

    businessAddressField.setCustomValidity('');

    if (!currentUser || currentUser.isAnonymous) {
      alert('You must be signed in to continue. Redirecting to sign in...');
      window.location.href = '/auth.html';
      return;
    }

    logCustomEvent('get_started_form_submitted', {
      action: 'onboarding_form_submitted',
      user_id: currentUser.uid,
      company_name: companyName,
      business_type: businessType
    });

    // Disable form and show loading state
    submitBtn.disabled = true;
    showProgressSpinner(true, 'Creating your Stripe account...');

    try {
      // Create Stripe connected account
      const stripeAccount = await createStripeConnectedAccount({
        companyName,
        contactEmail,
        businessAddress,
        businessType,
        phoneNumber,
        userEmail,
        geoLocation: selectedBusinessGeoLocation
      });
      console.log('Stripe account created:', stripeAccount.accountId);
      

      // Update message
      showProgressSpinner(true, 'Setting up account link...');
      
      // Create account link
      const stripeAccountLink = httpsCallable(functions, 'createAccountLink');
      const accountLinkResult = await stripeAccountLink({ accountId: stripeAccount.accountId });
      console.log('Stripe account link:', accountLinkResult.data.url);
      
      logCustomEvent('stripe_account_link_created', {
      });

      // Redirect to Stripe onboarding
      window.location.href = accountLinkResult.data.url;
    } catch (error) {
      console.error('Error creating Stripe account:', error);
      showProgressSpinner(false);
      
      // Re-enable button on error
      submitBtn.disabled = false;
      
      logCustomEvent('stripe_account_creation_error', {
        error: error.message
      });
      
      alert('Error creating Stripe account: ' + error.message + '\n\nPlease try again or contact support.');
    }
  } catch (error) {
    console.error('Error in handleFormSubmit:', error);
    showProgressSpinner(false);
    
    const submitBtn = document.getElementById('submitBtn');
    if (submitBtn) submitBtn.disabled = false;
    
    alert('An error occurred. Please try again.');
  }
};

/**
 * Initialize auth state and populate user email
 */
const initializeAuthState = () => {
  onAuthStateChanged(auth, (user) => {
    const signInLink = document.getElementById('signInLink');
    const signOutLink = document.getElementById('signOutLink');
    const userEmailInput = document.getElementById('userEmail');
    const contactEmailInput = document.getElementById('contactEmail');
    
    if (user && !user.isAnonymous) {
      // User is signed in
      logCustomEvent('page_view_authenticated', {
        page: 'getstarted',
      });

      // Populate hidden user email
      if (userEmailInput) userEmailInput.value = user.email;
      if (contactEmailInput) contactEmailInput.value = user.email;

      // Update navigation
      if (signInLink) {
        signInLink.classList.add('disabled');
      }

      if (signOutLink) {
        signOutLink.classList.remove('disabled');
      }
    } else {
      // User is not signed in
      window.localStorage.setItem('pendingGetStarted', 'true');
      window.location.href = '/auth.html';
    }
  });
};

/**
 * Attach event listeners
 */
const attachEventListeners = () => {
  // Form submission
  const form = document.getElementById('getStartedForm');
  if (form) {
    form.addEventListener('submit', handleFormSubmit);
  }

  // Sign out link
  const signOutLink = document.getElementById('signOutLink');
  if (signOutLink) {
    signOutLink.addEventListener('click', (event) => {
      event.preventDefault();
      signOut(auth).then(() => {
        window.location.href = '/auth.html';
      });
    });
  }

  // Sign in link
  const signInLink = document.getElementById('signInLink');
  if (signInLink) {
    signInLink.addEventListener('click', (event) => {
      event.preventDefault();
      window.location.href = '/auth.html';
    });
  }

  // Contact link
  const contactLink = document.getElementById('contactLink');
  if (contactLink) {
    contactLink.addEventListener('click', (event) => {
      event.preventDefault();
      window.location.href = '/contact.html';
    });
  }

  const businessAddressField = document.getElementById('businessAddress');
  if (businessAddressField) {
    // Clear custom validity once user changes input so browser can re-validate.
    businessAddressField.addEventListener('input', () => {
      businessAddressField.setCustomValidity('');
    });
  }
};

// Initialize when DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
  attachEventListeners();
  initializeAuthState();
  initializeBusinessAddressAutocomplete();
});

// Export functions for global access if needed
window.handleFormSubmit = handleFormSubmit;
