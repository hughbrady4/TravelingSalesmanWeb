import { initializeApp } from "firebase/app";
import { connectAuthEmulator, getAuth, onAuthStateChanged, signInAnonymously } from "firebase/auth";
import { getFirestore, serverTimestamp, collection, getDoc, setDoc, query, where, onSnapshot, doc } from "firebase/firestore";
const { Place } = await google.maps.importLibrary("places");
const { AdvancedMarkerElement, PinElement } = await google.maps.importLibrary("marker");
const { Route } = await google.maps.importLibrary('routes');

const labels = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";
const DRIVER_MARKERS = new Map();
let markers;
let mMapPolylines

let map;
let mRequestId;


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

onAuthStateChanged(auth, user => {
    if (user != null) {
        getRequests(user);
    } else {
        console.log("No user!");
    }
});

function getRequests(user) {

    const q = query(collection(firestore, "requests"), 
        where("user", "==", user.uid));
    const unsubscribe = onSnapshot(q, (querySnapshot) => {

       querySnapshot.docChanges().forEach((change) => {
            const source = change.doc.metadata.hasPendingWrites ? "Local" : "Server";

            if (change.type === "added") {
                console.log(source, "New request: ", change.doc.data());
                const newNode = document.createElement("li");
                newNode.textContent = change.doc.data().toString();
                newNode.classList.add("list-group-item");
                $("#req-node-list").append(newNode);
            }
            if (change.type === "modified") {
                console.log(source, "Modified request: ", change.doc.data());
            }
            if (change.type === "removed") {
                console.log(source, "Removed request: ", change.doc.data());
            }
        });
    });
}