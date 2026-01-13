import { expect } from 'chai';
import request from 'supertest';
import mongoose from 'mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';
import app from '../src/app.js';
import User from '../src/models/User.js';
import Parcel from '../src/models/Parcel.js';

describe('Ticket Basic Functionality Test', function() {
  this.timeout(10000);

  let mongoServer;
  let supervisorToken, supportAgentToken;
  let supervisorId, supportAgentId;
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

    const supportAgent = await User.create({
      name: 'Test Support Agent',
      email: 'support@test.com',
      password: 'password123',
      role: 'SupportAgent',
    });

    supervisorId = supervisor._id;
    supportAgentId = supportAgent._id;

    // Get tokens
    const supervisorLogin = await request(app)
      .post('/api/auth/login')
      .send({ email: 'supervisor@test.com', password: 'password123' });

    const supportAgentLogin = await request(app)
      .post('/api/auth/login')
      .send({ email: 'support@test.com', password: 'password123' });

    supervisorToken = supervisorLogin.body.token;
    supportAgentToken = supportAgentLogin.body.token;

    // Create test parcel
    testParcel = await Parcel.create({
      parcelId: 'TEST001',
      senderName: 'Test Sender',
      receiverName: 'Test Receiver',
      pickupLocation: '123 Pickup St',
      deliveryLocation: '456 Delivery Ave',
      status: 'InTransit'
    });
  });

  describe('Ticket Creation Core Requirements', () => {
    it('should create ticket with auto-assigned priority', async () => {
      const ticketData = {
        issueType: 'Lost',
        description: 'Test ticket - should auto-assign High priority'
      };

      const response = await request(app)
        .post('/api/tickets')
        .set('Authorization', `Bearer ${supervisorToken}`)
        .send(ticketData);

      console.log('Response status:', response.status);
      console.log('Response body:', response.body);

      expect(response.status).to.equal(201);
      expect(response.body).to.have.property('success', true);
      expect(response.body.data).to.have.property('ticketId');
      expect(response.body.data).to.have.property('status', 'Open');
      expect(response.body.data).to.have.property('priority', 'High');
      expect(response.body.data).to.have.property('issueType', 'Lost');
    });

    it('should validate parcel reference', async () => {
      const ticketData = {
        issueType: 'Damaged',
        description: 'Test ticket with valid parcel',
        parcelId: 'TEST001'
      };

      const response = await request(app)
        .post('/api/tickets')
        .set('Authorization', `Bearer ${supervisorToken}`)
        .send(ticketData);

      console.log('Parcel validation response:', response.status, response.body);

      expect(response.status).to.equal(201);
      expect(response.body).to.have.property('success', true);
      expect(response.body.data).to.have.property('parcel');
    });

    it('should reject invalid parcel reference', async () => {
      const ticketData = {
        issueType: 'Damaged',
        description: 'Test ticket with invalid parcel',
        parcelId: 'INVALID123'
      };

      const response = await request(app)
        .post('/api/tickets')
        .set('Authorization', `Bearer ${supervisorToken}`)
        .send(ticketData);

      console.log('Invalid parcel response:', response.status, response.body);

      expect(response.status).to.equal(400);
      expect(response.body).to.have.property('message');
      expect(response.body.message).to.include('Parcel not found');
    });

    it('should require issue type and description', async () => {
      const incompleteData = {
        issueType: 'Lost'
        // Missing description
      };

      const response = await request(app)
        .post('/api/tickets')
        .set('Authorization', `Bearer ${supervisorToken}`)
        .send(incompleteData);

      console.log('Incomplete data response:', response.status, response.body);

      expect(response.status).to.equal(400);
      expect(response.body).to.have.property('message');
      expect(response.body.message).to.include('Issue type and description are required');
    });

    it('should enforce role-based access control', async () => {
      const ticketData = {
        issueType: 'General',
        description: 'Test ticket for role validation'
      };

      // Test with Driver role (should be rejected)
      const driver = await User.create({
        name: 'Test Driver',
        email: 'driver@test.com',
        password: 'password123',
        role: 'Driver',
      });

      const driverLogin = await request(app)
        .post('/api/auth/login')
        .send({ email: 'driver@test.com', password: 'password123' });

      const response = await request(app)
        .post('/api/tickets')
        .set('Authorization', `Bearer ${driverLogin.body.token}`)
        .send(ticketData);

      console.log('Role validation response:', response.status, response.body);

      expect(response.status).to.equal(403);
      expect(response.body).to.have.property('message');
      expect(response.body.message).to.include('Access denied');
    });
  });

  describe('Priority Auto-Assignment Logic', () => {
    it('should auto-assign High priority for Lost issues', async () => {
      const ticketData = {
        issueType: 'Lost',
        description: 'Lost parcel test'
      };

      const response = await request(app)
        .post('/api/tickets')
        .set('Authorization', `Bearer ${supervisorToken}`)
        .send(ticketData);

      expect(response.status).to.equal(201);
      expect(response.body.data.priority).to.equal('High');
    });

    it('should auto-assign Medium priority for Delayed issues', async () => {
      const ticketData = {
        issueType: 'Delayed',
        description: 'Delayed parcel test'
      };

      const response = await request(app)
        .post('/api/tickets')
        .set('Authorization', `Bearer ${supervisorToken}`)
        .send(ticketData);

      expect(response.status).to.equal(201);
      expect(response.body.data.priority).to.equal('Medium');
    });

    it('should auto-assign High priority for Damaged issues', async () => {
      const ticketData = {
        issueType: 'Damaged',
        description: 'Damaged parcel test'
      };

      const response = await request(app)
        .post('/api/tickets')
        .set('Authorization', `Bearer ${supervisorToken}`)
        .send(ticketData);

      expect(response.status).to.equal(201);
      expect(response.body.data.priority).to.equal('High');
    });

    it('should auto-assign Low priority for General issues', async () => {
      const ticketData = {
        issueType: 'General',
        description: 'General inquiry test'
      };

      const response = await request(app)
        .post('/api/tickets')
        .set('Authorization', `Bearer ${supervisorToken}`)
        .send(ticketData);

      expect(response.status).to.equal(201);
      expect(response.body.data.priority).to.equal('Low');
    });

    it('should allow explicit priority override', async () => {
      const ticketData = {
        issueType: 'Lost', // Would normally be High
        priority: 'Low', // Override to Low
        description: 'Priority override test'
      };

      const response = await request(app)
        .post('/api/tickets')
        .set('Authorization', `Bearer ${supervisorToken}`)
        .send(ticketData);

      expect(response.status).to.equal(201);
      expect(response.body.data.priority).to.equal('Low');
    });
  });
});
