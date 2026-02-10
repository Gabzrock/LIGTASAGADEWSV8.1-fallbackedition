// --- 1. UI Logic & Helpers ---

        var cachedAWSData = []; // Store Sheetlabs data globally

        window.addEventListener('load', () => {
            setTimeout(() => {
                const loader = document.getElementById('loading-screen');
                loader.classList.add('hidden');
                setTimeout(() => { loader.style.display = 'none'; }, 1000);
            }, 3000); 
        });

        function updateClock() {
            const now = new Date();
            const dateStr = now.toLocaleDateString('en-PH', { 
                weekday: 'short', year: 'numeric', month: 'short', day: 'numeric' 
            });
            const timeStr = now.toLocaleTimeString('en-PH');
            document.getElementById('real-time').textContent = `${dateStr} | ${timeStr}`;
        }
        updateClock();
        setInterval(updateClock, 1000);

        function Homebutton() { window.location.href = '';  }
        function AWSbutton() { window.location.href = 'https://gabzrock.github.io/LIGTAS-AGADLandslide-Warning-Advisories/'; }

        function updatePropertiesTable(layerName, properties) {
            const tableBody = document.getElementById('propertiesTableBody');
            tableBody.innerHTML = ''; 

            if (!properties || Object.keys(properties).length === 0) {
                tableBody.innerHTML = '<tr><td colspan="3">No properties available for this feature.</td></tr>';
                return;
            }

            for (const [key, value] of Object.entries(properties)) {
                const displayValue = (typeof value === 'object' && value !== null) ? JSON.stringify(value) : value;
                const row = document.createElement('tr');
                row.innerHTML = `<td><strong>${layerName}</strong></td><td>${key}</td><td>${displayValue}</td>`;
                tableBody.appendChild(row);
            }
        }

        // --- 2. Map Initialization ---

        const initialCenter = [12.8797, 121.7740];
        const initialZoom = 6;
        const map = L.map('map').setView(initialCenter, initialZoom);

        const baseLayersData = {
            "Streets": L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', { attribution: '© OpenStreetMap' }),
            "Satellite": L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}', { attribution: 'Tiles &copy; Esri' }),
            "Hybrid": L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}', { attribution: 'Tiles &copy; Esri' }),
            "Topo": L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Terrain_Base/MapServer/tile/{z}/{y}/{x}', { attribution: 'Tiles &copy; Esri' })
        };
        baseLayersData["Hybrid"].addTo(map);

        // --- 3. HELPER: Find Nearest Station & Generate Report ---

        function findNearestStation(latlng) {
            if (!cachedAWSData || cachedAWSData.length === 0) return null;
            let nearest = null;
            let minDist = Infinity;
            cachedAWSData.forEach(station => {
                const slatlng = L.latLng(parseFloat(station.Latitude), parseFloat(station.Longitude));
                const dist = latlng.distanceTo(slatlng);
                if (dist < minDist) {
                    minDist = dist;
                    nearest = { ...station, distance: (dist / 1000).toFixed(2) }; // Add distance in km
                }
            });
            return nearest;
        }

        function generateCombinedReport(layerName, properties, nearestStation) {
            let susContent = '';
            for (const [key, value] of Object.entries(properties)) {
                susContent += `<tr><td>${key}</td><td>${value}</td></tr>`;
            }

            let stationContent = '<tr><td colspan="2">No AWS Data Available</td></tr>';
            if (nearestStation) {
                const wLevel = nearestStation.RainfallLandslidethresholdwarninglevel;
                const color = wLevel == 1 ? 'yellow' : (wLevel == 2 ? 'orange' : (wLevel == 3 ? 'red' : 'green'));
                
                stationContent = `
                    <tr><td><strong>Nearest Station</strong></td><td>${nearestStation.StationName || nearestStation.Station}</td></tr>
                    <tr><td><strong>Distance</strong></td><td>${nearestStation.distance} km</td></tr>
                    <tr><td><strong>Warning Level</strong></td><td style="background-color:${color}; font-weight:bold;">Level ${wLevel}</td></tr>
                    <tr><td><strong>Antecedent + Accumulated Rainfall(mm)</strong></td><td>${nearestStation.R24H || nearestStation.Rainfall || '0'} mm</td></tr>
                    <tr><td><strong>Rec. Actions</strong></td><td>${nearestStation.Recommendedactions || 'Monitor'}</td></tr>
                    <tr><td><strong>Guide</strong></td><td><img src="${nearestStation.Warninglevelguide}" alt="Guide" onerror="this.style.display='none'"></td></tr>
                `;
            }

            return `
                <div class="popup-content">
                    <h2>Combined Susceptibility Report</h2>
                    <div class="popup-section-header">1. Susceptibility Attributes (${layerName})</div>
                    <table class="popup-table">
                        <tr><th>Field</th><th>Value</th></tr>
                        ${susContent}
                    </table>
                    
                    <div class="popup-section-header">2. Weather & Warning Status</div>
                    <table class="popup-table">
                        ${stationContent}
                    </table>
                </div>
            `;
        }

        // --- 4. GeoJSON & Data Handling ---

        var overlays = {};
        
        const layerData = [
            { name: 'LIGTAS-LSDB', desc: 'Recorded Landslides', color: 'orange' }, 
            { name: 'MGB-HIGH', desc: 'HIGH Susceptibility', color: 'red' }, 
            { name: 'MGB-MED', desc: 'MED Susceptibility', color: 'yellow' }, 
            { name: 'MGB-LOW', desc: 'LOW Susceptibility', color: 'green' },
            { name: 'LIGTAS AWS', desc: 'Monitoring Station', color: 'white' },
            { name: 'SARAI AWS', desc: 'Monitoring Station', color: 'white' },
            { name: 'ASTI AWS', desc: 'Monitoring Station', color: 'white' },
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
            'https://raw.githubusercontent.com/Gabzrock/LIGTASAGADEWSV3/refs/heads/main/layer_layers_icon_193964.png',
            'https://raw.githubusercontent.com/Gabzrock/LIGTASAGADEWSV3/refs/heads/main/layer_layers_icon_193964.png',
            'https://raw.githubusercontent.com/Gabzrock/LIGTASAGADEWSV3/refs/heads/main/layer_layers_icon_193964.png'
        ];

        function createGeoJSONLayer(name, description, geojsonUrl, styleOptions = {}, iconUrl = null) {
            const fullName = `${name}: ${description}`;
            return fetch(geojsonUrl)
                .then(response => {
                    if (!response.ok) throw new Error("Network response was not ok");
                    return response.json();
                })
                .then(data => {
                    const layer = L.geoJSON(data, {
                        style: styleOptions,
                        pointToLayer: (feature, latlng) => {
                            if (iconUrl) {
                                return L.marker(latlng, {
                                    icon: L.icon({
                                        iconUrl: iconUrl,
                                        iconSize: [24, 24],
                                        iconAnchor: [12, 12],
                                        popupAnchor: [0, -12]
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
                            // Default popup (simple)
                            let popupContent = `<div class="popup-content"><h4>${name}</h4><table class="popup-table">`;
                            if (feature.properties) {
                                for (const [key, value] of Object.entries(feature.properties)) {
                                    popupContent += `<tr><td><strong>${key}</strong></td><td>${value}</td></tr>`;
                                }
                            }
                            popupContent += '</table></div>';
                            layer.bindPopup(popupContent); // Bind basic popup initially

                            // Click Event: Update Table AND Generate Dynamic Report if Susceptibility Layer
                            layer.on('click', (e) => { 
                                updatePropertiesTable(name, feature.properties);
                                
                                // Check if this is a Susceptibility Layer (starts with MGB)
                                if (name.includes('MGB') || name.includes('Susceptibility')) {
                                    // Calculate Nearest Station and Generate Report
                                    const nearest = findNearestStation(e.latlng);
                                    const reportContent = generateCombinedReport(name, feature.properties, nearest);
                                    
                                    // Open a new popup at click location with the report
                                    L.popup()
                                        .setLatLng(e.latlng)
                                        .setContent(reportContent)
                                        .openOn(map);
                                }
                            });
                        }
                    });
                    overlays[fullName] = layer;
                    return layer;
                })
                .catch(error => {
                    console.error(`Error loading ${name}:`, error);
                });
        }

        const layerPromises = [
            createGeoJSONLayer('LIGTAS-LSDB', 'Recorded Landslides', 'https://raw.githubusercontent.com/Gabzrock/LIGTAS-AGAD/refs/heads/main/LandslideDB-web.geojson', { color: 'orange', fillColor: 'orange', fillOpacity: 0.8, radius: 6, weight: 1 }, null),
            createGeoJSONLayer('PH boundary', 'Philippine Boundary', 'https://raw.githubusercontent.com/Gabzrock/LIGTAS-AGAD/refs/heads/main/country.0.01.json', { color: 'white', weight: 1 }),
            createGeoJSONLayer('CAR', 'Boundary', 'https://raw.githubusercontent.com/Gabzrock/LIGTASAGADEWSV3/refs/heads/main/uCAR-web.geojson', { color: 'blue', weight: 2 }),
            
            // Susceptibility Layers - These will trigger the new report
            createGeoJSONLayer('MGB-HIGH', 'Susceptibility', 'https://raw.githubusercontent.com/Gabzrock/LIGTASAGADEWSV3/refs/heads/main/uRIL_AWS_High%20Susceptibility.geojson', { color: 'red', fillOpacity: 0.6 }),
            createGeoJSONLayer('MGB-MED', 'Susceptibility', 'https://raw.githubusercontent.com/Gabzrock/LIGTASAGADEWSV3/refs/heads/main/uRIL_AWS_Moderate_Susceptibility.geojson', { color: 'yellow', fillOpacity: 0.6 }),
            createGeoJSONLayer('MGB-LOW', 'Susceptibility', 'https://raw.githubusercontent.com/Gabzrock/LIGTASAGADEWSV3/refs/heads/main/uRIL_AWS_Low_Susceptibility.geojson', { color: 'green', fillOpacity: 0.6 })
        ];

        // --- 5. Controls & Events ---

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
                    item.innerHTML = `<img src="${logoSrc}" class="legend-logo" alt="icon"><div class="legend-swatch" style="background-color: ${data.color};"></div><div class="legend-text"><strong>${data.name}</strong><br><span style="color:#666">${data.desc}</span></div>`;
                });
                L.DomEvent.on(toggleBtn, 'click', () => {
                    if (content.classList.contains('hidden')) { content.classList.remove('hidden'); toggleBtn.innerHTML = '▼ Legend'; } 
                    else { content.classList.add('hidden'); toggleBtn.innerHTML = '▶ Legend'; }
                });
                return container;
            }
        });

        Promise.allSettled(layerPromises).then(() => {
            const layerControl = L.control.layers(baseLayersData, overlays, { position: 'topright' }).addTo(map);
            map.addControl(new LegendControl());
            initSidebarControls();
        });

        L.control.scale().addTo(map);
        L.control.locate().addTo(map);

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

        document.getElementById('overrideBtn').onclick = () => { document.getElementById('errorOverride').style.display = 'none'; };
        document.getElementById('retryBtn').onclick = () => { location.reload(); };

        // --- 6. SHEETLABS API ---

        const warningLayerGroup = L.layerGroup().addTo(map);

        function getBufferStyle(warningLevel) {
            if (warningLevel === 1) return { color: 'yellow', fillColor: 'yellow', className: 'flash-yellow' };
            if (warningLevel === 2) return { color: 'orange', fillColor: 'orange', className: 'flash-orange' };
            if (warningLevel === 3) return { color: 'red', fillColor: 'red', className: 'flash-red' };
            return { color: 'white', fillColor: 'transparent', className: '' };
        }

        function getStationIcon(stationName) {
            if (stationName && stationName.includes('ASTI')) return layerLogos[6];
            if (stationName && stationName.includes('SARAI')) return layerLogos[5];
            return layerLogos[4]; 
        }

        fetch('https://sheetlabs.com/LA25/LIGTASAGADEWSV3')
            .then(response => response.json())
            .then(data => {
                cachedAWSData = data; // Cache data for reports
                data.forEach(station => {
                    var lat = parseFloat(station.Latitude);
                    var lng = parseFloat(station.Longitude);
                    var warningLevel = parseInt(station.RainfallLandslidethresholdwarninglevel);

                    if (isNaN(lat) || isNaN(lng)) return;

                    var bufferStyle = getBufferStyle(warningLevel);
                    if (bufferStyle.color !== 'transparent') {
                        var circle = L.circle([lat, lng], {
                            color: bufferStyle.color,
                            fillColor: bufferStyle.fillColor,
                            fillOpacity: 0.3,
                            radius: 20000,
                            className: bufferStyle.className,
                            dashArray: '5, 5' // 5-pixel dash, 5-pixel gap
                        });
                        warningLayerGroup.addLayer(circle);
                    }

                    var iconUrl = getStationIcon(station.StationName);
                    var marker = L.marker([lat, lng], {
                        icon: L.icon({
                            iconUrl: iconUrl,
                            iconSize: [25, 25],
                            iconAnchor: [12, 12]
                        })
                    });

                    var popupContent = `
                        <div class="popup-content">
                            <h2>${station.StationName || station.Station || 'Unknown Station'}</h2>
                            <table class="popup-table">
                                <tr><th>Field</th><th>Value</th></tr>
                                <tr><td>Status</td><td>${station.Status || 'N/A'}</td></tr>
                                <tr><td>Location Details</td><td>${station.LocationDetails || station.Municipality || 'N/A'}</td></tr>
                                <tr><td>Antecedent + Accumulated Rainfall</td><td>${station.Rainfall || station.R24H || '0'}</td></tr>
                                <tr><td>Warning Level</td><td>${station.RainfallLandslidethresholdwarninglevel || '0'}</td></tr>
                                <tr><td>Rainfall Description</td><td>${station.Rainfalldescription || 'N/A'}</td></tr>
                                <tr><td>Possible Scenario</td><td>${station.Possiblescenario || 'N/A'}</td></tr>
                                <tr><td>Recommended Actions</td><td>${station.Recommendedactions || 'N/A'}</td></tr>
                                <tr><td>Warning Level Guide</td><td><img src="${station.Warninglevelguide || ''}" alt="Warning Level Guide" onerror="this.style.display='none'"/></td></tr>
                                <tr><td>Image Link</td><td><img src="${station.Imagelink || ''}" alt="Image" onerror="this.style.display='none'"/></td></tr>
                                <tr><td>Municipality and Barangay Covered</td><td>${station.Daterange || station.Municipality || 'N/A'}</td></tr>
                            </table>
                        </div>
                    `;
                    marker.bindPopup(popupContent);
                    marker.on('click', () => { updatePropertiesTable("AWS Station", station); });
                    warningLayerGroup.addLayer(marker);
                });
                if(typeof initSidebarControls === 'function') initSidebarControls();
            })
            .catch(error => { console.error('Error fetching Sheetlabs data:', error); });

        // --- 7. CReSS WEATHER FORECAST ---

        const geojsonUrls = [
            'https://raw.githubusercontent.com/Gabzrock/CRSS/refs/heads/main/Daily_RF_Day01_Bin1.geojson', 'https://raw.githubusercontent.com/Gabzrock/CRSS/refs/heads/main/Daily_RF_Day01_Bin2.geojson', 'https://raw.githubusercontent.com/Gabzrock/CRSS/refs/heads/main/Daily_RF_Day01_Bin3.geojson', 'https://raw.githubusercontent.com/Gabzrock/CRSS/refs/heads/main/Daily_RF_Day01_Bin4.geojson', 'https://raw.githubusercontent.com/Gabzrock/CRSS/refs/heads/main/Daily_RF_Day01_Bin5.geojson', 'https://raw.githubusercontent.com/Gabzrock/CRSS/refs/heads/main/Daily_RF_Day01_Bin6.geojson', 'https://raw.githubusercontent.com/Gabzrock/CRSS/refs/heads/main/Daily_RF_Day01_Bin7.geojson',
            'https://raw.githubusercontent.com/Gabzrock/CRSS/refs/heads/main/Daily_RF_Day02_Bin1.geojson', 'https://raw.githubusercontent.com/Gabzrock/CRSS/refs/heads/main/Daily_RF_Day02_Bin2.geojson', 'https://raw.githubusercontent.com/Gabzrock/CRSS/refs/heads/main/Daily_RF_Day02_Bin3.geojson', 'https://raw.githubusercontent.com/Gabzrock/CRSS/refs/heads/main/Daily_RF_Day02_Bin4.geojson', 'https://raw.githubusercontent.com/Gabzrock/CRSS/refs/heads/main/Daily_RF_Day02_Bin5.geojson', 'https://raw.githubusercontent.com/Gabzrock/CRSS/refs/heads/main/Daily_RF_Day02_Bin6.geojson', 'https://raw.githubusercontent.com/Gabzrock/CRSS/refs/heads/main/Daily_RF_Day02_Bin7.geojson',
            'https://raw.githubusercontent.com/Gabzrock/CRSS/refs/heads/main/Daily_RF_Day03_Bin1.geojson', 'https://raw.githubusercontent.com/Gabzrock/CRSS/refs/heads/main/Daily_RF_Day03_Bin2.geojson', 'https://raw.githubusercontent.com/Gabzrock/CRSS/refs/heads/main/Daily_RF_Day03_Bin3.geojson', 'https://raw.githubusercontent.com/Gabzrock/CRSS/refs/heads/main/Daily_RF_Day03_Bin4.geojson', 'https://raw.githubusercontent.com/Gabzrock/CRSS/refs/heads/main/Daily_RF_Day03_Bin5.geojson', 'https://raw.githubusercontent.com/Gabzrock/CRSS/refs/heads/main/Daily_RF_Day03_Bin6.geojson', 'https://raw.githubusercontent.com/Gabzrock/CRSS/refs/heads/main/Daily_RF_Day03_Bin7.geojson',
            'https://raw.githubusercontent.com/Gabzrock/CRSS/refs/heads/main/Daily_RF_Day04_Bin1.geojson', 'https://raw.githubusercontent.com/Gabzrock/CRSS/refs/heads/main/Daily_RF_Day04_Bin2.geojson', 'https://raw.githubusercontent.com/Gabzrock/CRSS/refs/heads/main/Daily_RF_Day04_Bin3.geojson', 'https://raw.githubusercontent.com/Gabzrock/CRSS/refs/heads/main/Daily_RF_Day04_Bin4.geojson', 'https://raw.githubusercontent.com/Gabzrock/CRSS/refs/heads/main/Daily_RF_Day04_Bin5.geojson', 'https://raw.githubusercontent.com/Gabzrock/CRSS/refs/heads/main/Daily_RF_Day04_Bin6.geojson', 'https://raw.githubusercontent.com/Gabzrock/CRSS/refs/heads/main/Daily_RF_Day04_Bin7.geojson',
            'https://raw.githubusercontent.com/Gabzrock/CRSS/refs/heads/main/Daily_RF_Day05_Bin1.geojson', 'https://raw.githubusercontent.com/Gabzrock/CRSS/refs/heads/main/Daily_RF_Day05_Bin2.geojson', 'https://raw.githubusercontent.com/Gabzrock/CRSS/refs/heads/main/Daily_RF_Day05_Bin3.geojson', 'https://raw.githubusercontent.com/Gabzrock/CRSS/refs/heads/main/Daily_RF_Day05_Bin4.geojson', 'https://raw.githubusercontent.com/Gabzrock/CRSS/refs/heads/main/Daily_RF_Day05_Bin5.geojson', 'https://raw.githubusercontent.com/Gabzrock/CRSS/refs/heads/main/Daily_RF_Day05_Bin6.geojson', 'https://raw.githubusercontent.com/Gabzrock/CRSS/refs/heads/main/Daily_RF_Day05_Bin7.geojson',
            'https://raw.githubusercontent.com/Gabzrock/CRSS/refs/heads/main/Daily_RF_Day06_Bin1.geojson', 'https://raw.githubusercontent.com/Gabzrock/CRSS/refs/heads/main/Daily_RF_Day06_Bin2.geojson', 'https://raw.githubusercontent.com/Gabzrock/CRSS/refs/heads/main/Daily_RF_Day06_Bin3.geojson', 'https://raw.githubusercontent.com/Gabzrock/CRSS/refs/heads/main/Daily_RF_Day06_Bin4.geojson', 'https://raw.githubusercontent.com/Gabzrock/CRSS/refs/heads/main/Daily_RF_Day06_Bin5.geojson', 'https://raw.githubusercontent.com/Gabzrock/CRSS/refs/heads/main/Daily_RF_Day06_Bin6.geojson', 'https://raw.githubusercontent.com/Gabzrock/CRSS/refs/heads/main/Daily_RF_Day06_Bin7.geojson',
            'https://raw.githubusercontent.com/Gabzrock/CRSS/refs/heads/main/Daily_RF_Day07_Bin1.geojson', 'https://raw.githubusercontent.com/Gabzrock/CRSS/refs/heads/main/Daily_RF_Day07_Bin2.geojson', 'https://raw.githubusercontent.com/Gabzrock/CRSS/refs/heads/main/Daily_RF_Day07_Bin3.geojson', 'https://raw.githubusercontent.com/Gabzrock/CRSS/refs/heads/main/Daily_RF_Day07_Bin4.geojson', 'https://raw.githubusercontent.com/Gabzrock/CRSS/refs/heads/main/Daily_RF_Day07_Bin5.geojson', 'https://raw.githubusercontent.com/Gabzrock/CRSS/refs/heads/main/Daily_RF_Day07_Bin6.geojson', 'https://raw.githubusercontent.com/Gabzrock/CRSS/refs/heads/main/Daily_RF_Day07_Bin7.geojson',
            'https://raw.githubusercontent.com/Gabzrock/CRSS/refs/heads/main/Daily_RF_Day08_Bin1.geojson', 'https://raw.githubusercontent.com/Gabzrock/CRSS/refs/heads/main/Daily_RF_Day08_Bin2.geojson', 'https://raw.githubusercontent.com/Gabzrock/CRSS/refs/heads/main/Daily_RF_Day08_Bin3.geojson', 'https://raw.githubusercontent.com/Gabzrock/CRSS/refs/heads/main/Daily_RF_Day08_Bin4.geojson', 'https://raw.githubusercontent.com/Gabzrock/CRSS/refs/heads/main/Daily_RF_Day08_Bin5.geojson', 'https://raw.githubusercontent.com/Gabzrock/CRSS/refs/heads/main/Daily_RF_Day08_Bin6.geojson', 'https://raw.githubusercontent.com/Gabzrock/CRSS/refs/heads/main/Daily_RF_Day08_Bin7.geojson',
            'https://raw.githubusercontent.com/Gabzrock/CRSS/refs/heads/main/Daily_RF_Day08_Bin1.geojson', 'https://raw.githubusercontent.com/Gabzrock/CRSS/refs/heads/main/Daily_RF_Day08_Bin2.geojson', 'https://raw.githubusercontent.com/Gabzrock/CRSS/refs/heads/main/Daily_RF_Day08_Bin3.geojson', 'https://raw.githubusercontent.com/Gabzrock/CRSS/refs/heads/main/Daily_RF_Day08_Bin4.geojson', 'https://raw.githubusercontent.com/Gabzrock/CRSS/refs/heads/main/Daily_RF_Day08_Bin5.geojson', 'https://raw.githubusercontent.com/Gabzrock/CRSS/refs/heads/main/Daily_RF_Day08_Bin6.geojson', 'https://raw.githubusercontent.com/Gabzrock/CRSS/refs/heads/main/Daily_RF_Day08_Bin7.geojson',
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
                    .catch(err => console.log('Forecast data missing for Day ' + (groupIndex+1)));
            });
        }

        function startAnimation() {
            isPlaying = true;
            document.getElementById('playBtn').style.background = '#e69500';
            if(forecastLayers.length === 0) showGroup(currentGroupIndex);

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

        // --- 8. Sidebar & Global Control Logic ---
        
        function initSidebarControls() {
            const container = document.getElementById('layerControls');
            container.innerHTML = ''; // Clear existing

            function createToggle(id, label, layerObj) {
                const div = document.createElement('div');
                div.className = 'layer-item';
                
                const input = document.createElement('input');
                input.type = 'checkbox';
                input.id = id;
                input.checked = map.hasLayer(layerObj);
                
                input.onchange = (e) => {
                    if (e.target.checked) {
                        if(!map.hasLayer(layerObj)) map.addLayer(layerObj);
                    } else {
                        if(map.hasLayer(layerObj)) map.removeLayer(layerObj);
                    }
                };
                
                map.on('layeradd', (e) => { if(e.layer === layerObj) input.checked = true; });
                map.on('layerremove', (e) => { if(e.layer === layerObj) input.checked = false; });

                const lbl = document.createElement('label');
                lbl.htmlFor = id;
                lbl.innerText = label;
                lbl.style.cursor = "pointer";

                div.appendChild(input);
                div.appendChild(lbl);
                container.appendChild(div);
            }

            // 1. Static Overlays
            Object.keys(overlays).forEach((name, idx) => {
                createToggle('toggle_overlay_' + idx, name, overlays[name]);
            });

            // 2. Buffer/AWS Layer
            createToggle('toggle_warning', '20-KM Warning & AWS', warningLayerGroup);
        }

        document.getElementById('addAllBtn').onclick = () => {
            Object.values(overlays).forEach(layer => {
                if (!map.hasLayer(layer)) map.addLayer(layer);
            });
            if (!map.hasLayer(warningLayerGroup)) {
                map.addLayer(warningLayerGroup);
                document.getElementById('toggle-buffer').classList.add('btn-active');
                document.getElementById('toggle-buffer').style.opacity = "1";
            }
        };

        document.getElementById('removeAllBtn').onclick = () => {
            Object.values(overlays).forEach(layer => {
                if (map.hasLayer(layer)) map.removeLayer(layer);
            });
            if (map.hasLayer(warningLayerGroup)) {
                map.removeLayer(warningLayerGroup);
                document.getElementById('toggle-buffer').classList.remove('btn-active');
                document.getElementById('toggle-buffer').style.opacity = "0.7";
            }
        };

        const toggleBufferBtn = document.getElementById('toggle-buffer');
        toggleBufferBtn.addEventListener('click', () => {
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
        if(map.hasLayer(warningLayerGroup)) {
            toggleBufferBtn.classList.add('btn-active');
            toggleBufferBtn.style.opacity = "1";
        }