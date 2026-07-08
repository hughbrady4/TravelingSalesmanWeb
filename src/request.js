import {initializeApp} from "firebase/app";
import {connectAuthEmulator, getAuth} from "firebase/auth";
import {getFunctions, httpsCallable} from "firebase/functions";

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
const functions = getFunctions(app);
const requestRideCallable = httpsCallable(functions, "requestRide");
const currentPriceId = new URLSearchParams(window.location.search).get('priceId') || '';
const currentAccountId = new URLSearchParams(window.location.search).get('accountId') || '';

let routeStops = [];

let dateTimeInput;
let nowCheckbox;
let routeList;
let routeData;
let placeAutocomplete;
let Route;

function formatDateTimeLocal(date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  const hours = String(date.getHours()).padStart(2, '0');
  const minutes = String(date.getMinutes()).padStart(2, '0');
  return `${year}-${month}-${day}T${hours}:${minutes}`;
}

function setDateTimeMode() {
  const usingNow = nowCheckbox.checked;
  dateTimeInput.disabled = usingNow;
  dateTimeInput.required = !usingNow;

  if (usingNow) {
    dateTimeInput.value = '';
    dateTimeInput.setCustomValidity('');
  }
}

function addRouteStop(stop) {
  routeStops.push(stop);
  renderRouteList();
}

function removeRouteStop(index) {
  routeStops = routeStops.filter((_, stopIndex) => stopIndex !== index);
  renderRouteList();
}

function renderRouteList() {
  routeList.innerHTML = '';

  if (routeStops.length === 0) {
    const emptyItem = document.createElement('li');
    emptyItem.className = 'list-group-item text-muted';
    emptyItem.textContent = 'No route stops yet. Add one with autocomplete or My Location.';
    routeList.appendChild(emptyItem);
  } else {
    routeStops.forEach((stop, index) => {
      const item = document.createElement('li');
      item.className = 'list-group-item d-flex justify-content-between align-items-start gap-2';

      const textBlock = document.createElement('div');
      textBlock.className = 'me-auto';

      const title = document.createElement('div');
      title.className = 'fw-semibold';
      title.textContent = `${index + 1}. ${stop.label}`;

      const details = document.createElement('small');
      details.className = 'text-muted';
      details.textContent = stop.address;

      textBlock.appendChild(title);
      textBlock.appendChild(details);

      const removeButton = document.createElement('button');
      removeButton.type = 'button';
      removeButton.className = 'btn btn-sm btn-outline-danger';
      removeButton.textContent = 'Remove';
      removeButton.addEventListener('click', () => removeRouteStop(index));

      item.appendChild(textBlock);
      item.appendChild(removeButton);
      routeList.appendChild(item);
    });
  }

  routeData.value = JSON.stringify(routeStops, null, 2);
}

function setupDateTimeInput() {
  const now = new Date();
  dateTimeInput.min = formatDateTimeLocal(now);

  const oneHourAhead = new Date(now.getTime() + 60 * 60 * 1000);
  dateTimeInput.value = formatDateTimeLocal(oneHourAhead);

  nowCheckbox.addEventListener('change', setDateTimeMode);
  setDateTimeMode();
}

function setupAutocomplete() {
  if (!window.google?.maps?.places) {
    throw new Error('Google Maps Places library is unavailable.');
  }


  const autocompleteContainer = document.getElementById('place-autocomplete-widget');
  if (!autocompleteContainer) {
    throw new Error('Place autocomplete container is unavailable.');
  }

  placeAutocomplete = new google.maps.places.PlaceAutocompleteElement();
  placeAutocomplete.placeholder = 'Type an address or place name';
  placeAutocomplete.setAttribute('aria-label', 'Add stop with place autocomplete');
  autocompleteContainer.replaceChildren(placeAutocomplete);

  placeAutocomplete.addEventListener('gmp-select', async ({placePrediction}) => {
    if (!placePrediction) {
      return;
    }

    const place = placePrediction.toPlace();
    await place.fetchFields({fields: ['displayName', 'formattedAddress', 'location']});

    if (!place.location) {
      return;
    }

    const lat = place.location.lat();
    const lng = place.location.lng();
    const label = place.displayName || 'Selected location';
    const address = place.formattedAddress || `${lat.toFixed(6)}, ${lng.toFixed(6)}`;

    addRouteStop({
      source: 'place-autocomplete',
      label,
      address,
      lat,
      lng,
    });

    if ('value' in placeAutocomplete) {
      placeAutocomplete.value = '';
    }
  });
}

function setupMyLocationButton() {
  const myLocationButton = document.getElementById('btn-my-location');

  myLocationButton.addEventListener('click', () => {
    if (!navigator.geolocation) {
      alert('Geolocation is not supported by your browser.');
      return;
    }

    myLocationButton.disabled = true;
    myLocationButton.textContent = 'Locating...';

    navigator.geolocation.getCurrentPosition(
      (position) => {
        const { latitude, longitude } = position.coords;

        addRouteStop({
          source: 'my-location',
          label: 'My Location',
          address: `${latitude.toFixed(6)}, ${longitude.toFixed(6)}`,
          lat: latitude,
          lng: longitude,
        });

        myLocationButton.disabled = false;
        myLocationButton.textContent = 'Add My Location';
      },
      () => {
        alert('Unable to retrieve your location. Please verify browser location permissions.');
        myLocationButton.disabled = false;
        myLocationButton.textContent = 'Add My Location';
      },
      {
        enableHighAccuracy: true,
        timeout: 10000,
      }
    );
  });
}

function parseDurationToMillis(duration) {
  if (typeof duration === 'number' && Number.isFinite(duration)) {
    return duration;
  }

  if (typeof duration !== 'string') {
    return null;
  }

  const seconds = Number(duration.replace(/s$/, ''));
  if (!Number.isFinite(seconds)) {
    return null;
  }

  return seconds * 1000;
}

async function computeRouteMetrics(stops) {
  if (!Route || !Array.isArray(stops) || stops.length < 2) {
    return null;
  }

  const request = {
    origin: {
      lat: stops[0].lat,
      lng: stops[0].lng,
    },
    destination: {
      lat: stops[stops.length - 1].lat,
      lng: stops[stops.length - 1].lng,
    },
    travelMode: 'DRIVING',
    fields: ['distanceMeters', 'durationMillis'],
  };

  const {routes} = await Route.computeRoutes(request);
  const primaryRoute = Array.isArray(routes) ? routes[0] : null;
  if (!primaryRoute) {
    return null;
  }

  const distanceMeters = Number(primaryRoute.distanceMeters);
  const durationMillis = parseDurationToMillis(primaryRoute.durationMillis) ??
    parseDurationToMillis(primaryRoute.duration);

  if (!Number.isFinite(distanceMeters) || !Number.isFinite(durationMillis)) {
    return null;
  }

  return {
    distanceMiles: distanceMeters * 0.000621371,
    durationMinutes: durationMillis / 60000,
  };
}

function setupFormSubmission() {
  const form = document.getElementById('ride-request-form');
  const summary = document.getElementById('submit-summary');

  form.addEventListener('submit', async (event) => {
    event.preventDefault();

    if (!form.checkValidity()) {
      form.classList.add('was-validated');
      return;
    }

    if (routeStops.length < 1) {
      alert('Please add at least one route stop before submitting.');
      return;
    }

    const currentUser = auth.currentUser;
    if (!currentUser) {
      alert('Please sign in before requesting a ride.');
      return;
    }

    const submitButton = form.querySelector('button[type="submit"]');
    submitButton.disabled = true;
    submitButton.textContent = 'Submitting...';

    const schedule = nowCheckbox.checked
      ? 'Now'
      : new Date(dateTimeInput.value).toLocaleString();
    let routeSummary = '';
    let routeMetrics = null;

    try {
      routeMetrics = await computeRouteMetrics(routeStops);
      if (routeMetrics) {
        routeSummary = ` Estimated ${routeMetrics.distanceMiles.toFixed(1)} mi, ${routeMetrics.durationMinutes.toFixed(1)} min.`;
      }
    } catch (routeError) {
      console.warn('Unable to compute route metrics with Maps Routes SDK:', routeError);
    }

    const ridePayload = {
      rideNow: nowCheckbox.checked,
      rideDateTime: nowCheckbox.checked ? null : dateTimeInput.value,
      routeStops,
      distancemiles: routeMetrics?.distanceMiles,
      minutes: routeMetrics?.durationMinutes,
      priceId: currentPriceId || undefined,
      accountId: currentAccountId || undefined,
    };

    try {
      const response = await requestRideCallable(ridePayload);
      const requestId = response?.data?.requestId || 'unknown';
      const checkoutUrl = response?.data?.checkoutUrl || '';
      const detailUrl = `request-details.html?requestId=${encodeURIComponent(requestId)}`;
      summary.innerHTML = `Ride request submitted (${requestId}): ${schedule} with ${routeStops.length} stop(s).${routeSummary} <a href="${detailUrl}" class="alert-link">View request details</a>.`;
      summary.classList.remove('d-none');

      if (checkoutUrl) {
        window.location.href = checkoutUrl;
      }
    } catch (error) {
      const message = error?.message || 'Unable to submit ride request.';
      alert(message);
    } finally {
      submitButton.disabled = false;
      submitButton.textContent = 'Submit Request';
    }
  });
}

async function init() {
  dateTimeInput = document.getElementById('ride-datetime');
  nowCheckbox = document.getElementById('ride-now');
  routeList = document.getElementById('route-list');
  routeData = document.getElementById('route-data');

  setupDateTimeInput();
  setupMyLocationButton();
  setupFormSubmission();

  const [{Route: RoutesClass}] = await Promise.all([
    google.maps.importLibrary('routes'),
    google.maps.importLibrary('places'),
  ]);
  Route = RoutesClass;
  setupAutocomplete();
  renderRouteList();
}

document.addEventListener('DOMContentLoaded', () => {
  init().catch((error) => {
    console.error('Failed to initialize request form:', error);
    alert('Unable to initialize Google Maps autocomplete on this page.');
  });
});
