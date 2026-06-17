import { initializeApp } from 'firebase/app';
import { getAnalytics, logEvent } from 'firebase/analytics';

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

let mMap;
async function init() {
    const now = new Date();
    const timeZoneOffset = 0 - now.getTimezoneOffset();
    console.log(timeZoneOffset);

    const position = { lat: 0, lng: timeZoneOffset / 4 };

    const { Map } = await google.maps.importLibrary("maps");
    const { Place } = await google.maps.importLibrary("places");


    const mapDiv = document.getElementById("map");
    mMap = new Map(mapDiv, {
      fullscreenControl: false,
      streetViewControl: true,
      zoom: 4,
      minZoom: 3,
      center: position,
      disableDefaultUI: true,
      // mapId: "f7ac6bc39654da75",
      mapId: "22ced260f7a4722d",
    });

    const northPoleLat = 90.0;
    const southPoleLat = -90.0;


    const placeAutocomplete = new google.maps.places.PlaceAutocompleteElement();

    // Add the gmp-placeselect listener
    placeAutocomplete.addEventListener('gmp-select', async ({ placePrediction }) => {
        const place = placePrediction.toPlace();
        await place.fetchFields({ fields: ['displayName', 'formattedAddress', 'location'] });
        console.log(place);


        const lat = place.location.lat();
        const lng = place.location.lng();
        
        mMap.panTo({ lat: lat,  lng: lng });
        mMap.setZoom(11);

    });

    const textInputCard = document.createElement("div");
    textInputCard.id = "text-input-card";
    textInputCard.style.backgroundColor = "white";
    textInputCard.style.padding = "10px";
    textInputCard.style.borderRadius = "5px";
    textInputCard.style.boxShadow = "0 2px 6px rgba(0, 0, 0, 0.3)";   
    textInputCard.appendChild(placeAutocomplete);

    textInputCard.setAttribute("slot", "control-inline-start-block-start");
    if (mapDiv) {
        mapDiv.appendChild(textInputCard);
    }
}


window.addEventListener('DOMContentLoaded', () => {
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
