import { expect } from 'chai';
import request from 'supertest';
import mongoose from 'mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';
import app from '../src/app.js';
import User from '../src/models/User.js';
import Parcel from '../src/models/Parcel.js';
import Ticket from '../src/models/Ticket.js';

describe('Ticket Management Tests', function() {
  this.timeout(10000);

  let mongoServer;
  let supervisorToken, supportAgentToken, customerToken;
  let supervisorId, supportAgentId, customerId;
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

    const customer = await User.create({
      name: 'Test Customer',
      email: 'customer@test.com',
      password: 'password123',
      role: 'Driver', // Use Driver role instead of Customer (not in User model)
    });

    supervisorId = supervisor._id;
    supportAgentId = supportAgent._id;
    customerId = customer._id;

    // Get tokens
    const supervisorLogin = await request(app)
      .post('/api/auth/login')
      .send({ email: 'supervisor@test.com', password: 'password123' });

    const supportAgentLogin = await request(app)
      .post('/api/auth/login')
      .send({ email: 'support@test.com', password: 'password123' });

    const customerLogin = await request(app)
      .post('/api/auth/login')
      .send({ email: 'customer@test.com', password: 'password123' });

    supervisorToken = supervisorLogin.body.token;
    supportAgentToken = supportAgentLogin.body.token;
    customerToken = customerLogin.body.token;

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

  describe('POST /api/tickets - Create Ticket', () => {
    it('should allow supervisor to create ticket', async () => {
      const ticketData = {
        issueType: 'Lost',
        description: 'Parcel appears to be lost in transit',
        parcelId: 'TEST001'
      };

      const response = await request(app)
        .post('/api/tickets')
        .set('Authorization', `Bearer ${supervisorToken}`)
        .send(ticketData)
        .expect(201);

      expect(response.body).to.have.property('success', true);
      expect(response.body.data).to.have.property('ticketId');
      expect(response.body.data).to.have.property('status', 'Open');
      expect(response.body.data).to.have.property('priority', 'High'); // Auto-assigned for Lost
      expect(response.body.data).to.have.property('issueType', 'Lost');
      expect(response.body.data).to.have.property('parcel');
      expect(response.body.data.parcel).to.have.property('parcelId', 'TEST001');
    });

    it('should allow support agent to create ticket', async () => {
      const ticketData = {
        issueType: 'Delayed',
        description: 'Parcel delivery is delayed beyond expected time',
        priority: 'Medium',
        parcelId: 'TEST001'
      };

      const response = await request(app)
        .post('/api/tickets')
        .set('Authorization', `Bearer ${supportAgentToken}`)
        .send(ticketData)
        .expect(201);

      expect(response.body).to.have.property('success', true);
      expect(response.body.data).to.have.property('status', 'Open');
      expect(response.body.data).to.have.property('priority', 'Medium'); // Explicitly set
      expect(response.body.data).to.have.property('issueType', 'Delayed');
    });

    it('should reject driver from creating ticket', async () => {
      const ticketData = {
        issueType: 'General',
        description: 'General inquiry about delivery'
      };

      const response = await request(app)
        .post('/api/tickets')
        .set('Authorization', `Bearer ${customerToken}`)
        .send(ticketData)
        .expect(403);

      expect(response.body).to.have.property('message');
      expect(response.body.message).to.include('Access denied');
    });

    it('should auto-assign priority based on issue type', async () => {
      const testCases = [
        { issueType: 'Lost', expectedPriority: 'High' },
        { issueType: 'Delayed', expectedPriority: 'Medium' },
        { issueType: 'Damaged', expectedPriority: 'High' },
        { issueType: 'General', expectedPriority: 'Low' }
      ];

      for (const testCase of testCases) {
        const ticketData = {
          issueType: testCase.issueType,
          description: `Test ticket for ${testCase.issueType}`
        };

        const response = await request(app)
          .post('/api/tickets')
          .set('Authorization', `Bearer ${supervisorToken}`)
          .send(ticketData)
          .expect(201);

        expect(response.body.data.priority).to.equal(testCase.expectedPriority);
      }
    });

    it('should validate parcel reference if provided', async () => {
      const ticketData = {
        issueType: 'Damaged',
        description: 'Parcel arrived damaged',
        parcelId: 'NONEXISTENT' // Invalid parcel ID
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

    it('should validate issue type enum values', async () => {
      const invalidData = {
        issueType: 'InvalidType',
        description: 'Test description'
      };

      const response = await request(app)
        .post('/api/tickets')
        .set('Authorization', `Bearer ${supervisorToken}`)
        .send(invalidData)
        .expect(400);

      expect(response.body).to.have.property('message');
      expect(response.body.message).to.include('Invalid issue type');
    });

    it('should validate priority enum values', async () => {
      const invalidData = {
        issueType: 'General',
        description: 'Test description',
        priority: 'InvalidPriority'
      };

      const response = await request(app)
        .post('/api/tickets')
        .set('Authorization', `Bearer ${supervisorToken}`)
        .send(invalidData)
        .expect(400);

      expect(response.body).to.have.property('message');
      expect(response.body.message).to.include('Invalid priority');
    });

    it('should create ticket without parcel reference', async () => {
      const ticketData = {
        issueType: 'General',
        description: 'General inquiry without parcel'
      };

      const response = await request(app)
        .post('/api/tickets')
        .set('Authorization', `Bearer ${supervisorToken}`)
        .send(ticketData)
        .expect(201);

      expect(response.body).to.have.property('success', true);
      expect(response.body.data).to.have.property('parcel', null);
    });

    it('should return created ticket details', async () => {
      const ticketData = {
        issueType: 'Delayed',
        description: 'Test ticket with full details',
        priority: 'High',
        parcelId: 'TEST001',
        tags: ['urgent', 'customer-complaint']
      };

      const response = await request(app)
        .post('/api/tickets')
        .set('Authorization', `Bearer ${supervisorToken}`)
        .send(ticketData)
        .expect(201);

      expect(response.body.data).to.have.property('ticketId');
      expect(response.body.data).to.have.property('createdAt');
      expect(response.body.data).to.have.property('updatedAt');
      expect(response.body.data).to.have.property('estimatedResolutionTime');
      expect(response.body.data).to.have.property('tags');
      expect(response.body.data.tags).to.include.members(['urgent', 'customer-complaint']);
    });
  });

  describe('GET /api/tickets - Get Tickets', () => {
    beforeEach(async () => {
      // Create test tickets
      await Ticket.create([
        {
          issueType: 'Lost',
          priority: 'High',
          status: 'Open',
          description: 'Lost parcel 1',
          createdBy: supervisorId
        },
        {
          issueType: 'Delayed',
          priority: 'Medium',
          status: 'InProgress',
          description: 'Delayed parcel 1',
          createdBy: supervisorId,
          assignedTo: supportAgentId
        }
      ]);
    });

    it('should allow supervisor to get all tickets', async () => {
      const response = await request(app)
        .get('/api/tickets')
        .set('Authorization', `Bearer ${supervisorToken}`)
        .expect(200);

      expect(response.body).to.have.property('success', true);
      expect(response.body.data).to.have.property('tickets');
      expect(response.body.data).to.have.property('pagination');
      expect(response.body.data.tickets).to.be.an('array');
      expect(response.body.data.tickets).to.have.length(2);
    });

    it('should allow support agent to get all tickets', async () => {
      const response = await request(app)
        .get('/api/tickets')
        .set('Authorization', `Bearer ${supportAgentToken}`)
        .expect(200);

      expect(response.body).to.have.property('success', true);
      expect(response.body.data.tickets).to.be.an('array');
    });

    it('should reject driver from getting tickets', async () => {
      const response = await request(app)
        .get('/api/tickets')
        .set('Authorization', `Bearer ${customerToken}`)
        .expect(403);

      expect(response.body).to.have.property('message');
      expect(response.body.message).to.include('Access denied');
    });

    it('should support pagination', async () => {
      const response = await request(app)
        .get('/api/tickets?page=1&limit=1')
        .set('Authorization', `Bearer ${supervisorToken}`)
        .expect(200);

      expect(response.body.data.tickets).to.have.length(1);
      expect(response.body.data.pagination.currentPage).to.equal(1);
      expect(response.body.data.pagination.limit).to.equal(1);
    });

    it('should support filtering by status', async () => {
      const response = await request(app)
        .get('/api/tickets?status=Open')
        .set('Authorization', `Bearer ${supervisorToken}`)
        .expect(200);

      expect(response.body.data.tickets).to.be.an('array');
      response.body.data.tickets.forEach(ticket => {
        expect(ticket.status).to.equal('Open');
      });
    });

    it('should support filtering by priority', async () => {
      const response = await request(app)
        .get('/api/tickets?priority=High')
        .set('Authorization', `Bearer ${supervisorToken}`)
        .expect(200);

      expect(response.body.data.tickets).to.be.an('array');
      response.body.data.tickets.forEach(ticket => {
        expect(ticket.priority).to.equal('High');
      });
    });
  });

  describe('GET /api/tickets/:ticketId - Get Single Ticket', () => {
    let testTicket;

    beforeEach(async () => {
      testTicket = await Ticket.create({
        issueType: 'Damaged',
        priority: 'High',
        status: 'Open',
        description: 'Test ticket for single retrieval',
        createdBy: supervisorId,
        parcel: testParcel._id
      });
    });

    it('should allow supervisor to get ticket', async () => {
      const response = await request(app)
        .get(`/api/tickets/${testTicket.ticketId}`)
        .set('Authorization', `Bearer ${supervisorToken}`)
        .expect(200);

      expect(response.body).to.have.property('success', true);
      expect(response.body.data).to.have.property('ticketId', testTicket.ticketId);
      expect(response.body.data).to.have.property('parcel');
      expect(response.body.data.parcel).to.have.property('parcelId', 'TEST001');
    });

    it('should allow support agent to get ticket', async () => {
      const response = await request(app)
        .get(`/api/tickets/${testTicket.ticketId}`)
        .set('Authorization', `Bearer ${supportAgentToken}`)
        .expect(200);

      expect(response.body).to.have.property('success', true);
      expect(response.body.data).to.have.property('ticketId', testTicket.ticketId);
    });

    it('should return 404 for non-existent ticket', async () => {
      const response = await request(app)
        .get('/api/tickets/NONEXISTENT')
        .set('Authorization', `Bearer ${supervisorToken}`)
        .expect(404);

      expect(response.body).to.have.property('message');
      expect(response.body.message).to.include('Ticket not found');
    });
  });

  describe('PATCH /api/tickets/:ticketId/status - Update Status', () => {
    let testTicket;

    beforeEach(async () => {
      testTicket = await Ticket.create({
        issueType: 'Lost',
        priority: 'High',
        status: 'Open',
        description: 'Test ticket for status update',
        createdBy: supervisorId,
        assignedTo: supportAgentId
      });
    });

    it('should allow supervisor to update ticket status', async () => {
      const updateData = {
        status: 'InProgress',
        resolution: 'Investigating with delivery team'
      };

      const response = await request(app)
        .patch(`/api/tickets/${testTicket.ticketId}/status`)
        .set('Authorization', `Bearer ${supervisorToken}`)
        .send(updateData)
        .expect(200);

      expect(response.body).to.have.property('success', true);
      expect(response.body.data.status).to.equal('InProgress');
    });

    it('should allow assigned support agent to update ticket status', async () => {
      const updateData = {
        status: 'Resolved',
        resolution: 'Parcel found and delivered',
        resolutionCategory: 'Delivered'
      };

      const response = await request(app)
        .patch(`/api/tickets/${testTicket.ticketId}/status`)
        .set('Authorization', `Bearer ${supportAgentToken}`)
        .send(updateData)
        .expect(200);

      expect(response.body).to.have.property('success', true);
      expect(response.body.data.status).to.equal('Resolved');
      expect(response.body.data.resolution).to.equal('Parcel found and delivered');
    });

    it('should reject unassigned support agent from updating status', async () => {
      // Create another support agent
      const otherAgent = await User.create({
        name: 'Other Agent',
        email: 'other@test.com',
        password: 'password123',
        role: 'SupportAgent',
      });

      const otherLogin = await request(app)
        .post('/api/auth/login')
        .send({ email: 'other@test.com', password: 'password123' });

      const updateData = { status: 'InProgress' };

      const response = await request(app)
        .patch(`/api/tickets/${testTicket.ticketId}/status`)
        .set('Authorization', `Bearer ${otherLogin.body.token}`)
        .send(updateData)
        .expect(403);

      expect(response.body).to.have.property('message');
      expect(response.body.message).to.include('You can only update tickets assigned to you');
    });

    it('should validate status enum values', async () => {
      const invalidData = { status: 'InvalidStatus' };

      const response = await request(app)
        .patch(`/api/tickets/${testTicket.ticketId}/status`)
        .set('Authorization', `Bearer ${supervisorToken}`)
        .send(invalidData)
        .expect(400);

      expect(response.body).to.have.property('message');
      expect(response.body.message).to.include('Invalid status');
    });
  });

  describe('PATCH /api/tickets/:ticketId/assign - Assign Ticket', () => {
    let testTicket;

    beforeEach(async () => {
      testTicket = await Ticket.create({
        issueType: 'General',
        priority: 'Medium',
        status: 'Open',
        description: 'Test ticket for assignment',
        createdBy: supervisorId
      });
    });

    it('should allow supervisor to assign ticket', async () => {
      const assignData = {
        assignedTo: supportAgentId.toString(),
        notes: 'Assigning to primary support agent'
      };

      const response = await request(app)
        .patch(`/api/tickets/${testTicket.ticketId}/assign`)
        .set('Authorization', `Bearer ${supervisorToken}`)
        .send(assignData)
        .expect(200);

      expect(response.body).to.have.property('success', true);
      expect(response.body.data.assignedTo._id).to.equal(supportAgentId.toString());
    });

    it('should reject support agent from assigning tickets', async () => {
      const assignData = { assignedTo: supportAgentId.toString() };

      const response = await request(app)
        .patch(`/api/tickets/${testTicket.ticketId}/assign`)
        .set('Authorization', `Bearer ${supportAgentToken}`)
        .send(assignData)
        .expect(403);

      expect(response.body).to.have.property('message');
      expect(response.body.message).to.include('Access denied');
    });

    it('should validate support agent assignment', async () => {
      const assignData = {
        assignedTo: customerId.toString() // Customer is not a support agent
      };

      const response = await request(app)
        .patch(`/api/tickets/${testTicket.ticketId}/assign`)
        .set('Authorization', `Bearer ${supervisorToken}`)
        .send(assignData)
        .expect(400);

      expect(response.body).to.have.property('message');
      expect(response.body.message).to.include('Invalid support agent');
    });
  });

  describe('GET /api/tickets/statistics - Get Statistics', () => {
    beforeEach(async () => {
      // Create test tickets for statistics
      await Ticket.create([
        {
          issueType: 'Lost',
          priority: 'High',
          status: 'Open',
          description: 'Lost ticket 1',
          createdBy: supervisorId
        },
        {
          issueType: 'Delayed',
          priority: 'Medium',
          status: 'Resolved',
          description: 'Delayed ticket 1',
          createdBy: supervisorId,
          resolutionCategory: 'Delivered'
        },
        {
          issueType: 'Damaged',
          priority: 'High',
          status: 'InProgress',
          description: 'Damaged ticket 1',
          createdBy: supervisorId
        }
      ]);
    });

    it('should allow supervisor to get ticket statistics', async () => {
      const response = await request(app)
        .get('/api/tickets/statistics')
        .set('Authorization', `Bearer ${supervisorToken}`)
        .expect(200);

      expect(response.body).to.have.property('success', true);
      expect(response.body.data).to.have.property('status');
      expect(response.body.data).to.have.property('priority');
      expect(response.body.data).to.have.property('issueType');
      expect(response.body.data).to.have.property('resolution');
    });

    it('should reject support agent from getting statistics', async () => {
      const response = await request(app)
        .get('/api/tickets/statistics')
        .set('Authorization', `Bearer ${supportAgentToken}`)
        .expect(403);

      expect(response.body).to.have.property('message');
      expect(response.body.message).to.include('Access denied');
    });

    it('should support date filtering', async () => {
      const startDate = new Date(Date.now() - 24 * 60 * 60 * 1000); // 24 hours ago
      const endDate = new Date();

      const response = await request(app)
        .get(`/api/tickets/statistics?startDate=${startDate.toISOString()}&endDate=${endDate.toISOString()}`)
        .set('Authorization', `Bearer ${supervisorToken}`)
        .expect(200);

      expect(response.body).to.have.property('success', true);
      expect(response.body.data).to.have.property('status');
    });
  });
});
