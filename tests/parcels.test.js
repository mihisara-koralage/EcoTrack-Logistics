import assert from 'node:assert/strict';
import mongoose from 'mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';
import request from 'supertest';

import app from '../src/app.js';
import User from '../src/models/User.js';
import Parcel from '../src/models/Parcel.js';

// Setup test environment
process.env.JWT_SECRET = 'test-secret-parcels';
process.env.NODE_ENV = 'test';

// Test users
const supervisor = { name: 'Test Supervisor', email: 'supervisor.p@example.com', password: 'password123', role: 'Supervisor' };
const driver = { name: 'Test Driver', email: 'driver.p@example.com', password: 'password123', role: 'Driver' };
const supportAgent = { name: 'Test Support', email: 'support.p@example.com', password: 'password123', role: 'SupportAgent' };

let mongoServer;
let supervisorToken;
let driverToken;
let supportToken;
let driverId;

describe('Parcel API Endpoints', () => {
  before(async () => {
    mongoServer = await MongoMemoryServer.create();
    const uri = mongoServer.getUri();
    await mongoose.connect(uri);

    // Register and login users to get tokens
    await request(app).post('/api/auth/register').send(supervisor);
    const supLogin = await request(app).post('/api/auth/login').send({ email: supervisor.email, password: supervisor.password });
    supervisorToken = supLogin.body.token;

    await request(app).post('/api/auth/register').send(driver);
    const driverLogin = await request(app).post('/api/auth/login').send({ email: driver.email, password: driver.password });
    driverToken = driverLogin.body.token;
    driverId = driverLogin.body.user.id;

    await request(app).post('/api/auth/register').send(supportAgent);
    const supportLogin = await request(app).post('/api/auth/login').send({ email: supportAgent.email, password: supportAgent.password });
    supportToken = supportLogin.body.token;
  });

  after(async () => {
    await mongoose.connection.dropDatabase();
    await mongoose.disconnect();
    await mongoServer.stop();
  });

  beforeEach(async () => {
    await Parcel.deleteMany({});
  });

  const parcelData = {
    parcelId: 'ECO-TEST-001',
    senderName: 'Sender Corp',
    receiverName: 'Receiver Inc',
    pickupLocation: '123 Pickup St',
    deliveryLocation: '456 Delivery Ave',
  };

  it('should allow a Supervisor to create a parcel', async () => {
    const res = await request(app)
      .post('/api/parcels')
      .set('Authorization', `Bearer ${supervisorToken}`)
      .send(parcelData);
    assert.equal(res.status, 201);
    assert.equal(res.body.parcelId, parcelData.parcelId);
  });

  it('should prevent a Driver from creating a parcel', async () => {
    const res = await request(app)
      .post('/api/parcels')
      .set('Authorization', `Bearer ${driverToken}`)
      .send(parcelData);
    assert.equal(res.status, 403);
  });

  it('should allow any authenticated user to view all parcels', async () => {
    await request(app).post('/api/parcels').set('Authorization', `Bearer ${supervisorToken}`).send(parcelData);
    const res = await request(app).get('/api/parcels').set('Authorization', `Bearer ${driverToken}`);
    assert.equal(res.status, 200);
    assert.equal(res.body.length, 1);
    assert.equal(res.body[0].parcelId, parcelData.parcelId);
  });

  it('should allow a Supervisor to update a parcel', async () => {
    await request(app).post('/api/parcels').set('Authorization', `Bearer ${supervisorToken}`).send(parcelData);
    const res = await request(app)
      .put(`/api/parcels/${parcelData.parcelId}`)
      .set('Authorization', `Bearer ${supervisorToken}`)
      .send({ status: 'InTransit' });
    assert.equal(res.status, 200);
    assert.equal(res.body.status, 'InTransit');
  });

  it('should prevent a Driver from updating a parcel', async () => {
    await request(app).post('/api/parcels').set('Authorization', `Bearer ${supervisorToken}`).send(parcelData);
    const res = await request(app)
      .put(`/api/parcels/${parcelData.parcelId}`)
      .set('Authorization', `Bearer ${driverToken}`)
      .send({ status: 'InTransit' });
    assert.equal(res.status, 403);
  });

  it('should allow a Supervisor to delete a parcel', async () => {
    await request(app).post('/api/parcels').set('Authorization', `Bearer ${supervisorToken}`).send(parcelData);
    const res = await request(app)
      .delete(`/api/parcels/${parcelData.parcelId}`)
      .set('Authorization', `Bearer ${supervisorToken}`);
    assert.equal(res.status, 200);
    assert.equal(res.body.message, 'Parcel deleted successfully.');
  });

  it('should prevent a Driver from deleting a parcel', async () => {
    await request(app).post('/api/parcels').set('Authorization', `Bearer ${supervisorToken}`).send(parcelData);
    const res = await request(app)
      .delete(`/api/parcels/${parcelData.parcelId}`)
      .set('Authorization', `Bearer ${driverToken}`);
    assert.equal(res.status, 403);
  });

  it('should allow a Supervisor to assign a driver to a parcel', async () => {
    await request(app).post('/api/parcels').set('Authorization', `Bearer ${supervisorToken}`).send(parcelData);
    const res = await request(app)
      .patch(`/api/parcels/${parcelData.parcelId}/assign-driver`)
      .set('Authorization', `Bearer ${supervisorToken}`)
      .send({ driverId });
    assert.equal(res.status, 200);
    assert.equal(res.body.assignedDriver.email, driver.email);
    assert.equal(res.body.status, 'PickedUp');
  });

  it('should prevent assigning a non-driver to a parcel', async () => {
    const supervisorId = (await User.findOne({ email: supervisor.email }))._id;
    await request(app).post('/api/parcels').set('Authorization', `Bearer ${supervisorToken}`).send(parcelData);
    const res = await request(app)
      .patch(`/api/parcels/${parcelData.parcelId}/assign-driver`)
      .set('Authorization', `Bearer ${supervisorToken}`)
      .send({ driverId: supervisorId });
    assert.equal(res.status, 400);
    assert.equal(res.body.message, 'The assigned user is not a driver.');
  });

  it('should allow a Driver to update the status of a parcel', async () => {
    await request(app).post('/api/parcels').set('Authorization', `Bearer ${supervisorToken}`).send(parcelData);
    await request(app).patch(`/api/parcels/${parcelData.parcelId}/assign-driver`).set('Authorization', `Bearer ${supervisorToken}`).send({ driverId });

    const res = await request(app)
      .patch(`/api/parcels/${parcelData.parcelId}/status`)
      .set('Authorization', `Bearer ${driverToken}`)
      .send({ status: 'InTransit' });

    assert.equal(res.status, 200);
    assert.equal(res.body.status, 'InTransit');
    assert.equal(res.body.statusHistory.length, 2);
    assert.equal(res.body.statusHistory[1].status, 'InTransit');
  });

  it('should prevent a Supervisor from updating the status of a parcel', async () => {
    await request(app).post('/api/parcels').set('Authorization', `Bearer ${supervisorToken}`).send(parcelData);
    const res = await request(app)
      .patch(`/api/parcels/${parcelData.parcelId}/status`)
      .set('Authorization', `Bearer ${supervisorToken}`)
      .send({ status: 'InTransit' });
    assert.equal(res.status, 403);
  });

  it('should prevent invalid status transitions', async () => {
    await request(app).post('/api/parcels').set('Authorization', `Bearer ${supervisorToken}`).send(parcelData);
    await request(app).patch(`/api/parcels/${parcelData.parcelId}/assign-driver`).set('Authorization', `Bearer ${supervisorToken}`).send({ driverId });

    const res = await request(app)
      .patch(`/api/parcels/${parcelData.parcelId}/status`)
      .set('Authorization', `Bearer ${driverToken}`)
      .send({ status: 'Delivered' }); // Invalid transition from PickedUp

    assert.equal(res.status, 400);
    assert.equal(res.body.message, 'Invalid status transition from PickedUp to Delivered.');
  });

  it('should allow a Supervisor to track any parcel', async () => {
    await request(app).post('/api/parcels').set('Authorization', `Bearer ${supervisorToken}`).send(parcelData);
    const res = await request(app)
      .get(`/api/parcels/track/${parcelData.parcelId}`)
      .set('Authorization', `Bearer ${supervisorToken}`);
    assert.equal(res.status, 200);
    assert.ok(res.body.currentLocation);
  });

  it('should allow a SupportAgent to track any parcel', async () => {
    await request(app).post('/api/parcels').set('Authorization', `Bearer ${supervisorToken}`).send(parcelData);
    const res = await request(app)
      .get(`/api/parcels/track/${parcelData.parcelId}`)
      .set('Authorization', `Bearer ${supportToken}`);
    assert.equal(res.status, 200);
    assert.ok(res.body.estimatedDeliveryTime);
  });

  it('should allow an assigned Driver to track their parcel', async () => {
    await request(app).post('/api/parcels').set('Authorization', `Bearer ${supervisorToken}`).send(parcelData);
    await request(app).patch(`/api/parcels/${parcelData.parcelId}/assign-driver`).set('Authorization', `Bearer ${supervisorToken}`).send({ driverId });
    const res = await request(app)
      .get(`/api/parcels/track/${parcelData.parcelId}`)
      .set('Authorization', `Bearer ${driverToken}`);
    assert.equal(res.status, 200);
    assert.equal(res.body.assignedDriver.email, driver.email);
  });

  it('should prevent an unassigned Driver from tracking a parcel', async () => {
    await request(app).post('/api/parcels').set('Authorization', `Bearer ${supervisorToken}`).send(parcelData);
    const res = await request(app)
      .get(`/api/parcels/track/${parcelData.parcelId}`)
      .set('Authorization', `Bearer ${driverToken}`);
    assert.equal(res.status, 403);
  });
});
