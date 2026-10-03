import { connectAuthEmulator, getAuth, isSignInWithEmailLink, signInWithEmailLink, 
  sendSignInLinkToEmail, onAuthStateChanged, signOut as firebaseSignOut, linkWithCredential, EmailAuthProvider, 
  getAdditionalUserInfo, authStateReady  } from "firebase/auth";
import { initializeApp } from "firebase/app";
import { getAnalytics, logEvent } from "firebase/analytics";
import { OAuthProvider } from "firebase/auth/web-extension";


const firebaseConfig = {
  apiKey: "AIzaSyBacr58gJ0TMqP4gkV2TD1j--nslIIx3Gk",
  authDomain: "osweb-140a8.firebaseapp.com",
  projectId: "osweb-140a8",
  storageBucket: "osweb-140a8.firebasestorage.app",
  messagingSenderId: "939475367267",
  appId: "1:939475367267:web:ae83ef6f5b26ea525f4f56",
  measurementId: "G-GWDJ4TQSSY"
};


const app = initializeApp(firebaseConfig);
const auth = getAuth(app);

if (__USE_AUTH_EMULATOR__) {
  connectAuthEmulator(auth, 'http://127.0.0.1:9099');
}

const analytics = getAnalytics(app);

function logAuthEvent(eventName, eventParams = {}) {
  try {
    logEvent(analytics, eventName, eventParams);
  } catch (error) {
    console.error('Analytics event failed:', eventName, error);
  }
}


// Get button reference
const signOutBtn = document.getElementById('btn-signout');
const signinContainer = document.getElementById('signinContainer');
const successContainer = document.getElementById('successContainer');
const congratsContainer = document.getElementById('congratsContainer');
signOutBtn.addEventListener('click', signOut);

// Variable to store the countdown interval
let countdownInterval = null;

function clearCountdown() {
  if (countdownInterval) {
    clearInterval(countdownInterval);
    countdownInterval = null;
  }
}

const handleAuthUIChange = (user) => {
  if (user && !user.isAnonymous) {
    // User is signed in, see docs for a list of available properties
    // https://firebase.google.com/docs/reference/js/firebase.User
    const uid = user.uid;
    console.log('User is signed in:', user);
    // Enable the sign out button
    signOutBtn.disabled = false;
    // Hide the sign-in form and success container
    signinContainer.style.display = 'none';
    successContainer.style.display = 'none';
    // Show congratulations container and start countdown
    congratsContainer.style.display = 'block';
    startCountdown();
  } else {
    // User is signed out
    console.log('User is signed out');
    // Disable the sign out button
    signOutBtn.disabled = true;
    // Show the sign-in form
    signinContainer.style.display = 'block';
    // Hide congratulations container
    congratsContainer.style.display = 'none';
    // Clear any active countdown
    clearCountdown();
  }
};

onAuthStateChanged(auth, (user) => {
  handleAuthUIChange(user);
  // chack if the URL contains a sign-in link and handle it
  if (!user || user.isAnonymous) {
    handleEmailLinkSignIn();
  }
});

function startCountdown() {
  let timeLeft = 5; // 5 seconds countdown
  const countdownElement = document.getElementById('countdownTimer');

  // Update countdown immediately
  countdownElement.textContent = timeLeft;

  // Cancel the redirect if the user interacts with the page.
  const stopCountdownOnPageClick = () => {
    clearCountdown();
    countdownElement.textContent = 'stopped';
  };

  document.addEventListener('click', stopCountdownOnPageClick, { once: true });

  // Clear any existing interval
  clearCountdown();

  countdownInterval = setInterval(() => {
    timeLeft--;
    countdownElement.textContent = timeLeft;

    if (timeLeft <= 0) {
      clearCountdown();
      // Redirect to home page
      window.location.href = '/';
    }
  }, 1000);
}

function handleEmailLinkSignIn() {
  if (isSignInWithEmailLink(auth, window.location.href)) {
    // Additional state parameters can also be passed via URL.
    // This can be used to continue the user's intended action before triggering
    // the sign-in operation.
    // Get the email if available. This should be available if the user completes
    // the flow on the same device where they started it.
    
    let email = window.localStorage.getItem('emailForSignIn');
    if (!email) {
      // User opened the link on a different device. To prevent session fixation
      // attacks, ask the user to provide the associated email again. For example:
      email = window.prompt('Please provide your email for confirmation');
    }

    // Get reference to the currently signed-in user
    const prevUser = auth.currentUser;

    signInWithEmailLink(auth, email, window.location.href)
      .then((result) => {
        console.log('Sign-in result:', result);
        // You can access the new user by importing getAdditionalUserInfo
        const additionalUserInfo = getAdditionalUserInfo(result);
        // You can check if the user is new or existing:
        const isNewUser = additionalUserInfo?.isNewUser;
        console.log('Is new user:', isNewUser);
        if (isNewUser) {
          return linkWithCredential(prevUser, OAuthProvider.credentialFromResult(result))
          .then((usercred) => {
            const user = usercred.user;
            console.log('Successfully linked', user);
          });
        } else {
          console.log('User is not new, no linking required');
        }
        
      }).catch((error) => {
        const errorCode = error.code;
        const errorMessage = error.message;
        logAuthEvent('auth_handle_link_signin_failed', {
          error_code: errorCode,
          error_message: errorMessage
        });
        console.error('Error during email link sign-in:', error);
        showToast('Error', errorMessage || 'Failed to sign-in with link');

      });
  }
}


const form = document.getElementById('formEmailSignin');

form.addEventListener('submit', (event) => {
  // 1. Prevent the browser from reloading the page
  event.preventDefault();

  // 2. Extract data easily using FormData
  const formData = new FormData(event.target);
  const data = Object.fromEntries(formData.entries());

  console.log('Form Data:', data);

  const email = formData.get('email');

  // Log the form submission attempt
  logAuthEvent('auth_signin_form_submitted', {
    email: email || 'missing_email'
  });

  // Check if email is missing or empty
  if (!email || email.trim() === '') {
    showToast('Validation Error', 'Please enter an email address');
    return;
  }

  const actionCodeSettings = {
  // URL you want to redirect back to. The domain (www.example.com) for this
  // URL must be in the authorized domains list in the Firebase Console.
  url: `${window.location.origin}/auth`,
  // This must be true.
  handleCodeInApp: true,
  //   iOS: {
  //     bundleId: 'com.example.ios'
  //   },
  //   android: {
  //     packageName: 'com.example.android',
  //     installApp: true,
  //     minimumVersion: '12'
  //   },
  // The domain must be configured in Firebase Hosting and owned by the project.
  //   linkDomain: 'custom-domain.com'
  };

  logAuthEvent('auth_send_sign_in_link_requested', {
    email,
  });

  sendSignInLinkToEmail(auth, email, actionCodeSettings)
  .then(() => {
      // The link was successfully sent. Inform the user.
      // Save the email locally so you don't need to ask the user for it again
      // if they open the link on the same device.
      window.localStorage.setItem('emailForSignIn', email);
      logAuthEvent('auth_send_sign_in_link_success', {
        email
      });
      
      // Hide the sign-in form and show success message
      signinContainer.style.display = 'none';
      successContainer.style.display = 'block';
      
      // Display the email in the success message
      document.getElementById('successEmail').textContent = email;
      

  })
  .catch((error) => {
      const errorCode = error.code;
      const errorMessage = error.message;
      logAuthEvent('auth_send_sign_in_link_failed', {
        email,
        error_code: errorCode,
        error_message: errorMessage
      });
      showToast('Error', errorMessage || 'Failed to send sign-in link');
  });

});

// Function to show a Bootstrap toast message
function showToast(title, message) {
  const toastTitleEl = document.getElementById('toastTitle');
  const toastBodyEl = document.getElementById('toastBody');
  const toastEl = document.getElementById('appToast');
  
  // Set the toast content
  toastTitleEl.textContent = title;
  toastBodyEl.textContent = message;
  
  // Create and show the toast
  const toast = new bootstrap.Toast(toastEl);
  toast.show();
}

// Function to sign out the user
function signOut() {
  firebaseSignOut(auth)
    .then(() => {
      // Sign-out successful
      console.log('User signed out successfully');
      showToast('Success', 'You have been signed out');
      // Redirect to home page after sign out
      // window.location.href = '/';
    })
    .catch((error) => {
      // An error happened
      console.error('Sign out error:', error);
      showToast('Error', 'Failed to sign out');
    });
}


