import { getAuth, sendSignInLinkToEmail } from "firebase/auth";
import { initializeApp } from "firebase/app";

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

const form = document.getElementById('formEmailSignin');

form.addEventListener('submit', (event) => {
  // 1. Prevent the browser from reloading the page
  event.preventDefault();

  // 2. Extract data easily using FormData
  const formData = new FormData(event.target);
  const data = Object.fromEntries(formData.entries());

  console.log('Form Data:', data);

  const actionCodeSettings = {
  // URL you want to redirect back to. The domain (www.example.com) for this
  // URL must be in the authorized domains list in the Firebase Console.
  url: 'https://travelingsalesman.web.app',
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

  const email = formData.get('email');

  sendSignInLinkToEmail(auth, email, actionCodeSettings)
  .then(() => {
      // The link was successfully sent. Inform the user.
      // Save the email locally so you don't need to ask the user for it again
      // if they open the link on the same device.
      window.localStorage.setItem('emailForSignIn', email);
      // ...
  })
  .catch((error) => {
      const errorCode = error.code;
      const errorMessage = error.message;
      // ...
  });

});