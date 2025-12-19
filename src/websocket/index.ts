import { Server as HttpServer } from 'http';
import { Server, Socket } from 'socket.io';
import { config } from '../config';
import { obdHandler } from './handlers/obd.handler';

export const setupWebSocket = (httpServer: HttpServer): Server => {
  const io = new Server(httpServer, {
    cors: {
      origin: config.ws.corsOrigin.split(','),
      methods: ['GET', 'POST'],
      credentials: true,
    },
    pingTimeout: 60000,
    pingInterval: 25000,
  });

  // OBD namespace for vehicle telemetry
  const obdNamespace = io.of('/obd');

  obdNamespace.on('connection', (socket: Socket) => {
    console.log(`[OBD] Client connected: ${socket.id}`);

    obdHandler(obdNamespace, socket);

    socket.on('disconnect', (reason) => {
      console.log(`[OBD] Client disconnected: ${socket.id}, reason: ${reason}`);
    });

    socket.on('error', (error) => {
      console.error(`[OBD] Socket error for ${socket.id}:`, error);
    });
  });

  // Main namespace for general events
  io.on('connection', (socket: Socket) => {
    console.log(`[Main] Client connected: ${socket.id}`);

    // Handle authentication (can be expanded)
    socket.on('authenticate', (token: string) => {
      // TODO: Verify JWT token and attach user to socket
      console.log(`[Main] Authentication attempt from ${socket.id}`);
    });

    socket.on('disconnect', (reason) => {
      console.log(`[Main] Client disconnected: ${socket.id}, reason: ${reason}`);
    });
  });

  console.log('[WebSocket] Server initialized');

  return io;
};

export default setupWebSocket;
