import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';
import cors from 'cors';

import authRoutes from './routes/authRoutes.js';
import protectedRoutes from './routes/protectedRoutes.js';
import dashboardRoutes from './routes/dashboardRoutes.js';
import parcelRoutes from './routes/parcelRoutes.js';
import routeRoutes from './routes/routeRoutes.js';
import routeOptimizationRoutes from './routes/routeOptimizationRoutes.js';
import routeOptimizationApiRoutes from './routes/routeOptimizationApiRoutes.js';
import routeAssignmentRoutes from './routes/routeAssignmentRoutes.js';
import ticketRoutesSimple from './routes/ticketRoutesSimple.js';
import ticketRetrievalRoutes from './routes/ticketRetrievalRoutes.js';
import ticketAssignmentRoutes from './routes/ticketAssignmentRoutes.js';
import ticketStatusRoutes from './routes/ticketStatusRoutes.js';
import ticketParcelIntegrationRoutes from './routes/ticketParcelIntegrationRoutes.js';
import { notFoundHandler, errorHandler } from './middleware/errorHandler.js';
import errorLogger, { logMapApiStatus } from './middleware/errorLogging.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();

// CORS configuration
app.use(cors({
    origin: ['http://localhost:8080', 'http://127.0.0.1:8080'],
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization']
}));

app.use(express.json());
app.use(express.static(path.join(__dirname, '..', 'public')));
app.use('/api/auth', authRoutes);
app.use('/api/protected', protectedRoutes);
app.use('/api/dashboard', dashboardRoutes);
app.use('/api/parcels', parcelRoutes);
app.use('/api/routes', routeRoutes);
app.use('/api/route-optimization', routeOptimizationRoutes);
app.use('/api/routes/optimize', routeOptimizationApiRoutes);
app.use('/api/routes/assign', routeAssignmentRoutes);
app.use('/api/tickets', ticketRoutesSimple); // Creation routes
app.use('/api/tickets', ticketRetrievalRoutes); // Retrieval routes
app.use('/api/tickets', ticketAssignmentRoutes); // Assignment routes
app.use('/api/tickets', ticketStatusRoutes); // Status update routes
app.use('/api/tickets', ticketParcelIntegrationRoutes); // Parcel integration routes

// Error logging middleware (must be before errorHandler)
app.use(errorLogger);

app.get('/health', (_req, res) => {
  res.status(200).json({ status: 'ok', service: 'EcoTrack Logistics System API' });
});

app.get('/', (_req, res) => {
  res.sendFile(path.join(__dirname, '..', 'public', 'login.html'));
});

app.use(notFoundHandler);
app.use(errorHandler);

export default app;

// Also export for CommonJS compatibility
if (typeof module !== 'undefined' && module.exports) {
  module.exports = app;
}
