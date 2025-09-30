let map;
let userMarker;
let currentTrail = null;
let trails = [];
let watchId = null;
let colorOffset = 0;

// Initialize map
function initMap() {
    map = L.map('map').setView([0, 0], 16);
    
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        attribution: '© OpenStreetMap contributors',
        maxZoom: 19
    }).addTo(map);
    
    // Try to get user location
    if (navigator.geolocation) {
        navigator.geolocation.getCurrentPosition(
            (position) => {
                const { latitude, longitude } = position.coords;
                map.setView([latitude, longitude], 16);
                
                // Add user marker
                userMarker = L.circleMarker([latitude, longitude], {
                    radius: 8,
                    fillColor: '#4285F4',
                    color: '#fff',
                    weight: 2,
                    fillOpacity: 1
                }).addTo(map);
            },
            (error) => {
                console.error('Error getting location:', error);
            }
        );
    }
}

// Get color for current segment
function getTrailColor(offset) {
    const hue = (offset * 30) % 360;
    return `hsl(${hue}, 70%, 50%)`;
}

// Start recording a new trail
function startNewTrail() {
    if (currentTrail) return;
    
    colorOffset = 0;
    currentTrail = {
        id: Date.now(),
        name: `Trail ${trails.length + 1}`,
        startTime: new Date(),
        points: [],
        polylines: [],
        layerGroup: L.layerGroup().addTo(map)
    };
    
    // Start watching position
    watchId = navigator.geolocation.watchPosition(
        (position) => {
            const { latitude, longitude } = position.coords;
            const newPoint = [latitude, longitude];
            
            // Update user marker
            if (userMarker) {
                userMarker.setLatLng(newPoint);
            }
            
            // Add point to trail
            if (currentTrail.points.length > 0) {
                const lastPoint = currentTrail.points[currentTrail.points.length - 1];
                
                // Create a polyline segment with changing color
                const polyline = L.polyline([lastPoint, newPoint], {
                    color: getTrailColor(colorOffset),
                    weight: 4,
                    opacity: 0.8
                }).addTo(currentTrail.layerGroup);
                
                currentTrail.polylines.push(polyline);
                colorOffset++;
            }
            
            currentTrail.points.push(newPoint);
            
            // Center map on user
            map.panTo(newPoint);
        },
        (error) => {
            console.error('Error watching position:', error);
        },
        {
            enableHighAccuracy: true,
            maximumAge: 0,
            timeout: 5000
        }
    );
    
    // Update UI
    document.getElementById('newTrailBtn').style.display = 'none';
    document.getElementById('stopTrailBtn').style.display = 'flex';
    document.getElementById('deleteTrailBtn').style.display = 'flex';
}

// Stop recording current trail
function stopTrail() {
    if (!currentTrail) return;
    
    if (watchId) {
        navigator.geolocation.clearWatch(watchId);
        watchId = null;
    }
    
    // Save trail
    trails.push(currentTrail);
    updateTrailList();
    
    currentTrail = null;
    
    // Update UI
    document.getElementById('newTrailBtn').style.display = 'flex';
    document.getElementById('stopTrailBtn').style.display = 'none';
    document.getElementById('deleteTrailBtn').style.display = 'none';
}

// Delete current trail
function deleteCurrentTrail() {
    if (!currentTrail) return;
    
    if (watchId) {
        navigator.geolocation.clearWatch(watchId);
        watchId = null;
    }
    
    // Remove from map
    map.removeLayer(currentTrail.layerGroup);
    
    currentTrail = null;
    
    // Update UI
    document.getElementById('newTrailBtn').style.display = 'flex';
    document.getElementById('stopTrailBtn').style.display = 'none';
    document.getElementById('deleteTrailBtn').style.display = 'none';
}

// Delete saved trail
function deleteSavedTrail(trailId) {
    const index = trails.findIndex(t => t.id === trailId);
    if (index === -1) return;
    
    const trail = trails[index];
    map.removeLayer(trail.layerGroup);
    trails.splice(index, 1);
    updateTrailList();
}

// Update trail list UI
function updateTrailList() {
    const trailsContainer = document.getElementById('trails');
    
    if (trails.length === 0) {
        trailsContainer.innerHTML = '<p style="font-size: 12px; color: #999;">No trails yet</p>';
        return;
    }
    
    trailsContainer.innerHTML = trails.map(trail => `
        <div class="trail-item" data-trail-id="${trail.id}">
            <div class="trail-item-info">
                <div class="trail-item-name">${trail.name}</div>
                <div class="trail-item-time">${trail.startTime.toLocaleTimeString()}</div>
            </div>
            <button class="trail-item-delete" data-trail-id="${trail.id}">✕</button>
        </div>
    `).join('');
    
    // Add event listeners
    document.querySelectorAll('.trail-item').forEach(item => {
        const trailId = parseInt(item.dataset.trailId);
        
        item.addEventListener('click', (e) => {
            if (!e.target.classList.contains('trail-item-delete')) {
                toggleTrailVisibility(trailId);
            }
        });
    });
    
    document.querySelectorAll('.trail-item-delete').forEach(btn => {
        btn.addEventListener('click', (e) => {
            e.stopPropagation();
            const trailId = parseInt(btn.dataset.trailId);
            deleteSavedTrail(trailId);
        });
    });
}

// Toggle trail visibility
function toggleTrailVisibility(trailId) {
    const trail = trails.find(t => t.id === trailId);
    if (!trail) return;
    
    if (map.hasLayer(trail.layerGroup)) {
        map.removeLayer(trail.layerGroup);
    } else {
        trail.layerGroup.addTo(map);
    }
    
    // Update active state
    document.querySelectorAll('.trail-item').forEach(item => {
        if (parseInt(item.dataset.trailId) === trailId) {
            item.classList.toggle('active');
        }
    });
}

// Event listeners
document.getElementById('newTrailBtn').addEventListener('click', startNewTrail);
document.getElementById('stopTrailBtn').addEventListener('click', stopTrail);
document.getElementById('deleteTrailBtn').addEventListener('click', deleteCurrentTrail);

// Initialize
initMap();
updateTrailList();

