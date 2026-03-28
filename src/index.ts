import dotenv from "dotenv";

// Load environment variables first
dotenv.config();

// Import pinecone client early to set up fetch polyfills
import "./config/pineconeClient";

import express from "express";
import { apiRoutes } from "./routes";
import { pipelineService } from "./services/pipeline.service";
import { errorHandler } from "./middlewares/error.middleware";
import { logger, corsMiddleware } from "./middlewares/common.middleware";
import { initializeS3 } from "./utils/s3";
import { initializeMongoDB,getMongoStatus } from "./config/db";

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(express.json());
app.use(logger);
app.use(corsMiddleware);

// Health check endpoint
app.get('/health', (_req, res) => {
    res.json({
        status: 'ok',
        uptime: process.uptime(),
        timestamp: new Date().toISOString()
    });
});

// Routes
app.use('/', apiRoutes);

// Error handling middleware (must be last)
app.use(errorHandler);

const initializeResource = async () => {
    try {
        await initializeS3();
        await initializeMongoDB();
        
        // Initialize pipeline scheduler only after successful resource initialization
        pipelineService.start();
        
        // Start server only after MongoDB is connected
        const mongoStatus = getMongoStatus();
        if (mongoStatus.status === 'connected') {
            const server = app.listen(PORT, () => {
                console.log(`🚀 Britannia Product Scraper API running on http://localhost:${PORT}`);
                console.log(`📚 API Documentation available at: http://localhost:${PORT}/`);
            });

            // Configure timeouts for long-running SSE connections
            server.timeout = 300000;          // 5 min — for SSE streaming
            server.keepAliveTimeout = 120000;  // 2 min — keep-alive between requests
            server.headersTimeout = 310000;    // slightly > server.timeout

            console.log('✅ MongoDB is connected');
        } else {
            console.error('❌ MongoDB connection failed. Server not started.');
            process.exit(1);
        }
    } catch (error) {
        console.error('❌ Failed to initialize resources:', error);
        process.exit(1);
    }
};

// Initialize resources and start server
initializeResource();



// Graceful shutdown
process.on('SIGINT', () => {
  console.log('\n🛑 Received SIGINT. Shutting down gracefully...');
  pipelineService.stop();
  process.exit(0);
});

process.on('SIGTERM', () => {
  console.log('\n🛑 Received SIGTERM. Shutting down gracefully...');
  pipelineService.stop();
  process.exit(0);
});
