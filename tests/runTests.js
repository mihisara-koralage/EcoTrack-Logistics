import assert from 'node:assert/strict';
import mongoose from 'mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';
import request from 'supertest';

import app from '../src/app.js';
import User from '../src/models/User.js';

process.env.JWT_SECRET = process.env.JWT_SECRET || 'testsecret';
process.env.NODE_ENV = process.env.NODE_ENV || 'test';

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

const registerUser = async ({ name, email, password, role }) => {
  const response = await request(app).post('/api/auth/register').send({
    name,
    email,
    password,
    role,
  });
  return response;
};

const loginUser = async ({ email, password }) => {
  const response = await request(app).post('/api/auth/login').send({
    email,
    password,
  });
  return response;
};

(async () => {
  const mongoServer = await MongoMemoryServer.create();
  const uri = mongoServer.getUri();

  try {
    await mongoose.connect(uri);

    await test('Registration succeeds for Supervisor, Driver, and SupportAgent roles', async () => {
      const roles = ['Supervisor', 'Driver', 'SupportAgent'];

      for (const role of roles) {
        const response = await registerUser({
          name: `${role} User`,
          email: `${role.toLowerCase()}@example.com`,
          password: 'Password123!',
          role,
        });

        assert.equal(response.status, 201, `Expected 201 for role ${role}`);
        assert.equal(response.body.user.role, role, `Expected role ${role} in response`);
        assert.ok(response.body.user.id, 'Expected user id in response');
        assert.ok(await User.findOne({ email: `${role.toLowerCase()}@example.com` }), 'User should persist in database');
      }
    });

    await test('Duplicate email registration is rejected', async () => {
      const response = await registerUser({
        name: 'Duplicate User',
        email: 'driver@example.com',
        password: 'Password123!',
        role: 'Driver',
      });

      assert.equal(response.status, 409);
      assert.equal(response.body.message, 'Email is already registered.');
    });

    await test('Login returns JWT token and user details', async () => {
      const response = await loginUser({
        email: 'supportagent@example.com',
        password: 'Password123!',
      });

      assert.equal(response.status, 200);
      assert.ok(response.body.token, 'Expected token in response');
      assert.equal(response.body.user.email, 'supportagent@example.com');
      assert.equal(response.body.user.role, 'SupportAgent');
    });

    await test('Protected profile route requires authentication and returns user details', async () => {
      const loginResponse = await loginUser({
        email: 'supportagent@example.com',
        password: 'Password123!',
      });

      const token = loginResponse.body.token;

      const profileResponse = await request(app)
        .get('/api/protected/profile')
        .set('Authorization', `Bearer ${token}`);

      assert.equal(profileResponse.status, 200);
      assert.equal(profileResponse.body.user.email, 'supportagent@example.com');
    });

    await test('Protected route rejects requests without token', async () => {
      const response = await request(app).get('/api/protected/profile');
      assert.equal(response.status, 401);
      assert.equal(response.body.message, 'Authentication token missing.');
    });

    await test('Driver receives access to delivery route but not support route', async () => {
      const loginResponse = await loginUser({
        email: 'driver@example.com',
        password: 'Password123!',
      });

      const token = loginResponse.body.token;

      const deliveriesResponse = await request(app)
        .get('/api/protected/deliveries')
        .set('Authorization', `Bearer ${token}`);

      assert.equal(deliveriesResponse.status, 200);

      const ticketsResponse = await request(app)
        .get('/api/protected/tickets')
        .set('Authorization', `Bearer ${token}`);

      assert.equal(ticketsResponse.status, 403);
      assert.equal(ticketsResponse.body.message, 'Access denied for your role.');
    });
  } finally {
    await mongoose.connection.dropDatabase();
    await mongoose.disconnect();
    await mongoServer.stop();
  }

  console.log('\nTest Summary');
  console.log(`Passed: ${testResults.passed}`);
  console.log(`Failed: ${testResults.failed}`);

  if (testResults.failed > 0) {
    process.exitCode = 1;
  }
})();
