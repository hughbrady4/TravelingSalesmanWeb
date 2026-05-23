import { initializeApp } from "firebase/app";
import { getAuth, onAuthStateChanged, signInAnonymously } from "firebase/auth";
import { getFirestore, serverTimestamp, collection, getDoc, setDoc, addDoc, query, where, onSnapshot, doc } from "firebase/firestore";
const { Place } = await google.maps.importLibrary("places");
const { AdvancedMarkerElement, PinElement } = await google.maps.importLibrary("marker");
const { Route } = await google.maps.importLibrary('routes');
 import { getFunctions } from 'firebase/functions';




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
const firestore = getFirestore(app);

async function init() {

    const position = { lat: 39.97104933291905, lng: -74.25190468397426 };

    const { Map } = await google.maps.importLibrary("maps");

// The map, centered at Uluru
    map = new Map(document.getElementById("mapDiv"), {
        fullscreenControl: false,
        streetViewControl: true,
        zoom: 14,
        minZoom: 3,
        center: position,
        disableDefaultUI: false,
        mapId: "13569eb50ca88bbf",
        disableDefaultUI: true,
        streetViewControl: false,
        zoomControl: true,
    });

    const card = document.getElementById('request-card');
    map.controls[google.maps.ControlPosition.TOP_LEFT].push(card);

    const payButton = document.getElementById('pay-button');

    payButton.addEventListener("click", () => {
        pay();
        
        // window.open("https://buy.stripe.com/4gM8wP1RD1pab500xS3cc02");

    });

    getRequestData();

}

async function getRequestData() {

    const params = getQueryParameters(window.location.href);
    if ('id' in params) {
        console.log(params);
        mRequestId = params.id;

    } else {
        toastMessage("Missing id in query parameter.");
        return;
    }

    const docRef = doc(firestore, "requests", mRequestId);
    const docSnap = await getDoc(docRef);

    if (docSnap.exists()) {
        const data = docSnap.data();
        console.log("Request data: ", data);

        if ("A" in data && "B" in data) {
            routeRequest(data.A, data.B);
        }

        if ("A" in data) {
          getDriverInfo();
        }

        if ("price" in data) {
          updateButtonPrice(data.price);
        }

        



    } else {
      // docSnap.data() will be undefined in this case
      console.log("No such document!");
    }

    // const unsub = onSnapshot(doc(firestore, "requests", mRequestId), (snapshot) => {
    //     const data = snapshot.data();
    //     console.log("Current data: ", data);

    //     if ("A" in data && "B" in data) {
    //         routeRequest(data.A, data.B);
    //     }


    // });
}

async function routeRequest(origin, destination) {

    // Import the Routes library.

    console.log(origin);

    // Define a computeRoutes request.
    const request = {
    origin: origin,
    destination: destination,
    travelMode: 'DRIVING',
    fields: ['path', 'description', 'distanceMeters', 'durationMillis', 'viewport'], // Request fields needed to draw polylines.
    };

    // Call the computeRoutes() method to get routes.
    const {routes} = await Route.computeRoutes(request);


    // Call createPolylines to create polylines for the first route.
    const mapPolylines = routes[0].createPolylines();
    markers = await routes[0].createWaypointAdvancedMarkers({map: map});
    console.log(markers);
    // Add polylines to the map.
    mapPolylines.forEach((polyline) => polyline.setMap(map));
    map.fitBounds(routes[0].viewport);

    const distance = (routes[0].distanceMeters / 1000) * 0.621371;
    const duration = (routes[0].durationMillis / 1000) / 60;

    document.getElementById("request-distance").innerHTML = 
      "Trip distance: " + distance.toFixed(1) + " miles";
    document.getElementById("request-time").innerHTML = 
      "Trip duration: " + duration.toFixed(1) + " minutes";

    setTripDistanceTime(distance, duration);
    console.log(distance + ", " + duration);

    buildPickupRoutes();

}

onAuthStateChanged(auth, user => {
    if (user != null) {
        console.log(user);
    } else {
        console.log("No user!");
    }
});

async function getDriverInfo() {
        
  // const { AdvancedMarkerElement, PinElement } = await google.maps.importLibrary("marker");

  const driverQuery = query(collection(firestore, "drivers"), where("isOnline", "==", true));
  const unsubscribe = onSnapshot(driverQuery, (snapshot) => {
    // const bounds = mMap.getBounds();

    snapshot.docChanges().forEach((change) => {
      const driverId = change.doc.id;
      console.log(driverId);
      if (change.type === "added") {
        console.log("New driver: ", change.doc.data());

        if (change.doc.data().latitude && change.doc.data().longitude) {
          const pos = { lat: change.doc.data().latitude, lng: change.doc.data().longitude };
          const driverData = change.doc.data();
          
          const pinScaled = new PinElement({
            background: '#FFFFFF',
            scale: 1.2,
            // glyph: carImg,
          });

          let titleText = "Driver is online";
          if (change.doc.data().updated != null) {
            const updatedDate = change.doc.data().updated;
            if (change.doc.data().name != null) {
              titleText = change.doc.data().name + " is online at " + updatedDate.toDate();
            }
          }

          // Create a marker for each place.
          const marker = new AdvancedMarkerElement({
            map: map,
            position: pos,
            content: buildContent(driverData),
            title: titleText,
            gmpClickable: true,

          });
          // bounds.extend(pos);
          marker.gmpClickable = true;
          marker.addListener("click", (event) => {
            console.log(event);
            $('#btn-request-now').data("driverId", change.doc.id);
            $('#btn-request-now').data("token", change.doc.data().token);   
            $('#requestModal').modal('show');
            toggleHighlight(marker, driverData);

          });



          DRIVER_MARKERS.set(driverId, marker);

          const bounds = map.getBounds().extend(pos);
          map.fitBounds(bounds);
        }


      }

      if (change.type === "modified") {
        console.log("Modified driver: ", change.doc.data());
        const marker = DRIVER_MARKERS.get(driverId);
        console.log(marker);

        if (change.doc.data().latitude && change.doc.data().longitude) {
          const pos = { lat: change.doc.data().latitude, lng: change.doc.data().longitude };
          marker.position = pos;
        }
        if (change.doc.data().updated != null) {
          const updatedDate = change.doc.data().updated;
          let titleText = "Driver is online";
          if (change.doc.data().name != null) {
            titleText = change.doc.data().name + " is online at " + updatedDate.toDate();
            marker.setTitle = titleText;
        }
      }
    }
      
      if (change.type === "removed") {
        console.log("Removed driver: ", change.doc.data());
        const marker = DRIVER_MARKERS.get(driverId);
        DRIVER_MARKERS.delete(driverId);
        marker.setMap(null);
      }

      
    });

    if (DRIVER_MARKERS.size == 0) {
      $('#driver-alert').alert();
    } else {
      $('#driver-alert').alert('close');

      
      buildPickupRoutes();

    }


  });

}


function buildContent(driver) {
    const content = document.createElement("div");
    content.classList.add("driver");
    const date = driver.updated.toDate();


    // Format for a specific locale (e.g., en-GB) with desired options
    const formattedDate = date.toLocaleString('en-GB', {
      weekday: 'long',
      year: 'numeric',
      month: 'long',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });

    content.innerHTML = `
    <div class="icon">
        <i aria-hidden="true" class="fa fa-icon fa-${driver.type}" title="${driver.name}"></i>
        <span class="fa-sr-only">${driver.type}</span>
    </div>
    <div class="details">
        <div class="name">${driver.name}</div>
        <div class="phone">${driver.driverPhone}</div>

        <div class="updated">${formattedDate}</div>
        <div class="features">

        </div>
    </div>
    `;
    return content;
}

function toggleHighlight(markerView, driver) {
    if (markerView.content.classList.contains("highlight")) {
        markerView.content.classList.remove("highlight");
        markerView.zIndex = null;
    }
    else {
        markerView.content.classList.add("highlight");
        markerView.zIndex = 1;
    }
}

async function buildPickupRoutes() {

  if(markers == undefined) {
    console.log("No pickup location yet");
    return;
  }

  const pickup = markers[0];

  for (const driverMarker of DRIVER_MARKERS) {
    console.log(driverMarker[1]);

    const origin = driverMarker[1].position;
    const destination = pickup.position;

    // Define a computeRoutes request.
    const request = {
      origin: origin,
      destination: destination,
      travelMode: 'DRIVING',
      fields: ['path', 'description', 'distanceMeters', 'durationMillis'], // Request fields needed to draw polylines.
    };

    // Call the computeRoutes() method to get routes.
    const {routes} = await Route.computeRoutes(request);

    console.log(routes[0].toJSON());

    if (mMapPolylines != null) {
      mMapPolylines.forEach((polyline) => polyline.setMap(null));
    }
    // Call createPolylines to create polylines for the first route.
    mMapPolylines = routes[0].createPolylines();
    // Add polylines to the map.
    mMapPolylines.forEach((polyline) => polyline.setMap(map));

    const distance = (routes[0].distanceMeters / 1000) * 0.621371;
    const duration = (routes[0].durationMillis / 1000) / 60;

    document.getElementById("pickup-distance").innerHTML = 
      "Pickup distance: " + distance.toFixed(1) + " miles";
    document.getElementById("pickup-time").innerHTML = 
      "Pickup duration: " + duration.toFixed(1) + " minutes";


    console.log(distance + ", " + duration);

    setPickupDistanceTime(distance, duration);
  
  }

}

function toastMessage(message) {
    document.getElementById('toast-body').innerHTML = message;
    const toast = bootstrap.Toast.getOrCreateInstance(document.getElementById('toast'));
    toast.show();

}

function getQueryParameters(url) {
    // Create a temporary anchor element to parse the URL
    var anchor = document.createElement('a');
    anchor.href = url;

    // Split the query string by '&' and then by '=' to get key-value pairs
    var params = {};
    anchor.search.slice(1).split('&').forEach(function(part) {
        var item = part.split('=');
        // Decode URI components to handle special characters
        params[decodeURIComponent(item[0])] = decodeURIComponent(item[1] || '');
    });

    return params;
}


function signIn() {}

function signOut() {}


async function cancelRequest() {
    
  const requestRef = doc(firestore, "requests", mRequestId);

  await setDoc(requestRef, {
    status: "canceled",
    statusDescription: "User canceled request.",
    updatedTS: serverTimestamp(),
  }, { merge: true });

}

async function setTripDistanceTime(distance, time) {
  
  const requestRef = doc(firestore, "requests", mRequestId);

  await setDoc(requestRef, {
    tripDistance: distance,
    tripDuration: time,
    updatedTS: serverTimestamp(),
  }, { merge: true });

}

async function setPickupDistanceTime(distance, time) {
  
  const requestRef = doc(firestore, "requests", mRequestId);

  await setDoc(requestRef, {
    pickupDistance: distance,
    pickupDuration: time,
    updatedTS: serverTimestamp(),
  }, { merge: true });

}

async function pay(params) {


  
}

// Function to update the button text with a specific price
function updateButtonPrice(amount) {
  const button = document.getElementById("pay-button");
  if (button) {
    // Format the amount as currency (e.g., "$50.00")
    const formattedAmount = new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
    }).format(amount);

    button.textContent = `Pay (${formattedAmount})`;
  }
}


window.signIn = signIn;
window.signOut = signOut;
window.cancelRequest = cancelRequest;
init();

