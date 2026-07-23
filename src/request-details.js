import {initializeApp} from "firebase/app";
import {connectAuthEmulator, getAuth, onAuthStateChanged} from "firebase/auth";
import {connectFirestoreEmulator, doc, getDoc, setDoc, getFirestore, onSnapshot} from "firebase/firestore";

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

const searchParams = new URLSearchParams(window.location.search);
const requestId = searchParams.get("requestId") || "";
const requestPaidParam = searchParams.get("paid");

const loadingState = document.getElementById("loading-state");
const errorState = document.getElementById("error-state");
const detailState = document.getElementById("detail-state");
const statusValue = document.getElementById("request-status");
const completePaymentButton = document.getElementById("complete_payment");
const cancelRequestButton = document.getElementById("cancel_request");
const contactMerchantButton = document.getElementById("contact_merchant");
const requestMerchantValue = document.getElementById("request-merchant");
const requestEmailValue = document.getElementById("request-email");
const scheduleValue = document.getElementById("request-schedule");
const distanceValue = document.getElementById("request-distance");
const durationValue = document.getElementById("request-duration");
const pickupValue = document.getElementById("request-pickup");
const dropoffValue = document.getElementById("request-dropoff");
const routeStopsTable = document.getElementById("route-stops-table");

function formatTimestamp(value) {
  if (!value) {
    return "-";
  }

  if (value?.toDate) {
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

function renderRouteStops(stops) {
  routeStopsTable.innerHTML = "";

  if (!Array.isArray(stops) || stops.length === 0) {
    const row = document.createElement("tr");
    row.innerHTML = '<td colspan="4" class="text-muted">No route stops available.</td>';
    routeStopsTable.appendChild(row);
    return;
  }

  stops.forEach((stop, index) => {
    const row = document.createElement("tr");
    const lat = Number(stop?.lat);
    const lng = Number(stop?.lng);
    row.innerHTML = `
      <td>${index + 1}</td>
      <td>${String(stop?.label || "Stop")}</td>
      <td>${String(stop?.address || "-")}</td>
      <td>${Number.isFinite(lat) && Number.isFinite(lng) ? `${lat.toFixed(6)}, ${lng.toFixed(6)}` : "-"}</td>
    `;
    routeStopsTable.appendChild(row);
  });
}

function renderRequestData(id, data) {
  requestMerchantValue.textContent = String(data?.merchantDisplayName || "-");
  requestEmailValue.textContent = String(data?.merchantEmail || data?.merchantContactEmail || "-");
  const paidLabel = data?.paid === true ? "paid" : "unpaid";
  statusValue.textContent = `${String(data?.status || "unknown")} (${paidLabel})`;
  scheduleValue.textContent = formatSchedule(data?.schedule);
  distanceValue.textContent = Number.isFinite(Number(data?.distancemiles)) ?
    `${Math.round(Number(data.distancemiles))} miles` :
    "-";
  durationValue.textContent = Number.isFinite(Number(data?.minutes)) ?
    `${Number(data.minutes).toFixed(1)} minutes` :
    "-";
  pickupValue.textContent = String(data?.pickupAddress || data?.A?.address || "-");
  dropoffValue.textContent = String(data?.dropoffAddress || data?.B?.address || "-");

  const checkoutUrl = String(data?.sessionUrl || data?.checkoutSessionUrl || data?.paymentLink || "").trim();
  if (completePaymentButton) {
    if (checkoutUrl) {
      completePaymentButton.setAttribute("href", checkoutUrl);
      completePaymentButton.setAttribute("target", "_blank");
      completePaymentButton.setAttribute("rel", "noopener noreferrer");
      completePaymentButton.classList.remove("disabled");
      completePaymentButton.removeAttribute("aria-disabled");
      completePaymentButton.removeAttribute("title");
    } else {
      completePaymentButton.removeAttribute("href");
      completePaymentButton.removeAttribute("target");
      completePaymentButton.removeAttribute("rel");
      completePaymentButton.classList.add("disabled");
      completePaymentButton.setAttribute("aria-disabled", "true");
      completePaymentButton.setAttribute("title", "Checkout session not available yet");
    }
  }

  if (cancelRequestButton) {

  }

  if (contactMerchantButton) {

      contactMerchantButton.setAttribute("href", "/contact");


  }

  renderRouteStops(data?.routeStops);

  const printable = {
    ...data,
    createdTS: formatTimestamp(data?.createdTS),
    updatedTS: formatTimestamp(data?.updatedTS),
  };

  loadingState.classList.add("d-none");
  errorState.classList.add("d-none");
  detailState.classList.remove("d-none");
}

function showError(message) {
  errorState.textContent = message;
  loadingState.classList.add("d-none");
  detailState.classList.add("d-none");
  errorState.classList.remove("d-none");
}

if (!requestId) {
  showError("Missing requestId. Open this page with ?requestId=<id>.");
} else {
  const requestRef = doc(db, "requests", requestId);
  if (requestPaidParam === "true" || requestPaidParam === "false") {
    await setDoc(requestRef, {paid: requestPaidParam === "true"}, {merge: true});
  }
  onAuthStateChanged(auth, async (user) => {
    if (!user) {
      showError("You must be signed in to view request details.");
      return;
    }

    const snapshot = await getDoc(requestRef);

    if (!snapshot.exists()) {
      showError("Request not found.");
      return;
    }

    const initialData = snapshot.data() || {};
    // if (initialData.user && initialData.user !== user.uid) {
    //   showError("You do not have access to this request.");
    //   return;
    // }

    renderRequestData(snapshot.id, initialData);

    onSnapshot(requestRef, (liveDoc) => {
      if (!liveDoc.exists()) {
        showError("Request no longer exists.");
        return;
      }

      const liveData = liveDoc.data() || {};
      renderRequestData(liveDoc.id, liveData);
    });
  });
}
