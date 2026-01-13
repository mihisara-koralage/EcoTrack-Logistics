import { expect } from 'chai';
import request from 'supertest';
import mongoose from 'mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';
import app from '../src/app.js';
import User from '../src/models/User.js';
import Parcel from '../src/models/Parcel.js';
import Route from '../src/models/Route.js';

describe('Route Assignment Tests', function() {
  this.timeout(15000); // Increase timeout for complex operations

  let mongoServer;
  let supervisorToken, driverToken;
  let supervisorId, driverId;
  let testParcel, testRoute;

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
    await Route.deleteMany({});

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

    // Create test route
    testRoute = await Route.create({
      pickupLocation: { latitude: 40.7128, longitude: -74.0060 },
      deliveryLocation: { latitude: 34.0522, longitude: -118.2437 },
      distanceKm: 100.5,
      estimatedTimeMinutes: 120,
      carbonFootprintKg: 18.2,
      routeType: 'Shortest'
    });
  });

  describe('POST /api/routes/assign', () => {
    it('should allow supervisor to assign route to parcel', async () => {
      const assignmentData = {
        parcelId: 'TEST001',
        routeId: testRoute._id.toString(),
        routeType: 'Shortest',
        assignmentNotes: 'Test assignment'
      };

      const response = await request(app)
        .post('/api/routes/assign')
        .set('Authorization', `Bearer ${supervisorToken}`)
        .send(assignmentData)
        .expect(200);

      expect(response.body).to.have.property('success', true);
      expect(response.body.data).to.have.property('assignedRoute');
      expect(response.body.data).to.have.property('parcel');
      expect(response.body.data.assignedRoute.routeType).to.equal('Shortest');
      expect(response.body.data.assignedRoute.isActive).to.equal(true);
    });

    it('should reject driver from assigning route', async () => {
      const assignmentData = {
        parcelId: 'TEST001',
        routeId: testRoute._id.toString(),
        routeType: 'Shortest'
      };

      const response = await request(app)
        .post('/api/routes/assign')
        .set('Authorization', `Bearer ${driverToken}`)
        .send(assignmentData)
        .expect(403);

      expect(response.body).to.have.property('message');
      expect(response.body.message).to.include('Only supervisors can access this resource');
    });

    it('should deactivate existing routes when assigning new one', async () => {
      // First assign a route
      await request(app)
        .post('/api/routes/assign')
        .set('Authorization', `Bearer ${supervisorToken}`)
        .send({
          parcelId: 'TEST001',
          routeId: testRoute._id.toString(),
          routeType: 'Shortest'
        });

      // Create a new route
      const newRoute = await Route.create({
        pickupLocation: { latitude: 41.8781, longitude: -87.6298 },
        deliveryLocation: { latitude: 42.3601, longitude: -71.0589 },
        distanceKm: 150.8,
        estimatedTimeMinutes: 180,
        carbonFootprintKg: 27.5,
        routeType: 'EcoFriendly'
      });

      // Assign the new route
      const response = await request(app)
        .post('/api/routes/assign')
        .set('Authorization', `Bearer ${supervisorToken}`)
        .send({
          parcelId: 'TEST001',
          routeId: newRoute._id.toString(),
          routeType: 'EcoFriendly'
        })
        .expect(200);

      // Check that old route was deactivated
      const oldRoute = await Route.findById(testRoute._id);
      expect(oldRoute.isActive).to.equal(false);
      expect(oldRoute.deactivationReason).to.equal('Reassigned');
      expect(oldRoute.deactivationDate).to.be.a('date');
    });

    it('should reject assignment for non-existent parcel', async () => {
      const assignmentData = {
        parcelId: 'NONEXISTENT',
        routeId: testRoute._id.toString(),
        routeType: 'Shortest'
      };

      const response = await request(app)
        .post('/api/routes/assign')
        .set('Authorization', `Bearer ${supervisorToken}`)
        .send(assignmentData)
        .expect(404);

      expect(response.body).to.have.property('message');
      expect(response.body.message).to.include('Parcel not found');
    });

    it('should reject assignment for non-existent route', async () => {
      const fakeRouteId = new mongoose.Types.ObjectId();
      const assignmentData = {
        parcelId: 'TEST001',
        routeId: fakeRouteId.toString(),
        routeType: 'Shortest'
      };

      const response = await request(app)
        .post('/api/routes/assign')
        .set('Authorization', `Bearer ${supervisorToken}`)
        .send(assignmentData)
        .expect(404);

      expect(response.body).to.have.property('message');
      expect(response.body.message).to.include('Route not found');
    });
  });

  describe('GET /api/routes/assign/:parcelId', () => {
    beforeEach(async () => {
      // Assign the test route to the parcel
      await request(app)
        .post('/api/routes/assign')
        .set('Authorization', `Bearer ${supervisorToken}`)
        .send({
          parcelId: 'TEST001',
          routeId: testRoute._id.toString(),
          routeType: 'Shortest'
        });
    });

    it('should allow supervisor to get route assignment', async () => {
      const response = await request(app)
        .get('/api/routes/assign/TEST001')
        .set('Authorization', `Bearer ${supervisorToken}`)
        .expect(200);

      expect(response.body).to.have.property('success', true);
      expect(response.body.data).to.have.property('activeRoute');
      expect(response.body.data).to.have.property('routeHistory');
      expect(response.body.data).to.have.property('statistics');
      expect(response.body.data.activeRoute.routeId).to.equal(testRoute._id.toString());
    });

    it('should reject driver from getting route assignment', async () => {
      const response = await request(app)
        .get('/api/routes/assign/TEST001')
        .set('Authorization', `Bearer ${driverToken}`)
        .expect(403);

      expect(response.body).to.have.property('message');
      expect(response.body.message).to.include('Only supervisors can access this resource');
    });

    it('should return null activeRoute for unassigned parcel', async () => {
      // Create unassigned parcel
      const unassignedParcel = await Parcel.create({
        parcelId: 'TEST002',
        senderName: 'Test Sender 2',
        receiverName: 'Test Receiver 2',
        pickupLocation: '123 Pickup St',
        deliveryLocation: '456 Delivery Ave',
        status: 'Pending'
      });

      const response = await request(app)
        .get('/api/routes/assign/TEST002')
        .set('Authorization', `Bearer ${supervisorToken}`)
        .expect(200);

      expect(response.body).to.have.property('success', true);
      expect(response.body.data.activeRoute).to.equal(null);
      expect(response.body.data.parcel.routeAssignmentStatus).to.equal('Unassigned');
    });
  });

  describe('PATCH /api/routes/assign/:parcelId', () => {
    beforeEach(async () => {
      // Assign the test route first
      await request(app)
        .post('/api/routes/assign')
        .set('Authorization', `Bearer ${supervisorToken}`)
        .send({
          parcelId: 'TEST001',
          routeId: testRoute._id.toString(),
          routeType: 'Shortest'
        });
    });

    it('should allow supervisor to update route assignment', async () => {
      const updateData = {
        routeType: 'EcoFriendly',
        assignmentNotes: 'Updated to eco-friendly route'
      };

      const response = await request(app)
        .patch('/api/routes/assign/TEST001')
        .set('Authorization', `Bearer ${supervisorToken}`)
        .send(updateData)
        .expect(200);

      expect(response.body).to.have.property('success', true);
      expect(response.body.data).to.have.property('updatedRoute');
      expect(response.body.data.changes.routeTypeChanged).to.equal(true);
      expect(response.body.data.changes.previousRouteType).to.equal('Shortest');
      expect(response.body.data.changes.newRouteType).to.equal('EcoFriendly');
    });

    it('should create new route when type changes', async () => {
      const updateData = {
        routeType: 'EcoFriendly'
      };

      const response = await request(app)
        .patch('/api/routes/assign/TEST001')
        .set('Authorization', `Bearer ${supervisorToken}`)
        .send(updateData)
        .expect(200);

      // Check that old route was deactivated
      const oldRoute = await Route.findById(testRoute._id);
      expect(oldRoute.isActive).to.equal(false);
      expect(oldRoute.deactivationReason).to.equal('Route type changed');

      // Check that new route was created
      const assignments = await Route.find({ parcel: testParcel._id });
      const activeRoutes = assignments.filter(route => route.isActive);
      expect(activeRoutes).to.have.length(1);
      expect(activeRoutes[0].routeType).to.equal('EcoFriendly');
    });

    it('should reject invalid route type', async () => {
      const updateData = {
        routeType: 'InvalidType'
      };

      const response = await request(app)
        .patch('/api/routes/assign/TEST001')
        .set('Authorization', `Bearer ${supervisorToken}`)
        .send(updateData)
        .expect(400);

      expect(response.body).to.have.property('message');
      expect(response.body.message).to.include('Route type must be either "Shortest" or "EcoFriendly"');
    });
  });

  describe('DELETE /api/routes/assign/:parcelId', () => {
    beforeEach(async () => {
      // Assign the test route first
      await request(app)
        .post('/api/routes/assign')
        .set('Authorization', `Bearer ${supervisorToken}`)
        .send({
          parcelId: 'TEST001',
          routeId: testRoute._id.toString(),
          routeType: 'Shortest'
        });
    });

    it('should allow supervisor to remove route assignment', async () => {
      const deleteData = {
        reason: 'Manual removal for testing'
      };

      const response = await request(app)
        .delete('/api/routes/assign/TEST001')
        .set('Authorization', `Bearer ${supervisorToken}`)
        .send(deleteData)
        .expect(200);

      expect(response.body).to.have.property('success', true);
      expect(response.body.data).to.have.property('deactivation');
      expect(response.body.data.parcel.routeAssignmentStatus).to.equal('Unassigned');

      // Check that route was deactivated
      const deactivatedRoute = await Route.findById(testRoute._id);
      expect(deactivatedRoute.isActive).to.equal(false);
      expect(deactivatedRoute.deactivationReason).to.equal('Manual removal for testing');
    });

    it('should reject driver from removing route assignment', async () => {
      const response = await request(app)
        .delete('/api/routes/assign/TEST001')
        .set('Authorization', `Bearer ${driverToken}`)
        .expect(403);

      expect(response.body).to.have.property('message');
      expect(response.body.message).to.include('Only supervisors can access this resource');
    });
  });

  describe('GET /api/routes/assignments', () => {
    beforeEach(async () => {
      // Create multiple route assignments
      await request(app)
        .post('/api/routes/assign')
        .set('Authorization', `Bearer ${supervisorToken}`)
        .send({
          parcelId: 'TEST001',
          routeId: testRoute._id.toString(),
          routeType: 'Shortest'
        });
    });

    it('should allow supervisor to get all assignments', async () => {
      const response = await request(app)
        .get('/api/routes/assignments')
        .set('Authorization', `Bearer ${supervisorToken}`)
        .expect(200);

      expect(response.body).to.have.property('success', true);
      expect(response.body.data).to.have.property('assignments');
      expect(response.body.data).to.have.property('pagination');
      expect(response.body.data.assignments).to.be.an('array');
      expect(response.body.data.assignments[0]).to.have.property('routeId');
    });

    it('should support pagination parameters', async () => {
      const response = await request(app)
        .get('/api/routes/assignments?page=1&limit=5')
        .set('Authorization', `Bearer ${supervisorToken}`)
        .expect(200);

      expect(response.body).to.have.property('success', true);
      expect(response.body.data.pagination.currentPage).to.equal(1);
      expect(response.body.data.pagination.limit).to.equal(5);
    });

    it('should filter by status', async () => {
      const response = await request(app)
        .get('/api/routes/assignments?status=active')
        .set('Authorization', `Bearer ${supervisorToken}`)
        .expect(200);

      expect(response.body).to.have.property('success', true);
      // All returned assignments should be active
      response.body.data.assignments.forEach(assignment => {
        expect(assignment.isActive).to.equal(true);
      });
    });

    it('should reject driver from accessing assignments', async () => {
      const response = await request(app)
        .get('/api/routes/assignments')
        .set('Authorization', `Bearer ${driverToken}`)
        .expect(403);

      expect(response.body).to.have.property('message');
      expect(response.body.message).to.include('Only supervisors can access this resource');
    });
  });

  describe('Route Assignment Validation', () => {
    it('should ensure one active route per parcel', async () => {
      // Create a second route
      const secondRoute = await Route.create({
        pickupLocation: { latitude: 41.8781, longitude: -87.6298 },
        deliveryLocation: { latitude: 42.3601, longitude: -71.0589 },
        distanceKm: 150.8,
        estimatedTimeMinutes: 180,
        carbonFootprintKg: 27.5,
        routeType: 'EcoFriendly'
      });

      // Assign second route (should deactivate first)
      await request(app)
        .post('/api/routes/assign')
        .set('Authorization', `Bearer ${supervisorToken}`)
        .send({
          parcelId: 'TEST001',
          routeId: secondRoute._id.toString(),
          routeType: 'EcoFriendly'
        })
        .expect(200);

      // Check that only one route is active
      const activeRoutes = await Route.find({ 
        parcel: testParcel._id, 
        isActive: true 
      });

      expect(activeRoutes).to.have.length(1);
      expect(activeRoutes[0].routeId).to.equal(secondRoute._id.toString());
      expect(activeRoutes[0].routeType).to.equal('EcoFriendly');
    });

    it('should prevent route assignment to different parcels', async () => {
      // Create a second parcel
      const secondParcel = await Parcel.create({
        parcelId: 'TEST002',
        senderName: 'Test Sender 2',
        receiverName: 'Test Receiver 2',
        pickupLocation: '123 Pickup St',
        deliveryLocation: '456 Delivery Ave',
        status: 'Pending'
      });

      // Try to assign route to different parcel
      const response = await request(app)
        .post('/api/routes/assign')
        .set('Authorization', `Bearer ${supervisorToken}`)
        .send({
          parcelId: 'TEST002',
          routeId: testRoute._id.toString(), // Route belongs to TEST001
          routeType: 'Shortest'
        })
        .expect(400);

      expect(response.body).to.have.property('message');
      expect(response.body.message).to.include('Route is already assigned to a different parcel');
    });
  });
});
