let map;
let userMarker;
let currentTrail = null;
let trails = [];
let watchId = null;
let colorOffset = 0;

// Compress image before storing
function compressImage(dataUrl, maxWidth = 800, quality = 0.7) {
    return new Promise((resolve) => {
        const img = new Image();
        img.onload = () => {
            const canvas = document.createElement('canvas');
            let width = img.width;
            let height = img.height;
            
            // Calculate new dimensions
            if (width > maxWidth) {
                height = (height * maxWidth) / width;
                width = maxWidth;
            }
            
            canvas.width = width;
            canvas.height = height;
            
            const ctx = canvas.getContext('2d');
            ctx.drawImage(img, 0, 0, width, height);
            
            // Convert to compressed JPEG
            const compressedDataUrl = canvas.toDataURL('image/jpeg', quality);
            resolve(compressedDataUrl);
        };
        img.src = dataUrl;
    });
}

// Check localStorage size
function getLocalStorageSize() {
    let total = 0;
    for (let key in localStorage) {
        if (localStorage.hasOwnProperty(key)) {
            total += localStorage[key].length + key.length;
        }
    }
    return total;
}

// Load trails from localStorage
function loadTrails() {
    const saved = localStorage.getItem('trails');
    if (saved) {
        const savedTrails = JSON.parse(saved);
        trails = savedTrails.map(trail => {
            // Recreate layer group and polylines
            const layerGroup = L.layerGroup().addTo(map);
            
            // Recreate polylines
            for (let i = 0; i < trail.points.length - 1; i++) {
                const polyline = L.polyline([trail.points[i], trail.points[i + 1]], {
                    color: getTrailColor(i),
                    weight: 4,
                    opacity: 0.8
                }).addTo(layerGroup);
            }
            
            // Recreate photo markers
            if (trail.photos) {
                trail.photos.forEach(photo => {
                    addPhotoMarker(layerGroup, photo.position, photo.imageData);
                });
            }
            
            // Hide layer by default
            map.removeLayer(layerGroup);
            
            return {
                ...trail,
                startTime: new Date(trail.startTime),
                layerGroup: layerGroup,
                photos: trail.photos || []
            };
        });
    }
}

// Save trails to localStorage
function saveTrails() {
    try {
        const trailsToSave = trails.map(trail => ({
            id: trail.id,
            name: trail.name,
            startTime: trail.startTime,
            points: trail.points,
            photos: trail.photos || []
        }));
        localStorage.setItem('trails', JSON.stringify(trailsToSave));
    } catch (e) {
        if (e.name === 'QuotaExceededError') {
            console.error('Storage quota exceeded. Attempting to save without oldest photos...');
            
            // Try to save by removing photos from oldest trails
            const trailsToSave = trails.map((trail, index) => {
                // Keep photos only for the most recent 3 trails
                const shouldKeepPhotos = index >= trails.length - 3;
                return {
                    id: trail.id,
                    name: trail.name,
                    startTime: trail.startTime,
                    points: trail.points,
                    photos: shouldKeepPhotos ? (trail.photos || []) : []
                };
            });
            
            try {
                localStorage.setItem('trails', JSON.stringify(trailsToSave));
                alert('Storage limit reached. Photos from older trails were removed to save your current trail.');
            } catch (e2) {
                console.error('Still not enough space. Saving trail data only...');
                // Last resort: save only trail points, no photos
                const minimalTrails = trails.map(trail => ({
                    id: trail.id,
                    name: trail.name,
                    startTime: trail.startTime,
                    points: trail.points,
                    photos: []
                }));
                localStorage.setItem('trails', JSON.stringify(minimalTrails));
                alert('Storage critically low. Only trail paths were saved.');
            }
        } else {
            throw e;
        }
    }
}

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

// Add photo marker to map
function addPhotoMarker(layerGroup, position, imageData) {
    const photoIcon = L.divIcon({
        className: 'photo-marker',
        html: '<div class="photo-marker-inner">📷</div>',
        iconSize: [32, 32],
        iconAnchor: [16, 16]
    });
    
    const marker = L.marker(position, { icon: photoIcon }).addTo(layerGroup);
    
    marker.on('click', () => {
        showImageModal(imageData);
    });
    
    return marker;
}

// Show image modal
function showImageModal(imageData) {
    const modal = document.getElementById('imageModal');
    const modalImage = document.getElementById('modalImage');
    modalImage.src = imageData;
    modal.style.display = 'flex';
}

// Take photo
function takePhoto() {
    if (!currentTrail) return;
    
    const cameraInput = document.getElementById('cameraInput');
    cameraInput.click();
}

// Handle photo capture
document.getElementById('cameraInput').addEventListener('change', async (e) => {
    const file = e.target.files[0];
    if (!file || !currentTrail) return;
    
    const reader = new FileReader();
    reader.onload = async (event) => {
        const imageData = event.target.result;
        
        // Compress the image
        const compressedImage = await compressImage(imageData, 800, 0.7);
        
        // Get current position
        if (userMarker) {
            const position = userMarker.getLatLng();
            const positionArray = [position.lat, position.lng];
            
            // Add photo to current trail
            if (!currentTrail.photos) {
                currentTrail.photos = [];
            }
            
            currentTrail.photos.push({
                position: positionArray,
                imageData: compressedImage,
                timestamp: new Date()
            });
            
            // Add marker to map
            addPhotoMarker(currentTrail.layerGroup, positionArray, compressedImage);
            
            // Auto-save after adding photo
            saveTrails();
        }
    };
    reader.readAsDataURL(file);
    
    // Reset input
    e.target.value = '';
});

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
        photos: [],
        layerGroup: L.layerGroup().addTo(map)
    };
    
    // Immediately save the new trail as a draft
    trails.push(currentTrail);
    saveTrails();
    updateTrailList();
    
    // Start watching position with high accuracy settings
    watchId = navigator.geolocation.watchPosition(
        (position) => {
            const { latitude, longitude, accuracy } = position.coords;
            
            // Filter out inaccurate readings - only accept points with accuracy better than 20 meters
            if (accuracy > 20) {
                console.log(`Skipping inaccurate point: accuracy ${accuracy}m`);
                return;
            }
            
            const newPoint = [latitude, longitude];
            
            // Update user marker
            if (userMarker) {
                userMarker.setLatLng(newPoint);
            }
            
            // Add point to trail only if it's far enough from the last point (min 2 meters)
            if (currentTrail.points.length > 0) {
                const lastPoint = currentTrail.points[currentTrail.points.length - 1];
                const distance = map.distance(lastPoint, newPoint);
                
                // Skip if the point is too close (reduces GPS jitter)
                if (distance < 2) {
                    return;
                }
                
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
            
            // Auto-save after each point is added
            saveTrails();
            
            // Center map on user
            map.panTo(newPoint);
        },
        (error) => {
            console.error('Error watching position:', error);
        },
        {
            enableHighAccuracy: true,
            maximumAge: 0,
            timeout: 10000,
            distanceFilter: 2
        }
    );
    
    // Update UI
    document.getElementById('newTrailBtn').style.display = 'none';
    document.getElementById('stopTrailBtn').style.display = 'flex';
    document.getElementById('cameraBtn').style.display = 'flex';
    document.getElementById('deleteTrailBtn').style.display = 'flex';
}

// Stop recording current trail
function stopTrail() {
    if (!currentTrail) return;
    
    if (watchId) {
        navigator.geolocation.clearWatch(watchId);
        watchId = null;
    }
    
    // Final save
    saveTrails();
    updateTrailList();
    
    currentTrail = null;
    
    // Update UI
    document.getElementById('newTrailBtn').style.display = 'flex';
    document.getElementById('stopTrailBtn').style.display = 'none';
    document.getElementById('cameraBtn').style.display = 'none';
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
    
    // Remove from trails array
    const index = trails.findIndex(t => t.id === currentTrail.id);
    if (index !== -1) {
        trails.splice(index, 1);
        saveTrails();
        updateTrailList();
    }
    
    currentTrail = null;
    
    // Update UI
    document.getElementById('newTrailBtn').style.display = 'flex';
    document.getElementById('stopTrailBtn').style.display = 'none';
    document.getElementById('cameraBtn').style.display = 'none';
    document.getElementById('deleteTrailBtn').style.display = 'none';
}

// Delete saved trail
function deleteSavedTrail(trailId) {
    const index = trails.findIndex(t => t.id === trailId);
    if (index === -1) return;
    
    const trail = trails[index];
    map.removeLayer(trail.layerGroup);
    trails.splice(index, 1);
    saveTrails();
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

// Close modal
document.querySelector('.modal-close').addEventListener('click', () => {
    document.getElementById('imageModal').style.display = 'none';
});

document.getElementById('imageModal').addEventListener('click', (e) => {
    if (e.target.id === 'imageModal') {
        document.getElementById('imageModal').style.display = 'none';
    }
});

// Event listeners
document.getElementById('newTrailBtn').addEventListener('click', startNewTrail);
document.getElementById('stopTrailBtn').addEventListener('click', stopTrail);
document.getElementById('cameraBtn').addEventListener('click', takePhoto);
document.getElementById('deleteTrailBtn').addEventListener('click', deleteCurrentTrail);

// Initialize
initMap();
loadTrails();
updateTrailList();