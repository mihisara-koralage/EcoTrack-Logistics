import { expect } from 'chai';
import mapService from '../src/services/mapService.js';

describe('Map Service Tests', function() {
  this.timeout(10000); // Increase timeout for API calls

  describe('Configuration', () => {
    it('should return provider information', () => {
      const info = mapService.getProviderInfo();
      expect(info).to.have.property('provider');
      expect(info).to.have.property('configured');
      expect(info).to.have.property('baseUrl');
    });

    it('should check if properly configured', () => {
      const isConfigured = mapService.isConfigured();
      // This will be false unless API keys are set in environment
      expect(typeof isConfigured).to.equal('boolean');
    });
  });

  describe('Distance Calculation', () => {
    it('should handle missing API configuration gracefully', async () => {
      try {
        await mapService.calculateDistanceAndTime(
          40.7128, -74.0060, // New York
          34.0522, -118.2437  // Los Angeles
        );
        // If no API key is configured, should throw an error
        expect.fail('Should have thrown an error without API configuration');
      } catch (error) {
        expect(error).to.be.an('error');
        expect(error.message).to.include('Failed to calculate distance');
      }
    });

    it('should validate coordinate inputs', async () => {
      try {
        await mapService.calculateDistanceAndTime(
          null, null, null, null
        );
        expect.fail('Should have thrown an error with invalid coordinates');
      } catch (error) {
        expect(error).to.be.an('error');
      }
    });
  });

  describe('Route Optimization', () => {
    it('should handle route optimization requests', async () => {
      try {
        const waypoints = [
          { lat: 40.7128, lng: -74.0060 }, // New York
          { lat: 41.8781, lng: -87.6298 }, // Chicago
          { lat: 34.0522, lng: -118.2437 }  // Los Angeles
        ];

        await mapService.getOptimizedRoute(waypoints);
        expect.fail('Should have thrown an error without API configuration');
      } catch (error) {
        expect(error).to.be.an('error');
        expect(error.message).to.include('Failed to optimize route');
      }
    });
  });

  describe('Error Handling', () => {
    it('should handle invalid provider configuration', () => {
      // Temporarily set invalid provider
      const originalProvider = process.env.MAP_PROVIDER;
      process.env.MAP_PROVIDER = 'invalid';

      try {
        new (require('../src/services/mapService.js').default)();
        expect.fail('Should have thrown an error for invalid provider');
      } catch (error) {
        expect(error).to.be.an('error');
        expect(error.message).to.include('Invalid MAP_PROVIDER');
      } finally {
        // Restore original provider
        if (originalProvider) {
          process.env.MAP_PROVIDER = originalProvider;
        } else {
          delete process.env.MAP_PROVIDER;
        }
      }
    });
  });
});
