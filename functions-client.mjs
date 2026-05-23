import { getFunctions, httpsCallable } from "firebase/functions";
import { initializeApp } from 'firebase/app';

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
const functions = getFunctions(app);
let mAccountId;



// script.js
const args = process.argv.slice(2); // Skip the first two default elements
console.log('Passed arguments:', args);

const email = process.argv[2];
console.log('Email argument:', email);

const callConnectedAccount = httpsCallable(functions, 'createConnectedAccount');

const result1 =  await callConnectedAccount({ email: email });
mAccountId = result1.data.accountId;

const callAccountLink = httpsCallable(functions, 'createAccountLink');

callAccountLink({ accountId: mAccountId })
  .then((result) => {
    // Read result of the Cloud Function.
    /** @type {any} */
    const data = result.data;
    console.log(data);
  });