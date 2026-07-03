import { initializeApp } from "firebase/app";
import { connectAuthEmulator, getAuth, onAuthStateChanged, signInAnonymously } from "firebase/auth";
import {
  getFirestore,
  serverTimestamp,
  collection,
  addDoc,
  query,
  orderBy,
  where,
  onSnapshot,
  doc,
  setDoc,
  getDocs,
} from "firebase/firestore";
import { getMessaging, onRegistered, register, onMessage} from "firebase/messaging";

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

const firestore = getFirestore(app, "travelingsalesman");
const SESSION_STORAGE_KEY = "contactChatSessionId";

let currentUserUid = null;
let authReadyResolve;
let authReadyResolved = false;
const authReady = new Promise((resolve) => {
  authReadyResolve = resolve;
});



let sessionId = null;
let sessionReadyResolve;
let sessionReadyResolved = false;
const sessionReady = new Promise((resolve) => {
  sessionReadyResolve = resolve;
});



let cachedNotificationToken = null;
const chatMessagesCollection = collection(firestore, "contactMessages");
const chatSessionsCollection = collection(firestore, "chatSessions");
const adminsCollection = collection(firestore, "admins");
const messaging = getMessaging(app);


onAuthStateChanged(auth, (user) => {
  if (user) {

    if (user.isAnonymous) {
      console.log("User is signed in anonymously.");
    } else {
      console.log("User is signed in.");
    }
    currentUserUid = user.uid;
    findOpenChatSessionId().then((sessionId) => {
      if (sessionId) {
        if (!sessionReadyResolved) {
              sessionReadyResolved = true;
              sessionReadyResolve();
        }
        initializeChatListener();
        
        console.log("Found existing chat session for user:", sessionId);
      } else {
        
        console.log("No existing chat session found for user.");
      }
    }).catch((error) => {
      console.error("Error checking for existing chat session:", error);
    });
  }

  if (!authReadyResolved) {
    authReadyResolved = true;
    authReadyResolve();
  }
});


// This is triggered every time a manual register() finishes, a FID change
// is detected, or a pushsubscriptionchange event is fired.
onRegistered(messaging, (installationId) => {
  console.log('Registered installation ID:', installationId);
  cachedNotificationToken = installationId;

  if (!sessionId) {
  console.warn("No chat session ID available to save notification token.");
  return;
  }

  const sessionDocRef = doc(chatSessionsCollection, sessionId);
  setDoc(
    sessionDocRef,
    {
      notificationToken: installationId,
      notificationTokenUpdatedAt: serverTimestamp(),
    },
    { merge: true }
  ).then(() => {
    console.log("Notification token saved successfully.");
  }).catch((error) => {
    console.error("Failed to save notification token on chat session:", error);
  });
});

function getSessionUserName() {
  const user = auth.currentUser;
  if (user?.displayName) {
    return user.displayName;
  }
  if (user?.email) {
    return user.email;
  }
  return "Anonymous";
}

function getSessionTitleDescription() {
  const pageTitle = document?.title || "Contact Support";
  return `${pageTitle} chat session`;
}

async function findOpenChatSessionId() {

  if (sessionId) {
    return sessionId;
  }

  try {
    const openSessionQuery = query(
      chatSessionsCollection,
      where("userUid", "==", currentUserUid),
      where("status", "==", "open")
    );
    const snapshot = await getDocs(openSessionQuery);
    if (!snapshot.empty) {
      const existingDoc = snapshot.docs[0];
      localStorage.setItem(SESSION_STORAGE_KEY, existingDoc.id);
      sessionId = existingDoc.id;


      return existingDoc.id;
    } else {


      const sessionDocRef = doc(chatSessionsCollection);
      const newSessionId = sessionDocRef.id;
      await setDoc(sessionDocRef, {
        sessionId: newSessionId,
        userUid: currentUserUid || "unknown",
        userName: getSessionUserName(),
        titleDescription: getSessionTitleDescription(),
        status: "open",
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
      localStorage.setItem(SESSION_STORAGE_KEY, newSessionId);
      sessionId = newSessionId;
      
      
      
      
      return newSessionId;
    
    
    
    }

  } catch (error) {
    console.error("Failed to query open chat session:", error);
  }

  return null;
}

async function getAdminUids() {
  try {
    const snapshot = await getDocs(adminsCollection);
    const adminUids = [];
    snapshot.forEach((doc) => {
      const data = doc.data();
      if (data && data.active === true) {
        adminUids.push(data.key);
      }
    });
    return adminUids;
  } catch (error) {
    console.error("Failed to fetch admin UIDs:", error);
    return [];
  }
}


function createMessageBubble(text, type = "sent") {
  const bubble = document.createElement("div");
  bubble.className = `chat-message ${type}`;
  bubble.innerHTML = `<div class="message-text">${text}</div>`;
  return bubble;
}

function scrollChatToBottom(container) {
  container.scrollTop = container.scrollHeight;
}

function renderChatMessages(snapshot) {
  const messageList = document.getElementById("chatMessages");
  if (!messageList) return;

  messageList.innerHTML = "";
  let hasMessages = false;

  snapshot.forEach((doc) => {
    const data = doc.data();
    if (!data || !data.text) return;

    let messageType = "received";

    if (data.senderId === currentUserUid) {
      messageType = "sent";
    }

    const message = createMessageBubble(data.text, messageType);
    messageList.appendChild(message);
    hasMessages = true;
  });

  if (!hasMessages) {
    messageList.appendChild(
      createMessageBubble(
        "Hi there! Welcome to Traveling Salesman support. Type your message below to start a chat with our team.",
        "received"
      )
    );
  }

  scrollChatToBottom(messageList);
}

async function saveChatMessage(text, type = "sent", senderId = null) {
  try {

    await authReady;


    if (!currentUserUid) {
      try {
        await signInAnonymously(auth);
        console.log("Signed in anonymously");
      } catch (error) {
        console.error("Anonymous sign-in failed:", error);
      }
    }
    
    await sessionReady;

    const messageSenderId = senderId || currentUserUid || "unknown";
    await ensureChatSessionNotificationToken();
    await addDoc(chatMessagesCollection, {
      sessionId,
      senderId: messageSenderId,
      text,
      type,
      createdAt: serverTimestamp(),
    });
  } catch (error) {
    console.error("Unable to save chat message:", error);
  }
}


async function ensureChatSessionNotificationToken() {

  if (cachedNotificationToken) {
    return cachedNotificationToken;
  }

  if (typeof window === "undefined" || !("Notification" in window)) {
    return;
  }

  try {
    const permission = await Notification.requestPermission();
    if (permission === "granted") {

      await register(messaging, {
        vapidKey: "BM4nqARW3Jo0dL56pkReBFiO2lB5aTaedmTfPxdYnAkWSakIv5cYTRBZKMHODehWo7PupmHCo0cs3UVNH0z5ZVQ",
      });
    }

  } catch (error) {
    console.error("Failed to request Firebase notification token:", error);
  }

}



function handleUserSend() {
  const input = document.getElementById("chatInput");
  if (!input) return;

  const message = input.value.trim();
  if (!message) return;

  input.value = "";
  input.focus();

  saveChatMessage(message, "sent");


}

function onContactFormSubmit(event) {
  event.preventDefault();
  handleUserSend();
}

function initializeChatListener() {

  let chatMessagesQuery = query(
    chatMessagesCollection,
    where("sessionId", "==", sessionId),
    orderBy("createdAt", "asc")
  );
  onSnapshot(
    chatMessagesQuery,
    (snapshot) => renderChatMessages(snapshot),
    (error) => console.error("Chat listener error:", error)
  );
}

onMessage(messaging, (payload) => {
  console.log('Message received. ', payload);
  const notificationTitle = payload.data?.title || 'Background Message Title';
  const notificationBody = payload.data?.body || 'Background Message body.'
  showToast(notificationTitle, notificationBody);
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


window.addEventListener("DOMContentLoaded", async () => {
  const form = document.getElementById("chatForm");
  if (form) {
    form.addEventListener("submit", onContactFormSubmit);
  }

  const sendButton = document.getElementById("sendButton");
  if (sendButton) {
    sendButton.addEventListener("click", handleUserSend);
  }

  const input = document.getElementById("chatInput");
  if (input) {
    input.addEventListener("keydown", (event) => {
      if (event.key === "Enter" && !event.shiftKey) {
        event.preventDefault();
        handleUserSend();
      }
    });
  }

});
