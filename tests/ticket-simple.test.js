import { expect } from 'chai';
import request from 'supertest';
import mongoose from 'mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';
import app from '../src/app.js';
import User from '../src/models/User.js';
import Parcel from '../src/models/Parcel.js';
import Ticket from '../src/models/Ticket.js';

describe('Ticket Creation Simple Tests', function() {
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
    await Ticket.deleteMany({});

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

  describe('Basic Ticket Creation', () => {
    it('should allow supervisor to create basic ticket', async () => {
      const ticketData = {
        issueType: 'General',
        description: 'Test ticket creation'
      };

      const response = await request(app)
        .post('/api/tickets')
        .set('Authorization', `Bearer ${supervisorToken}`)
        .send(ticketData)
        .expect(201);

      expect(response.body).to.have.property('success', true);
      expect(response.body.data).to.have.property('ticketId');
      expect(response.body.data).to.have.property('status', 'Open');
      expect(response.body.data).to.have.property('priority', 'Low'); // Auto-assigned for General
      expect(response.body.data).to.have.property('issueType', 'General');
    });

    it('should auto-assign High priority for Lost issue type', async () => {
      const ticketData = {
        issueType: 'Lost',
        description: 'Parcel appears to be lost'
      };

      const response = await request(app)
        .post('/api/tickets')
        .set('Authorization', `Bearer ${supervisorToken}`)
        .send(ticketData)
        .expect(201);

      expect(response.body.data.priority).to.equal('High');
    });

    it('should auto-assign Medium priority for Delayed issue type', async () => {
      const ticketData = {
        issueType: 'Delayed',
        description: 'Parcel delivery is delayed'
      };

      const response = await request(app)
        .post('/api/tickets')
        .set('Authorization', `Bearer ${supervisorToken}`)
        .send(ticketData)
        .expect(201);

      expect(response.body.data.priority).to.equal('Medium');
    });

    it('should allow explicit priority override', async () => {
      const ticketData = {
        issueType: 'Lost', // Would normally be High
        priority: 'Medium', // Override to Medium
        description: 'Test with explicit priority'
      };

      const response = await request(app)
        .post('/api/tickets')
        .set('Authorization', `Bearer ${supervisorToken}`)
        .send(ticketData)
        .expect(201);

      expect(response.body.data.priority).to.equal('Medium');
    });

    it('should validate parcel reference', async () => {
      const ticketData = {
        issueType: 'Damaged',
        description: 'Test with valid parcel',
        parcelId: 'TEST001'
      };

      const response = await request(app)
        .post('/api/tickets')
        .set('Authorization', `Bearer ${supervisorToken}`)
        .send(ticketData)
        .expect(201);

      expect(response.body).to.have.property('success', true);
      expect(response.body.data).to.have.property('parcel');
      expect(response.body.data.parcel).to.have.property('parcelId', 'TEST001');
    });

    it('should reject invalid parcel reference', async () => {
      const ticketData = {
        issueType: 'Damaged',
        description: 'Test with invalid parcel',
        parcelId: 'INVALID'
      };

      const response = await request(app)
        .post('/api/tickets')
        .set('Authorization', `Bearer ${supervisorToken}`)
        .send(ticketData)
        .expect(400);

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
        .send(incompleteData)
        .expect(400);

      expect(response.body).to.have.property('message');
      expect(response.body.message).to.include('Issue type and description are required');
    });
  });
});
