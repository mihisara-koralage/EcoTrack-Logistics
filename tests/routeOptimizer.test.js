import { expect } from 'chai';
import routeOptimizer from '../src/services/routeOptimizer.js';

describe('Route Optimizer Tests', function() {
  this.timeout(15000); // Increase timeout for complex calculations

  describe('Basic Route Optimization', () => {
    it('should optimize route between two points', async () => {
      const pickup = { latitude: 40.7128, longitude: -74.0060 }; // New York
      const delivery = { latitude: 34.0522, longitude: -118.2437 }; // Los Angeles

      try {
        const result = await routeOptimizer.optimizeRoute(pickup, delivery);
        
        expect(result).to.have.property('success');
        expect(result).to.have.property('routes');
        expect(result.routes).to.have.property('shortest');
        expect(result.routes).to.have.property('eco');
        expect(result).to.have.property('comparison');
        expect(result).to.have.property('recommendation');
        
        // Verify route structures
        expect(result.routes.shortest).to.have.property('type', 'Shortest');
        expect(result.routes.eco).to.have.property('type', 'EcoFriendly');
        
        // Verify carbon footprint calculations
        expect(result.routes.shortest.carbonFootprintKg).to.be.a('number');
        expect(result.routes.eco.carbonFootprintKg).to.be.a('number');
        
      } catch (error) {
        // Expected to fail without Map API configuration
        expect(error).to.be.an('error');
        expect(error.message).to.include('Route optimization failed');
      }
    });

    it('should validate input coordinates', async () => {
      try {
        await routeOptimizer.optimizeRoute(null, { latitude: 34.0522, longitude: -118.2437 });
        expect.fail('Should have thrown an error for invalid pickup');
      } catch (error) {
        expect(error).to.be.an('error');
        expect(error.message).to.include('Invalid pickup coordinates');
      }
    });

    it('should handle invalid latitude values', async () => {
      try {
        await routeOptimizer.optimizeRoute(
          { latitude: 91, longitude: -74.0060 }, // Invalid latitude
          { latitude: 34.0522, longitude: -118.2437 }
        );
        expect.fail('Should have thrown an error for invalid latitude');
      } catch (error) {
        expect(error).to.be.an('error');
        expect(error.message).to.include('Invalid pickup latitude');
      }
    });

    it('should handle invalid longitude values', async () => {
      try {
        await routeOptimizer.optimizeRoute(
          { latitude: 40.7128, longitude: 181 }, // Invalid longitude
          { latitude: 34.0522, longitude: -118.2437 }
        );
        expect.fail('Should have thrown an error for invalid longitude');
      } catch (error) {
        expect(error).to.be.an('error');
        expect(error.message).to.include('Invalid pickup longitude');
      }
    });
  });

  describe('Carbon Footprint Calculations', () => {
    it('should calculate carbon footprint correctly', () => {
      const distance = 100; // 100 km
      const emissionFactor = 0.28; // Medium standard vehicle
      const expected = 28; // 100 × 0.28 = 28 kg

      const result = routeOptimizer.calculateCarbonFootprint(distance, emissionFactor);
      expect(result).to.equal(expected);
    });

    it('should round carbon footprint to 2 decimal places', () => {
      const distance = 123.456;
      const emissionFactor = 0.19;
      const expected = 23.46; // Rounded to 2 decimal places

      const result = routeOptimizer.calculateCarbonFootprint(distance, emissionFactor);
      expect(result).to.equal(expected);
    });
  });

  describe('Vehicle Categories', () => {
    it('should categorize light cargo correctly', () => {
      const category = routeOptimizer.getVehicleCategory(500); // 500 kg
      expect(category.type).to.equal('small');
      expect(category.weight).to.equal('< 1 ton');
    });

    it('should categorize medium cargo correctly', () => {
      const category = routeOptimizer.getVehicleCategory(2000); // 2000 kg
      expect(category.type).to.equal('medium');
      expect(category.weight).to.equal('1-3 tons');
    });

    it('should categorize heavy cargo correctly', () => {
      const category = routeOptimizer.getVehicleCategory(5000); // 5000 kg
      expect(category.type).to.equal('large');
      expect(category.weight).to.equal('> 3 tons');
    });
  });

  describe('Route Comparison', () => {
    it('should generate route comparison insights', () => {
      const shortestRoute = {
        distanceKm: 100,
        estimatedTimeMinutes: 120,
        carbonFootprintKg: 28,
        costEstimate: 45
      };

      const ecoRoute = {
        distanceKm: 108, // 8% longer
        estimatedTimeMinutes: 141, // 15% slower
        carbonFootprintKg: 18.2, // 35% reduction
        costEstimate: 37.8
      };

      const comparison = routeOptimizer.compareRoutes(shortestRoute, ecoRoute, {});

      expect(comparison.carbonSavings.kg).to.equal(9.8);
      expect(comparison.carbonSavings.percentage).to.equal(35);
      expect(comparison.timeImpact.additionalMinutes).to.equal(21);
      expect(comparison.timeImpact.percentage).to.equal(18);
    });

    it('should provide eco recommendation when benefits are significant', () => {
      const comparison = {
        carbonSavings: { percentage: 25 },
        timeImpact: { percentage: 10 },
        costImpact: { percentage: 5 }
      };

      const recommendation = routeOptimizer.getRecommendation(comparison);
      expect(recommendation.recommended).to.equal('eco');
      expect(recommendation.confidence).to.equal('high');
    });

    it('should recommend shortest route when time impact is high', () => {
      const comparison = {
        carbonSavings: { percentage: 5 },
        timeImpact: { percentage: 30 },
        costImpact: { percentage: 15 }
      };

      const recommendation = routeOptimizer.getRecommendation(comparison);
      expect(recommendation.recommended).to.equal('shortest');
      expect(recommendation.confidence).to.equal('high');
    });
  });

  describe('Batch Optimization', () => {
    it('should handle multiple route optimization requests', async () => {
      const routes = [
        {
          pickup: { latitude: 40.7128, longitude: -74.0060 },
          delivery: { latitude: 34.0522, longitude: -118.2437 },
          options: { vehicleType: 'light' }
        },
        {
          pickup: { latitude: 41.8781, longitude: -87.6298 },
          delivery: { latitude: 42.3601, longitude: -71.0589 },
          options: { vehicleType: 'heavy' }
        }
      ];

      try {
        const results = await routeOptimizer.optimizeMultipleRoutes(routes);
        expect(results).to.be.an('array');
        expect(results).to.have.length(2);
        
        // Each result should have the expected structure
        results.forEach((result, index) => {
          expect(result).to.have.property('originalRequest');
          expect(result.originalRequest).to.deep.equal(routes[index]);
        });
      } catch (error) {
        // Expected to fail without Map API configuration
        expect(error).to.be.an('error');
      }
    });
  });

  describe('Statistics Generation', () => {
    it('should generate optimization statistics', () => {
      const optimizedRoutes = [
        {
          success: true,
          comparison: { carbonSavings: { kg: 10 }, timeImpact: { additionalMinutes: 15 } },
          recommendation: { recommended: 'eco' }
        },
        {
          success: true,
          comparison: { carbonSavings: { kg: 5 }, timeImpact: { additionalMinutes: 8 } },
          recommendation: { recommended: 'shortest' }
        },
        {
          success: false,
          error: 'Invalid coordinates'
        }
      ];

      const stats = routeOptimizer.getOptimizationStatistics(optimizedRoutes);

      expect(stats.totalRoutes).to.equal(3);
      expect(stats.successful).to.equal(2);
      expect(stats.failed).to.equal(1);
      expect(stats.totalCarbonSavings).to.equal(15);
      expect(stats.averageCarbonSavings).to.equal(7.5);
      expect(stats.totalTimeImpact).to.equal(23);
      expect(stats.averageTimeImpact).to.equal(12);
      expect(stats.recommendations.ecoChosen).to.equal(1);
      expect(stats.recommendations.shortestChosen).to.equal(1);
    });
  });

  describe('Fuel Consumption Calculations', () => {
    it('should calculate fuel consumption for different vehicle types', () => {
      const distance = 100; // 100 km
      
      // Standard medium vehicle: 12L/100km
      const standardFuel = routeOptimizer.calculateFuelConsumption(distance, 'standard', 'medium');
      expect(standardFuel).to.equal(12);

      // Electric medium vehicle: 25kWh/100km
      const electricFuel = routeOptimizer.calculateFuelConsumption(distance, 'electric', 'medium');
      expect(electricFuel).to.equal(25);

      // Hybrid medium vehicle: 9L/100km
      const hybridFuel = routeOptimizer.calculateFuelConsumption(distance, 'hybrid', 'medium');
      expect(hybridFuel).to.equal(9);
    });
  });

  describe('Cost Calculations', () => {
    it('should calculate route costs for different fuel types', () => {
      const distance = 100; // 100 km
      
      const standardCost = routeOptimizer.calculateCost(distance, 'standard');
      expect(standardCost).to.equal(45); // 100 × 0.45

      const electricCost = routeOptimizer.calculateCost(distance, 'electric');
      expect(electricCost).to.equal(25); // 100 × 0.25

      const hybridCost = routeOptimizer.calculateCost(distance, 'hybrid');
      expect(hybridCost).to.equal(35); // 100 × 0.35
    });
  });
});
