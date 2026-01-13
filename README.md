# EcoTrack Logistics System

A comprehensive web-based logistics management platform that integrates GPS tracking, route optimization, ticket management, and secure authentication systems for modern delivery operations.

## 🚀 Features Implemented

### 🗺️ GPS Tracking & Route Management
- **Real-time GPS Tracking**: Live vehicle position updates every 200ms
- **Sri Lankan Highway Network**: Accurate A1, A2, and A6 highway simulation
- **Route Visualization**: Interactive maps with custom vehicle markers
- **Progress Monitoring**: Percentage-based route completion tracking
- **Highway Checkpoints**: Key junction markers with detailed information

### 🛣️ Route Optimization
- **Intelligent Route Selection**: Geographic-based highway optimization
- **Distance Calculation**: Haversine formula for accurate measurements
- **Time Estimation**: Speed-based duration calculations
- **Alternative Routes**: Multiple routing options when available
- **Fuel Efficiency**: Route selection considering distance and road quality

### 🎫 Ticket Management System
- **Complete Ticket Lifecycle**: Creation, assignment, and resolution tracking
- **Priority Classification**: Four-level priority system (Low, Medium, High, Urgent)
- **Staff Assignment**: Workload distribution and management
- **Parcel Integration**: Direct linking to delivery issues
- **Category Management**: Delivery, Pickup, Payment, System, and Other categories

### 🔐 Secure Authentication
- **JWT Token Authentication**: Secure session management with expiration
- **Password Security**: bcrypt hashing with salt rounds (10)
- **Role-Based Access Control**: Three-tier permission system
  - **Drivers**: Access to assigned parcels and route tracking
  - **Supervisors**: Full parcel management and route assignment
  - **Support Staff**: Ticket management and customer service
- **Input Validation**: Comprehensive security measures and sanitization

### 📱 User Interfaces
- **Driver Dashboard**: Route tracking and parcel management
- **Supervisor Dashboard**: Complete parcel and route oversight
- **Support Dashboard**: Ticket management and customer service
- **Interactive Maps**: OpenStreetMap integration with Leaflet.js
- **Responsive Design**: Mobile-friendly interface design

## 🏗️ Technical Architecture

### Backend Stack
- **Runtime**: Node.js with ES6 modules
- **Framework**: Express.js for REST API development
- **Database**: MongoDB with Mongoose ODM
- **Authentication**: JWT (JSON Web Tokens) with bcrypt
- **Security**: CORS configuration and input validation

### Frontend Stack
- **Core**: HTML5, CSS3, JavaScript (ES6+)
- **Mapping**: Leaflet.js with OpenStreetMap tiles
- **UI Components**: Custom CSS with modern design patterns
- **Real-time Updates**: JavaScript intervals for live tracking

### Project Structure
```
src/
├── config/           # Database and environment configuration
├── controllers/      # Business logic handlers
├── middleware/       # Authentication and error handling
├── models/          # Database schemas (User, Parcel, Ticket)
├── routes/          # API endpoints and routing
├── services/        # Business logic services
└── utils/           # Helper functions and utilities

public/              # Frontend files and static assets
tests/               # Test suite and validation
```

## 🚀 Quick Start

### Prerequisites
- Node.js (v14 or higher)
- MongoDB (local or cloud instance)
- Git for version control

### Installation & Setup

1. **Clone and install dependencies**:
   ```bash
   git clone <repository-url>
   cd EcoTrack-Logistics
   npm install
   ```

2. **Environment configuration**:
   ```bash
   cp .env.example .env
   ```
   Update `.env` with your configuration:
   ```env
   MONGO_URI=mongodb://localhost:27017/ecotrack
   JWT_SECRET=your-super-secret-jwt-key-here
   JWT_EXPIRES_IN=7d
   PORT=3000
   NODE_ENV=development
   ```

3. **Database setup**:
   ```bash
   # For local MongoDB
   mongod --dbpath "C:\data\db"
   
   # Or use MongoDB Atlas for cloud deployment
   ```

4. **Start the application**:
   ```bash
   # Development mode with auto-restart
   npm run dev
   
   # Production mode
   npm start
   ```

5. **Access the application**:
   - Main Application: `http://localhost:3000`
   - Health Check: `http://localhost:3000/health`
   - API Documentation: Available via in-app documentation

## 📊 Key Features in Detail

### GPS Tracking System
The GPS tracking system provides realistic vehicle movement simulation along Sri Lankan highway networks with:
- Real-time position updates every 200ms
- Accurate highway route following (A1, A2, A6)
- Visual vehicle representation with custom markers
- Progress tracking and status updates
- Highway segment identification and reporting

### Route Optimization
Intelligent route selection based on:
- Geographic coordinate analysis
- Sri Lankan highway network topology
- Distance and time calculations
- Fuel efficiency considerations
- Alternative route options

### Ticket Management
Comprehensive support system featuring:
- Complete ticket lifecycle management
- Priority-based handling
- Staff assignment and workload distribution
- Parcel integration for delivery issues
- Real-time status tracking

### Authentication & Security
Robust security implementation with:
- JWT-based session management
- Secure password hashing
- Role-based access control
- Input validation and sanitization
- CORS protection

## 🧪 Testing

### Running Tests
```bash
# Run all tests
npm test

# Run specific test suites
npm run test:parcels
npm run test:tickets
npm run test:increment2
npm run test:increment3
```

### Test Coverage
- Unit tests for core business logic
- Integration tests for API endpoints
- Database operation validation
- Authentication flow testing
- Frontend component testing

## 🚀 Deployment

### Local Deployment
The system is fully configured for local deployment with all components running on a single machine.

### Web Hosting Deployment
Ready for production deployment on:
- **Cloud Platforms**: AWS, Google Cloud, Azure
- **PaaS Services**: Heroku, Vercel, Netlify
- **VPS Hosting**: DigitalOcean, Linode
- **Container Deployment**: Docker with Kubernetes

### Production Considerations
- MongoDB Atlas for database hosting
- Environment variable management
- SSL/TLS certificate implementation
- Load balancing for high availability
- Application performance monitoring

## 📱 API Endpoints

### Authentication
- `POST /api/auth/register` - User registration
- `POST /api/auth/login` - User login
- `POST /api/auth/logout` - User logout

### Parcel Management
- `GET /api/parcels` - List all parcels
- `POST /api/parcels` - Create new parcel
- `PUT /api/parcels/:id` - Update parcel
- `DELETE /api/parcels/:id` - Delete parcel

### Ticket Management
- `GET /api/tickets` - List all tickets
- `POST /api/tickets` - Create new ticket
- `PUT /api/tickets/:id/assign` - Assign ticket
- `PUT /api/tickets/:id/status` - Update ticket status

### Route Management
- `POST /api/routes/optimize` - Calculate optimal route
- `GET /api/routes/:id` - Get route details
- `PUT /api/routes/:id/assign` - Assign route to driver

## 🔧 Configuration

### Environment Variables
```env
# Database
MONGO_URI=mongodb://localhost:27017/ecotrack

# Authentication
JWT_SECRET=your-super-secret-jwt-key-here
JWT_EXPIRES_IN=7d

# Server
PORT=3000
NODE_ENV=development

# Map Services (Optional)
OPENROUTESERVICE_API_KEY=your-api-key-here
GOOGLE_MAPS_API_KEY=your-google-maps-key
MAPBOX_ACCESS_TOKEN=your-mapbox-token
```

## 🤝 Contributing

1. Fork the repository
2. Create a feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Add amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

## 📄 License

This project is licensed under the MIT License - see the LICENSE file for details.

## 📞 Support

For support and questions:
- Create an issue in the repository
- Check the in-app documentation
- Review the API endpoints documentation

---

**Version**: 1.0.0  
**Status**: Production Ready  
**Last Updated**: January 2025
