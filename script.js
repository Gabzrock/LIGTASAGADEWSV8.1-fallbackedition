// --- 1. Global Error Handling & Utilities ---

// Enhanced Error Display
function showError(message, type = 'error') {
    const errDiv = document.getElementById('errorOverride');
    const errMsg = document.getElementById('errorMessage');
    
    if (errDiv && errMsg) {
        errMsg.innerHTML = `<strong>${type === 'error' ? 'System Error' : 'Notice'}:</strong> ${message}`;
        errDiv.className = type; 
        errDiv.style.display = 'block';
        
        if (type === 'warning') {
            setTimeout(() => { errDiv.style.display = 'none'; }, 5000);
        }
    }
    console.error(`[${type.toUpperCase()}] ${message}`);
}

function safeExecute(fn, contextName) {
    try {
        fn();
    } catch (error) {
        console.error(`Error in ${contextName}:`, error);
        if (contextName.includes('Map') || contextName.includes('Init')) {
            showError(`Failed to load component: ${contextName}`);
        }
    }
}

function hideLoadingScreen() {
    const loader = document.getElementById('loading-screen');
    if (loader) {
        loader.classList.add('hidden');
        setTimeout(() => { loader.style.display = 'none'; }, 1000);
    }
}

window.addEventListener('offline', () => {
    showError("Internet connection lost. Map data may not load.", 'error');
});

window.addEventListener('online', () => {
    showError("Internet connection restored. Refreshing data...", 'warning');
    setTimeout(() => {
        document.getElementById('errorOverride').style.display = 'none';
        fetchAndRefreshData();
    }, 2000);
});

// PDF Download with Error Handling
window.downloadPopupPDF = function(button) {
    try {
        const container = button.closest('.popup-container');
        if (!container) throw new Error("Popup content not found.");

        const element = container.cloneNode(true);
        const btn = element.querySelector('.pdf-btn');
        if(btn) btn.remove();

        const scrollContainer = element.querySelector('.popup-scroll-container');
        if(scrollContainer) {
            scrollContainer.style.maxHeight = 'none';
            scrollContainer.style.overflow = 'visible';
        }

        const originalBtnText = button.innerText;
        button.innerText = "Generating...";
        button.disabled = true;

        const opt = {
            margin:       10,
            filename:     'RILEWS_Report.pdf',
            image:        { type: 'jpeg', quality: 0.98 },
            html2canvas:  { scale: 2, useCORS: true }, 
            jsPDF:        { unit: 'mm', format: 'a4', orientation: 'portrait' }
        };

        html2pdf().from(element).set(opt).save()
            .then(() => {
                button.innerText = originalBtnText;
                button.disabled = false;
            })
            .catch(err => {
                console.error("PDF Error:", err);
                showError("Failed to generate PDF. Browser may block cross-origin images.", 'warning');
                button.innerText = "Retry PDF";
                button.disabled = false;
            });

    } catch (e) {
        console.error(e);
        showError("Could not initiate PDF download.");
    }
};

// Show Image Modal with Fallback
window.showImage = function(src, alt) {
    if (!src || src.includes('undefined') || src === '') {
        console.warn("Invalid image source clicked");
        return;
    }
    const modal = document.getElementById('imageModal');
    const modalImg = document.getElementById("img01");
    const captionText = document.getElementById("caption");
    
    modalImg.style.display = 'block';
    
    modalImg.onload = function() {
        modal.style.display = "block";
        captionText.innerHTML = alt || "Image View";
    };
    
    modalImg.onerror = function() {
        showError("Failed to load image high-resolution view.", 'warning');
        modal.style.display = "none";
    };

    modalImg.src = src;
}

setTimeout(hideLoadingScreen, 10000); 

// --- 2. UI Logic ---

var cachedAWSData = []; 
var landslideFeatures = []; 

function updateClock() {
    try {
        const now = new Date();
        const dateStr = now.toLocaleDateString('en-PH', { 
            weekday: 'short', year: 'numeric', month: 'short', day: 'numeric' 
        });
        const timeStr = now.toLocaleTimeString('en-PH');
        const el = document.getElementById('real-time');
        if(el) el.textContent = `${dateStr} | ${timeStr}`;
    } catch(e) { console.warn("Clock error", e); }
}
setInterval(updateClock, 1000);
updateClock(); 

function Homebutton() { window.location.href = '';  }
function AWSbutton() { window.location.href = 'https://gabzrock.github.io/LIGTAS-AGADLandslide-Warning-Advisories/'; }

document.getElementById('overrideBtn').onclick = () => { 
    const el = document.getElementById('errorOverride');
    if(el) el.style.display = 'none'; 
};
document.getElementById('retryBtn').onclick = () => { location.reload(); };


function updatePropertiesTable(layerName, properties) {
    const tableBody = document.getElementById('propertiesTableBody');
    if (!tableBody) return;
    
    tableBody.innerHTML = ''; 

    if (!properties || Object.keys(properties).length === 0) {
        tableBody.innerHTML = '<tr><td colspan="3">No properties available.</td></tr>';
        return;
    }

    try {
        for (const [key, value] of Object.entries(properties)) {
            const displayValue = (typeof value === 'object' && value !== null) ? JSON.stringify(value) : value;
            const row = document.createElement('tr');
            row.innerHTML = `<td><strong>${layerName}</strong></td><td>${key}</td><td>${displayValue}</td>`;
            tableBody.appendChild(row);
        }
    } catch (e) {
        console.error("Error updating table", e);
    }
}

// --- 3. Map Initialization ---

const initialCenter = [12.8797, 121.7740];
const initialZoom = 6;
let map;
let baseLayersData = {};

try {
    if (typeof L === 'undefined') throw new Error("Leaflet library not found.");

    map = L.map('map').setView(initialCenter, initialZoom);
    
    baseLayersData = {
        "Streets": L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', { attribution: '© OpenStreetMap' }),
        "Satellite": L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}', { attribution: 'Tiles &copy; Esri' }),
        "Hybrid": L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}', { attribution: 'Tiles &copy; Esri' }),
        "Topo": L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Terrain_Base/MapServer/tile/{z}/{y}/{x}', { attribution: 'Tiles &copy; Esri' })
    };
    baseLayersData["Hybrid"].addTo(map);

    L.control.scale().addTo(map);
    L.control.locate().addTo(map);
    
    L.Control.ResetView = L.Control.extend({
        onAdd: map => {
            const c = L.DomUtil.create('div', 'leaflet-bar leaflet-control leaflet-control-custom');
            c.style.backgroundColor = 'white';
            c.style.width = '30px';
            c.style.height = '30px';
            c.style.cursor = 'pointer';
            c.innerHTML = '<span style="font-size:20px; line-height:30px; display:block; text-align:center;">🏠</span>';
            c.title = "Reset View";
            c.onclick = () => map.setView(initialCenter, initialZoom);
            return c;
        }
    });
    map.addControl(new L.Control.ResetView({ position: 'topleft' }));

} catch (e) {
    console.error("Critical: Map failed to initialize", e);
    showError("Map failed to load. Please check your connection or refresh.", 'error');
}

// --- 4. GeoJSON Layers & Legend Data ---

var overlays = {};
const layerData = [
    { name: 'LIGTAS-LSDB', desc: 'Recorded Landslides', color: 'orange' }, 
    { name: 'MGB-HIGH', desc: 'HIGH Susceptibility', color: 'red' }, 
    { name: 'MGB-MED', desc: 'MED Susceptibility', color: 'yellow' }, 
    { name: 'MGB-LOW', desc: 'LOW Susceptibility', color: 'green' },
    { name: 'LIGTAS AWS', desc: 'Monitoring Station', color: 'white' },
    { name: 'SARAI AWS', desc: 'Monitoring Station', color: 'white' },
    { name: 'ASTI AWS', desc: 'Monitoring Station', color: 'white' },
    { name: 'PAGASA AWS', desc: 'Monitoring Station', color: 'white' },
    { name: 'Yellow buffer', desc: 'Warning Level 1 (20km)', color: 'yellow' },
    { name: 'Orange buffer', desc: 'Warning Level 2 (20km)', color: 'orange' },
    { name: 'Red buffer', desc: 'Warning Level 3 (20km)', color: 'red' }
];

const layerLogos = [
    'https://raw.githubusercontent.com/Gabzrock/LIGTASAGADEWSV3/refs/heads/main/Landslide-icon.png', 
    'https://raw.githubusercontent.com/Gabzrock/LIGTASAGADEWSV3/refs/heads/main/logo3.png', 
    'https://raw.githubusercontent.com/Gabzrock/LIGTASAGADEWSV3/refs/heads/main/logo3.png', 
    'https://raw.githubusercontent.com/Gabzrock/LIGTASAGADEWSV3/refs/heads/main/logo3.png', 
    'https://ligtas.uplb.edu.ph/wp-content/uploads/2022/04/3-e1659971771933.png', 
    'https://ligtas.uplb.edu.ph/wp-content/uploads/2022/02/SARAI.png', 
    'https://ligtas.uplb.edu.ph/wp-content/uploads/2022/10/DOST-ASTI-Logo-RGB-e1722929759841.png',
    'https://raw.githubusercontent.com/Gabzrock/LIGTASkanaba/refs/heads/main/LOGO2.png', 
    'https://raw.githubusercontent.com/Gabzrock/LIGTASAGADEWSV3/refs/heads/main/layer_layers_icon_193964.png',
    'https://raw.githubusercontent.com/Gabzrock/LIGTASAGADEWSV3/refs/heads/main/layer_layers_icon_193964.png',
    'https://raw.githubusercontent.com/Gabzrock/LIGTASAGADEWSV3/refs/heads/main/layer_layers_icon_193964.png'
];

function findNearestStation(latlng) {
    if (!cachedAWSData || cachedAWSData.length === 0) return null;
    let nearest = null;
    let minDist = Infinity;
    
    try {
        cachedAWSData.forEach(station => {
            const lat = parseFloat(station.Latitude);
            const lng = parseFloat(station.Longitude);
            if(isNaN(lat) || isNaN(lng)) return;

            const slatlng = L.latLng(lat, lng);
            const dist = latlng.distanceTo(slatlng);
            if (dist < minDist) {
                minDist = dist;
                nearest = { ...station, distance: (dist / 1000).toFixed(2) }; 
            }
        });
    } catch(e) { console.error("Error finding nearest station", e); }
    return nearest;
}

function getNearbyLandslideCount(latlng, radiusKm = 5) {
    if (!landslideFeatures || landslideFeatures.length === 0) return 0;
    let count = 0;
    
    landslideFeatures.forEach(feature => {
        if (feature.geometry && feature.geometry.type === 'Point') {
            const coords = feature.geometry.coordinates; 
            const lLatLng = L.latLng(coords[1], coords[0]);
            const distance = latlng.distanceTo(lLatLng); 
            if (distance <= (radiusKm * 1000)) {
                count++;
            }
        }
    });
    return count;
}

function generateCombinedReport(layerName, properties, nearestStation, landslideCount) {
    let susContent = '';
    for (const [key, value] of Object.entries(properties)) {
        let displayValue = value;
        if (typeof value === 'string' && (value.startsWith('http') || value.startsWith('www'))) {
             displayValue = `<a href="${value}" target="_blank" style="color:var(--primary-color); text-decoration:none; font-weight:bold;">View Link 🔗</a>`;
        }
        susContent += `<tr><th>${key}</th><td>${displayValue}</td></tr>`;
    }

    let stationContent = '<tr><td colspan="2">No AWS Data Available</td></tr>';
    if (nearestStation) {
        const wLevel = nearestStation.RainfallLandslidethresholdwarninglevel;
        const color = wLevel == 1 ? 'yellow' : (wLevel == 2 ? 'orange' : (wLevel == 3 ? 'red' : 'green'));
        
        stationContent = `
            <tr><th>Nearest Station</th><td>${nearestStation.StationName || nearestStation.Station}</td></tr>
            <tr><th>Distance</th><td>${nearestStation.distance} km</td></tr>
            <tr><th>Warning Level</th><td style="background-color:${color}; font-weight:bold;">Level ${wLevel}</td></tr>
            <tr><th>Rainfall (24h)</th><td>${nearestStation.R24H || nearestStation.Rainfall || '0'} mm</td></tr>
            <tr><th>Rec. Actions</th><td>${nearestStation.Recommendedactions || 'Monitor'}</td></tr>
        `;
    }

    let lsContent = `<tr><th>Nearby Landslides (5km)</th><td><b>${landslideCount}</b> recorded event(s)</td></tr>`;

    return `
        <div class="popup-container">
            <div class="popup-header">Combined Report</div>
            <div class="popup-scroll-container">
                <div class="popup-section-title">1. Susceptibility (${layerName})</div>
                <table class="popup-table">${susContent}</table>
                
                <div class="popup-section-title">2. Weather Status</div>
                <table class="popup-table">${stationContent}</table>
                
                <div class="popup-section-title">3. Historical Context</div>
                <table class="popup-table">${lsContent}</table>
            </div>
            <button class="pdf-btn" onclick="downloadPopupPDF(this)">Download as PDF</button>
        </div>
    `;
}

function createGeoJSONLayer(name, description, geojsonUrl, styleOptions = {}, iconUrl = null) {
    const fullName = `${name}: ${description}`;
    return fetch(geojsonUrl)
        .then(response => {
            if (!response.ok) throw new Error(`HTTP ${response.status}`);
            return response.json();
        })
        .then(data => {
            if (name === 'LIGTAS-LSDB') {
                landslideFeatures = data.features || [];
            }

            const layer = L.geoJSON(data, {
                style: styleOptions,
                pointToLayer: (feature, latlng) => {
                    if (iconUrl) {
                        return L.marker(latlng, {
                            icon: L.icon({
                                iconUrl: iconUrl, iconSize: [24, 24], iconAnchor: [12, 12], popupAnchor: [0, -12]
                            })
                        });
                    } else {
                        return L.circleMarker(latlng, {
                            color: styleOptions.color || 'blue',
                            fillColor: styleOptions.fillColor || styleOptions.color || 'blue',
                            fillOpacity: styleOptions.fillOpacity || 0.8,
                            radius: styleOptions.radius || 6,
                            weight: styleOptions.weight || 1
                        });
                    }
                },
                onEachFeature: (feature, layer) => {
                    let popupRows = '';
                    if (feature.properties) {
                        for (const [key, value] of Object.entries(feature.properties)) {
                            let displayValue = value;
                            if (typeof value === 'string' && (value.startsWith('http') || value.startsWith('https') || value.startsWith('www'))) {
                                displayValue = `<a href="${value}" target="_blank" style="color:blue; text-decoration:underline;">View Link</a>`;
                            }
                            popupRows += `<tr><th>${key}</th><td>${displayValue}</td></tr>`;
                        }
                    }
                    
                    const popupContent = `
                        <div class="popup-container">
                            <div class="popup-header">${name}</div>
                            <div class="popup-scroll-container">
                                <table class="popup-table">${popupRows}</table>
                            </div>
                            <button class="pdf-btn" onclick="downloadPopupPDF(this)">Download as PDF</button>
                        </div>`;
                    
                    layer.bindPopup(popupContent);

                    layer.on('click', (e) => { 
                        updatePropertiesTable(name, feature.properties);
                        if (name.includes('MGB') || name.includes('Susceptibility')) {
                            const nearest = findNearestStation(e.latlng);
                            const lsCount = getNearbyLandslideCount(e.latlng, 5); 
                            const reportContent = generateCombinedReport(name, feature.properties, nearest, lsCount);
                            L.popup().setLatLng(e.latlng).setContent(reportContent).openOn(map);
                        }
                    });
                }
            });
            overlays[fullName] = layer;
            return layer;
        })
        .catch(error => {
            console.error(`Error loading ${name}:`, error);
            return null;
        });
}

// --- UPDATED LAYER DEFINITIONS ---
const layerPromises = [
    createGeoJSONLayer('LIGTAS-LSDB', 'Recorded Landslides', 'https://raw.githubusercontent.com/Gabzrock/LIGTAS-AGAD/refs/heads/main/LandslideDB-web.geojson', { color: 'orange', fillColor: 'orange', fillOpacity: 0.8, radius: 6, weight: 1, className: 'flashing-high'}, null),
    
    // UPDATED: Added className: 'flashing-high' to make this layer flash
    createGeoJSONLayer('MGB-HIGH', 'Susceptibility', 'https://raw.githubusercontent.com/Gabzrock/LIGTASAGADEWSV3/refs/heads/main/uRIL_AWS_High%20Susceptibility.geojson', { color: 'red', fillOpacity: 0.6, className: 'flashing-high' }),
    
    createGeoJSONLayer('MGB-MED', 'Susceptibility', 'https://raw.githubusercontent.com/Gabzrock/LIGTASAGADEWSV3/refs/heads/main/uRIL_AWS_Moderate_Susceptibility.geojson', { color: 'yellow', fillOpacity: 0.6 }),
    createGeoJSONLayer('MGB-LOW', 'Susceptibility', 'https://raw.githubusercontent.com/Gabzrock/LIGTASAGADEWSV3/refs/heads/main/uRIL_AWS_Low_Susceptibility.geojson', { color: 'green', fillOpacity: 0.6 })
];

// --- 5. Controls Initialization ---

const LegendControl = L.Control.extend({
    options: { position: 'bottomright' },
    onAdd: function(map) {
        const container = L.DomUtil.create('div', 'legend');
        const toggleBtn = L.DomUtil.create('button', 'legend-toggle', container);
        toggleBtn.innerHTML = '▼ Legend';
        const content = L.DomUtil.create('div', 'legend-content', container);
        layerData.forEach((data, index) => {
            const logoSrc = layerLogos[index] || '';
            const item = L.DomUtil.create('div', 'legend-item', content);
            item.innerHTML = `<img src="${logoSrc}" class="legend-logo" alt="icon"><div class="legend-swatch" style="background-color: ${data.color};"></div><div class="legend-text"><strong>${data.name}</strong><br><span>${data.desc}</span></div>`;
        });
        L.DomEvent.on(toggleBtn, 'click', () => {
            if (content.classList.contains('hidden')) { content.classList.remove('hidden'); toggleBtn.innerHTML = '▼ Legend'; } 
            else { content.classList.add('hidden'); toggleBtn.innerHTML = '▶ Legend'; }
        });
        return container;
    }
});
map.addControl(new LegendControl());

const searchControl = new L.Control.Search({
    url: 'https://nominatim.openstreetmap.org/search?format=json&q={s}',
    jsonpParam: 'json_callback',
    propertyName: 'display_name',
    propertyLoc: ['lat', 'lon'],
    marker: L.circleMarker([0, 0], { radius: 30, color: 'red' }),
    autoCollapse: true,
    autoType: false,
    minLength: 2
});
map.addControl(searchControl);

Promise.allSettled(layerPromises).then((results) => {
    hideLoadingScreen(); 

    const failed = results.filter(r => r.status === 'rejected' || (r.status === 'fulfilled' && r.value === null));
    if (failed.length > 0) {
        showError(`${failed.length} layers failed to load. Check network.`, 'warning');
    }

    try {
        const layerControl = L.control.layers(baseLayersData, overlays, { position: 'topright' }).addTo(map);
        initSidebarControls();
    } catch (e) {
        console.error("Error initializing controls", e);
    }
});

// --- 6. Data Fetching & Processing ---

const warningLayerGroup = L.layerGroup().addTo(map);
const googleSheetCSV = 'https://docs.google.com/spreadsheets/d/e/2PACX-1vSosfBP3StMyRUzwI0tUZPsLjPVH1zePCz8gZbTMOzjOvnonbmNCoy5VT46UxO0qdqb-Wm9EqTpXp8y/pub?gid=470430875&single=true&output=csv';

function getBufferColor(warningLevel) {
    if (warningLevel === 1) return 'yellow';
    if (warningLevel === 2) return 'orange';
    if (warningLevel === 3) return 'red';
    return null;
}

function getStationIcon(stationName) {
    if (stationName && stationName.includes('ASTI')) return layerLogos[6];
    if (stationName && stationName.includes('SARAI')) return layerLogos[5];
    if (stationName && stationName.includes('PAGASA')) return layerLogos[7];

    return layerLogos[4]; 
}

function processAWSData(data) {
    if (!data) return;

    try {
        if (JSON.stringify(data) === JSON.stringify(cachedAWSData)) return; 
    } catch(e) { }

    console.log("Updating Map with new AWS Data...");
    cachedAWSData = data; 
    warningLayerGroup.clearLayers(); 

    data.forEach(station => {
        try {
            var lat = parseFloat(station.Latitude);
            var lng = parseFloat(station.Longitude);
            
            if (isNaN(lat) || isNaN(lng) || lat === 0 || lng === 0) return;

            var warningLevel = parseInt(station.RainfallLandslidethresholdwarninglevel);
            var color = getBufferColor(warningLevel);
            
            if (color) {
                var staticCircle = L.circle([lat, lng], {
                    color: color, fillColor: color, fillOpacity: 0.05,
                    radius: 20000, weight: 2, dashArray: '5, 10', interactive: false 
                });
                warningLayerGroup.addLayer(staticCircle);

                var pulseCircle = L.circle([lat, lng], {
                    color: color, fillColor: color, fillOpacity: 0.3,
                    radius: 20000, weight: 1, className: 'pulse-layer', interactive: false
                });
                warningLayerGroup.addLayer(pulseCircle);
            }

            var iconUrl = getStationIcon(station.StationName);
            var marker = L.marker([lat, lng], {
                icon: L.icon({
                    iconUrl: iconUrl, iconSize: [25, 25], iconAnchor: [12, 12]
                })
            });

            var popupContent = `
                <div class="popup-container">
                    <div class="popup-header">${station.StationName || station.Station || 'Unknown Station'}</div>
                    <div class="popup-scroll-container">
                        <table class="popup-table">
                            <tr><th>Status</th><td>${station.Status || 'N/A'}</td></tr>
                            <tr><th>Location</th><td>${station.LocationDetails || station.Municipality || 'N/A'}</td></tr>
                            <tr><th>Rainfall (Total)</th><td>${station.Rainfall || station.R24H || '0'} mm</td></tr>
                            <tr><th>Warning Level</th><td>${station.RainfallLandslidethresholdwarninglevel || '0'}</td></tr>
                            <tr><th>Description</th><td>${station.Rainfalldescription || 'N/A'}</td></tr>
                            <tr><th>Scenario</th><td>${station.Possiblescenario || 'N/A'}</td></tr>
                            <tr><th>Actions</th><td>${station.Recommendedactions || 'N/A'}</td></tr>
                            <tr><th>Guide</th><td><img src="${station.Warninglevelguide || ''}" alt="Guide" onclick="showImage(this.src, 'Guide')" onerror="this.style.display='none'"/></td></tr>
                            <tr><th>Image</th><td><img src="${station.Imagelink || ''}" alt="Image" onclick="showImage(this.src, 'Station Image')" onerror="this.style.display='none'"/></td></tr>
                            <tr><th>Area</th><td>${station.Daterange || station.Municipality || 'N/A'}</td></tr>
                        </table>
                    </div>
                </div>`;
            
            marker.bindPopup(popupContent);
            marker.on('click', () => { updatePropertiesTable("AWS Station", station); });
            warningLayerGroup.addLayer(marker);
        } catch (err) {
            console.error("Error processing station:", station.StationName, err);
        }
    });
}

function fetchAndRefreshData() {
    console.log("Fetching data...");
    
    fetch('')
        .then(response => {
            if (!response.ok) throw new Error("Sheetlabs fetch failed");
            return response.json();
        })
        .then(data => { processAWSData(data); })
        .catch(error => { 
            console.warn('Primary fetch failed, switching to CSV fallback...', error);
            if (typeof Papa !== 'undefined') {
                Papa.parse(googleSheetCSV, {
                    download: true, header: true, skipEmptyLines: true,
                    complete: function(results) { processAWSData(results.data); },
                    error: function(err) { 
                        console.error("CSV Fallback failed.", err); 
                        showError("Data connection lost. Retrying...", 'warning'); 
                    }
                });
            } else {
                console.error("PapaParse not loaded.");
                showError("Critical library missing: PapaParse.", 'error');
            }
        });
}

fetchAndRefreshData();
setInterval(fetchAndRefreshData, 60000);

// --- 7. Sidebar & Forecast (With Raster Support) ---

const geojsonUrls = [
'https://raw.githubusercontent.com/Gabzrock/CRSS/refs/heads/main/Daily_RF_Day01_Bin1.geojson', 'https://raw.githubusercontent.com/Gabzrock/CRSS/refs/heads/main/Daily_RF_Day01_Bin2.geojson', 'https://raw.githubusercontent.com/Gabzrock/CRSS/refs/heads/main/Daily_RF_Day01_Bin3.geojson', 'https://raw.githubusercontent.com/Gabzrock/CRSS/refs/heads/main/Daily_RF_Day01_Bin4.geojson', 'https://raw.githubusercontent.com/Gabzrock/CRSS/refs/heads/main/Daily_RF_Day01_Bin5.geojson', 'https://raw.githubusercontent.com/Gabzrock/CRSS/refs/heads/main/Daily_RF_Day01_Bin6.geojson', 'https://raw.githubusercontent.com/Gabzrock/CRSS/refs/heads/main/Daily_RF_Day01_Bin7.geojson',
'https://raw.githubusercontent.com/Gabzrock/CRSS/refs/heads/main/Daily_RF_Day02_Bin1.geojson', 'https://raw.githubusercontent.com/Gabzrock/CRSS/refs/heads/main/Daily_RF_Day02_Bin2.geojson', 'https://raw.githubusercontent.com/Gabzrock/CRSS/refs/heads/main/Daily_RF_Day02_Bin3.geojson', 'https://raw.githubusercontent.com/Gabzrock/CRSS/refs/heads/main/Daily_RF_Day02_Bin4.geojson', 'https://raw.githubusercontent.com/Gabzrock/CRSS/refs/heads/main/Daily_RF_Day02_Bin5.geojson', 'https://raw.githubusercontent.com/Gabzrock/CRSS/refs/heads/main/Daily_RF_Day02_Bin6.geojson', 'https://raw.githubusercontent.com/Gabzrock/CRSS/refs/heads/main/Daily_RF_Day02_Bin7.geojson',
'https://raw.githubusercontent.com/Gabzrock/CRSS/refs/heads/main/Daily_RF_Day03_Bin1.geojson', 'https://raw.githubusercontent.com/Gabzrock/CRSS/refs/heads/main/Daily_RF_Day03_Bin2.geojson', 'https://raw.githubusercontent.com/Gabzrock/CRSS/refs/heads/main/Daily_RF_Day03_Bin3.geojson', 'https://raw.githubusercontent.com/Gabzrock/CRSS/refs/heads/main/Daily_RF_Day03_Bin4.geojson', 'https://raw.githubusercontent.com/Gabzrock/CRSS/refs/heads/main/Daily_RF_Day03_Bin5.geojson', 'https://raw.githubusercontent.com/Gabzrock/CRSS/refs/heads/main/Daily_RF_Day03_Bin6.geojson', 'https://raw.githubusercontent.com/Gabzrock/CRSS/refs/heads/main/Daily_RF_Day03_Bin7.geojson',
'https://raw.githubusercontent.com/Gabzrock/CRSS/refs/heads/main/Daily_RF_Day04_Bin1.geojson', 'https://raw.githubusercontent.com/Gabzrock/CRSS/refs/heads/main/Daily_RF_Day04_Bin2.geojson', 'https://raw.githubusercontent.com/Gabzrock/CRSS/refs/heads/main/Daily_RF_Day04_Bin3.geojson', 'https://raw.githubusercontent.com/Gabzrock/CRSS/refs/heads/main/Daily_RF_Day04_Bin4.geojson', 'https://raw.githubusercontent.com/Gabzrock/CRSS/refs/heads/main/Daily_RF_Day04_Bin5.geojson', 'https://raw.githubusercontent.com/Gabzrock/CRSS/refs/heads/main/Daily_RF_Day04_Bin6.geojson', 'https://raw.githubusercontent.com/Gabzrock/CRSS/refs/heads/main/Daily_RF_Day04_Bin7.geojson',
'https://raw.githubusercontent.com/Gabzrock/CRSS/refs/heads/main/Daily_RF_Day05_Bin1.geojson', 'https://raw.githubusercontent.com/Gabzrock/CRSS/refs/heads/main/Daily_RF_Day05_Bin2.geojson', 'https://raw.githubusercontent.com/Gabzrock/CRSS/refs/heads/main/Daily_RF_Day05_Bin3.geojson', 'https://raw.githubusercontent.com/Gabzrock/CRSS/refs/heads/main/Daily_RF_Day05_Bin4.geojson', 'https://raw.githubusercontent.com/Gabzrock/CRSS/refs/heads/main/Daily_RF_Day05_Bin5.geojson', 'https://raw.githubusercontent.com/Gabzrock/CRSS/refs/heads/main/Daily_RF_Day05_Bin6.geojson', 'https://raw.githubusercontent.com/Gabzrock/CRSS/refs/heads/main/Daily_RF_Day05_Bin7.geojson',
'https://raw.githubusercontent.com/Gabzrock/CRSS/refs/heads/main/Daily_RF_Day06_Bin1.geojson', 'https://raw.githubusercontent.com/Gabzrock/CRSS/refs/heads/main/Daily_RF_Day06_Bin2.geojson', 'https://raw.githubusercontent.com/Gabzrock/CRSS/refs/heads/main/Daily_RF_Day06_Bin3.geojson', 'https://raw.githubusercontent.com/Gabzrock/CRSS/refs/heads/main/Daily_RF_Day06_Bin4.geojson', 'https://raw.githubusercontent.com/Gabzrock/CRSS/refs/heads/main/Daily_RF_Day06_Bin5.geojson', 'https://raw.githubusercontent.com/Gabzrock/CRSS/refs/heads/main/Daily_RF_Day06_Bin6.geojson', 'https://raw.githubusercontent.com/Gabzrock/CRSS/refs/heads/main/Daily_RF_Day06_Bin7.geojson',
'https://raw.githubusercontent.com/Gabzrock/CRSS/refs/heads/main/Daily_RF_Day07_Bin1.geojson', 'https://raw.githubusercontent.com/Gabzrock/CRSS/refs/heads/main/Daily_RF_Day07_Bin2.geojson', 'https://raw.githubusercontent.com/Gabzrock/CRSS/refs/heads/main/Daily_RF_Day07_Bin3.geojson', 'https://raw.githubusercontent.com/Gabzrock/CRSS/refs/heads/main/Daily_RF_Day07_Bin4.geojson', 'https://raw.githubusercontent.com/Gabzrock/CRSS/refs/heads/main/Daily_RF_Day07_Bin5.geojson', 'https://raw.githubusercontent.com/Gabzrock/CRSS/refs/heads/main/Daily_RF_Day07_Bin6.geojson', 'https://raw.githubusercontent.com/Gabzrock/CRSS/refs/heads/main/Daily_RF_Day07_Bin7.geojson',
'https://raw.githubusercontent.com/Gabzrock/CRSS/refs/heads/main/Daily_RF_Day08_Bin1.geojson', 'https://raw.githubusercontent.com/Gabzrock/CRSS/refs/heads/main/Daily_RF_Day08_Bin2.geojson', 'https://raw.githubusercontent.com/Gabzrock/CRSS/refs/heads/main/Daily_RF_Day08_Bin3.geojson', 'https://raw.githubusercontent.com/Gabzrock/CRSS/refs/heads/main/Daily_RF_Day08_Bin4.geojson', 'https://raw.githubusercontent.com/Gabzrock/CRSS/refs/heads/main/Daily_RF_Day08_Bin5.geojson', 'https://raw.githubusercontent.com/Gabzrock/CRSS/refs/heads/main/Daily_RF_Day08_Bin6.geojson', 'https://raw.githubusercontent.com/Gabzrock/CRSS/refs/heads/main/Daily_RF_Day08_Bin7.geojson'
];

const colors = [
    'violet', 'indigo', 'blue', 'green', 'yellow', 'orange', 'red',
    'violet', 'indigo', 'blue', 'green', 'yellow', 'orange', 'red',
    'violet', 'indigo', 'blue', 'green', 'yellow', 'orange', 'red',
    'violet', 'indigo', 'blue', 'green', 'yellow', 'orange', 'red',
    'violet', 'indigo', 'blue', 'green', 'yellow', 'orange', 'red',
    'violet', 'indigo', 'blue', 'green', 'yellow', 'orange', 'red',
    'violet', 'indigo', 'blue', 'green', 'yellow', 'orange', 'red',
    'violet', 'indigo', 'blue', 'green', 'yellow', 'orange', 'red',
    'violet', 'indigo', 'blue', 'green', 'yellow', 'orange', 'red',
    'violet', 'indigo', 'blue', 'green', 'yellow', 'orange', 'red'
];

// Raster Configuration with Placeholders
const rasterForecastUrls = [
    'https://placehold.co/800x600?text=Rainfall+Raster+Day+1',
    'https://placehold.co/800x600?text=Rainfall+Raster+Day+2',
    'https://placehold.co/800x600?text=Rainfall+Raster+Day+3',
    'https://placehold.co/800x600?text=Rainfall+Raster+Day+4',
    'https://placehold.co/800x600?text=Rainfall+Raster+Day+5',
    'https://placehold.co/800x600?text=Rainfall+Raster+Day+6',
    'https://placehold.co/800x600?text=Rainfall+Raster+Day+7',
    'https://placehold.co/800x600?text=Rainfall+Raster+Day+8',
    'https://placehold.co/800x600?text=Rainfall+Raster+Day+9',
    'https://placehold.co/800x600?text=Rainfall+Raster+Day+10'
];

const rasterBounds = [[5, 115], [21, 127]];
let currentRasterLayer = null;
let showRaster = false;

let forecastLayers = [];
let currentGroupIndex = 0;
let animationInterval;
let isPlaying = false;
let speed = 5000;

const slider = document.getElementById('speedSlider');
const output = document.getElementById('speedValue');

slider.oninput = function() {
    speed = this.value * 1000;
    output.innerHTML = this.value + "s";
    if(isPlaying) {
        clearInterval(animationInterval);
        startAnimation();
    }
}

function updateRaster(index) {
    if (!showRaster) {
        if (currentRasterLayer) {
            map.removeLayer(currentRasterLayer);
            currentRasterLayer = null;
        }
        return;
    }

    if (currentRasterLayer) {
        map.removeLayer(currentRasterLayer);
    }

    const imageUrl = rasterForecastUrls[index % rasterForecastUrls.length];
    
    // Add Raster with Error Handling
    currentRasterLayer = L.imageOverlay(imageUrl, rasterBounds, {
        opacity: 0.6,
        interactive: true,
        attribution: 'Rainfall Raster Forecast'
    });
    
    currentRasterLayer.on('error', function() {
        console.warn(`Raster image failed to load: ${imageUrl}`);
        showError(`Raster frame ${index + 1} missing or failed to load.`, 'warning');
    });

    currentRasterLayer.addTo(map);
}

function showGroup(groupIndex) {
    forecastLayers.forEach(layer => map.removeLayer(layer));
    forecastLayers = [];

    const startIndex = groupIndex * 7;
    const groupUrls = geojsonUrls.slice(startIndex, startIndex + 7);

    document.getElementById('currentGroup').textContent = `Day: ${groupIndex + 1}`;

    groupUrls.forEach((url, i) => {
        fetch(url)
            .then(res => res.json())
            .then(data => {
                const layer = L.geoJSON(data, {
                    style: {
                        color: colors[i],
                        weight: 2,
                        opacity: 0.7
                    },
                    onEachFeature: (feature, layer) => {
                        layer.on('click', (e) => {
                            L.DomEvent.stopPropagation(e);
                            updatePropertiesTable("CReSS Forecast (Day " + (groupIndex + 1) + ")", feature.properties);
                        });
                    }
                }).addTo(map);
                forecastLayers.push(layer);
            })
            .catch(err => console.log('Forecast data missing'));
    });

    updateRaster(groupIndex);
}

function startAnimation() {
    isPlaying = true;
    document.getElementById('playBtn').style.background = '#e69500';
    if(forecastLayers.length === 0 && !currentRasterLayer) showGroup(currentGroupIndex);

    animationInterval = setInterval(() => {
        currentGroupIndex = (currentGroupIndex + 1) % 10;
        showGroup(currentGroupIndex);
    }, speed);
}

function stopAnimation() {
    isPlaying = false;
    clearInterval(animationInterval);
    document.getElementById('playBtn').style.background = 'var(--primary-color)';
}

document.getElementById('playBtn').onclick = () => { if (!isPlaying) startAnimation(); };
document.getElementById('pauseBtn').onclick = stopAnimation;
document.getElementById('stopBtn').onclick = () => {
    stopAnimation();
    forecastLayers.forEach(layer => map.removeLayer(layer));
    forecastLayers = [];
    if(currentRasterLayer) { map.removeLayer(currentRasterLayer); currentRasterLayer = null; }
    currentGroupIndex = 0;
    document.getElementById('currentGroup').textContent = "Day: 1";
};
document.getElementById('nextBtn').onclick = () => {
    stopAnimation();
    currentGroupIndex = (currentGroupIndex + 1) % 10;
    showGroup(currentGroupIndex);
};
document.getElementById('prevBtn').onclick = () => {
    stopAnimation();
    currentGroupIndex = (currentGroupIndex - 1 + 10) % 10;
    showGroup(currentGroupIndex);
};

// --- FIX: SIDEBAR CONTROLS ---
function initSidebarControls() {
    const container = document.getElementById('layerControls');
    if (!container) return;
    container.innerHTML = ''; 

    // Helper to create checkbox
    function createToggle(id, label, layerObj, onChangeOverride) {
        const div = document.createElement('div');
        div.className = 'layer-item';
        
        const input = document.createElement('input');
        input.type = 'checkbox';
        input.id = id;
        input.className = 'layer-toggle-input'; // Add class for querying if needed
        
        // Initial State
        if (layerObj) {
            input.checked = map.hasLayer(layerObj);
        }

        input.onchange = (e) => { 
            if (onChangeOverride) {
                onChangeOverride(e.target.checked);
            } else if (layerObj) {
                e.target.checked ? map.addLayer(layerObj) : map.removeLayer(layerObj); 
            }
        };

        const lbl = document.createElement('label');
        lbl.htmlFor = id;
        lbl.innerText = label;
        div.appendChild(input);
        div.appendChild(lbl);
        container.appendChild(div);
        
        return input;
    }

    // Generate toggles for Overlays
    Object.keys(overlays).forEach((name, idx) => {
        const layer = overlays[name];
        const input = createToggle('toggle_overlay_' + idx, name, layer);
        
        // Keep UI in sync with map events
        map.on('layeradd', (e) => { if(e.layer === layer) input.checked = true; });
        map.on('layerremove', (e) => { if(e.layer === layer) input.checked = false; });
    });

    // Warning Layer Toggle
    const warnInput = createToggle('toggle_warning', '20-KM Warning & AWS', warningLayerGroup);
    map.on('layeradd', (e) => { if(e.layer === warningLayerGroup) warnInput.checked = true; });
    map.on('layerremove', (e) => { if(e.layer === warningLayerGroup) warnInput.checked = false; });

    // Raster Toggle
    createToggle('toggle_raster', 'Show Raster Forecast', null, (checked) => {
        showRaster = checked;
        if (checked) updateRaster(currentGroupIndex); 
        else if (currentRasterLayer) map.removeLayer(currentRasterLayer);
    });
}

// FIX: GLOBAL BUTTONS LOGIC
// Re-bind click handlers to ensure they reference the latest objects
const addAllBtn = document.getElementById('addAllBtn');
if (addAllBtn) {
    addAllBtn.onclick = () => {
        // Add all Overlays
        Object.values(overlays).forEach(layer => {
            if (!map.hasLayer(layer)) map.addLayer(layer);
        });
        // Add Warning Layer
        if (!map.hasLayer(warningLayerGroup)) map.addLayer(warningLayerGroup);
    };
}

const removeAllBtn = document.getElementById('removeAllBtn');
if (removeAllBtn) {
    removeAllBtn.onclick = () => {
        // Remove all Overlays
        Object.values(overlays).forEach(layer => {
            if (map.hasLayer(layer)) map.removeLayer(layer);
        });
        // Remove Warning Layer
        if (map.hasLayer(warningLayerGroup)) map.removeLayer(warningLayerGroup);
    };
}

const toggleBufferBtn = document.getElementById('toggle-buffer');
if(toggleBufferBtn) toggleBufferBtn.addEventListener('click', () => {
    if (map.hasLayer(warningLayerGroup)) {
        map.removeLayer(warningLayerGroup);
        toggleBufferBtn.classList.remove('btn-active');
        toggleBufferBtn.style.opacity = "0.7";
    } else {
        map.addLayer(warningLayerGroup);
        toggleBufferBtn.classList.add('btn-active');
        toggleBufferBtn.style.opacity = "1";
    }
});
