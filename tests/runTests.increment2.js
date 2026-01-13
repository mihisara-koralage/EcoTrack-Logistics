import assert from 'node:assert/strict';
import mongoose from 'mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';
import request from 'supertest';

import app from '../src/app.js';

process.env.JWT_SECRET = process.env.JWT_SECRET || 'testsecret-increment2';
process.env.NODE_ENV = process.env.NODE_ENV || 'test';

const credentials = {
  supervisor: {
    name: 'Supervisor One',
    email: 'supervisor@example.com',
    password: 'Password123!',
    role: 'Supervisor',
  },
  driver: {
    name: 'Driver One',
    email: 'driverincrement2@example.com',
    password: 'Password123!',
    role: 'Driver',
  },
  support: {
    name: 'Support One',
    email: 'supportincrement2@example.com',
    password: 'Password123!',
    role: 'SupportAgent',
  },
};

const testResults = {
  passed: 0,
  failed: 0,
};

const log = {
  success: (name) => {
    console.log(`✅ ${name}`);
    testResults.passed += 1;
  },
  error: (name, err) => {
    console.error(`❌ ${name}`);
    console.error(err instanceof Error ? err.stack : err);
    testResults.failed += 1;
  },
};

const test = async (name, fn) => {
  try {
    await fn();
    log.success(name);
  } catch (error) {
    log.error(name, error);
  }
};

const registerUser = async (payload) => {
  const response = await request(app).post('/api/auth/register').send(payload);
  assert.equal(response.status, 201, 'Registration should succeed');
};

const loginUser = async ({ email, password }) => {
  const response = await request(app).post('/api/auth/login').send({ email, password });
  assert.equal(response.status, 200, 'Login should succeed');
  return response.body.token;
};

(async () => {
  const mongoServer = await MongoMemoryServer.create();
  const uri = mongoServer.getUri();

  try {
    await mongoose.connect(uri);

    await registerUser(credentials.supervisor);
    await registerUser(credentials.driver);
    await registerUser(credentials.support);

    const supervisorToken = await loginUser(credentials.supervisor);
    const driverToken = await loginUser(credentials.driver);
    const supportToken = await loginUser(credentials.support);

    await test('Supervisor can access supervisor dashboard', async () => {
      const response = await request(app)
        .get('/api/dashboard/supervisor')
        .set('Authorization', `Bearer ${supervisorToken}`);

      assert.equal(response.status, 200);
      assert.ok(response.body.summary);
      assert.ok(response.body.summary.totalParcels);
    });

    await test('Driver can access driver dashboard', async () => {
      const response = await request(app)
        .get('/api/dashboard/driver')
        .set('Authorization', `Bearer ${driverToken}`);

      assert.equal(response.status, 200);
      assert.ok(Array.isArray(response.body.assignedDeliveries));
      assert.ok(response.body.statusSummary);
    });

    await test('Support agent can access support dashboard', async () => {
      const response = await request(app)
        .get('/api/dashboard/support')
        .set('Authorization', `Bearer ${supportToken}`);

      assert.equal(response.status, 200);
      assert.ok(Array.isArray(response.body.openTickets));
      assert.ok(typeof response.body.resolvedTicketsCount === 'number');
    });

    await test('Driver receives 403 when accessing support dashboard', async () => {
      const response = await request(app)
        .get('/api/dashboard/support')
        .set('Authorization', `Bearer ${driverToken}`);

      assert.equal(response.status, 403);
      assert.equal(response.body.message, 'Access denied for your role.');
    });

    await test('Support agent receives 403 when accessing driver dashboard', async () => {
      const response = await request(app)
        .get('/api/dashboard/driver')
        .set('Authorization', `Bearer ${supportToken}`);

      assert.equal(response.status, 403);
      assert.equal(response.body.message, 'Access denied for your role.');
    });

    await test('Missing token results in 401 for dashboard route', async () => {
      const response = await request(app).get('/api/dashboard/driver');

      assert.equal(response.status, 401);
      assert.equal(response.body.message, 'Authentication token missing.');
    });

    await test('Invalid token results in 401 for dashboard route', async () => {
      const response = await request(app)
        .get('/api/dashboard/driver')
        .set('Authorization', 'Bearer invalidtoken');

      assert.equal(response.status, 401);
      assert.equal(response.body.message, 'Invalid authentication token.');
    });
  } finally {
    await mongoose.connection.dropDatabase();
    await mongoose.disconnect();
    await mongoServer.stop();
  }

  console.log('\nIncrement 2 Test Summary');
  console.log(`Passed: ${testResults.passed}`);
  console.log(`Failed: ${testResults.failed}`);

  if (testResults.failed > 0) {
    process.exitCode = 1;
  }
})();
