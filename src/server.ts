import { createServer } from 'http';
import app from './app';
import { config } from './config';
import { connectDatabase } from './config/database';
import { setupWebSocket } from './websocket';

const httpServer = createServer(app);

// Setup WebSocket server
const io = setupWebSocket(httpServer);

// Make io available to the app
app.set('io', io);

// Graceful shutdown handler
const gracefulShutdown = async (signal: string) => {
  console.log(`\n${signal} received. Starting graceful shutdown...`);

  // Close HTTP server
  httpServer.close(() => {
    console.log('HTTP server closed');
  });

  // Close WebSocket connections
  io.close(() => {
    console.log('WebSocket server closed');
  });

  // Close database connection
  const mongoose = await import('mongoose');
  await mongoose.default.connection.close();
  console.log('Database connection closed');

  process.exit(0);
};

// Handle shutdown signals
process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
process.on('SIGINT', () => gracefulShutdown('SIGINT'));

// Handle uncaught exceptions
process.on('uncaughtException', (error) => {
  console.error('Uncaught Exception:', error);
  process.exit(1);
});

// Handle unhandled promise rejections
process.on('unhandledRejection', (reason, promise) => {
  console.error('Unhandled Rejection at:', promise, 'reason:', reason);
  process.exit(1);
});

// Start server
const startServer = async () => {
  try {
    // Connect to database
    await connectDatabase();

    // Start HTTP server
    httpServer.listen(config.port, () => {
      console.log(`
╔════════════════════════════════════════════════════════════╗
║                                                            ║
║   🔧 AxleWorks Backend Server                              ║
║                                                            ║
║   Environment: ${config.nodeEnv.padEnd(40)}║
║   Port: ${config.port.toString().padEnd(47)}║
║   API: http://localhost:${config.port}/api${' '.repeat(29)}║
║   Health: http://localhost:${config.port}/health${' '.repeat(25)}║
║   WebSocket: ws://localhost:${config.port}/obd${' '.repeat(25)}║
║                                                            ║
╚════════════════════════════════════════════════════════════╝
      `);
    });
  } catch (error) {
    console.error('Failed to start server:', error);
    process.exit(1);
  }
};

startServer();
