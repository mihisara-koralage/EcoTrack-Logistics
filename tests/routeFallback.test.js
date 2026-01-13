import { expect } from 'chai';
import routeFallback from '../src/services/routeFallback.js';

describe('Route Fallback Service Tests', function() {
  this.timeout(10000);

  beforeEach(() => {
    // Clear cache before each test
    routeFallback.cache.clear();
  });

  describe('Cache Management', () => {
    it('should cache and retrieve route data', () => {
      const key = 'test-key';
      const testData = { success: true, routes: { shortest: {}, eco: {} } };

      routeFallback.cacheRoute(key, testData);
      const cached = routeFallback.getCachedRoute(key);

      expect(cached).to.deep.equal(testData);
    });

    it('should return null for expired cache', () => {
      const key = 'expired-key';
      const testData = { success: true };

      // Cache with very short TTL
      routeFallback.cacheRoute(key, testData);
      
      // Manually expire the cache
      const cached = routeFallback.cache.get(key);
      cached.timestamp = Date.now() - 40000; // 40 seconds ago (expired)
      cached.ttl = 30000; // 30 seconds

      const result = routeFallback.getCachedRoute(key);
      expect(result).to.be.null;
    });

    it('should generate consistent cache keys', () => {
      const pickup = { latitude: 40.7128, longitude: -74.0060 };
      const delivery = { latitude: 34.0522, longitude: -118.2437 };
      const options = { vehicleType: 'medium', fuelType: 'hybrid' };

      const key1 = routeFallback.generateRouteKey(pickup, delivery, options);
      const key2 = routeFallback.generateRouteKey(pickup, delivery, options);

      expect(key1).to.equal(key2);
      expect(key1).to.be.a('string');
      expect(key1).to.have.length(32); // Base64 truncated to 32 chars
    });
  });

  describe('Fallback Route Calculation', () => {
    it('should calculate fallback route with realistic data', () => {
      const pickup = { latitude: 40.7128, longitude: -74.0060 };
      const delivery = { latitude: 34.0522, longitude: -118.2437 };
      const options = { vehicleType: 'medium', fuelType: 'hybrid' };

      const result = routeFallback.calculateFallbackRoute(pickup, delivery, options);

      expect(result).to.have.property('success', true);
      expect(result).to.have.property('routes');
      expect(result.routes).to.have.property('shortest');
      expect(result.routes).to.have.property('eco');
      expect(result).to.have.property('comparison');
      expect(result).to.have.property('recommendation');
    });

    it('should calculate different metrics for shortest vs eco routes', () => {
      const pickup = { latitude: 40.7128, longitude: -74.0060 };
      const delivery = { latitude: 34.0522, longitude: -118.2437 };
      const options = { vehicleType: 'medium', fuelType: 'hybrid' };

      const result = routeFallback.calculateFallbackRoute(pickup, delivery, options);

      // Eco route should be longer but have lower carbon
      expect(result.routes.eco.distanceKm).to.be.greaterThan(result.routes.shortest.distanceKm);
      expect(result.routes.eco.carbonFootprintKg).to.be.lessThan(result.routes.shortest.carbonFootprintKg);
      expect(result.routes.eco.estimatedTimeMinutes).to.be.greaterThan(result.routes.shortest.estimatedTimeMinutes);
    });

    it('should use correct emission factors', () => {
      const pickup = { latitude: 40.7128, longitude: -74.0060 };
      const delivery = { latitude: 34.0522, longitude: -118.2437 };
      const distance = 100; // 100 km

      // Test different fuel types
      const standardResult = routeFallback.calculateFallbackRoute(pickup, delivery, { fuelType: 'standard' });
      const electricResult = routeFallback.calculateFallbackRoute(pickup, delivery, { fuelType: 'electric' });
      const hybridResult = routeFallback.calculateFallbackRoute(pickup, delivery, { fuelType: 'hybrid' });

      // Electric should have lowest emissions
      expect(electricResult.routes.shortest.carbonFootprintKg).to.be.lessThan(hybridResult.routes.shortest.carbonFootprintKg);
      expect(hybridResult.routes.shortest.carbonFootprintKg).to.be.lessThan(standardResult.routes.shortest.carbonFootprintKg);
    });

    it('should handle different vehicle types', () => {
      const pickup = { latitude: 40.7128, longitude: -74.0060 };
      const delivery = { latitude: 34.0522, longitude: -118.2437 };

      const lightResult = routeFallback.calculateFallbackRoute(pickup, delivery, { vehicleType: 'light' });
      const mediumResult = routeFallback.calculateFallbackRoute(pickup, delivery, { vehicleType: 'medium' });
      const heavyResult = routeFallback.calculateFallbackRoute(pickup, delivery, { vehicleType: 'heavy' });

      // Light vehicles should be faster
      expect(lightResult.routes.shortest.estimatedTimeMinutes).to.be.lessThan(mediumResult.routes.shortest.estimatedTimeMinutes);
      expect(mediumResult.routes.shortest.estimatedTimeMinutes).to.be.lessThan(heavyResult.routes.shortest.estimatedTimeMinutes);
    });
  });

  describe('Mock Route Matching', () => {
    it('should match NYC to LA route', () => {
      const pickup = { latitude: 40.7128, longitude: -74.0060 }; // NYC
      const delivery = { latitude: 34.0522, longitude: -118.2437 }; // LA

      const result = routeFallback.calculateFallbackRoute(pickup, delivery);

      expect(result).to.have.property('success', true);
      expect(result.routes.shortest.distanceKm).to.be.approximately(3944, 10);
      expect(result.routes.eco.distanceKm).to.be.approximately(4256, 10);
    });

    it('should return calculated route for unknown cities', () => {
      const pickup = { latitude: 45.0, longitude: -93.0 }; // Minneapolis
      const delivery = { latitude: 39.7392, longitude: -104.9903 }; // Denver

      const result = routeFallback.calculateFallbackRoute(pickup, delivery);

      expect(result).to.have.property('success', true);
      expect(result).to.have.property('fallbackUsed', true);
      expect(result.fallbackReason).to.include('calculated fallback');
    });
  });

  describe('Distance Calculation', () => {
    it('should calculate correct distance between coordinates', () => {
      const pickup = { latitude: 40.7128, longitude: -74.0060 }; // NYC
      const delivery = { latitude: 34.0522, longitude: -118.2437 }; // LA

      const distance = routeFallback.calculateDistance(pickup, delivery);

      // Expected distance is approximately 3944 km
      expect(distance).to.be.approximately(3944, 50);
    });

    it('should handle same coordinates', () => {
      const pickup = { latitude: 40.7128, longitude: -74.0060 };
      const delivery = { latitude: 40.7128, longitude: -74.0060 };

      const distance = routeFallback.calculateDistance(pickup, delivery);

      expect(distance).to.equal(0);
    });
  });

  describe('API Failure Handling', () => {
    it('should handle Map API failure gracefully', () => {
      const pickup = { latitude: 40.7128, longitude: -74.0060 };
      const delivery = { latitude: 34.0522, longitude: -118.2437 };
      const options = { vehicleType: 'medium', fuelType: 'hybrid' };
      const mockError = new Error('Map API timeout');

      const result = routeFallback.handleMapApiFailure(mockError, pickup, delivery, options);

      expect(result).to.have.property('success', true);
      expect(result).to.have.property('fallbackUsed', true);
      expect(result.fallbackReason).to.include('Map API unavailable');
      expect(result).to.have.property('routes');
    });

    it('should use cached route when available', () => {
      const pickup = { latitude: 40.7128, longitude: -74.0060 };
      const delivery = { latitude: 34.0522, longitude: -118.2437 };
      const options = { vehicleType: 'medium', fuelType: 'hybrid' };
      const mockError = new Error('Map API timeout');

      // Pre-cache a route
      const cachedData = { success: true, routes: { shortest: { distanceKm: 100 }, eco: { distanceKm: 110 } } };
      const cacheKey = routeFallback.generateRouteKey(pickup, delivery, options);
      routeFallback.cacheRoute(cacheKey, cachedData);

      const result = routeFallback.handleMapApiFailure(mockError, pickup, delivery, options);

      expect(result).to.have.property('success', true);
      expect(result).to.have.property('fallbackUsed', true);
      expect(result.fallbackReason).to.include('Using cached route data');
      expect(result.routes.shortest.distanceKm).to.equal(100);
    });
  });

  describe('System Status', () => {
    it('should return system health information', () => {
      const status = routeFallback.getSystemStatus();

      expect(status).to.have.property('mapApiStatus');
      expect(status).to.have.property('cacheSize');
      expect(status).to.have.property('mockRoutesAvailable');
      expect(status).to.have.property('systemHealth');
      expect(status.systemHealth).to.equal('operational');
    });

    it('should track cache size correctly', () => {
      // Add some cached routes
      routeFallback.cacheRoute('key1', { data: 'test1' });
      routeFallback.cacheRoute('key2', { data: 'test2' });
      routeFallback.cacheRoute('key3', { data: 'test3' });

      const status = routeFallback.getSystemStatus();

      expect(status.cacheSize).to.equal(3);
    });
  });

  describe('Cache Cleanup', () => {
    it('should remove expired cache entries', () => {
      // Add expired entry
      const expiredEntry = { timestamp: Date.now() - 40000, ttl: 30000 }; // 40 seconds ago, expired
      routeFallback.cache.set('expired', expiredEntry);

      // Add valid entry
      const validEntry = { timestamp: Date.now() - 10000, ttl: 30000 }; // 10 seconds ago, valid
      routeFallback.cache.set('valid', validEntry);

      routeFallback.cleanupCache();

      expect(routeFallback.cache.has('expired')).to.be.false;
      expect(routeFallback.cache.has('valid')).to.be.true;
    });
  });

  describe('Preloading Common Routes', () => {
    it('should preload common city-to-city routes', () => {
      routeFallback.preloadCommonRoutes();

      const status = routeFallback.getSystemStatus();
      expect(status.cacheSize).to.be.greaterThan(0);

      // Check if common routes are cached
      const nycLaKey = routeFallback.generateRouteKey(
        { latitude: 40.7128, longitude: -74.0060 },
        { latitude: 34.0522, longitude: -118.2437 },
        {}
      );

      const cached = routeFallback.getCachedRoute(nycLaKey);
      expect(cached).to.not.be.null;
      expect(cached).to.have.property('success', true);
    });
  });
});
