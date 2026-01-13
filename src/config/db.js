import mongoose from 'mongoose';

const connectDB = async (mongoUri = '') => {
  if (!mongoUri) {
    throw new Error('MongoDB connection string is missing. Set MONGO_URI in environment variables.');
  }

  try {
    await mongoose.connect(mongoUri);
    console.log('Connected to MongoDB');
  } catch (error) {
    console.error('MongoDB connection error:', error.message);
    throw error;
  }
};

export default connectDB;
