import { expect } from 'chai';
import request from 'supertest';
import mongoose from 'mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';
import app from '../src/app.js';
import User from '../src/models/User.js';
import Parcel from '../src/models/Parcel.js';

describe('Increment 3: Parcel Management Tests', function() {
  this.timeout(10000); // Increase timeout to 10 seconds
  let mongoServer;
  let supervisorToken, driverToken, supportToken;
  let supervisorId, driverId, supportId;
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

    const support = await User.create({
      name: 'Test Support',
      email: 'support@test.com',
      password: 'password123',
      role: 'SupportAgent',
    });

    supervisorId = supervisor._id;
    driverId = driver._id;
    supportId = support._id;

    // Get tokens
    const supervisorLogin = await request(app)
      .post('/api/auth/login')
      .send({ email: 'supervisor@test.com', password: 'password123' });

    const driverLogin = await request(app)
      .post('/api/auth/login')
      .send({ email: 'driver@test.com', password: 'password123' });

    const supportLogin = await request(app)
      .post('/api/auth/login')
      .send({ email: 'support@test.com', password: 'password123' });

    supervisorToken = supervisorLogin.body.token;
    driverToken = driverLogin.body.token;
    supportToken = supportLogin.body.token;
  });

  describe('Parcel Creation (Supervisor Only)', () => {
    it('should allow supervisor to create a parcel', async () => {
      const parcelData = {
        parcelId: 'TEST001',
        senderName: 'John Sender',
        receiverName: 'Jane Receiver',
        pickupLocation: '123 Pickup St',
        deliveryLocation: '456 Delivery Ave',
      };

      const response = await request(app)
        .post('/api/parcels')
        .set('Authorization', `Bearer ${supervisorToken}`)
        .send(parcelData)
        .expect(201);

      expect(response.body).to.have.property('parcelId', 'TEST001');
      expect(response.body).to.have.property('senderName', 'John Sender');
      expect(response.body).to.have.property('status', 'Pending');
      expect(response.body).to.have.property('statusHistory');
      expect(response.body.statusHistory).to.be.an('array');
    });

    it('should reject parcel creation by driver', async () => {
      const parcelData = {
        parcelId: 'TEST002',
        senderName: 'John Sender',
        receiverName: 'Jane Receiver',
        pickupLocation: '123 Pickup St',
        deliveryLocation: '456 Delivery Ave',
      };

      await request(app)
        .post('/api/parcels')
        .set('Authorization', `Bearer ${driverToken}`)
        .send(parcelData)
        .expect(403);
    });

    it('should reject parcel creation by support agent', async () => {
      const parcelData = {
        parcelId: 'TEST003',
        senderName: 'John Sender',
        receiverName: 'Jane Receiver',
        pickupLocation: '123 Pickup St',
        deliveryLocation: '456 Delivery Ave',
      };

      await request(app)
        .post('/api/parcels')
        .set('Authorization', `Bearer ${supportToken}`)
        .send(parcelData)
        .expect(403);
    });

    it('should reject parcel creation without authentication', async () => {
      const parcelData = {
        parcelId: 'TEST004',
        senderName: 'John Sender',
        receiverName: 'Jane Receiver',
        pickupLocation: '123 Pickup St',
        deliveryLocation: '456 Delivery Ave',
      };

      await request(app)
        .post('/api/parcels')
        .send(parcelData)
        .expect(401);
    });
  });

  describe('Driver Assignment', () => {
    beforeEach(async () => {
      testParcel = await Parcel.create({
        parcelId: 'ASSIGN001',
        senderName: 'Test Sender',
        receiverName: 'Test Receiver',
        pickupLocation: '123 Pickup St',
        deliveryLocation: '456 Delivery Ave',
      });
    });

    it('should allow supervisor to assign driver to parcel', async () => {
      const response = await request(app)
        .patch(`/api/parcels/${testParcel.parcelId}/assign-driver`)
        .set('Authorization', `Bearer ${supervisorToken}`)
        .send({ driverId: driverId.toString() })
        .expect(200);

      expect(response.body.assignedDriver._id).to.equal(driverId.toString());
      expect(response.body.status).to.equal('PickedUp');
    });

    it('should reject driver assignment by non-supervisor', async () => {
      await request(app)
        .patch(`/api/parcels/${testParcel.parcelId}/assign-driver`)
        .set('Authorization', `Bearer ${driverToken}`)
        .send({ driverId: driverId.toString() })
        .expect(403);
    });

    it('should reject assignment to non-driver user', async () => {
      await request(app)
        .patch(`/api/parcels/${testParcel.parcelId}/assign-driver`)
        .set('Authorization', `Bearer ${supervisorToken}`)
        .send({ driverId: supportId.toString() })
        .expect(400);
    });

    it('should reject assignment to non-existent driver', async () => {
      const fakeDriverId = new mongoose.Types.ObjectId();
      
      await request(app)
        .patch(`/api/parcels/${testParcel.parcelId}/assign-driver`)
        .set('Authorization', `Bearer ${supervisorToken}`)
        .send({ driverId: fakeDriverId.toString() })
        .expect(404);
    });
  });

  describe('Status Updates', () => {
    beforeEach(async () => {
      testParcel = await Parcel.create({
        parcelId: 'STATUS001',
        senderName: 'Test Sender',
        receiverName: 'Test Receiver',
        pickupLocation: '123 Pickup St',
        deliveryLocation: '456 Delivery Ave',
        assignedDriver: driverId,
        status: 'PickedUp',
      });
    });

    it('should allow valid status transition from PickedUp to InTransit', async () => {
      const response = await request(app)
        .patch(`/api/parcels/${testParcel.parcelId}/status`)
        .set('Authorization', `Bearer ${driverToken}`)
        .send({ status: 'InTransit' })
        .expect(200);

      expect(response.body.status).to.equal('InTransit');
      expect(response.body.statusHistory).to.have.length(2);
      expect(response.body.currentLocation).to.have.property('latitude');
      expect(response.body.currentLocation).to.have.property('longitude');
    });

    it('should allow valid status transition from InTransit to OutForDelivery', async () => {
      await Parcel.findByIdAndUpdate(testParcel._id, { status: 'InTransit' });

      const response = await request(app)
        .patch(`/api/parcels/${testParcel.parcelId}/status`)
        .set('Authorization', `Bearer ${driverToken}`)
        .send({ status: 'OutForDelivery' })
        .expect(200);

      expect(response.body.status).to.equal('OutForDelivery');
      expect(response.body.statusHistory).to.have.length(3);
    });

    it('should allow valid status transition from OutForDelivery to Delivered', async () => {
      await Parcel.findByIdAndUpdate(testParcel._id, { status: 'OutForDelivery' });

      const response = await request(app)
        .patch(`/api/parcels/${testParcel.parcelId}/status`)
        .set('Authorization', `Bearer ${driverToken}`)
        .send({ status: 'Delivered' })
        .expect(200);

      expect(response.body.status).to.equal('Delivered');
      expect(response.body.statusHistory).to.have.length(3);
    });

    it('should reject invalid status transition', async () => {
      await request(app)
        .patch(`/api/parcels/${testParcel.parcelId}/status`)
        .set('Authorization', `Bearer ${driverToken}`)
        .send({ status: 'Delivered' })
        .expect(400);
    });

    it('should reject status update by non-driver', async () => {
      await request(app)
        .patch(`/api/parcels/${testParcel.parcelId}/status`)
        .set('Authorization', `Bearer ${supervisorToken}`)
        .send({ status: 'InTransit' })
        .expect(403);
    });

    it('should reject status update by unassigned driver', async () => {
      // Create another driver
      const otherDriver = await User.create({
        name: 'Other Driver',
        email: 'other@test.com',
        password: 'password123',
        role: 'Driver',
      });

      const otherLogin = await request(app)
        .post('/api/auth/login')
        .send({ email: 'other@test.com', password: 'password123' });

      await request(app)
        .patch(`/api/parcels/${testParcel.parcelId}/status`)
        .set('Authorization', `Bearer ${otherLogin.body.token}`)
        .send({ status: 'InTransit' })
        .expect(403);
    });
  });

  describe('Parcel Tracking Access Control', () => {
    beforeEach(async () => {
      testParcel = await Parcel.create({
        parcelId: 'TRACK001',
        senderName: 'Test Sender',
        receiverName: 'Test Receiver',
        pickupLocation: '123 Pickup St',
        deliveryLocation: '456 Delivery Ave',
        assignedDriver: driverId,
        status: 'InTransit',
        currentLocation: {
          latitude: 40.7128,
          longitude: -74.0060,
          timestamp: new Date().toISOString(),
          accuracy: 10,
        },
      });
    });

    it('should allow supervisor to track any parcel', async () => {
      const response = await request(app)
        .get(`/api/parcels/track/${testParcel.parcelId}`)
        .set('Authorization', `Bearer ${supervisorToken}`)
        .expect(200);

      expect(response.body).to.have.property('status', 'InTransit');
      expect(response.body).to.have.property('currentLocation');
      expect(response.body.currentLocation).to.have.property('latitude', 40.7128);
      expect(response.body).to.have.property('assignedDriver');
    });

    it('should allow support agent to track any parcel', async () => {
      const response = await request(app)
        .get(`/api/parcels/track/${testParcel.parcelId}`)
        .set('Authorization', `Bearer ${supportToken}`)
        .expect(200);

      expect(response.body).to.have.property('status', 'InTransit');
      expect(response.body).to.have.property('currentLocation');
    });

    it('should allow assigned driver to track their parcel', async () => {
      const response = await request(app)
        .get(`/api/parcels/track/${testParcel.parcelId}`)
        .set('Authorization', `Bearer ${driverToken}`)
        .expect(200);

      expect(response.body).to.have.property('status', 'InTransit');
      expect(response.body).to.have.property('currentLocation');
    });

    it('should reject tracking by unassigned driver', async () => {
      const otherDriver = await User.create({
        name: 'Other Driver',
        email: 'otherdriver@test.com',
        password: 'password123',
        role: 'Driver',
      });

      const otherLogin = await request(app)
        .post('/api/auth/login')
        .send({ email: 'otherdriver@test.com', password: 'password123' });

      await request(app)
        .get(`/api/parcels/track/${testParcel.parcelId}`)
        .set('Authorization', `Bearer ${otherLogin.body.token}`)
        .expect(403);
    });

    it('should reject tracking without authentication', async () => {
      await request(app)
        .get(`/api/parcels/track/${testParcel.parcelId}`)
        .expect(401);
    });

    it('should return 404 for non-existent parcel', async () => {
      await request(app)
        .get('/api/parcels/track/NONEXISTENT')
        .set('Authorization', `Bearer ${supervisorToken}`)
        .expect(404);
    });
  });
});
