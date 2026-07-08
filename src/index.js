import { initializeApp } from 'firebase/app';
import { getAnalytics, logEvent } from 'firebase/analytics';
import { connectAuthEmulator, getAuth, onAuthStateChanged, signInAnonymously } from 'firebase/auth';
import { collection, doc, getDoc, getFirestore, onSnapshot, query, serverTimestamp, setDoc, where } from 'firebase/firestore';

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
const analytics = getAnalytics(app);
const auth = getAuth(app);

if (__USE_AUTH_EMULATOR__) {
  connectAuthEmulator(auth, 'http://127.0.0.1:9099');
}

const db = getFirestore(app, 'travelingsalesman');

const safeLogEvent = (name, params = {}) => {
  try {
    logEvent(analytics, name, params);
  } catch (error) {
    console.error('Failed to log analytics event:', name, error);
  }
};

const navigate = (url, eventName) => {
  if (eventName) {
    safeLogEvent(eventName, { destination: url });
  }
  window.location.href = url;
};

const waitForAuthUser = () => new Promise((resolve) => {
  const unsubscribe = onAuthStateChanged(
    auth,
    (user) => {
      unsubscribe();
      resolve(user);
    },
    () => {
      unsubscribe();
      resolve(auth.currentUser);
    },
  );
});

const ensureAuthenticatedUser = async () => {
  let user = auth.currentUser;

  if (!user) {
    user = await waitForAuthUser();
  }

  if (!user) {
    const cred = await signInAnonymously(auth);
    user = cred.user;
  }

  return user;
};

const updateUserLocationRecord = async (position) => {
  const user = await ensureAuthenticatedUser();

  const userRef = doc(db, 'users', user.uid);
  await setDoc(
    userRef,
    {
      location: {
        lat: position.lat,
        lng: position.lng,
      },
      isAnonymous: user.isAnonymous,
      locationUpdatedAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    },
    { merge: true },
  );
};

const acknowledgeDisclaimer = async () => {
  const user = await ensureAuthenticatedUser();
  const userRef = doc(db, 'users', user.uid);

  await setDoc(
    userRef,
    {
      isAnonymous: user.isAnonymous,
      disclaimerAcknowledged: true,
      disclaimerAcknowledgedAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    },
    { merge: true },
  );
};

const addDisclaimerAlert = () => {
  const mainContainer = document.querySelector('main.container');
  if (!mainContainer || document.getElementById('homeDisclaimerAlert')) {
    return;
  }

  const alert = document.createElement('div');
  alert.id = 'homeDisclaimerAlert';
  alert.className = 'alert alert-warning mb-4';
  alert.setAttribute('role', 'alert');
  alert.innerHTML = [
    '<div class="d-flex flex-column flex-md-row align-items-start align-items-md-center justify-content-between gap-3">',
    '<div><strong>Disclaimer:</strong> Traveling Salesman is <strong>NOT</strong> a rideshare company nor service provider. Vendors are responsible for maintaining all requisite licensing and insurance for any particular product or service.</div>',
    '<button id="acknowledgeDisclaimerBtn" type="button" class="btn btn-sm btn-outline-dark">Acknowledge</button>',
    '</div>',
  ].join('');

  mainContainer.prepend(alert);

  const acknowledgeBtn = document.getElementById('acknowledgeDisclaimerBtn');
  if (!acknowledgeBtn) {
    return;
  }

  acknowledgeBtn.addEventListener('click', async () => {
    acknowledgeBtn.disabled = true;
    acknowledgeBtn.textContent = 'Saving...';

    try {
      await acknowledgeDisclaimer();
      alert.remove();
      safeLogEvent('home_disclaimer_acknowledged');
    } catch (error) {
      console.error('Unable to acknowledge disclaimer:', error);
      safeLogEvent('home_disclaimer_ack_error', { message: error.message || 'unknown' });
      acknowledgeBtn.disabled = false;
      acknowledgeBtn.textContent = 'Acknowledge';
      window.alert('Unable to save your acknowledgment. Please try again.');
    }
  });
};

let mMap;
let activeLocationMarker;
let pendingSavedLocation;
let placeSearchRequest;
let pendingPlaceSearchBias;
let productsUnsubscribe;
let pricesUnsubscribe;
let productPriceInfoWindow;

const productPriceMarkers = new Map();
const productDocsById = new Map();
const priceDocsByProductId = new Map();

const LOCATION_MARKER_ICON = {
  url: 'data:image/svg+xml;charset=UTF-8,' + encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><path fill="#0d6efd" d="M12 2c-3.87 0-7 3.13-7 7 0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7zm0 10a3 3 0 1 1 0-6 3 3 0 0 1 0 6z"/></svg>'),
};

const parseGeoLocation = (value) => {
  if (!value) {
    return null;
  }

  if (typeof value === 'string') {
    const [latString, lngString] = value.split(',').map((part) => part.trim());
    const lat = Number(latString);
    const lng = Number(lngString);
    if (Number.isFinite(lat) && Number.isFinite(lng)) {
      return { lat, lng };
    }
    return null;
  }

  if (Number.isFinite(value.lat) && Number.isFinite(value.lng)) {
    return {
      lat: value.lat,
      lng: value.lng,
    };
  }

  return null;
};

const escapeHtml = (value) => String(value)
  .replace(/&/g, '&amp;')
  .replace(/</g, '&lt;')
  .replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;')
  .replace(/'/g, '&#39;');

const buildProductUrlWithParams = (baseUrl, accountId, priceId) => {
  if (!baseUrl) {
    return null;
  }

  try {
    const url = new URL(baseUrl, window.location.origin);
    url.searchParams.set('accountId', accountId);
    if (priceId) {
      url.searchParams.set('priceId', priceId);
    }
    return url.toString();
  } catch (error) {
    console.error('Invalid product URL for info window link:', error);
    return null;
  }
};

const getProductPosition = async (productData) => {
  const candidateFields = [
    productData.location,
    productData.geoLocation,
    productData.geo_code,
    productData.geoCode,
    productData.geoCoordinates,
  ];

  for (const candidate of candidateFields) {
    const parsed = parseGeoLocation(candidate);
    if (parsed) {
      return parsed;
    }
  }

  const productUserId = productData.userId || productData.metadata?.tsp_uid;
  if (!productUserId || productUserId === 'unknown') {
    return null;
  }

  // try {
  //   const userSnap = await getDoc(doc(db, 'users', productUserId));
  //   if (!userSnap.exists()) {
  //     return null;
  //   }

  //   const userLocation = userSnap.data()?.location;
  //   return parseGeoLocation(userLocation);
  // } catch (error) {
  //   console.error('Unable to load user location for product marker:', error);
  //   return null;
  // }
};

const formatPriceLabel = (priceData) => {
  const amount = Number(priceData.unit_amount);
  const currency = String(priceData.currency || 'usd').toUpperCase();

  if (!Number.isFinite(amount)) {
    return currency;
  }

  try {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency,
    }).format(amount / 100);
  } catch (error) {
    return `${(amount / 100).toFixed(2)} ${currency}`;
  }
};

const createProductPriceMarkerElement = (productId, productData, relatedPrices) => {
  const markerEl = document.createElement('div');
  markerEl.style.position = 'relative';
  markerEl.style.display = 'flex';
  markerEl.style.flexDirection = 'column';
  markerEl.style.alignItems = 'center';
  markerEl.style.transform = 'translateY(-4px)';
  markerEl.style.transition = 'transform 150ms ease';

  const badge = document.createElement('div');
  badge.style.background = '#0f5132';
  badge.style.color = '#ffffff';
  badge.style.fontSize = '10px';
  badge.style.fontWeight = '700';
  badge.style.padding = '2px 8px';
  badge.style.borderRadius = '999px';
  badge.style.boxShadow = '0 1px 2px rgba(0, 0, 0, 0.3)';
  badge.style.marginBottom = '4px';
  badge.textContent = `${relatedPrices.length} PRICE${relatedPrices.length === 1 ? '' : 'S'}`;

  const pin = document.createElement('div');
  pin.style.width = '20px';
  pin.style.height = '20px';
  pin.style.borderRadius = '50%';
  pin.style.background = '#198754';
  pin.style.border = '2px solid #ffffff';
  pin.style.boxShadow = '0 2px 8px rgba(0, 0, 0, 0.35)';

  const stem = document.createElement('div');
  stem.style.width = '2px';
  stem.style.height = '14px';
  stem.style.background = '#198754';
  stem.style.borderRadius = '2px';
  stem.style.marginTop = '-1px';

  markerEl.appendChild(badge);
  markerEl.appendChild(pin);
  markerEl.appendChild(stem);

  const productName = productData.name || productId;
  markerEl.title = productName;
  markerEl.setAttribute('aria-label', `${productName} product marker`);

  markerEl.addEventListener('mouseenter', () => {
    markerEl.style.transform = 'translateY(-8px)';
  });

  markerEl.addEventListener('mouseleave', () => {
    markerEl.style.transform = 'translateY(-4px)';
  });

  return markerEl;
};

const closeProductPriceMarkers = () => {
  productPriceMarkers.forEach((marker) => {
    marker.map = null;
  });
  productPriceMarkers.clear();
  productDocsById.clear();
  priceDocsByProductId.clear();
};

const syncProductPriceMarkers = async () => {
  if (!mMap || !window.google?.maps?.marker?.AdvancedMarkerElement) {
    return;
  }

  const userLocationCache = new Map();
  const activeProductIds = new Set();

  const entries = Array.from(productDocsById.entries());
  const updates = await Promise.all(entries.map(async ([productId, productData]) => {
    if (productData.active === false) {
      return { productId, productData, relatedPrices: [], position: null };
    }

    const relatedPrices = priceDocsByProductId.get(productId) || [];
    if (relatedPrices.length === 0) {
      return { productId, productData, relatedPrices, position: null };
    }

    const productUserId = productData.userId || productData.metadata?.tsp_uid;
    if (productUserId && productUserId !== 'unknown' && userLocationCache.has(productUserId)) {
      return {
        productId,
        productData,
        relatedPrices,
        position: userLocationCache.get(productUserId),
      };
    }

    const position = productData.geoCoordinates || await getProductPosition(productData);
    if (productUserId && productUserId !== 'unknown') {
      userLocationCache.set(productUserId, position);
    }

    return {
      productId,
      productData,
      relatedPrices,
      position,
    };
  }));

  updates.forEach(({ productId, productData, relatedPrices, position }) => {
    if (!position || relatedPrices.length === 0) {
      const staleMarker = productPriceMarkers.get(productId);
      if (staleMarker) {
        staleMarker.map = null;
        productPriceMarkers.delete(productId);
      }
      return;
    }

    activeProductIds.add(productId);
    const productName = productData.name || productId;
    const existingMarker = productPriceMarkers.get(productId);

    if (existingMarker) {
      existingMarker.position = position;
      existingMarker.title = productName;
      return;
    }

    const markerEl = createProductPriceMarkerElement(productId, productData, relatedPrices);
    const marker = new google.maps.marker.AdvancedMarkerElement({
      map: mMap,
      position,
      title: productName,
      content: markerEl,
      gmpClickable: true,
    });

    marker.addListener('click', () => {
      if (!productPriceInfoWindow) {
        productPriceInfoWindow = new google.maps.InfoWindow();
      }

      const safeProductName = escapeHtml(productName);
      const safeDescription = escapeHtml(productData.description || 'No description provided');
      const productUrl = typeof productData.url === 'string' ? productData.url.trim() : '';
      const accountId = typeof productData.accountId === 'string' ? productData.accountId.trim() : '';
      const pricesHtml = relatedPrices
        .slice(0, 4)
        .map((priceData) => {
          const priceLabel = escapeHtml(formatPriceLabel(priceData));
          const linkedUrl = buildProductUrlWithParams(productUrl, accountId, priceData.id);

          if (!linkedUrl) {
            return `<li>${priceLabel}</li>`;
          }

          return `<li><a href="${escapeHtml(linkedUrl)}" target="_blank" rel="noopener noreferrer">${priceLabel}</a></li>`;
        })
        .join('');

      const firstPriceId = relatedPrices[0]?.id;
      const productLinkUrl = buildProductUrlWithParams(productUrl, accountId, firstPriceId);
      const productLinkHtml = productLinkUrl
        ? `<div style="margin-top:8px;"><a href="${escapeHtml(productLinkUrl)}" target="_blank" rel="noopener noreferrer">Open product link</a></div>`
        : '';

      // Use vendor name from product document
      const accountDisplayName = productData.accountDisplayName || '';
      const headerContent = accountDisplayName 
        ? `<strong>Vendor: </strong>`
        : '';


      const heading = document.createElement('h2');
      heading.textContent = accountDisplayName;
      heading.style.fontSize = '14px';
      heading.style.margin = '0 0 4px 0';


      productPriceInfoWindow.setContent([
        '<div style="min-width:240px;line-height:1.35;">',
        `<strong>${safeProductName}</strong>`,
        `<div style="font-size:12px;margin-top:4px;">${safeDescription}</div>`,
        '<div style="font-size:12px;margin-top:6px;">Active prices:</div>',
        `<ul style="margin:4px 0 0 16px;padding:0;">${pricesHtml || '<li>No price data</li>'}</ul>`,
        productLinkHtml,
        '</div>',
      ].join(''));

      productPriceInfoWindow.setOptions({ headerContent: heading });

      productPriceInfoWindow.open({ map: mMap, anchor: marker });
      mMap.panTo(position);
    });

    productPriceMarkers.set(productId, marker);
  });

  productPriceMarkers.forEach((marker, productId) => {
    if (!activeProductIds.has(productId)) {
      marker.map = null;
      productPriceMarkers.delete(productId);
    }
  });
};

const initializeProductPriceMarkers = () => {
  if (!mMap) {
    return;
  }

  if (productsUnsubscribe) {
    productsUnsubscribe();
  }

  if (pricesUnsubscribe) {
    pricesUnsubscribe();
  }

  const productsQuery = query(
    collection(db, 'stripeProducts'),
  );

  const pricesQuery = query(
    collection(db, 'stripePrices'),
    where('online', '==', true),
  );

  productsUnsubscribe = onSnapshot(
    productsQuery,
    (snapshot) => {
      productDocsById.clear();
      snapshot.docs.forEach((productDoc) => {
        productDocsById.set(productDoc.id, productDoc.data());
      });

      syncProductPriceMarkers().catch((error) => {
        console.error('Unable to sync product markers from products:', error);
      });
    },
    (error) => {
      console.error('Unable to subscribe to stripe products:', error);
      closeProductPriceMarkers();
    },
  );

  pricesUnsubscribe = onSnapshot(
    pricesQuery,
    (snapshot) => {
      priceDocsByProductId.clear();
      snapshot.docs.forEach((priceDoc) => {
        const priceData = priceDoc.data();
        if (!priceData.product) {
          return;
        }

        if (!priceDocsByProductId.has(priceData.product)) {
          priceDocsByProductId.set(priceData.product, []);
        }

        priceDocsByProductId.get(priceData.product).push(priceData);
      });

      syncProductPriceMarkers().catch((error) => {
        console.error('Unable to sync product markers from prices:', error);
      });
    },
    (error) => {
      console.error('Unable to subscribe to stripe prices:', error);
      closeProductPriceMarkers();
    },
  );
};

const updateLocationMarker = (position, title = 'Selected location') => {
  if (!mMap) {
    return;
  }

  if (!activeLocationMarker) {
    activeLocationMarker = new google.maps.Marker({
      map: mMap,
      position,
      title,
      icon: {
        ...LOCATION_MARKER_ICON,
        scaledSize: new google.maps.Size(36, 36),
        anchor: new google.maps.Point(18, 36),
      },
      optimized: true,
    });
    return;
  }

  activeLocationMarker.setPosition(position);
  activeLocationMarker.setTitle(title);
};

const isValidLocation = (location) => {
  return !!location && Number.isFinite(location.lat) && Number.isFinite(location.lng);
};

const applyStoredLocation = (location) => {
  if (!isValidLocation(location)) {
    return;
  }

  if (placeSearchRequest) {
    placeSearchRequest.locationBias = location;
  } else {
    pendingPlaceSearchBias = location;
  }

  if (!mMap) {
    pendingSavedLocation = location;
    return;
  }

  mMap.panTo(location);
  mMap.setZoom(11);
  updateLocationMarker(location, 'Saved location');
};

const getLatLngFromPlaceLocation = (location) => {
  if (!location) {
    return null;
  }

  const lat = typeof location.lat === 'function' ? location.lat() : location.lat;
  const lng = typeof location.lng === 'function' ? location.lng() : location.lng;

  if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
    return null;
  }

  return { lat, lng };
};

const loadUserHomeState = async () => {
  try {
    const user = await ensureAuthenticatedUser();
    const userRef = doc(db, 'users', user.uid);
    const userSnap = await getDoc(userRef);

    if (!userSnap.exists()) {
      await setDoc(
        userRef,
        {
          isAnonymous: user.isAnonymous,
          disclaimerAcknowledged: false,
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        },
        { merge: true },
      );
      return;
    }

    const userData = userSnap.data();

    if (userData.isAnonymous !== user.isAnonymous) {
      await setDoc(
        userRef,
        {
          isAnonymous: user.isAnonymous,
          updatedAt: serverTimestamp(),
        },
        { merge: true },
      );
    }

    if (userData.disclaimerAcknowledged) {
      const disclaimer = document.getElementById('homeDisclaimerAlert');
      if (disclaimer) {
        disclaimer.remove();
      }
    }

    applyStoredLocation(userData.location);
  } catch (error) {
    console.error('Unable to load user home state:', error);
    safeLogEvent('home_state_load_error', { message: error.message || 'unknown' });
  }
};

const createMyLocationControl = () => {
  const controlCard = document.createElement('div');
  controlCard.style.backgroundColor = 'white';
  controlCard.style.borderRadius = '6px';
  controlCard.style.boxShadow = '0 2px 6px rgba(0, 0, 0, 0.3)';
  controlCard.style.margin = '10px';

  const button = document.createElement('button');
  button.type = 'button';
  button.style.border = 'none';
  button.style.background = 'transparent';
  button.style.padding = '10px 12px';
  button.style.cursor = 'pointer';
  button.style.fontWeight = '600';
  button.style.fontSize = '14px';

  const setLocationButtonIdleState = () => {
    button.innerHTML = [
      '<svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">',
      '<circle cx="12" cy="12" r="3"></circle>',
      '<line x1="12" y1="2" x2="12" y2="5"></line>',
      '<line x1="12" y1="19" x2="12" y2="22"></line>',
      '<line x1="2" y1="12" x2="5" y2="12"></line>',
      '<line x1="19" y1="12" x2="22" y2="12"></line>',
      '</svg>',
    ].join('');
    button.setAttribute('aria-label', 'Use my location');
    button.title = 'Use My Location';
  };

  setLocationButtonIdleState();

  button.addEventListener('click', () => {
    if (!navigator.geolocation) {
      alert('Geolocation is not supported by this browser.');
      return;
    }

    button.disabled = true;
    button.textContent = 'Locating...';

    navigator.geolocation.getCurrentPosition(
      async (pos) => {
        const userPosition = {
          lat: pos.coords.latitude,
          lng: pos.coords.longitude,
        };

        mMap.panTo(userPosition);
        mMap.setZoom(13);
        updateLocationMarker(userPosition, 'Your location');

        try {
          await updateUserLocationRecord(userPosition);
        } catch (error) {
          console.error('Unable to update user location record:', error);
          safeLogEvent('home_location_firestore_error', { message: error.message || 'unknown' });
        }

        safeLogEvent('home_location_found');
        button.disabled = false;
        setLocationButtonIdleState();
      },
      (error) => {
        console.error('Unable to retrieve location:', error);
        safeLogEvent('home_location_error', { code: error.code });
        alert('Unable to get your location. Please allow location access and try again.');
        button.disabled = false;
        setLocationButtonIdleState();
      },
      {
        enableHighAccuracy: true,
        timeout: 10000,
      },
    );
  });

  controlCard.appendChild(button);
  return controlCard;
};

const createPlaceSearchControl = () => {
  const controlCard = document.createElement('div');
  controlCard.style.backgroundColor = 'white';
  controlCard.style.borderRadius = '8px';
  controlCard.style.boxShadow = '0 2px 6px rgba(0, 0, 0, 0.3)';
  controlCard.style.margin = '10px';
  controlCard.style.padding = '10px';
  controlCard.style.maxWidth = '340px';
  controlCard.style.minWidth = '280px';

  const searchRow = document.createElement('div');
  searchRow.style.display = 'flex';
  searchRow.style.gap = '8px';
  searchRow.style.marginBottom = '8px';

  const queryInput = document.createElement('input');
  queryInput.type = 'text';
  queryInput.placeholder = 'Search nearby places';
  queryInput.value = 'cafe';
  queryInput.className = 'form-control form-control-sm';
  queryInput.setAttribute('aria-label', 'Search for a place');

  const searchButton = document.createElement('button');
  searchButton.type = 'button';
  searchButton.className = 'btn btn-sm btn-primary';
  searchButton.textContent = 'Search';

  searchRow.appendChild(queryInput);
  searchRow.appendChild(searchButton);

  const placeSearch = document.createElement('gmp-place-search');
  placeSearch.setAttribute('selectable', '');
  placeSearch.style.display = 'block';
  placeSearch.style.maxHeight = '160px';
  placeSearch.style.overflow = 'auto';

  const placeAllContent = document.createElement('gmp-place-all-content');
  const placeSearchQuery = document.createElement('gmp-place-text-search-request');
  placeSearchQuery.setAttribute('max-result-count', '5');
  placeSearchRequest = placeSearchQuery;

  if (pendingPlaceSearchBias) {
    placeSearchQuery.locationBias = pendingPlaceSearchBias;
    pendingPlaceSearchBias = undefined;
  }

  placeSearch.appendChild(placeAllContent);
  placeSearch.appendChild(placeSearchQuery);

  const runPlaceSearch = () => {
    const queryText = queryInput.value.trim();
    if (!queryText) {
      return;
    }

    const center = mMap?.getCenter();
    if (center) {
      placeSearchQuery.locationBias = center;
    }

    placeSearchQuery.textQuery = queryText;
    safeLogEvent('home_place_search', { query: queryText });
  };

  searchButton.addEventListener('click', runPlaceSearch);
  queryInput.addEventListener('keydown', (event) => {
    if (event.key === 'Enter') {
      event.preventDefault();
      runPlaceSearch();
    }
  });

  placeSearch.addEventListener('gmp-select', async (event) => {
    const place = event.place || event.detail?.place;
    if (!place) {
      return;
    }

    if (!place.location && typeof place.fetchFields === 'function') {
      await place.fetchFields({ fields: ['displayName', 'location'] });
    }

    const selectedPosition = getLatLngFromPlaceLocation(place.location);
    if (!selectedPosition) {
      return;
    }

    mMap.panTo(selectedPosition);
    mMap.setZoom(13);
    updateLocationMarker(selectedPosition, place.displayName || 'Selected place');
    safeLogEvent('home_place_selected', { place_id: place.id || 'unknown' });
  });

  controlCard.appendChild(searchRow);
  controlCard.appendChild(placeSearch);

  // Start with a default search so the list is populated when the control first loads.
  setTimeout(runPlaceSearch, 0);

  return controlCard;
};

async function init() {
    const now = new Date();
    const timeZoneOffset = 0 - now.getTimezoneOffset();
    console.log(timeZoneOffset);

    const position = { lat: 0, lng: timeZoneOffset / 4 };

    const { Map } = await google.maps.importLibrary("maps");
    await google.maps.importLibrary("places");
    await google.maps.importLibrary('marker');


    const mapDiv = document.getElementById("map");
    mMap = new Map(mapDiv, {
      fullscreenControl: false,
      streetViewControl: false,
      zoom: 4,
      minZoom: 3,
      center: position,
      disableDefaultUI: true,
      // mapId: "f7ac6bc39654da75",
      mapId: "22ced260f7a4722d",
    });

    const myLocationControl = createMyLocationControl();
    mMap.controls[google.maps.ControlPosition.RIGHT_TOP].push(myLocationControl);

    //const placeSearchControl = createPlaceSearchControl();
    //mMap.controls[google.maps.ControlPosition.LEFT_TOP].push(placeSearchControl);

    if (pendingSavedLocation) {
      const location = pendingSavedLocation;
      pendingSavedLocation = undefined;
      applyStoredLocation(location);
    }

    initializeProductPriceMarkers();
}


window.addEventListener('DOMContentLoaded', () => {
  addDisclaimerAlert();
  loadUserHomeState();

  const getStartedBtn = document.getElementById('getStartedBtn');
  const signInLink = document.getElementById('signInLink');
  const contactLink = document.getElementById('contactLink');
  const brandLink = document.getElementById('brandLink');

  if (getStartedBtn) {
    getStartedBtn.addEventListener('click', (event) => {
      event.preventDefault();
      navigate('onboard.html', 'home_get_started');
    });
  }

  if (signInLink) {
    signInLink.addEventListener('click', (event) => {
      event.preventDefault();
      navigate('auth.html', 'home_sign_in');
    });
  }

  if (contactLink) {
    contactLink.addEventListener('click', (event) => {
      event.preventDefault();
      navigate('contact.html', 'home_contact');
    });
  }

  if (brandLink) {
    brandLink.addEventListener('click', (event) => {
      event.preventDefault();
      navigate('index.html', 'home_brand_click');
    });
  }

  safeLogEvent('page_view', { page_location: 'home' });
    init();
});
