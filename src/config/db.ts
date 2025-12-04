import mongoose from 'mongoose';
import dotenv from 'dotenv';

dotenv.config();

/**
 * Initialize MongoDB connection
 */
export const initializeMongoDB = async (): Promise<void> => {
  try {
    const dbUri = process.env.DB_URI;
    
    if (!dbUri) {
      console.log('⚠️  DB_URI not found in environment variables. MongoDB connection skipped.');
      return;
    }

    console.log('🔌 Connecting to MongoDB...');
    
    await mongoose.connect(dbUri, {
autoIndex: true,
});

    console.log('✅ MongoDB connected successfully!');
    
    // Handle connection events
    mongoose.connection.on('error', (error) => {
      console.error('❌ MongoDB connection error:', error);
    });

    mongoose.connection.on('disconnected', () => {
      console.log('🔌 MongoDB disconnected');
    });

    // Graceful shutdown
    process.on('SIGINT', async () => {
      try {
        await mongoose.connection.close();
        console.log('🛑 MongoDB connection closed through app termination');
      } catch (error) {
        console.error('❌ Error closing MongoDB connection:', error);
      }
    });

  } catch (error) {
    console.error('❌ Failed to connect to MongoDB:', error);
    throw error;
  }
};

/**
 * Get MongoDB connection status
 */
export const getMongoStatus = () => {
  const states = {
    0: 'disconnected',
    1: 'connected',
    2: 'connecting',
    3: 'disconnecting',
    4: 'invalid',
    99: 'uninitialized'
  };
  
  return {
    status: states[mongoose.connection.readyState as keyof typeof states] || 'unknown',
    readyState: mongoose.connection.readyState,
    host: mongoose.connection.host,
    port: mongoose.connection.port,
    name: mongoose.connection.name
  };
};

/**
 * Close MongoDB connection
 */
export const closeMongoDB = async (): Promise<void> => {
  try {
    await mongoose.connection.close();
    console.log('🛑 MongoDB connection closed');
  } catch (error) {
    console.error('❌ Error closing MongoDB connection:', error);
    throw error;
  }
};