import {initializeApp} from "firebase/app";
import {
    connectAuthEmulator,
    getAuth,
    onAuthStateChanged,
    signInAnonymously,
    signOut as firebaseSignOut,
} from "firebase/auth";
import {
    collection,
    connectFirestoreEmulator,
    getFirestore,
    onSnapshot,
    query,
    where,
} from "firebase/firestore";

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
    connectAuthEmulator(auth, "http://127.0.0.1:9099");
}

const isFirestoreEmulator = __USE_AUTH_EMULATOR__;
const firestoreDatabase = isFirestoreEmulator ? "(default)" : "travelingsalesman";
const db = getFirestore(app, firestoreDatabase);

if (__USE_AUTH_EMULATOR__) {
    connectFirestoreEmulator(db, "127.0.0.1", 8080);
}

const requestList = document.getElementById("req-node-list");
const loadingState = document.getElementById("loading-state");
const emptyState = document.getElementById("empty-state");
const errorState = document.getElementById("error-state");
const signInButton = document.getElementById("btn-signin");
const signOutButton = document.getElementById("btn-signout");

let requestsUnsubscribe = null;

function formatTimestamp(value) {
    if (!value) {
        return "-";
    }

    if (typeof value?.toDate === "function") {
        return value.toDate().toLocaleString();
    }

    const parsed = new Date(value);
    if (Number.isNaN(parsed.getTime())) {
        return String(value);
    }

    return parsed.toLocaleString();
}

function formatSchedule(schedule) {
    if (!schedule || typeof schedule !== "object") {
        return "-";
    }

    if (schedule.rideNow === true) {
        return "Now";
    }

    if (schedule.rideDateTime) {
        const parsed = new Date(schedule.rideDateTime);
        if (!Number.isNaN(parsed.getTime())) {
            return parsed.toLocaleString();
        }
        return String(schedule.rideDateTime);
    }

    return "-";
}

function getStatusClass(status) {
    const normalized = String(status || "requested").toLowerCase();
    if (normalized === "completed") {
        return "text-bg-success";
    }
    if (normalized === "canceled" || normalized === "closed") {
        return "text-bg-secondary";
    }
    if (normalized === "pricing" || normalized === "quoted") {
        return "text-bg-info";
    }
    return "text-bg-primary";
}

function createRequestListItem(requestId, data) {
    const merchantName = data?.merchantDisplayName || "Unknown merchant";
    const requestStatus = String(data?.status || "requested");
    const createdAt = formatTimestamp(data?.createdTS);
    const schedule = formatSchedule(data?.schedule);
    const pickup = String(data?.pickupAddress || data?.A?.address || "-");
    const dropoff = String(data?.dropoffAddress || data?.B?.address || "-");
    const minutes = Number(data?.minutes);
    const duration = Number.isFinite(minutes) ? `${minutes.toFixed(1)} min` : "-";
    const distance = Number.isFinite(Number(data?.distancemiles)) ? `${Math.round(Number(data.distancemiles))} mi` : "-";

    const item = document.createElement("li");
    item.className = "list-group-item py-3";

    const detailUrl = new URL("request-details.html", window.location.href);
    detailUrl.searchParams.set("requestId", requestId);

    item.innerHTML = `
        <div class="d-flex flex-wrap justify-content-between align-items-start gap-2 mb-2">
            <div>
                <div class="fw-semibold">${merchantName}</div>
                <div class="small text-body-secondary">Request ID: ${requestId}</div>
            </div>
            <span class="badge ${getStatusClass(requestStatus)} text-capitalize">${requestStatus}</span>
        </div>
        <div class="row g-2 small mb-2">
            <div class="col-sm-6"><span class="text-body-secondary">Created:</span> ${createdAt}</div>
            <div class="col-sm-6"><span class="text-body-secondary">Scheduled:</span> ${schedule}</div>
            <div class="col-sm-6"><span class="text-body-secondary">Pickup:</span> ${pickup}</div>
            <div class="col-sm-6"><span class="text-body-secondary">Dropoff:</span> ${dropoff}</div>
            <div class="col-sm-6"><span class="text-body-secondary">Distance:</span> ${distance}</div>
            <div class="col-sm-6"><span class="text-body-secondary">Duration:</span> ${duration}</div>
        </div>
        <a class="btn btn-sm btn-outline-primary" href="${detailUrl.toString()}">View Details</a>
    `;

    return item;
}

function showLoading(message) {
    loadingState.textContent = message;
    loadingState.classList.remove("d-none");
    emptyState.classList.add("d-none");
    errorState.classList.add("d-none");
}

function showEmpty(message) {
    loadingState.classList.add("d-none");
    emptyState.textContent = message;
    emptyState.classList.remove("d-none");
    errorState.classList.add("d-none");
}

function showError(message) {
    loadingState.classList.add("d-none");
    emptyState.classList.add("d-none");
    errorState.textContent = message;
    errorState.classList.remove("d-none");
}

function clearRequestList() {
    requestList.innerHTML = "";
}

function renderRequests(snapshot) {
    const requests = snapshot.docs
            .map((documentSnapshot) => ({id: documentSnapshot.id, data: documentSnapshot.data() || {}}))
            .sort((a, b) => {
                const aMillis = a.data?.createdTS?.toMillis ? a.data.createdTS.toMillis() : new Date(a.data?.createdTS || 0).getTime();
                const bMillis = b.data?.createdTS?.toMillis ? b.data.createdTS.toMillis() : new Date(b.data?.createdTS || 0).getTime();
                return bMillis - aMillis;
            });

    clearRequestList();

    if (requests.length === 0) {
        showEmpty("No ride requests yet.");
        return;
    }

    requests.forEach((requestData) => {
        requestList.appendChild(createRequestListItem(requestData.id, requestData.data));
    });

    loadingState.classList.add("d-none");
    emptyState.classList.add("d-none");
    errorState.classList.add("d-none");
}

function subscribeToRequests(user) {
    if (requestsUnsubscribe) {
        requestsUnsubscribe();
        requestsUnsubscribe = null;
    }

    showLoading("Loading your ride requests...");

    const q = query(
        collection(db, "requests"),
        where("user", "==", user.uid),
        where("status", "!=", "deleted"),
    );
    requestsUnsubscribe = onSnapshot(q, (querySnapshot) => {
        renderRequests(querySnapshot);
    }, (error) => {
        console.error("Failed to load request history:", error);
        showError("Unable to load request history right now.");
    });
}

async function signIn() {
    window.location.assign("auth.html");
}

async function signOut() {
    try {
        await firebaseSignOut(auth);
        showLoading("Signed out. Sign in to view request history.");
        clearRequestList();
    } catch (error) {
        console.error("Failed to sign out:", error);
        showError("Could not sign out. Please try again.");
    }
}

window.signIn = signIn;
window.signOut = signOut;

if (signInButton) {
    signInButton.addEventListener("click", signIn);
}

if (signOutButton) {
    signOutButton.addEventListener("click", signOut);
}

onAuthStateChanged(auth, async (user) => {
    if (!user) {
        showLoading("Signing you in...");
        try {
            const credential = await signInAnonymously(auth);
            subscribeToRequests(credential.user);
        } catch (error) {
            console.error("Anonymous sign-in failed:", error);
            showError("Unable to authenticate. Please sign in and try again.");
        }
        return;
    }

    subscribeToRequests(user);
});