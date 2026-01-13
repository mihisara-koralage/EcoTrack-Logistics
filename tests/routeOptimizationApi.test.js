import { expect } from 'chai';
import request from 'supertest';
import mongoose from 'mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';
import app from '../src/app.js';
import User from '../src/models/User.js';
import Parcel from '../src/models/Parcel.js';

describe('Route Optimization API Tests', function() {
  this.timeout(15000); // Increase timeout for API calls

  let mongoServer;
  let supervisorToken, driverToken;
  let supervisorId, driverId;
  let testParcel;

  before(async () => {
    mongoServer = await MongoMemoryServer.create();
    const mongoUri = mongoServer.getUri();
    await mongoose.connect(mongoUri);
  });

  after(async () => {
    await mongoose.disconnect();
    await mongoServer.stop();
  });

  beforeEach(async () => {
    await User.deleteMany({});
    await Parcel.deleteMany({});

    // Create test users
    const supervisor = await User.create({
      name: 'Test Supervisor',
      email: 'supervisor@test.com',
      password: 'password123',
      role: 'Supervisor',
    });

    const driver = await User.create({
      name: 'Test Driver',
      email: 'driver@test.com',
      password: 'password123',
      role: 'Driver',
    });

    supervisorId = supervisor._id;
    driverId = driver._id;

    // Get tokens
    const supervisorLogin = await request(app)
      .post('/api/auth/login')
      .send({ email: 'supervisor@test.com', password: 'password123' });

    const driverLogin = await request(app)
      .post('/api/auth/login')
      .send({ email: 'driver@test.com', password: 'password123' });

    supervisorToken = supervisorLogin.body.token;
    driverToken = driverLogin.body.token;

    // Create test parcel
    testParcel = await Parcel.create({
      parcelId: 'TEST001',
      senderName: 'Test Sender',
      receiverName: 'Test Receiver',
      pickupLocation: '123 Pickup St',
      deliveryLocation: '456 Delivery Ave',
      assignedDriver: driverId,
      status: 'PickedUp'
    });
  });

  describe('POST /api/routes/optimize', () => {
    it('should allow supervisor to optimize route', async () => {
      const routeData = {
        parcelId: 'TEST001',
        pickupLocation: { latitude: 40.7128, longitude: -74.0060 },
        deliveryLocation: { latitude: 34.0522, longitude: -118.2437 },
        options: {
          vehicleType: 'medium',
          fuelType: 'hybrid'
        }
      };

      const response = await request(app)
        .post('/api/routes/optimize')
        .set('Authorization', `Bearer ${supervisorToken}`)
        .send(routeData)
        .expect(200);

      expect(response.body).to.have.property('success', true);
      expect(response.body.data).to.have.property('optimizedRoutes');
      expect(response.body.data.optimizedRoutes).to.have.property('shortest');
      expect(response.body.data.optimizedRoutes).to.have.property('eco');
      expect(response.body.data).to.have.property('selectedRoute');
      expect(response.body.data).to.have.property('storedRoute');
    });

    it('should allow assigned driver to optimize route', async () => {
      const routeData = {
        parcelId: 'TEST001',
        pickupLocation: { latitude: 40.7128, longitude: -74.0060 },
        deliveryLocation: { latitude: 34.0522, longitude: -118.2437 }
      };

      const response = await request(app)
        .post('/api/routes/optimize')
        .set('Authorization', `Bearer ${driverToken}`)
        .send(routeData)
        .expect(200);

      expect(response.body).to.have.property('success', true);
      expect(response.body.data).to.have.property('optimizedRoutes');
    });

    it('should reject unassigned driver from optimizing route', async () => {
      // Create another driver not assigned to the parcel
      const otherDriver = await User.create({
        name: 'Other Driver',
        email: 'other@test.com',
        password: 'password123',
        role: 'Driver',
      });

      const otherLogin = await request(app)
        .post('/api/auth/login')
        .send({ email: 'other@test.com', password: 'password123' });

      const routeData = {
        parcelId: 'TEST001',
        pickupLocation: { latitude: 40.7128, longitude: -74.0060 },
        deliveryLocation: { latitude: 34.0522, longitude: -118.2437 }
      };

      const response = await request(app)
        .post('/api/routes/optimize')
        .set('Authorization', `Bearer ${otherLogin.body.token}`)
        .send(routeData)
        .expect(403);

      expect(response.body).to.have.property('message');
      expect(response.body.message).to.include('only optimize routes for parcels assigned to you');
    });

    it('should reject optimization without required fields', async () => {
      const incompleteData = {
        pickupLocation: { latitude: 40.7128, longitude: -74.0060 }
        // Missing parcelId and deliveryLocation
      };

      const response = await request(app)
        .post('/api/routes/optimize')
        .set('Authorization', `Bearer ${supervisorToken}`)
        .send(incompleteData)
        .expect(400);

      expect(response.body).to.have.property('message');
      expect(response.body.message).to.include('Parcel ID, pickup location, and delivery location are required');
    });

    it('should reject optimization for non-existent parcel', async () => {
      const routeData = {
        parcelId: 'NONEXISTENT',
        pickupLocation: { latitude: 40.7128, longitude: -74.0060 },
        deliveryLocation: { latitude: 34.0522, longitude: -118.2437 }
      };

      const response = await request(app)
        .post('/api/routes/optimize')
        .set('Authorization', `Bearer ${supervisorToken}`)
        .send(routeData)
        .expect(404);

      expect(response.body).to.have.property('message');
      expect(response.body.message).to.include('Parcel not found');
    });
  });

  describe('GET /api/routes/optimize/:parcelId/history', () => {
    it('should allow supervisor to view optimization history', async () => {
      const response = await request(app)
        .get('/api/routes/optimize/TEST001/history')
        .set('Authorization', `Bearer ${supervisorToken}`)
        .expect(200);

      expect(response.body).to.have.property('success', true);
      expect(response.body.data).to.have.property('parcel');
      expect(response.body.data).to.have.property('optimizationHistory');
      expect(response.body.data.optimizationHistory).to.be.an('array');
    });

    it('should allow assigned driver to view optimization history', async () => {
      const response = await request(app)
        .get('/api/routes/optimize/TEST001/history')
        .set('Authorization', `Bearer ${driverToken}`)
        .expect(200);

      expect(response.body).to.have.property('success', true);
      expect(response.body.data).to.have.property('optimizationHistory');
    });

    it('should reject unauthenticated access', async () => {
      const response = await request(app)
        .get('/api/routes/optimize/TEST001/history')
        .expect(401);

      expect(response.body).to.have.property('message');
    });
  });

  describe('PATCH /api/routes/optimize/:routeId', () => {
    let routeId;

    beforeEach(async () => {
      // First create an optimized route
      const optimizeResponse = await request(app)
        .post('/api/routes/optimize')
        .set('Authorization', `Bearer ${supervisorToken}`)
        .send({
          parcelId: 'TEST001',
          pickupLocation: { latitude: 40.7128, longitude: -74.0060 },
          deliveryLocation: { latitude: 34.0522, longitude: -118.2437 }
        });

      routeId = optimizeResponse.body.data.storedRoute.routeId;
    });

    it('should allow supervisor to update optimized route', async () => {
      const updateData = {
        options: {
          fuelType: 'electric',
          vehicleType: 'light'
        }
      };

      const response = await request(app)
        .patch(`/api/routes/optimize/${routeId}`)
        .set('Authorization', `Bearer ${supervisorToken}`)
        .send(updateData)
        .expect(200);

      expect(response.body).to.have.property('success', true);
      expect(response.body.data).to.have.property('updatedRoute');
      expect(response.body.data).to.have.property('comparison');
    });

    it('should allow assigned driver to update optimized route', async () => {
      const updateData = {
        options: {
          fuelType: 'electric'
        }
      };

      const response = await request(app)
        .patch(`/api/routes/optimize/${routeId}`)
        .set('Authorization', `Bearer ${driverToken}`)
        .send(updateData)
        .expect(200);

      expect(response.body).to.have.property('success', true);
    });

    it('should reject update for non-existent route', async () => {
      const fakeRouteId = new mongoose.Types.ObjectId();
      const updateData = { options: { fuelType: 'electric' } };

      const response = await request(app)
        .patch(`/api/routes/optimize/${fakeRouteId}`)
        .set('Authorization', `Bearer ${supervisorToken}`)
        .send(updateData)
        .expect(404);

      expect(response.body).to.have.property('message');
      expect(response.body.message).to.include('Route not found');
    });
  });

  describe('DELETE /api/routes/optimize/:routeId', () => {
    let routeId;

    beforeEach(async () => {
      // First create an optimized route
      const optimizeResponse = await request(app)
        .post('/api/routes/optimize')
        .set('Authorization', `Bearer ${supervisorToken}`)
        .send({
          parcelId: 'TEST001',
          pickupLocation: { latitude: 40.7128, longitude: -74.0060 },
          deliveryLocation: { latitude: 34.0522, longitude: -118.2437 }
        });

      routeId = optimizeResponse.body.data.storedRoute.routeId;
    });

    it('should allow supervisor to delete optimized route', async () => {
      const response = await request(app)
        .delete(`/api/routes/optimize/${routeId}`)
        .set('Authorization', `Bearer ${supervisorToken}`)
        .expect(200);

      expect(response.body).to.have.property('success', true);
      expect(response.body.data).to.have.property('deletedRoute');
    });

    it('should reject driver from deleting optimized route', async () => {
      const response = await request(app)
        .delete(`/api/routes/optimize/${routeId}`)
        .set('Authorization', `Bearer ${driverToken}`)
        .expect(403);

      expect(response.body).to.have.property('message');
      expect(response.body.message).to.include('Only supervisors can delete optimized routes');
    });

    it('should reject delete for non-existent route', async () => {
      const fakeRouteId = new mongoose.Types.ObjectId();

      const response = await request(app)
        .delete(`/api/routes/optimize/${fakeRouteId}`)
        .set('Authorization', `Bearer ${supervisorToken}`)
        .expect(404);

      expect(response.body).to.have.property('message');
      expect(response.body.message).to.include('Route not found');
    });
  });

  describe('Route Optimization Data Validation', () => {
    it('should validate coordinate structure', async () => {
      const invalidRouteData = {
        parcelId: 'TEST001',
        pickupLocation: { latitude: 40.7128 }, // Missing longitude
        deliveryLocation: { latitude: 34.0522, longitude: -118.2437 }
      };

      const response = await request(app)
        .post('/api/routes/optimize')
        .set('Authorization', `Bearer ${supervisorToken}`)
        .send(invalidRouteData)
        .expect(400);

      expect(response.body).to.have.property('message');
      expect(response.body.message).to.include('Valid latitude and longitude coordinates are required');
    });

    it('should validate coordinate ranges', async () => {
      const invalidRouteData = {
        parcelId: 'TEST001',
        pickupLocation: { latitude: 91, longitude: -74.0060 }, // Invalid latitude
        deliveryLocation: { latitude: 34.0522, longitude: -118.2437 }
      };

      const response = await request(app)
        .post('/api/routes/optimize')
        .set('Authorization', `Bearer ${supervisorToken}`)
        .send(invalidRouteData)
        .expect(400);

      expect(response.body).to.have.property('message');
      expect(response.body.message).to.include('Invalid pickup latitude');
    });
  });
});
