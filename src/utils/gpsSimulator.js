/**
 * GPS Simulation Utility
 * Generates random latitude and longitude values for parcel tracking simulation.
 * This is a placeholder for real GPS integration.
 */

/**
 * Generates a random latitude within a reasonable range
 * @returns {number} Random latitude between -90 and 90
 */
function generateRandomLatitude() {
  // Generate latitude between -90 and 90 degrees
  // Using a narrower range for more realistic delivery scenarios
  return (Math.random() * 180 - 90).toFixed(6);
}

/**
 * Generates a random longitude within a reasonable range
 * @returns {number} Random longitude between -180 and 180
 */
function generateRandomLongitude() {
  // Generate longitude between -180 and 180 degrees
  // Using a narrower range for more realistic delivery scenarios
  return (Math.random() * 360 - 180).toFixed(6);
}

/**
 * Generates a random GPS coordinate pair
 * @returns {Object} Object with latitude and longitude properties
 */
function generateRandomCoordinates() {
  return {
    latitude: parseFloat(generateRandomLatitude()),
    longitude: parseFloat(generateRandomLongitude()),
    timestamp: new Date().toISOString(),
    accuracy: Math.floor(Math.random() * 20) + 5, // Random accuracy between 5-25 meters
    speed: Math.floor(Math.random() * 60) + 0, // Random speed between 0-60 km/h
  };
}

/**
 * Generates coordinates near a given location (for simulating movement)
 * @param {number} baseLatitude - Starting latitude
 * @param {number} baseLongitude - Starting longitude
 * @param {number} radiusKm - Maximum distance in kilometers from base point
 * @returns {Object} Object with latitude and longitude properties
 */
function generateNearbyCoordinates(baseLatitude, baseLongitude, radiusKm = 1) {
  // Convert radius from kilometers to degrees (approximate)
  const radiusInDegrees = radiusKm / 111; // 1 degree ≈ 111 km
  
  // Generate random offset within radius
  const latOffset = (Math.random() - 0.5) * 2 * radiusInDegrees;
  const lngOffset = (Math.random() - 0.5) * 2 * radiusInDegrees;
  
  return {
    latitude: parseFloat((baseLatitude + latOffset).toFixed(6)),
    longitude: parseFloat((baseLongitude + lngOffset).toFixed(6)),
    timestamp: new Date().toISOString(),
    accuracy: Math.floor(Math.random() * 20) + 5,
    speed: Math.floor(Math.random() * 60) + 0,
  };
}

/**
 * Simulates GPS coordinates for different parcel status scenarios
 * @param {string} status - Current parcel status
 * @param {Object} currentLocation - Current parcel location
 * @returns {Object} Simulated GPS coordinates
 */
function simulateLocationUpdate(status, currentLocation = null) {
  // Default coordinates (center of a hypothetical service area)
  const defaultLat = 40.7128; // New York coordinates as example
  const defaultLng = -74.0060;
  
  switch (status) {
    case 'PickedUp':
      // When picked up, generate coordinates near the pickup location
      return generateNearbyCoordinates(defaultLat, defaultLng, 0.5);
      
    case 'InTransit':
      // When in transit, generate coordinates along the route
      if (currentLocation) {
        // Move closer to destination
        return generateNearbyCoordinates(
          currentLocation.latitude,
          currentLocation.longitude,
          2.0 // Larger radius for transit movement
        );
      } else {
        return generateNearbyCoordinates(defaultLat, defaultLng, 5.0);
      }
      
    case 'OutForDelivery':
      // When out for delivery, generate coordinates very close to destination
      if (currentLocation) {
        return generateNearbyCoordinates(
          currentLocation.latitude,
          currentLocation.longitude,
          0.2 // Small radius for final delivery
        );
      } else {
        return generateNearbyCoordinates(defaultLat, defaultLng, 1.0);
      }
      
    case 'Delivered':
      // When delivered, use the exact delivery location
      return {
        latitude: parseFloat((defaultLat + (Math.random() - 0.5) * 0.01).toFixed(6)),
        longitude: parseFloat((defaultLng + (Math.random() - 0.5) * 0.01).toFixed(6)),
        timestamp: new Date().toISOString(),
        accuracy: 5, // High accuracy for delivered status
        speed: 0, // No speed when delivered
      };
      
    default:
      return generateRandomCoordinates();
  }
}

export {
  generateRandomLatitude,
  generateRandomLongitude,
  generateRandomCoordinates,
  generateNearbyCoordinates,
  simulateLocationUpdate,
};
