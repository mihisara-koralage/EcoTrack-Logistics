import { expect } from 'chai';
import request from 'supertest';
import mongoose from 'mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';
import app from '../src/app.js';
import User from '../src/models/User.js';
import Parcel from '../src/models/Parcel.js';
import Ticket from '../src/models/Ticket.js';

describe('Ticket Retrieval API Tests', function() {
  this.timeout(10000);

  let mongoServer;
  let supervisorToken, supportAgentToken;
  let supervisorId, supportAgentId;
  let testTickets = [];

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

    // Create test tickets
    const testParcel = await Parcel.create({
      parcelId: 'TEST001',
      senderName: 'Test Sender',
      receiverName: 'Test Receiver',
      pickupLocation: '123 Pickup St',
      deliveryLocation: '456 Delivery Ave',
      status: 'InTransit'
    });

    testTickets = await Ticket.create([
      {
        ticketId: 'TK-20260109-0001',
        issueType: 'Lost',
        priority: 'High',
        status: 'Open',
        description: 'Lost parcel 1',
        createdBy: supervisorId,
        assignedTo: supportAgentId
      },
      {
        ticketId: 'TK-20260109-0002',
        issueType: 'Delayed',
        priority: 'Medium',
        status: 'InProgress',
        description: 'Delayed parcel 1',
        createdBy: supervisorId,
        assignedTo: supportAgentId
      },
      {
        ticketId: 'TK-20260109-0003',
        issueType: 'Damaged',
        priority: 'High',
        status: 'Resolved',
        description: 'Damaged parcel 1',
        createdBy: supervisorId,
        assignedTo: supportAgentId
      },
      {
        ticketId: 'TK-20260109-0004',
        issueType: 'General',
        priority: 'Low',
        status: 'Open',
        description: 'General inquiry 1',
        createdBy: supervisorId
        // Unassigned
      }
    ]);
  });

  describe('GET /api/tickets - Basic Retrieval', () => {
    it('should allow supervisor to view all tickets', async () => {
      const response = await request(app)
        .get('/api/tickets')
        .set('Authorization', `Bearer ${supervisorToken}`)
        .expect(200);

      expect(response.body).to.have.property('success', true);
      expect(response.body.data).to.have.property('tickets');
      expect(response.body.data).to.have.property('pagination');
      expect(response.body.data.tickets).to.be.an('array');
      expect(response.body.data.tickets).to.have.length(4); // All tickets
    });

    it('should allow support agent to view assigned tickets only', async () => {
      const response = await request(app)
        .get('/api/tickets')
        .set('Authorization', `Bearer ${supportAgentToken}`)
        .expect(200);

      expect(response.body).to.have.property('success', true);
      expect(response.body.data.tickets).to.be.an('array');
      expect(response.body.data.tickets).to.have.length(3); // Only assigned tickets
    });

    it('should return paginated results', async () => {
      const response = await request(app)
        .get('/api/tickets?page=1&limit=2')
        .set('Authorization', `Bearer ${supervisorToken}`)
        .expect(200);

      expect(response.body.data.tickets).to.have.length(2); // Limited to 2
      expect(response.body.data.pagination.currentPage).to.equal(1);
      expect(response.body.data.pagination.limit).to.equal(2);
      expect(response.body.data.pagination.totalPages).to.equal(2); // 4 total / 2 limit = 2 pages
      expect(response.body.data.pagination.hasNextPage).to.equal(true);
      expect(response.body.data.pagination.nextPage).to.equal(2);
    });

    it('should handle pagination edge cases', async () => {
      const response = await request(app)
        .get('/api/tickets?page=2&limit=2')
        .set('Authorization', `Bearer ${supervisorToken}`)
        .expect(200);

      expect(response.body.data.tickets).to.have.length(2); // Second page
      expect(response.body.data.pagination.currentPage).to.equal(2);
      expect(response.body.data.pagination.hasPrevPage).to.equal(true);
      expect(response.body.data.pagination.prevPage).to.equal(1);
      expect(response.body.data.pagination.hasNextPage).to.equal(false);
    });
  });

  describe('GET /api/tickets - Filtering', () => {
    it('should filter by status', async () => {
      const response = await request(app)
        .get('/api/tickets?status=Open')
        .set('Authorization', `Bearer ${supervisorToken}`)
        .expect(200);

      expect(response.body.data.tickets).to.be.an('array');
      response.body.data.tickets.forEach(ticket => {
        expect(ticket.status).to.equal('Open');
      });
    });

    it('should filter by priority', async () => {
      const response = await request(app)
        .get('/api/tickets?priority=High')
        .set('Authorization', `Bearer ${supervisorToken}`)
        .expect(200);

      expect(response.body.data.tickets).to.be.an('array');
      response.body.data.tickets.forEach(ticket => {
        expect(ticket.priority).to.equal('High');
      });
    });

    it('should filter by issue type', async () => {
      const response = await request(app)
        .get('/api/tickets?issueType=Lost')
        .set('Authorization', `Bearer ${supervisorToken}`)
        .expect(200);

      expect(response.body.data.tickets).to.be.an('array');
      response.body.data.tickets.forEach(ticket => {
        expect(ticket.issueType).to.equal('Lost');
      });
    });

    it('should combine multiple filters', async () => {
      const response = await request(app)
        .get('/api/tickets?status=Open&priority=High')
        .set('Authorization', `Bearer ${supervisorToken}`)
        .expect(200);

      expect(response.body.data.tickets).to.be.an('array');
      response.body.data.tickets.forEach(ticket => {
        expect(ticket.status).to.equal('Open');
        expect(ticket.priority).to.equal('High');
      });
    });

    it('should validate filter parameters', async () => {
      const response = await request(app)
        .get('/api/tickets?status=InvalidStatus')
        .set('Authorization', `Bearer ${supervisorToken}`)
        .expect(400);

      expect(response.body).to.have.property('message');
      expect(response.body.message).to.include('Invalid status');
    });
  });

  describe('GET /api/tickets/:ticketId - Single Ticket', () => {
    it('should allow supervisor to get any ticket', async () => {
      const response = await request(app)
        .get('/api/tickets/TK-20260109-0001')
        .set('Authorization', `Bearer ${supervisorToken}`)
        .expect(200);

      expect(response.body).to.have.property('success', true);
      expect(response.body.data).to.have.property('ticketId', 'TK-20260109-0001');
      expect(response.body.data).to.have.property('issueType', 'Lost');
    });

    it('should allow support agent to get assigned ticket', async () => {
      const response = await request(app)
        .get('/api/tickets/TK-20260109-0001')
        .set('Authorization', `Bearer ${supportAgentToken}`)
        .expect(200);

      expect(response.body).to.have.property('success', true);
      expect(response.body.data).to.have.property('ticketId', 'TK-20260109-0001');
    });

    it('should reject support agent from getting unassigned ticket', async () => {
      const response = await request(app)
        .get('/api/tickets/TK-20260109-0004') // Unassigned ticket
        .set('Authorization', `Bearer ${supportAgentToken}`)
        .expect(403);

      expect(response.body).to.have.property('message');
      expect(response.body.message).to.include('You can only view tickets assigned to you');
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

  describe('GET /api/tickets/statistics - Statistics', () => {
    it('should allow supervisor to get statistics', async () => {
      const response = await request(app)
        .get('/api/tickets/statistics')
        .set('Authorization', `Bearer ${supervisorToken}`)
        .expect(200);

      expect(response.body).to.have.property('success', true);
      expect(response.body.data).to.have.property('summary');
      expect(response.body.data).to.have.property('statistics');
      expect(response.body.data.summary).to.have.property('totalTickets');
      expect(response.body.data.summary).to.have.property('openTickets');
      expect(response.body.data.summary).to.have.property('inProgressTickets');
      expect(response.body.data.summary).to.have.property('resolvedTickets');
    });

    it('should reject support agent from accessing statistics', async () => {
      const response = await request(app)
        .get('/api/tickets/statistics')
        .set('Authorization', `Bearer ${supportAgentToken}`)
        .expect(403);

      expect(response.body).to.have.property('message');
      expect(response.body.message).to.include('Only supervisors can access ticket statistics');
    });

    it('should provide statistics by status grouping', async () => {
      const response = await request(app)
        .get('/api/tickets/statistics?groupBy=status')
        .set('Authorization', `Bearer ${supervisorToken}`)
        .expect(200);

      expect(response.body.data.statistics).to.be.an('array');
      expect(response.body.data.statistics).to.deep.include.members([
        { _id: 'Open', count: 2 },
        { _id: 'InProgress', count: 1 },
        { _id: 'Resolved', count: 1 }
      ]);
    });

    it('should provide statistics by priority grouping', async () => {
      const response = await request(app)
        .get('/api/tickets/statistics?groupBy=priority')
        .set('Authorization', `Bearer ${supervisorToken}`)
        .expect(200);

      expect(response.body.data.statistics).to.be.an('array');
      expect(response.body.data.statistics).to.deep.include.members([
        { _id: 'High', count: 2 },
        { _id: 'Medium', count: 1 },
        { _id: 'Low', count: 1 }
      ]);
    });
  });

  describe('GET /api/tickets/my - User-Specific Tickets', () => {
    it('should return tickets created by supervisor', async () => {
      const response = await request(app)
        .get('/api/tickets/my')
        .set('Authorization', `Bearer ${supervisorToken}`)
        .expect(200);

      expect(response.body).to.have.property('success', true);
      expect(response.body.data.tickets).to.be.an('array');
      expect(response.body.data.tickets).to.have.length(4); // All tickets created by supervisor
    });

    it('should return tickets assigned to support agent', async () => {
      const response = await request(app)
        .get('/api/tickets/my')
        .set('Authorization', `Bearer ${supportAgentToken}`)
        .expect(200);

      expect(response.body).to.have.property('success', true);
      expect(response.body.data.tickets).to.be.an('array');
      expect(response.body.data.tickets).to.have.length(3); // Only assigned tickets
    });

    it('should apply filters to user-specific tickets', async () => {
      const response = await request(app)
        .get('/api/tickets/my?status=Open')
        .set('Authorization', `Bearer ${supervisorToken}`)
        .expect(200);

      expect(response.body.data.tickets).to.be.an('array');
      response.body.data.tickets.forEach(ticket => {
        expect(ticket.status).to.equal('Open');
      });
    });
  });

  describe('Sorting and Search', () => {
    it('should sort tickets by creation date', async () => {
      const response = await request(app)
        .get('/api/tickets?sortBy=createdAt&sortOrder=asc')
        .set('Authorization', `Bearer ${supervisorToken}`)
        .expect(200);

      expect(response.body.data.tickets).to.be.an('array');
      // Check if tickets are sorted ascending by createdAt
      for (let i = 1; i < response.body.data.tickets.length; i++) {
        const prevDate = new Date(response.body.data.tickets[i - 1].createdAt);
        const currDate = new Date(response.body.data.tickets[i].createdAt);
        expect(currDate).to.be.at.least(prevDate);
      }
    });

    it('should search tickets by description', async () => {
      const response = await request(app)
        .get('/api/tickets?search=Lost')
        .set('Authorization', `Bearer ${supervisorToken}`)
        .expect(200);

      expect(response.body.data.tickets).to.be.an('array');
      response.body.data.tickets.forEach(ticket => {
        expect(ticket.description).to.include('Lost');
      });
    });

    it('should search tickets by ticket ID', async () => {
      const response = await request(app)
        .get('/api/tickets?search=TK-20260109-0001')
        .set('Authorization', `Bearer ${supervisorToken}`)
        .expect(200);

      expect(response.body.data.tickets).to.be.an('array');
      expect(response.body.data.tickets).to.have.length(1);
      expect(response.body.data.tickets[0].ticketId).to.equal('TK-20260109-0001');
    });
  });
});
