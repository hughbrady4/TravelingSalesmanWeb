import { initializeApp } from "firebase/app";
import { getMessaging, onBackgroundMessage } from "firebase/messaging/sw";

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
const messaging = getMessaging(app);

onBackgroundMessage(messaging, (payload) => {
  console.log('[firebase-messaging-sw.js] Received background message', payload);

  const notificationTitle = payload.data?.title || 'Background Message Title';
  const notificationOptions = {
    body: payload.data?.body || 'Background Message body.',
    icon: payload.data?.icon || '/firebase-logo.png'
  };

  self.registration.showNotification(notificationTitle, notificationOptions);
});
