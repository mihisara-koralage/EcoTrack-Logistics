import axios from 'axios';

/**
 * Map Service for EcoTrack Logistics System
 * 
 * Uses OpenStreetMap (OSM) with Leaflet.js for visualization
 * and OpenRouteService for routing calculations
 * 
 * This implementation uses only free and open-source tools
 * suitable for prototype development and academic demonstration.
 */

class MapService {
  constructor() {
    this.provider = 'openstreetmap'; // OSM-based service
    this.apiKey = this.getApiKey();
    this.baseUrl = this.getBaseUrl();
  }

  /**
   * Get API key for OpenRouteService
   * @returns {string} API key from environment variables
   */
  getApiKey() {
    return process.env.OPENROUTESERVICE_API_KEY || '';
  }

  /**
   * Get base URL for OpenRouteService
   * @returns {string} Base URL for API requests
   */
  getBaseUrl() {
    return 'https://api.openrouteservice.org';
  }

  /**
   * Calculate distance and travel time between two coordinates
   * @param {number} originLat - Origin latitude
   * @param {number} originLng - Origin longitude
   * @param {number} destLat - Destination latitude
   * @param {number} destLng - Destination longitude
   * @returns {Promise<Object>} Distance and duration information
   */
  async calculateDistanceAndTime(originLat, originLng, destLat, destLng) {
    try {
      return await this.openRouteServiceDistance(originLat, originLng, destLat, destLng);
    } catch (error) {
      console.error('OpenRouteService API Error:', error.message);
      // Fallback to Haversine calculation if API fails
      return this.fallbackDistanceCalculation(originLat, originLng, destLat, destLng);
    }
  }

  /**
   * OpenRouteService API implementation for distance calculation
   * @private
   */
  async openRouteServiceDistance(originLat, originLng, destLat, destLng) {
    if (!this.apiKey) {
      throw new Error('OpenRouteService API key not configured');
    }

    const url = `${this.baseUrl}/v2/directions/driving-car`;
    const params = {
      api_key: this.apiKey,
      start: [originLng, originLat].join(','),
      end: [destLng, destLat].join(',')
    };

    const response = await axios.get(url, { params });
    
    if (response.data.features.length === 0) {
      throw new Error('No route found between coordinates');
    }

    const route = response.data.features[0];
    const distance = route.properties.segments[0].distance; // meters
    const duration = route.properties.segments[0].duration; // seconds

    return {
      distanceKm: distance / 1000,
      durationMinutes: Math.round(duration / 60),
      provider: 'openrouteservice',
      rawResponse: route
    };
  }

  /**
   * Fallback distance calculation using Haversine formula
   * @private
   */
  fallbackDistanceCalculation(originLat, originLng, destLat, destLng) {
    const R = 6371; // Earth's radius in km
    const dLat = this.toRadians(destLat - originLat);
    const dLng = this.toRadians(destLng - originLng);
    
    const a = 
      Math.sin(dLat/2) * Math.sin(dLat/2) +
      Math.cos(this.toRadians(originLat)) * Math.cos(this.toRadians(destLat)) *
      Math.sin(dLng/2) * Math.sin(dLng/2);
    
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
    const distance = R * c;
    
    // Estimate time based on average city driving speed (40 km/h)
    const estimatedTime = (distance / 40) * 60; // minutes
    
    return {
      distanceKm: distance,
      durationMinutes: Math.round(estimatedTime),
      provider: 'haversine_fallback',
      rawResponse: null
    };
  }

  /**
   * Get optimized route with multiple waypoints
   * @param {Array} waypoints - Array of {lat, lng} coordinates
   * @param {string} optimizationType - 'time' or 'distance'
   * @returns {Promise<Object>} Optimized route information
   */
  async getOptimizedRoute(waypoints, optimizationType = 'time') {
    try {
      return await this.openRouteServiceOptimize(waypoints, optimizationType);
    } catch (error) {
      console.error('Route optimization error:', error.message);
      // Return sequential route as fallback
      return this.fallbackRouteOptimization(waypoints);
    }
  }

  /**
   * OpenRouteService route optimization
   * @private
   */
  async openRouteServiceOptimize(waypoints, optimizationType) {
    if (!this.apiKey) {
      throw new Error('OpenRouteService API key not configured');
    }

    if (waypoints.length < 2) {
      throw new Error('At least 2 waypoints required for routing');
    }

    const url = `${this.baseUrl}/v2/directions/driving-car`;
    const coordinates = waypoints.map(wp => [wp.lng, wp.lat]).join('|');
    
    const params = {
      api_key: this.apiKey,
      coordinates: coordinates
    };

    const response = await axios.get(url, { params });
    
    if (response.data.features.length === 0) {
      throw new Error('No route found for waypoints');
    }

    const route = response.data.features[0];
    const distance = route.properties.segments.reduce((sum, seg) => sum + seg.distance, 0);
    const duration = route.properties.segments.reduce((sum, seg) => sum + seg.duration, 0);

    return {
      totalDistanceKm: distance / 1000,
      totalDurationMinutes: Math.round(duration / 60),
      optimizedOrder: waypoints.map((_, index) => index),
      provider: 'openrouteservice',
      rawResponse: route
    };
  }

  /**
   * Fallback route optimization (sequential waypoints)
   * @private
   */
  fallbackRouteOptimization(waypoints) {
    let totalDistance = 0;
    let totalTime = 0;
    
    for (let i = 0; i < waypoints.length - 1; i++) {
      const result = this.fallbackDistanceCalculation(
        waypoints[i].lat, waypoints[i].lng,
        waypoints[i + 1].lat, waypoints[i + 1].lng
      );
      totalDistance += result.distanceKm;
      totalTime += result.durationMinutes;
    }

    return {
      totalDistanceKm: totalDistance,
      totalDurationMinutes: Math.round(totalTime),
      optimizedOrder: waypoints.map((_, index) => index),
      provider: 'sequential_fallback',
      rawResponse: null
    };
  }

  /**
   * Convert degrees to radians
   * @private
   */
  toRadians(degrees) {
    return degrees * (Math.PI / 180);
  }

  /**
   * Validate API configuration
   * @returns {boolean} True if properly configured
   */
  isConfigured() {
    return !!(this.apiKey && this.provider);
  }

  /**
   * Get provider information
   * @returns {Object} Current provider configuration
   */
  getProviderInfo() {
    return {
      provider: this.provider,
      configured: this.isConfigured(),
      baseUrl: this.baseUrl,
      description: 'OpenStreetMap with OpenRouteService - Free and open-source mapping solution'
    };
  }

  /**
   * Get OpenStreetMap tile URL for Leaflet
   * @returns {string} OSM tile server URL
   */
  getTileUrl() {
    return 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png';
  }

  /**
   * Get attribution for OpenStreetMap
   * @returns {string} OSM attribution text
   */
  getAttribution() {
    return '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors';
  }
}

// Export singleton instance
const mapService = new MapService();

export default mapService;
