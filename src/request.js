let routeStops = [];

let dateTimeInput;
let nowCheckbox;
let routeList;
let routeData;
let locationInput;

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

  const autocomplete = new google.maps.places.Autocomplete(locationInput, {
    fields: ['formatted_address', 'geometry', 'name'],
  });

  autocomplete.addListener('place_changed', () => {
    const place = autocomplete.getPlace();
    if (!place?.geometry?.location) {
      return;
    }

    const lat = place.geometry.location.lat();
    const lng = place.geometry.location.lng();
    const label = place.name || 'Selected location';
    const address = place.formatted_address || `${lat.toFixed(6)}, ${lng.toFixed(6)}`;

    addRouteStop({
      source: 'autocomplete',
      label,
      address,
      lat,
      lng,
    });

    locationInput.value = '';
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

function setupFormSubmission() {
  const form = document.getElementById('ride-request-form');
  const summary = document.getElementById('submit-summary');

  form.addEventListener('submit', (event) => {
    event.preventDefault();

    if (!form.checkValidity()) {
      form.classList.add('was-validated');
      return;
    }

    const schedule = nowCheckbox.checked
      ? 'Now'
      : new Date(dateTimeInput.value).toLocaleString();

    summary.textContent = `Ride request ready: ${schedule} with ${routeStops.length} stop(s).`;
    summary.classList.remove('d-none');
  });
}

async function init() {
  dateTimeInput = document.getElementById('ride-datetime');
  nowCheckbox = document.getElementById('ride-now');
  routeList = document.getElementById('route-list');
  routeData = document.getElementById('route-data');
  locationInput = document.getElementById('autocomplete-location');

  setupDateTimeInput();
  setupMyLocationButton();
  setupFormSubmission();

  await google.maps.importLibrary('places');
  setupAutocomplete();
  renderRouteList();
}

document.addEventListener('DOMContentLoaded', () => {
  init().catch((error) => {
    console.error('Failed to initialize request form:', error);
    alert('Unable to initialize Google Maps autocomplete on this page.');
  });
});
