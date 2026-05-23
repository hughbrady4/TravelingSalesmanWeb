import { initializeApp } from "firebase/app";
import { getAuth, onAuthStateChanged, signInAnonymously } from "firebase/auth";
import { getFirestore, serverTimestamp, collection, addDoc, query, where, onSnapshot, doc, setDoc } from "firebase/firestore";
const { Place } = await google.maps.importLibrary("places");
const { AdvancedMarkerElement, PinElement } = await google.maps.importLibrary("marker");
const {LatLngBounds} = await google.maps.importLibrary("core")

const labels = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";


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
const DRIVER_MARKERS = new Map();
let map;


onAuthStateChanged(auth, user => {
    if (user != null) {
        console.log(user);
        getRequests(user);
    } else {
        console.log("No user!");
    }
});

async function getUserLocation() {

    if (navigator.geolocation) {
        
        navigator.geolocation.getCurrentPosition(async (position) => {

            const lat = position.coords.latitude;
            const lng = position.coords.longitude;

            if (lat && lng) {

                if (auth.currentUser == null) {
                    await signInAnonymously(auth);
                }

                //update firestore user data
                updateLocation(position);    

                //reverse geocode to get address
                const geocoder = new google.maps.Geocoder();
                const pos = new google.maps.LatLng(lat, lng);

                geocoder.geocode({ location: pos }).then((response) => {
                    if (response.results[0]) {
                        // map.setZoom(11);
                        const address = response.results[0].formatted_address;
                        $("#btn-add-to-route").data("address", address);
                        $("#modal-address").html(address);

                        // infowindow.setContent(address);
                        // infowindow.open(mMap, marker);
                        // INFO_MARKERS.set(label, infowindow);
                    } else {
                        window.alert("No street address results found");
                    }
                }).catch((e) => window.alert("Geocoder failed due to: " + e));

                //add postion to confirmation dialog and display
                $("#btn-add-to-route").data("position", pos);
                $('#routeControl').modal('show');
          
        } 

        }, (error) => {
        window.alert("Failed to get location due to: " + error.message)
        console.log(error.message);
        });

    } //end geo location
}

async function updateLocation(position) {

    const user = auth.currentUser;
    if (user != null) {

        const userRef = doc(firestore, "users", user.uid);

        await setDoc(userRef, {
        latitude: position.coords.latitude,
        longitude: position.coords.longitude,
        accuracy: position.coords.accuracy,
        positionTS: serverTimestamp(),
        }, { merge: true });
    }
}


async function addToRoute(button) {

    let labelIndex = $("#req-node-list").children().length;
    let label = labels[labelIndex % labels.length];

    //get node info from button
    const latLng = $(button).data("position");
    const address = $(button).data("address");

    const newNode = document.createElement("li");
    newNode.textContent = address;
    newNode.classList.add("list-group-item");
    $("#req-node-list").append(newNode);

    //save node to firestore under user collection for easy retrieval when building route
    const user = auth.currentUser;
    if (user != null) {

        const nodeRef = doc(firestore, "users", user.uid, "nodes", label);

        await setDoc(nodeRef, {
            address: address,
            latitude: latLng.lat(),
            longitude: latLng.lng(),
        });
    }

  
}

function clearRouteNodes() {
    $("#req-node-list").empty();


}

//build request record and save to firestore, then open request details page
//not currently validating that nodes are properly saved to firestore, but will add in future update
//not currently called
async function requestRide() {


    // const phoneNumber = document.getElementById("input-telephone");

    // if (phoneNumber.value === "") {
    //     toastMessage("Please include a phone number to request.");
    //     return;

    // }

    const orderedList = document.getElementById('req-node-list'); 
    const listItems = orderedList.children; 


    if (listItems.length < 2) {
        toastMessage("Please add a minimum of two locations to request.");
        return;
    }

    if (auth.currentUser == null) {
        await signInAnonymously(auth);
    }


    const requestRec = {
        user: auth.currentUser.uid,
        // userPhone: phoneNumber.value,
        requestTS: serverTimestamp(),
        status: "new",
        numNodes: listItems.length,

    };
        
    for (let i = 0; i < listItems.length; i++) {
        let label = labels[i % labels.length];
        
        const listItem = listItems[i];
        const itemText = listItem.textContent; // Get the text content of the list item
        requestRec[label] = itemText;
    }        

    // Add a new document with a generated id.
    const requestRef = await addDoc(collection(firestore, "requests"), requestRec);

    const baseUrl = window.location.href;
    const requestId = requestRef.id;

    const requestUrl = new URL("request.html", baseUrl);
    requestUrl.searchParams.append("id", requestId);
    window.open(requestUrl.href, '_blank');


}

function toastMessage(message) {
    document.getElementById('toast-body').innerHTML = message;
    const toast = bootstrap.Toast.getOrCreateInstance(document.getElementById('toast'));
    toast.show();

}


function signIn() {}

function signOut() {}

function getRequests(user) {

    const q = query(collection(firestore, "requests"), 
        where("user", "==", user.uid), where("status", "not-in", ["completed", "closed", "canceled"]));
    const unsubscribe = onSnapshot(q, (querySnapshot) => {

       querySnapshot.docChanges().forEach((change) => {
            const source = change.doc.metadata.hasPendingWrites ? "Local" : "Server";

            if (change.type === "added") {
                console.log(source, "New request: ", change.doc.data());
                const baseUrl = window.location.href;
                const requestId = change.doc.id;

                const requestUrl = new URL("request.html", baseUrl);
                requestUrl.searchParams.append("id", requestId);

                perpendAlert("request-alert", `You have existing request. Click <a href="${requestUrl.href}" class="alert-link">here</a> to review.`, "warning");

            }
            if (change.type === "modified") {
                console.log(source, "Modified request: ", change.doc.data());
            }
            if (change.type === "removed") {
                console.log(source, "Removed request: ", change.doc.data());
            }
        });


        // querySnapshot.forEach((doc) => {
        //     const source = doc.metadata.hasPendingWrites ? "Local" : "Server";
        //     console.log(source, " data: ", doc.data());
        //     const baseUrl = window.location.href;
        //     const requestId = doc.id;

        //     const requestUrl = new URL("request.html", baseUrl);
        //     requestUrl.searchParams.append("id", requestId);
        //     window.open(requestUrl.href, '_blank');
        // });
            
    });

}

async function getDrivers() {
        

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
          
        //   const pinScaled = new PinElement({
        //     background: '#FFFFFF',
        //     scale: 1.2,
        //     // glyph: carImg,
        //   });

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
        //   // bounds.extend(pos);
          marker.gmpClickable = true;
          marker.addListener("click", (event) => {
            console.log(event);
            // $('#btn-request-now').data("driverId", change.doc.id);
            // $('#btn-request-now').data("token", change.doc.data().token);   
            // $('#requestModal').modal('show');
            toggleHighlight(marker, driverData);

          });



          DRIVER_MARKERS.set(driverId, marker);


        }
        // showAlerts();


      }

      if (change.type === "modified") {
        console.log("Modified driver: ", change.doc.data());
        const marker = DRIVER_MARKERS.get(driverId);

        if (change.doc.data().latitude && change.doc.data().longitude) {
          const pos = { lat: change.doc.data().latitude, lng: change.doc.data().longitude };
          marker.position = pos;
        }
    //     if (change.doc.data().updated != null) {
    //       const updatedDate = change.doc.data().updated;
    //       let titleText = "Driver is online";
    //       if (change.doc.data().name != null) {
    //         titleText = change.doc.data().name + " is online at " + updatedDate.toDate();
    //         marker.setTitle = titleText;
    //     }
    //   }
    }
      
      if (change.type === "removed") {
        console.log("Removed driver: ", change.doc.data());
        const marker = DRIVER_MARKERS.get(driverId);
        DRIVER_MARKERS.delete(driverId);
        marker.setMap(null);
        // showAlerts();
      }

      
    });


    showAlerts();

    let bounds = map.getBounds();
    
    //fit map to markers
    for (const [id, marker] of DRIVER_MARKERS) {
        console.log(`${id} = ${marker}`);
        if (bounds != null && bounds.contains(marker.position) == false) {
            bounds.extend(marker.position);
            map.fitBounds(bounds);
        }
    }

  });

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


function showAlerts(){
    if (DRIVER_MARKERS.size == 0) {
        const element = document.querySelector('#driver-alert-none');
        if (element == null) {
            perpendAlert("driver-alert-none", "Sorry, no drivers are currently online.", "warning");
        }        
        $('#driver-alert-online').remove();

    } else {
        const element = document.querySelector('#driver-alert-online');
        if (element == null) {
            perpendAlert("driver-alert-online", `Good news, drivers online. Click <a data-bs-toggle="offcanvas" href="#offcanvasBottom" role="button" aria-controls="offcanvasBottom" class="alert-link">here</a> for current location.`, "success");
        }
        $('#driver-alert-none').remove();

    }
    
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

const alertPlaceholder = document.getElementById('alertPlaceholder');
const parentElement = document.getElementById('main-container');

const perpendAlert = (id, message, type) => {
  

  const wrapper = document.createElement('div');
  wrapper.innerHTML = [
    `<div id="${id}" class="alert alert-${type} alert-dismissible fade show" role="alert">`,
    `  <div>${message}</div>`,
    `  <button type="button" class="btn-close" data-bs-dismiss="alert" aria-label="Close"></button>`,
    `</div>`
  ].join('');
  parentElement.prepend(wrapper);
};


async function init() {

    const position = { lat: 39.97104933291905, lng: -74.25190468397426 };
    const { Map } = await google.maps.importLibrary("maps");

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

    // const btnLocation = document.getElementById('btn-location');
    // const btnRequest = document.getElementById('btn-request');
    // map.controls[google.maps.ControlPosition.RIGHT_TOP].push(btnLocation);
    // map.controls[google.maps.ControlPosition.RIGHT_TOP].push(btnRequest);

    getDrivers();

}

function requestHistory() {
    const baseUrl = window.location.href;
    // const requestId = change.doc.id;

    const requestUrl = new URL("request.history.html", baseUrl);
    // requestUrl.searchParams.append("id", requestId);
    window.open(requestUrl.href, '_blank');
}

window.signIn = signIn;
window.signOut = signOut;
window.getUserLocation = getUserLocation;
window.addToRoute = addToRoute;
window.clearRouteNodes = clearRouteNodes;
window.requestRide = requestRide;
window.requestHistory = requestHistory;


const placeAutocomplete = new google.maps.places.PlaceAutocompleteElement();

// Add the gmp-placeselect listener
placeAutocomplete.addEventListener('gmp-select', async ({ placePrediction }) => {
    const place = placePrediction.toPlace();
    await place.fetchFields({ fields: ['displayName', 'formattedAddress', 'location'] });
    $("#btn-add-to-route").data("address", place.formattedAddress);
    $("#modal-address").html(place.formattedAddress);
    $("#btn-add-to-route").data("position", place.location);
    $('#routeControl').modal('show');


});

const textInputCard = document.getElementById('text-input-card');
textInputCard.appendChild(placeAutocomplete);


const myOffcanvas = document.getElementById('offcanvasBottom')
myOffcanvas.addEventListener('shown.bs.offcanvas', event => {
    // init();

});

init();


