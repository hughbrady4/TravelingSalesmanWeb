import {initializeApp} from "firebase/app";
import {connectFunctionsEmulator, getFunctions, httpsCallable} from "firebase/functions";

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

// connectFunctionsEmulator(functions, "127.0.0.1", 5001);

try {
  const listConnectedAccounts = httpsCallable(functions, "listConnectedAccounts");
  const result = await listConnectedAccounts({
    appliedConfigurations: ["merchant"],
  });

  console.log(result.data);
} catch (error) {
  console.error("listConnectedAccounts failed:", error);
}