import express from 'express';
import cors from 'cors';
import mongoose from 'mongoose';
import bcrypt from 'bcryptjs';
import { v4 as uuidv4 } from 'uuid';
import { createServer } from 'http';
import { WebSocketServer, WebSocket } from 'ws';

const app = express();
const PORT = process.env.PORT || 3000;
const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/axleworks';

// Create HTTP server for both Express and WebSocket
const server = createServer(app);

app.use(cors());
app.use(express.json());

// MongoDB Schemas
const userSchema = new mongoose.Schema({
  phone: { type: String, required: true },
  countryCode: { type: String, required: true },
  firstName: { type: String },
  lastName: { type: String },
  email: { type: String },
  profileComplete: { type: Boolean, default: false },
  createdAt: { type: Date, default: Date.now },
});
userSchema.index({ phone: 1, countryCode: 1 }, { unique: true });

const adminUserSchema = new mongoose.Schema({
  email: { type: String, required: true, unique: true },
  password: { type: String, required: true },
  firstName: { type: String, required: true },
  lastName: { type: String, required: true },
  role: { type: String, enum: ['admin', 'manager', 'technician'], default: 'admin' },
  createdAt: { type: Date, default: Date.now },
});

const sessionSchema = new mongoose.Schema({
  token: { type: String, required: true, unique: true },
  userId: { type: mongoose.Schema.Types.ObjectId, required: true },
  userType: { type: String, enum: ['user', 'admin'], required: true },
  expiresAt: { type: Date, required: true },
  createdAt: { type: Date, default: Date.now },
});

const refreshTokenSchema = new mongoose.Schema({
  token: { type: String, required: true, unique: true },
  userId: { type: mongoose.Schema.Types.ObjectId, required: true },
  expiresAt: { type: Date, required: true },
  createdAt: { type: Date, default: Date.now },
});

// Customer schema (linked to User for app users)
const customerSchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', unique: true, sparse: true },
  firstName: { type: String },
  lastName: { type: String },
  phone: { type: String, required: true },
  countryCode: { type: String },
  email: { type: String },
  address: {
    street: { type: String },
    city: { type: String },
    state: { type: String },
    postalCode: { type: String },
    country: { type: String },
  },
  notes: { type: String },
  tags: [{ type: String }],
  source: { type: String, enum: ['walk-in', 'app', 'referral', 'website'], default: 'app' },
  totalSpent: { type: Number, default: 0 },
  visitCount: { type: Number, default: 0 },
  lastVisit: { type: Date },
  isActive: { type: Boolean, default: true },
  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now },
});
customerSchema.index({ phone: 1 });
customerSchema.index({ firstName: 'text', lastName: 'text' });

// Vehicle schema (linked to Customer)
const vehicleSchema = new mongoose.Schema({
  customerId: { type: mongoose.Schema.Types.ObjectId, ref: 'Customer', required: true },
  make: { type: String, required: true },
  model: { type: String, required: true },
  year: { type: Number, required: true },
  vin: { type: String },
  licensePlate: { type: String },
  color: { type: String },
  mileage: { type: Number },
  engineType: { type: String },
  transmission: { type: String, enum: ['automatic', 'manual', 'cvt'], default: 'automatic' },
  fuelType: { type: String, enum: ['petrol', 'diesel', 'electric', 'hybrid'], default: 'petrol' },
  notes: { type: String },
  isActive: { type: Boolean, default: true },
  createdAt: { type: Date, default: Date.now },
});

// Service Record schema (maintenance data recorded during service visits)
const serviceRecordSchema = new mongoose.Schema({
  vehicleId: { type: mongoose.Schema.Types.ObjectId, ref: 'Vehicle', required: true },
  customerId: { type: mongoose.Schema.Types.ObjectId, ref: 'Customer', required: true },
  recordedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'AdminUser' },
  mileageAtService: { type: Number },
  serviceDate: { type: Date, default: Date.now },

  // Oil
  oil: {
    level: { type: String, enum: ['full', 'good', 'low', 'critical', 'not_checked'], default: 'not_checked' },
    condition: { type: String, enum: ['clean', 'good', 'dirty', 'very_dirty', 'not_checked'], default: 'not_checked' },
    changed: { type: Boolean, default: false },
    oilType: { type: String }, // e.g., "5W-30 Synthetic", "10W-40 Conventional"
    oilBrand: { type: String }, // e.g., "Mobil 1", "Castrol"
    changeIntervalMonths: { type: Number, default: 6 }, // Time interval in months
    nextChangeMileage: { type: Number },
  },

  // Brake Fluid
  brakeFluid: {
    level: { type: String, enum: ['full', 'good', 'low', 'critical', 'not_checked'], default: 'not_checked' },
    condition: { type: String, enum: ['clean', 'good', 'dirty', 'contaminated', 'not_checked'], default: 'not_checked' },
    changed: { type: Boolean, default: false },
  },

  // Transmission Fluid
  transmissionFluid: {
    level: { type: String, enum: ['full', 'good', 'low', 'critical', 'not_checked'], default: 'not_checked' },
    condition: { type: String, enum: ['clean', 'good', 'dirty', 'burnt', 'not_checked'], default: 'not_checked' },
    changed: { type: Boolean, default: false },
  },

  // Coolant
  coolant: {
    level: { type: String, enum: ['full', 'good', 'low', 'critical', 'not_checked'], default: 'not_checked' },
    condition: { type: String, enum: ['clean', 'good', 'dirty', 'contaminated', 'not_checked'], default: 'not_checked' },
    changed: { type: Boolean, default: false },
  },

  // Power Steering Fluid
  powerSteeringFluid: {
    level: { type: String, enum: ['full', 'good', 'low', 'critical', 'not_checked'], default: 'not_checked' },
    changed: { type: Boolean, default: false },
  },

  // Brake Pads
  brakePads: {
    frontLeft: { type: Number, min: 0, max: 100 }, // percentage remaining
    frontRight: { type: Number, min: 0, max: 100 },
    rearLeft: { type: Number, min: 0, max: 100 },
    rearRight: { type: Number, min: 0, max: 100 },
  },

  // Tires
  tires: {
    frontLeft: {
      treadDepth: { type: Number }, // mm
      pressure: { type: Number }, // PSI
      condition: { type: String, enum: ['good', 'fair', 'worn', 'replace', 'not_checked'], default: 'not_checked' },
    },
    frontRight: {
      treadDepth: { type: Number },
      pressure: { type: Number },
      condition: { type: String, enum: ['good', 'fair', 'worn', 'replace', 'not_checked'], default: 'not_checked' },
    },
    rearLeft: {
      treadDepth: { type: Number },
      pressure: { type: Number },
      condition: { type: String, enum: ['good', 'fair', 'worn', 'replace', 'not_checked'], default: 'not_checked' },
    },
    rearRight: {
      treadDepth: { type: Number },
      pressure: { type: Number },
      condition: { type: String, enum: ['good', 'fair', 'worn', 'replace', 'not_checked'], default: 'not_checked' },
    },
  },

  // Battery
  battery: {
    voltage: { type: Number },
    health: { type: String, enum: ['good', 'fair', 'weak', 'replace', 'not_checked'], default: 'not_checked' },
    replaced: { type: Boolean, default: false },
  },

  // Air Filter
  airFilter: {
    condition: { type: String, enum: ['clean', 'good', 'dirty', 'replace', 'not_checked'], default: 'not_checked' },
    replaced: { type: Boolean, default: false },
  },

  // Cabin Air Filter
  cabinAirFilter: {
    condition: { type: String, enum: ['clean', 'good', 'dirty', 'replace', 'not_checked'], default: 'not_checked' },
    replaced: { type: Boolean, default: false },
  },

  // Wipers
  wipers: {
    front: { type: String, enum: ['good', 'fair', 'streaking', 'replace', 'not_checked'], default: 'not_checked' },
    rear: { type: String, enum: ['good', 'fair', 'streaking', 'replace', 'not_checked', 'n/a'], default: 'not_checked' },
    replaced: { type: Boolean, default: false },
  },

  // Lights
  lights: {
    headlights: { type: String, enum: ['working', 'dim', 'out', 'not_checked'], default: 'not_checked' },
    taillights: { type: String, enum: ['working', 'out', 'not_checked'], default: 'not_checked' },
    brakeLights: { type: String, enum: ['working', 'out', 'not_checked'], default: 'not_checked' },
    turnSignals: { type: String, enum: ['working', 'out', 'not_checked'], default: 'not_checked' },
  },

  // Overall health score (calculated or manually set)
  overallHealth: { type: String, enum: ['excellent', 'good', 'fair', 'poor', 'critical'], default: 'good' },

  // Service notes
  notes: { type: String },
  recommendations: [{ type: String }],

  // Services performed
  servicesPerformed: [{ type: String }],

  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now },
});

// Service Entry schema (individual service records with type-specific data)
const serviceEntrySchema = new mongoose.Schema({
  vehicleId: { type: mongoose.Schema.Types.ObjectId, ref: 'Vehicle', required: true },
  customerId: { type: mongoose.Schema.Types.ObjectId, ref: 'Customer', required: true },
  recordedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'AdminUser' },
  serviceType: {
    type: String,
    enum: [
      'oil_change',
      'brake_service',
      'tire_service',
      'battery_service',
      'fluid_service',
      'filter_service',
      'wiper_service',
      'light_check',
      'general_inspection',
    ],
    required: true,
  },
  serviceDate: { type: Date, default: Date.now },
  mileageAtService: { type: Number },
  // Type-specific data stored as flexible object
  data: { type: mongoose.Schema.Types.Mixed },
  notes: { type: String },
  cost: { type: Number },
  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now },
});
serviceEntrySchema.index({ vehicleId: 1, serviceType: 1, serviceDate: -1 });

// OBD Data schema (real-time telemetry from vehicles)
const obdDataSchema = new mongoose.Schema({
  vehicleId: { type: mongoose.Schema.Types.ObjectId, ref: 'Vehicle', required: true },
  customerId: { type: mongoose.Schema.Types.ObjectId, ref: 'Customer', required: true },
  timestamp: { type: Date, default: Date.now },

  // Engine & Performance
  rpm: { type: Number },
  speed: { type: Number }, // km/h
  engineLoad: { type: Number }, // percentage
  throttlePosition: { type: Number }, // percentage

  // Temperatures
  coolantTemp: { type: Number }, // Celsius
  engineTemp: { type: Number }, // Celsius (alias for coolant)
  intakeTemp: { type: Number }, // Celsius
  ambientTemp: { type: Number }, // Celsius
  catalystTemp: { type: Number }, // Celsius

  // Fuel System
  fuelLevel: { type: Number }, // percentage
  fuelLevelInput: { type: Number }, // percentage
  fuelPressure: { type: Number }, // kPa
  shortTermFuelTrim: { type: Number }, // percentage
  longTermFuelTrim: { type: Number }, // percentage

  // Air & Pressure
  maf: { type: Number }, // g/s
  massAirFlow: { type: Number }, // g/s (alias)
  manifoldPressure: { type: Number }, // kPa
  barometricPressure: { type: Number }, // kPa
  boostPressure: { type: Number }, // bar

  // Timing & Engine
  timingAdvance: { type: Number }, // degrees
  engineRuntime: { type: Number }, // seconds

  // Electrical
  batteryVoltage: { type: Number }, // volts
  controlModuleVoltage: { type: Number }, // volts

  // Throttle & Pedal
  relativeThrottle: { type: Number }, // percentage
  absoluteThrottleB: { type: Number }, // percentage
  acceleratorPedalD: { type: Number }, // percentage
  acceleratorPedalE: { type: Number }, // percentage
  commandedThrottle: { type: Number }, // percentage

  // EGR
  commandedEGR: { type: Number }, // percentage
  egrError: { type: Number }, // percentage

  // Diagnostics
  milStatus: { type: Boolean }, // check engine light
  dtcCount: { type: Number },
  activeDTCs: [{ type: String }],

  // Distance/Maintenance
  distanceWithMIL: { type: Number }, // km
  distanceSinceDTCCleared: { type: Number }, // km
  warmupsSinceDTCCleared: { type: Number },

  // Advanced
  absoluteLoad: { type: Number }, // percentage
  commandedAirFuelRatio: { type: Number },

  // Connection info
  connectionType: { type: String, enum: ['bluetooth', 'wifi', 'ble'], default: 'bluetooth' },
  adapterType: { type: String },
});
obdDataSchema.index({ vehicleId: 1, timestamp: -1 });
// Note: We use count-based limit (10,000 per vehicle) instead of TTL

// OBD Session schema (tracks active streaming sessions)
const obdSessionSchema = new mongoose.Schema({
  vehicleId: { type: mongoose.Schema.Types.ObjectId, ref: 'Vehicle', required: true },
  customerId: { type: mongoose.Schema.Types.ObjectId, ref: 'Customer', required: true },
  startedAt: { type: Date, default: Date.now },
  endedAt: { type: Date },
  isActive: { type: Boolean, default: true },
  lastDataAt: { type: Date },
  dataPointCount: { type: Number, default: 0 },
  connectionType: { type: String },
});
obdSessionSchema.index({ vehicleId: 1, isActive: 1 });

const User = mongoose.model('User', userSchema);
const AdminUser = mongoose.model('AdminUser', adminUserSchema);
const Session = mongoose.model('Session', sessionSchema);
const RefreshToken = mongoose.model('RefreshToken', refreshTokenSchema);
const Customer = mongoose.model('Customer', customerSchema);
const Vehicle = mongoose.model('Vehicle', vehicleSchema);
const ServiceRecord = mongoose.model('ServiceRecord', serviceRecordSchema);
const ServiceEntry = mongoose.model('ServiceEntry', serviceEntrySchema);
const OBDData = mongoose.model('OBDData', obdDataSchema);
const OBDSession = mongoose.model('OBDSession', obdSessionSchema);

// ============================================================================
// WebSocket Server Setup
// ============================================================================

const wss = new WebSocketServer({ server, path: '/ws' });

// Track connected clients
interface WSClient {
  ws: WebSocket;
  type: 'mobile' | 'admin';
  userId?: string;
  vehicleId?: string;
  sessionId?: string;
  subscribedVehicles: Set<string>;
  isAlive: boolean;
}

const clients = new Map<WebSocket, WSClient>();

// Store latest OBD data per vehicle (in-memory for real-time broadcasting)
const latestOBDData = new Map<string, any>();

// Heartbeat interval to detect dead connections
const heartbeatInterval = setInterval(() => {
  clients.forEach((client, ws) => {
    if (!client.isAlive) {
      console.log('[WS] Terminating dead connection');
      clients.delete(ws);
      return ws.terminate();
    }
    client.isAlive = false;
    ws.ping();
  });
}, 30000);

wss.on('close', () => {
  clearInterval(heartbeatInterval);
});

wss.on('connection', (ws: WebSocket, req) => {
  console.log('[WS] New connection from:', req.socket.remoteAddress);

  const client: WSClient = {
    ws,
    type: 'mobile',
    subscribedVehicles: new Set(),
    isAlive: true,
  };
  clients.set(ws, client);

  ws.on('pong', () => {
    const c = clients.get(ws);
    if (c) c.isAlive = true;
  });

  ws.on('message', async (message) => {
    try {
      const data = JSON.parse(message.toString());
      await handleWebSocketMessage(ws, client, data);
    } catch (error) {
      console.error('[WS] Error handling message:', error);
      ws.send(JSON.stringify({ type: 'error', message: 'Invalid message format' }));
    }
  });

  ws.on('close', async () => {
    console.log('[WS] Connection closed');
    const c = clients.get(ws);
    if (c?.sessionId) {
      // End OBD session
      await OBDSession.findByIdAndUpdate(c.sessionId, {
        endedAt: new Date(),
        isActive: false,
      });
    }
    clients.delete(ws);
  });

  ws.on('error', (error) => {
    console.error('[WS] WebSocket error:', error);
  });

  // Send welcome message
  ws.send(JSON.stringify({ type: 'connected', message: 'Connected to AxleWorks WebSocket' }));
});

// Handle incoming WebSocket messages
async function handleWebSocketMessage(ws: WebSocket, client: WSClient, data: any) {
  const { type, token, vehicleId, payload } = data;

  switch (type) {
    case 'auth': {
      // Authenticate the connection
      const session = await Session.findOne({ token });
      if (!session || new Date(session.expiresAt) < new Date()) {
        ws.send(JSON.stringify({ type: 'auth_error', message: 'Invalid or expired token' }));
        return;
      }

      client.userId = session.userId.toString();
      // Map 'user' to 'mobile' for session types (mobile app uses 'user', admin uses 'admin')
      client.type = session.userType === 'user' ? 'mobile' : 'admin';

      ws.send(JSON.stringify({
        type: 'auth_success',
        userType: client.type,
        userId: client.userId,
      }));
      console.log(`[WS] Authenticated ${client.type} user: ${client.userId}`);
      break;
    }

    case 'start_obd_stream': {
      // Mobile app starting OBD data stream for a vehicle
      if (!client.userId || client.type !== 'mobile') {
        ws.send(JSON.stringify({ type: 'error', message: 'Not authenticated as mobile user' }));
        return;
      }

      if (!vehicleId) {
        ws.send(JSON.stringify({ type: 'error', message: 'vehicleId required' }));
        return;
      }

      // Verify vehicle belongs to user
      const customer = await Customer.findOne({ userId: client.userId });
      if (!customer) {
        ws.send(JSON.stringify({ type: 'error', message: 'Customer not found' }));
        return;
      }

      const vehicle = await Vehicle.findOne({ _id: vehicleId, customerId: customer._id, isActive: true });
      if (!vehicle) {
        ws.send(JSON.stringify({ type: 'error', message: 'Vehicle not found or not owned' }));
        return;
      }

      // Create OBD session
      const obdSession = await OBDSession.create({
        vehicleId,
        customerId: customer._id,
        connectionType: payload?.connectionType || 'bluetooth',
      });

      client.vehicleId = vehicleId;
      client.sessionId = obdSession._id.toString();

      ws.send(JSON.stringify({
        type: 'stream_started',
        sessionId: client.sessionId,
        vehicleId,
      }));
      console.log(`[WS] OBD stream started for vehicle: ${vehicleId}`);

      // Notify admin subscribers
      broadcastToAdminSubscribers(vehicleId, {
        type: 'vehicle_streaming',
        vehicleId,
        vehicle: {
          make: vehicle.make,
          model: vehicle.model,
          year: vehicle.year,
        },
      });
      break;
    }

    case 'obd_data': {
      // Mobile app sending OBD data
      if (!client.vehicleId || !client.sessionId) {
        ws.send(JSON.stringify({ type: 'error', message: 'No active OBD stream' }));
        return;
      }

      const obdPayload = payload;
      if (!obdPayload) {
        ws.send(JSON.stringify({ type: 'error', message: 'No OBD data in payload' }));
        return;
      }

      // Get customer ID from session
      const obdSession = await OBDSession.findById(client.sessionId);
      if (!obdSession) {
        ws.send(JSON.stringify({ type: 'error', message: 'Session not found' }));
        return;
      }

      // Store OBD data (sample every 1 second for storage, but broadcast all)
      const now = new Date();
      const lastStored = latestOBDData.get(client.vehicleId)?.storedAt;
      const shouldStore = !lastStored || (now.getTime() - lastStored.getTime()) >= 1000;

      if (shouldStore) {
        await OBDData.create({
          vehicleId: client.vehicleId,
          customerId: obdSession.customerId,
          timestamp: now,
          ...obdPayload,
        });

        // Update session stats
        await OBDSession.findByIdAndUpdate(client.sessionId, {
          lastDataAt: now,
          $inc: { dataPointCount: 1 },
        });

        // Maintain 10,000 record limit per vehicle - delete oldest if exceeded
        // Run cleanup periodically (every 100 records stored)
        const dataCount = latestOBDData.get(client.vehicleId)?.storedCount || 0;
        if (dataCount % 100 === 0) {
          const count = await OBDData.countDocuments({ vehicleId: client.vehicleId });
          if (count > 10000) {
            // Find oldest records to delete
            const toDelete = count - 10000;
            const oldestRecords = await OBDData.find({ vehicleId: client.vehicleId })
              .sort({ timestamp: 1 })
              .limit(toDelete)
              .select('_id');
            const idsToDelete = oldestRecords.map(r => r._id);
            await OBDData.deleteMany({ _id: { $in: idsToDelete } });
            console.log(`[OBD] Cleaned up ${toDelete} old records for vehicle ${client.vehicleId}`);
          }
        }
      }

      // Store in memory for real-time access
      const prevStoredCount = latestOBDData.get(client.vehicleId)?.storedCount || 0;
      latestOBDData.set(client.vehicleId, {
        ...obdPayload,
        timestamp: now,
        storedAt: shouldStore ? now : lastStored,
        storedCount: shouldStore ? prevStoredCount + 1 : prevStoredCount,
      });

      // Broadcast to admin subscribers
      broadcastToAdminSubscribers(client.vehicleId, {
        type: 'obd_update',
        vehicleId: client.vehicleId,
        data: obdPayload,
        timestamp: now.toISOString(),
      });
      break;
    }

    case 'stop_obd_stream': {
      // Mobile app stopping OBD stream
      if (client.sessionId) {
        await OBDSession.findByIdAndUpdate(client.sessionId, {
          endedAt: new Date(),
          isActive: false,
        });

        // Notify admin subscribers
        if (client.vehicleId) {
          broadcastToAdminSubscribers(client.vehicleId, {
            type: 'vehicle_stream_ended',
            vehicleId: client.vehicleId,
          });
          latestOBDData.delete(client.vehicleId);
        }

        client.sessionId = undefined;
        client.vehicleId = undefined;

        ws.send(JSON.stringify({ type: 'stream_stopped' }));
        console.log('[WS] OBD stream stopped');
      }
      break;
    }

    case 'subscribe_vehicle': {
      // Admin subscribing to vehicle updates
      if (!client.userId || client.type !== 'admin') {
        ws.send(JSON.stringify({ type: 'error', message: 'Not authenticated as admin' }));
        return;
      }

      if (!vehicleId) {
        ws.send(JSON.stringify({ type: 'error', message: 'vehicleId required' }));
        return;
      }

      client.subscribedVehicles.add(vehicleId);

      // Send current data if available
      const currentData = latestOBDData.get(vehicleId);
      if (currentData) {
        ws.send(JSON.stringify({
          type: 'obd_update',
          vehicleId,
          data: currentData,
          timestamp: currentData.timestamp,
        }));
      }

      // Check if vehicle is currently streaming
      const activeSession = await OBDSession.findOne({ vehicleId, isActive: true });
      ws.send(JSON.stringify({
        type: 'subscribed',
        vehicleId,
        isStreaming: !!activeSession,
      }));
      console.log(`[WS] Admin subscribed to vehicle: ${vehicleId}`);
      break;
    }

    case 'unsubscribe_vehicle': {
      // Admin unsubscribing from vehicle
      if (vehicleId) {
        client.subscribedVehicles.delete(vehicleId);
        ws.send(JSON.stringify({ type: 'unsubscribed', vehicleId }));
      }
      break;
    }

    case 'subscribe_all_vehicles': {
      // Admin subscribing to all vehicle updates
      if (!client.userId || client.type !== 'admin') {
        ws.send(JSON.stringify({ type: 'error', message: 'Not authenticated as admin' }));
        return;
      }

      // Get all active streaming sessions
      const activeSessions = await OBDSession.find({ isActive: true }).populate('vehicleId', 'make model year licensePlate');

      for (const session of activeSessions) {
        const vid = session.vehicleId._id.toString();
        client.subscribedVehicles.add(vid);

        const currentData = latestOBDData.get(vid);
        if (currentData) {
          ws.send(JSON.stringify({
            type: 'obd_update',
            vehicleId: vid,
            vehicle: session.vehicleId,
            data: currentData,
            timestamp: currentData.timestamp,
          }));
        }
      }

      ws.send(JSON.stringify({
        type: 'subscribed_all',
        activeStreams: activeSessions.length,
      }));
      break;
    }

    case 'ping': {
      ws.send(JSON.stringify({ type: 'pong', timestamp: Date.now() }));
      break;
    }

    default:
      ws.send(JSON.stringify({ type: 'error', message: `Unknown message type: ${type}` }));
  }
}

// Broadcast to admin clients subscribed to a vehicle
function broadcastToAdminSubscribers(vehicleId: string, message: object) {
  const messageStr = JSON.stringify(message);
  clients.forEach((client) => {
    if (client.type === 'admin' && client.subscribedVehicles.has(vehicleId)) {
      if (client.ws.readyState === WebSocket.OPEN) {
        client.ws.send(messageStr);
      }
    }
  });
}

// In-memory OTP storage (short-lived, no need for DB)
const otpStore: Map<string, { otp: string; expiresAt: number; phone: string; countryCode: string }> = new Map();

// Generate 6-digit OTP
function generateOTP(): string {
  return Math.floor(100000 + Math.random() * 900000).toString();
}

// Seed admin user if not exists
async function seedAdmin() {
  try {
    const existingAdmin = await AdminUser.findOne({ email: 'admin@axleworks.com' });

    if (!existingAdmin) {
      const hashedPassword = await bcrypt.hash('admin123', 10);
      await AdminUser.create({
        email: 'admin@axleworks.com',
        password: hashedPassword,
        firstName: 'Admin',
        lastName: 'User',
        role: 'admin',
      });
      console.log('✅ Default admin user created: admin@axleworks.com / admin123');
    } else {
      console.log('✅ Admin user already exists');
    }
  } catch (error) {
    console.error('Error seeding admin:', error);
  }
}

// Health check
app.get('/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// ============================================================================
// Mobile App Authentication (Phone OTP)
// ============================================================================

// Send OTP
app.post('/auth/send-otp', (req, res) => {
  const { phone, countryCode } = req.body;

  if (!phone || !countryCode) {
    return res.status(400).json({ error: 'Phone number and country code are required' });
  }

  const otp = generateOTP();
  const key = `${countryCode}${phone}`;

  // Store OTP with 5-minute expiry
  otpStore.set(key, {
    otp,
    expiresAt: Date.now() + 5 * 60 * 1000,
    phone,
    countryCode,
  });

  // In production, send OTP via SMS service (Twilio, etc.)
  console.log(`[DEV] OTP for ${countryCode}${phone}: ${otp}`);

  res.json({
    success: true,
    message: 'OTP sent successfully',
    // Only in dev mode - remove in production
    devOtp: process.env.NODE_ENV !== 'production' ? otp : undefined,
  });
});

// Verify OTP
app.post('/auth/verify-otp', async (req, res) => {
  const { phone, countryCode, otp } = req.body;

  if (!phone || !countryCode || !otp) {
    return res.status(400).json({ error: 'Phone, country code, and OTP are required' });
  }

  const key = `${countryCode}${phone}`;
  const stored = otpStore.get(key);

  if (!stored) {
    return res.status(400).json({ error: 'OTP not found. Please request a new one.' });
  }

  if (Date.now() > stored.expiresAt) {
    otpStore.delete(key);
    return res.status(400).json({ error: 'OTP has expired. Please request a new one.' });
  }

  if (stored.otp !== otp) {
    return res.status(400).json({ error: 'Invalid OTP' });
  }

  // OTP verified - clean up
  otpStore.delete(key);

  try {
    // Find or create user
    let user = await User.findOne({ phone, countryCode });
    let isNewUser = false;

    if (!user) {
      user = await User.create({ phone, countryCode });
      isNewUser = true;

      // Create associated customer for new user (app user)
      await Customer.create({
        userId: user._id,
        phone,
        countryCode,
        source: 'app',
      });
    }

    // Create session
    const sessionToken = uuidv4();
    const sessionExpiry = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000); // 30 days

    await Session.create({
      token: sessionToken,
      userId: user._id,
      userType: 'user',
      expiresAt: sessionExpiry,
    });

    res.json({
      success: true,
      token: sessionToken,
      user: {
        id: user._id,
        phone: user.phone,
        countryCode: user.countryCode,
        firstName: user.firstName,
        lastName: user.lastName,
        email: user.email,
        profileComplete: user.profileComplete || false,
      },
    });
  } catch (error: any) {
    console.error('Error verifying OTP:', error);
    res.status(500).json({
      error: 'Internal server error',
      details: process.env.NODE_ENV !== 'production' ? error.message : undefined
    });
  }
});

// Validate session
app.get('/auth/me', async (req, res) => {
  const authHeader = req.headers.authorization;

  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'No token provided' });
  }

  const token = authHeader.substring(7);

  try {
    const session = await Session.findOne({ token, userType: 'user' });

    if (!session) {
      return res.status(401).json({ error: 'Invalid session' });
    }

    if (new Date(session.expiresAt) < new Date()) {
      await Session.deleteOne({ token });
      return res.status(401).json({ error: 'Session expired' });
    }

    const user = await User.findById(session.userId);

    if (!user) {
      return res.status(401).json({ error: 'User not found' });
    }

    res.json({
      user: {
        id: user._id,
        phone: user.phone,
        countryCode: user.countryCode,
        firstName: user.firstName,
        lastName: user.lastName,
        email: user.email,
        profileComplete: user.profileComplete || false,
      },
    });
  } catch (error) {
    console.error('Error validating session:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Logout
app.post('/auth/logout', async (req, res) => {
  const authHeader = req.headers.authorization;

  if (authHeader && authHeader.startsWith('Bearer ')) {
    const token = authHeader.substring(7);
    await Session.deleteOne({ token });
  }

  res.json({ success: true });
});

// Update user profile
app.put('/auth/profile', async (req, res) => {
  const authHeader = req.headers.authorization;

  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'No token provided' });
  }

  const token = authHeader.substring(7);

  try {
    const session = await Session.findOne({ token, userType: 'user' });

    if (!session) {
      return res.status(401).json({ error: 'Invalid session' });
    }

    if (new Date(session.expiresAt) < new Date()) {
      await Session.deleteOne({ token });
      return res.status(401).json({ error: 'Session expired' });
    }

    const { firstName, lastName, email, skipProfile } = req.body;

    const updateData: any = { profileComplete: true };
    if (!skipProfile) {
      if (firstName) updateData.firstName = firstName;
      if (lastName) updateData.lastName = lastName;
      if (email) updateData.email = email;
    }

    const user = await User.findByIdAndUpdate(
      session.userId,
      updateData,
      { new: true }
    );

    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    // Also update customer data
    if (!skipProfile) {
      await Customer.findOneAndUpdate(
        { userId: session.userId },
        {
          firstName: user.firstName,
          lastName: user.lastName,
          email: user.email,
        }
      );
    }

    res.json({
      success: true,
      user: {
        id: user._id,
        phone: user.phone,
        countryCode: user.countryCode,
        firstName: user.firstName,
        lastName: user.lastName,
        email: user.email,
        profileComplete: user.profileComplete,
      },
    });
  } catch (error) {
    console.error('Error updating profile:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// ============================================================================
// Mobile App - Vehicle Management
// ============================================================================

// Helper: Get authenticated user and their customer
async function getAuthenticatedUserAndCustomer(req: express.Request, res: express.Response) {
  const authHeader = req.headers.authorization;

  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    res.status(401).json({ error: 'No token provided' });
    return null;
  }

  const token = authHeader.substring(7);

  const session = await Session.findOne({ token, userType: 'user' });

  if (!session) {
    res.status(401).json({ error: 'Invalid session' });
    return null;
  }

  if (new Date(session.expiresAt) < new Date()) {
    await Session.deleteOne({ token });
    res.status(401).json({ error: 'Session expired' });
    return null;
  }

  const user = await User.findById(session.userId);
  if (!user) {
    res.status(401).json({ error: 'User not found' });
    return null;
  }

  let customer = await Customer.findOne({ userId: user._id });

  // Auto-create customer for existing users who don't have one
  if (!customer) {
    customer = await Customer.create({
      userId: user._id,
      phone: user.phone,
      countryCode: user.countryCode,
      firstName: user.firstName,
      lastName: user.lastName,
      email: user.email,
      source: 'app',
    });
  }

  return { user, customer };
}

// Get all vehicles for authenticated user
app.get('/auth/vehicles', async (req, res) => {
  try {
    const auth = await getAuthenticatedUserAndCustomer(req, res);
    if (!auth) return;

    const vehicles = await Vehicle.find({ customerId: auth.customer._id, isActive: true })
      .sort({ createdAt: -1 });

    res.json({
      success: true,
      vehicles: vehicles.map(v => ({
        id: v._id,
        make: v.make,
        model: v.model,
        year: v.year,
        vin: v.vin,
        licensePlate: v.licensePlate,
        color: v.color,
        mileage: v.mileage,
        engineType: v.engineType,
        transmission: v.transmission,
        fuelType: v.fuelType,
        notes: v.notes,
        createdAt: v.createdAt,
      })),
    });
  } catch (error) {
    console.error('Error fetching vehicles:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Add a new vehicle
app.post('/auth/vehicles', async (req, res) => {
  try {
    const auth = await getAuthenticatedUserAndCustomer(req, res);
    if (!auth) return;

    const { make, model, year, vin, licensePlate, color, mileage, engineType, transmission, fuelType, notes } = req.body;

    if (!make || !model || !year) {
      return res.status(400).json({ error: 'Make, model, and year are required' });
    }

    const vehicle = await Vehicle.create({
      customerId: auth.customer._id,
      make,
      model,
      year: parseInt(year),
      vin,
      licensePlate,
      color,
      mileage: mileage ? parseInt(mileage) : undefined,
      engineType,
      transmission: transmission || 'automatic',
      fuelType: fuelType || 'petrol',
      notes,
    });

    res.json({
      success: true,
      vehicle: {
        id: vehicle._id,
        make: vehicle.make,
        model: vehicle.model,
        year: vehicle.year,
        vin: vehicle.vin,
        licensePlate: vehicle.licensePlate,
        color: vehicle.color,
        mileage: vehicle.mileage,
        engineType: vehicle.engineType,
        transmission: vehicle.transmission,
        fuelType: vehicle.fuelType,
        notes: vehicle.notes,
        createdAt: vehicle.createdAt,
      },
    });
  } catch (error) {
    console.error('Error creating vehicle:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Update a vehicle
app.put('/auth/vehicles/:id', async (req, res) => {
  try {
    const auth = await getAuthenticatedUserAndCustomer(req, res);
    if (!auth) return;

    const { id } = req.params;
    const { make, model, year, vin, licensePlate, color, mileage, engineType, transmission, fuelType, notes } = req.body;

    // Verify vehicle belongs to this customer
    const vehicle = await Vehicle.findOne({ _id: id, customerId: auth.customer._id, isActive: true });
    if (!vehicle) {
      return res.status(404).json({ error: 'Vehicle not found' });
    }

    // Update fields
    if (make) vehicle.make = make;
    if (model) vehicle.model = model;
    if (year) vehicle.year = parseInt(year);
    if (vin !== undefined) vehicle.vin = vin;
    if (licensePlate !== undefined) vehicle.licensePlate = licensePlate;
    if (color !== undefined) vehicle.color = color;
    if (mileage !== undefined) vehicle.mileage = parseInt(mileage);
    if (engineType !== undefined) vehicle.engineType = engineType;
    if (transmission) vehicle.transmission = transmission;
    if (fuelType) vehicle.fuelType = fuelType;
    if (notes !== undefined) vehicle.notes = notes;

    await vehicle.save();

    res.json({
      success: true,
      vehicle: {
        id: vehicle._id,
        make: vehicle.make,
        model: vehicle.model,
        year: vehicle.year,
        vin: vehicle.vin,
        licensePlate: vehicle.licensePlate,
        color: vehicle.color,
        mileage: vehicle.mileage,
        engineType: vehicle.engineType,
        transmission: vehicle.transmission,
        fuelType: vehicle.fuelType,
        notes: vehicle.notes,
        createdAt: vehicle.createdAt,
      },
    });
  } catch (error) {
    console.error('Error updating vehicle:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Delete a vehicle (soft delete)
app.delete('/auth/vehicles/:id', async (req, res) => {
  try {
    const auth = await getAuthenticatedUserAndCustomer(req, res);
    if (!auth) return;

    const { id } = req.params;

    // Verify vehicle belongs to this customer
    const vehicle = await Vehicle.findOne({ _id: id, customerId: auth.customer._id, isActive: true });
    if (!vehicle) {
      return res.status(404).json({ error: 'Vehicle not found' });
    }

    // Soft delete
    vehicle.isActive = false;
    await vehicle.save();

    res.json({ success: true });
  } catch (error) {
    console.error('Error deleting vehicle:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Get a single vehicle by ID
app.get('/auth/vehicles/:id', async (req, res) => {
  try {
    const auth = await getAuthenticatedUserAndCustomer(req, res);
    if (!auth) return;

    const { id } = req.params;

    const vehicle = await Vehicle.findOne({ _id: id, customerId: auth.customer._id, isActive: true });
    if (!vehicle) {
      return res.status(404).json({ error: 'Vehicle not found' });
    }

    res.json({
      success: true,
      vehicle: {
        id: vehicle._id,
        make: vehicle.make,
        model: vehicle.model,
        year: vehicle.year,
        vin: vehicle.vin,
        licensePlate: vehicle.licensePlate,
        color: vehicle.color,
        mileage: vehicle.mileage,
        engineType: vehicle.engineType,
        transmission: vehicle.transmission,
        fuelType: vehicle.fuelType,
        notes: vehicle.notes,
        createdAt: vehicle.createdAt,
      },
    });
  } catch (error) {
    console.error('Error fetching vehicle:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// ============================================================================
// Admin Authentication (Email/Password) - for Admin Panel
// ============================================================================

// Admin Login
app.post('/api/v1/auth/login', async (req, res) => {
  const { email, password } = req.body;

  if (!email || !password) {
    return res.status(400).json({
      success: false,
      error: 'Email and password are required'
    });
  }

  try {
    // Find admin user by email
    const admin = await AdminUser.findOne({ email });

    if (!admin) {
      return res.status(401).json({
        success: false,
        error: 'Invalid email or password'
      });
    }

    // Compare password
    const isMatch = await bcrypt.compare(password, admin.password);
    if (!isMatch) {
      return res.status(401).json({
        success: false,
        error: 'Invalid email or password'
      });
    }

    // Create access token (1 hour)
    const accessToken = uuidv4();
    const accessExpiry = new Date(Date.now() + 60 * 60 * 1000);

    await Session.create({
      token: accessToken,
      userId: admin._id,
      userType: 'admin',
      expiresAt: accessExpiry,
    });

    // Create refresh token (7 days)
    const refreshToken = uuidv4();
    const refreshExpiry = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);

    await RefreshToken.create({
      token: refreshToken,
      userId: admin._id,
      expiresAt: refreshExpiry,
    });

    res.json({
      success: true,
      message: 'Login successful',
      data: {
        accessToken,
        refreshToken,
        user: {
          id: admin._id,
          email: admin.email,
          firstName: admin.firstName,
          lastName: admin.lastName,
          role: admin.role,
        },
      },
    });
  } catch (error) {
    console.error('Error during admin login:', error);
    res.status(500).json({
      success: false,
      error: 'Internal server error'
    });
  }
});

// Admin Refresh Token
app.post('/api/v1/auth/refresh', async (req, res) => {
  const { refreshToken } = req.body;

  if (!refreshToken) {
    return res.status(400).json({
      success: false,
      error: 'Refresh token is required'
    });
  }

  try {
    const stored = await RefreshToken.findOne({ token: refreshToken });

    if (!stored) {
      return res.status(401).json({
        success: false,
        error: 'Invalid refresh token'
      });
    }

    if (new Date(stored.expiresAt) < new Date()) {
      await RefreshToken.deleteOne({ token: refreshToken });
      return res.status(401).json({
        success: false,
        error: 'Refresh token expired'
      });
    }

    const admin = await AdminUser.findById(stored.userId);
    if (!admin) {
      return res.status(401).json({
        success: false,
        error: 'User not found'
      });
    }

    // Create new access token
    const accessToken = uuidv4();
    const accessExpiry = new Date(Date.now() + 60 * 60 * 1000);

    await Session.create({
      token: accessToken,
      userId: admin._id,
      userType: 'admin',
      expiresAt: accessExpiry,
    });

    res.json({
      success: true,
      data: {
        accessToken,
      },
    });
  } catch (error) {
    console.error('Error refreshing token:', error);
    res.status(500).json({
      success: false,
      error: 'Internal server error'
    });
  }
});

// Admin Get Profile
app.get('/api/v1/auth/profile', async (req, res) => {
  const authHeader = req.headers.authorization;

  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({
      success: false,
      error: 'No token provided'
    });
  }

  const token = authHeader.substring(7);

  try {
    const session = await Session.findOne({ token, userType: 'admin' });

    if (!session) {
      return res.status(401).json({
        success: false,
        error: 'Invalid session'
      });
    }

    if (new Date(session.expiresAt) < new Date()) {
      await Session.deleteOne({ token });
      return res.status(401).json({
        success: false,
        error: 'Session expired'
      });
    }

    const admin = await AdminUser.findById(session.userId);

    if (!admin) {
      return res.status(401).json({
        success: false,
        error: 'User not found'
      });
    }

    res.json({
      success: true,
      data: {
        id: admin._id,
        email: admin.email,
        firstName: admin.firstName,
        lastName: admin.lastName,
        role: admin.role,
      },
    });
  } catch (error) {
    console.error('Error getting profile:', error);
    res.status(500).json({
      success: false,
      error: 'Internal server error'
    });
  }
});

// Admin Logout
app.post('/api/v1/auth/logout', async (req, res) => {
  const authHeader = req.headers.authorization;

  if (authHeader && authHeader.startsWith('Bearer ')) {
    const token = authHeader.substring(7);
    await Session.deleteOne({ token });
  }

  res.json({ success: true });
});

// ============================================================================
// Admin API - App Users Management
// ============================================================================

// Middleware to verify admin session
async function requireAdmin(req: express.Request, res: express.Response, next: express.NextFunction) {
  const authHeader = req.headers.authorization;

  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ success: false, error: 'No token provided' });
  }

  const token = authHeader.substring(7);

  try {
    const session = await Session.findOne({ token, userType: 'admin' });

    if (!session) {
      return res.status(401).json({ success: false, error: 'Invalid session' });
    }

    if (new Date(session.expiresAt) < new Date()) {
      await Session.deleteOne({ token });
      return res.status(401).json({ success: false, error: 'Session expired' });
    }

    // Fetch and attach admin user to request
    const admin = await AdminUser.findById(session.userId);
    if (admin) {
      (req as any).admin = admin;
    }

    next();
  } catch (error) {
    res.status(500).json({ success: false, error: 'Internal server error' });
  }
}

// Get all app users (mobile app users)
app.get('/api/v1/users', requireAdmin, async (req, res) => {
  try {
    const page = parseInt(req.query.page as string) || 1;
    const limit = parseInt(req.query.limit as string) || 10;
    const search = req.query.search as string;

    const query: any = {};
    if (search) {
      query.phone = { $regex: search, $options: 'i' };
    }

    const total = await User.countDocuments(query);
    const users = await User.find(query)
      .sort({ createdAt: -1 })
      .skip((page - 1) * limit)
      .limit(limit);

    res.json({
      success: true,
      data: users,
      pagination: {
        page,
        limit,
        total,
        pages: Math.ceil(total / limit),
      },
    });
  } catch (error) {
    console.error('Error fetching users:', error);
    res.status(500).json({ success: false, error: 'Internal server error' });
  }
});

// Get user count for dashboard
app.get('/api/v1/users/count', requireAdmin, async (req, res) => {
  try {
    const total = await User.countDocuments();
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const newToday = await User.countDocuments({ createdAt: { $gte: today } });

    res.json({
      success: true,
      data: { total, newToday },
    });
  } catch (error) {
    console.error('Error fetching user count:', error);
    res.status(500).json({ success: false, error: 'Internal server error' });
  }
});

// ============================================================================
// Admin API - Vehicles Management
// ============================================================================

// Get all vehicles (for admin panel)
app.get('/api/v1/vehicles', requireAdmin, async (req, res) => {
  try {
    const page = parseInt(req.query.page as string) || 1;
    const limit = parseInt(req.query.limit as string) || 10;
    const search = req.query.search as string;

    const query: any = { isActive: true };
    if (search) {
      query.$or = [
        { make: { $regex: search, $options: 'i' } },
        { model: { $regex: search, $options: 'i' } },
        { licensePlate: { $regex: search, $options: 'i' } },
        { vin: { $regex: search, $options: 'i' } },
      ];
    }

    const total = await Vehicle.countDocuments(query);
    const vehicles = await Vehicle.find(query)
      .populate('customerId', 'firstName lastName phone')
      .sort({ createdAt: -1 })
      .skip((page - 1) * limit)
      .limit(limit);

    res.json({
      success: true,
      data: vehicles.map(v => ({
        _id: v._id,
        make: v.make,
        model: v.model,
        year: v.year,
        vin: v.vin,
        licensePlate: v.licensePlate,
        color: v.color,
        mileage: v.mileage,
        fuelType: v.fuelType,
        transmission: v.transmission,
        healthStatus: 'good',
        vehicleType: v.fuelType === 'electric' ? 'Electric' : v.fuelType === 'hybrid' ? 'Hybrid' : 'Standard',
        customer: v.customerId,
        createdAt: v.createdAt,
      })),
      pagination: {
        page,
        limit,
        total,
        pages: Math.ceil(total / limit),
      },
    });
  } catch (error) {
    console.error('Error fetching vehicles:', error);
    res.status(500).json({ success: false, error: 'Internal server error' });
  }
});

// Get vehicle count for dashboard
app.get('/api/v1/vehicles/count', requireAdmin, async (req, res) => {
  try {
    const total = await Vehicle.countDocuments({ isActive: true });

    res.json({
      success: true,
      data: { total },
    });
  } catch (error) {
    console.error('Error fetching vehicle count:', error);
    res.status(500).json({ success: false, error: 'Internal server error' });
  }
});

// Delete a vehicle (admin)
app.delete('/api/v1/vehicles/:id', requireAdmin, async (req, res) => {
  try {
    const { id } = req.params;

    const vehicle = await Vehicle.findById(id);
    if (!vehicle) {
      return res.status(404).json({ success: false, error: 'Vehicle not found' });
    }

    // Soft delete
    vehicle.isActive = false;
    await vehicle.save();

    res.json({ success: true });
  } catch (error) {
    console.error('Error deleting vehicle:', error);
    res.status(500).json({ success: false, error: 'Internal server error' });
  }
});

// ============================================================================
// Admin API - Service Records Management
// ============================================================================

// Create a service record
app.post('/api/v1/service-records', requireAdmin, async (req, res) => {
  try {
    const { vehicleId, ...recordData } = req.body;

    if (!vehicleId) {
      return res.status(400).json({ success: false, error: 'Vehicle ID is required' });
    }

    const vehicle = await Vehicle.findById(vehicleId);
    if (!vehicle) {
      return res.status(404).json({ success: false, error: 'Vehicle not found' });
    }

    const serviceRecord = await ServiceRecord.create({
      vehicleId,
      customerId: vehicle.customerId,
      ...recordData,
    });

    // Update vehicle mileage if provided
    if (recordData.mileageAtService && recordData.mileageAtService > (vehicle.mileage || 0)) {
      vehicle.mileage = recordData.mileageAtService;
      await vehicle.save();
    }

    res.json({
      success: true,
      data: serviceRecord,
    });
  } catch (error) {
    console.error('Error creating service record:', error);
    res.status(500).json({ success: false, error: 'Internal server error' });
  }
});

// Get all service records (with pagination)
app.get('/api/v1/service-records', requireAdmin, async (req, res) => {
  try {
    const page = parseInt(req.query.page as string) || 1;
    const limit = parseInt(req.query.limit as string) || 10;
    const vehicleId = req.query.vehicleId as string;

    const query: any = {};
    if (vehicleId) {
      query.vehicleId = vehicleId;
    }

    const total = await ServiceRecord.countDocuments(query);
    const records = await ServiceRecord.find(query)
      .populate('vehicleId', 'make model year licensePlate')
      .populate('customerId', 'firstName lastName phone')
      .sort({ serviceDate: -1 })
      .skip((page - 1) * limit)
      .limit(limit);

    res.json({
      success: true,
      data: records,
      pagination: {
        page,
        limit,
        total,
        pages: Math.ceil(total / limit),
      },
    });
  } catch (error) {
    console.error('Error fetching service records:', error);
    res.status(500).json({ success: false, error: 'Internal server error' });
  }
});

// Get service records for a specific vehicle
app.get('/api/v1/vehicles/:id/service-records', requireAdmin, async (req, res) => {
  try {
    const { id } = req.params;

    const records = await ServiceRecord.find({ vehicleId: id })
      .sort({ serviceDate: -1 })
      .limit(20);

    res.json({
      success: true,
      data: records,
    });
  } catch (error) {
    console.error('Error fetching vehicle service records:', error);
    res.status(500).json({ success: false, error: 'Internal server error' });
  }
});

// Get a single service record
app.get('/api/v1/service-records/:id', requireAdmin, async (req, res) => {
  try {
    const { id } = req.params;

    const record = await ServiceRecord.findById(id)
      .populate('vehicleId', 'make model year licensePlate vin')
      .populate('customerId', 'firstName lastName phone email');

    if (!record) {
      return res.status(404).json({ success: false, error: 'Service record not found' });
    }

    res.json({
      success: true,
      data: record,
    });
  } catch (error) {
    console.error('Error fetching service record:', error);
    res.status(500).json({ success: false, error: 'Internal server error' });
  }
});

// Update a service record
app.put('/api/v1/service-records/:id', requireAdmin, async (req, res) => {
  try {
    const { id } = req.params;
    const updateData = req.body;

    const record = await ServiceRecord.findByIdAndUpdate(
      id,
      { ...updateData, updatedAt: new Date() },
      { new: true }
    );

    if (!record) {
      return res.status(404).json({ success: false, error: 'Service record not found' });
    }

    res.json({
      success: true,
      data: record,
    });
  } catch (error) {
    console.error('Error updating service record:', error);
    res.status(500).json({ success: false, error: 'Internal server error' });
  }
});

// Delete a service record
app.delete('/api/v1/service-records/:id', requireAdmin, async (req, res) => {
  try {
    const { id } = req.params;

    const record = await ServiceRecord.findByIdAndDelete(id);

    if (!record) {
      return res.status(404).json({ success: false, error: 'Service record not found' });
    }

    res.json({ success: true });
  } catch (error) {
    console.error('Error deleting service record:', error);
    res.status(500).json({ success: false, error: 'Internal server error' });
  }
});

// ============================================================================
// Service Entries (Individual service records by type)
// ============================================================================

// Create a new service entry
app.post('/api/v1/service-entries', requireAdmin, async (req, res) => {
  try {
    const { vehicleId, serviceType, serviceDate, mileageAtService, data, notes, cost } = req.body;

    if (!vehicleId || !serviceType) {
      return res.status(400).json({ success: false, error: 'vehicleId and serviceType are required' });
    }

    const vehicle = await Vehicle.findById(vehicleId);
    if (!vehicle) {
      return res.status(404).json({ success: false, error: 'Vehicle not found' });
    }

    const entry = await ServiceEntry.create({
      vehicleId,
      customerId: vehicle.customerId,
      recordedBy: (req as any).admin?._id,
      serviceType,
      serviceDate: serviceDate || new Date(),
      mileageAtService,
      data,
      notes,
      cost,
    });

    // Update vehicle mileage if provided
    if (mileageAtService && mileageAtService > (vehicle.mileage || 0)) {
      await Vehicle.findByIdAndUpdate(vehicleId, { mileage: mileageAtService });
    }

    res.status(201).json({ success: true, data: entry });
  } catch (error) {
    console.error('Error creating service entry:', error);
    res.status(500).json({ success: false, error: 'Internal server error' });
  }
});

// Get all service entries (with filters)
app.get('/api/v1/service-entries', requireAdmin, async (req, res) => {
  try {
    const { vehicleId, customerId, serviceType, page = 1, limit = 50 } = req.query;

    const filter: any = {};
    if (vehicleId) filter.vehicleId = vehicleId;
    if (customerId) filter.customerId = customerId;
    if (serviceType) filter.serviceType = serviceType;

    const entries = await ServiceEntry.find(filter)
      .populate('vehicleId', 'make model year licensePlate')
      .populate('customerId', 'firstName lastName phone')
      .populate('recordedBy', 'firstName lastName')
      .sort({ serviceDate: -1 })
      .skip((Number(page) - 1) * Number(limit))
      .limit(Number(limit));

    const total = await ServiceEntry.countDocuments(filter);

    res.json({
      success: true,
      data: entries,
      pagination: { page: Number(page), limit: Number(limit), total, pages: Math.ceil(total / Number(limit)) },
    });
  } catch (error) {
    console.error('Error fetching service entries:', error);
    res.status(500).json({ success: false, error: 'Internal server error' });
  }
});

// Get service entries for a specific vehicle
app.get('/api/v1/vehicles/:id/service-entries', requireAdmin, async (req, res) => {
  try {
    const { id } = req.params;
    const { serviceType } = req.query;

    const filter: any = { vehicleId: id };
    if (serviceType) filter.serviceType = serviceType;

    const entries = await ServiceEntry.find(filter)
      .populate('recordedBy', 'firstName lastName')
      .sort({ serviceDate: -1 });

    res.json({ success: true, data: entries });
  } catch (error) {
    console.error('Error fetching vehicle service entries:', error);
    res.status(500).json({ success: false, error: 'Internal server error' });
  }
});

// Get a single service entry
app.get('/api/v1/service-entries/:id', requireAdmin, async (req, res) => {
  try {
    const { id } = req.params;

    const entry = await ServiceEntry.findById(id)
      .populate('vehicleId', 'make model year licensePlate')
      .populate('customerId', 'firstName lastName phone')
      .populate('recordedBy', 'firstName lastName');

    if (!entry) {
      return res.status(404).json({ success: false, error: 'Service entry not found' });
    }

    res.json({ success: true, data: entry });
  } catch (error) {
    console.error('Error fetching service entry:', error);
    res.status(500).json({ success: false, error: 'Internal server error' });
  }
});

// Update a service entry
app.put('/api/v1/service-entries/:id', requireAdmin, async (req, res) => {
  try {
    const { id } = req.params;
    const { serviceDate, mileageAtService, data, notes, cost } = req.body;

    const entry = await ServiceEntry.findByIdAndUpdate(
      id,
      { serviceDate, mileageAtService, data, notes, cost, updatedAt: new Date() },
      { new: true }
    );

    if (!entry) {
      return res.status(404).json({ success: false, error: 'Service entry not found' });
    }

    res.json({ success: true, data: entry });
  } catch (error) {
    console.error('Error updating service entry:', error);
    res.status(500).json({ success: false, error: 'Internal server error' });
  }
});

// Delete a service entry
app.delete('/api/v1/service-entries/:id', requireAdmin, async (req, res) => {
  try {
    const { id } = req.params;

    const entry = await ServiceEntry.findByIdAndDelete(id);

    if (!entry) {
      return res.status(404).json({ success: false, error: 'Service entry not found' });
    }

    res.json({ success: true });
  } catch (error) {
    console.error('Error deleting service entry:', error);
    res.status(500).json({ success: false, error: 'Internal server error' });
  }
});

// ============================================================================
// Mobile App - Service Data Endpoint
// ============================================================================

// Debug: Get all brake service entries (temporary)
app.get('/auth/debug/brake-entries', async (req, res) => {
  try {
    const allBrakeEntries = await ServiceEntry.find({ serviceType: 'brake_service' }).lean();
    console.log('[DEBUG] All brake_service entries:', allBrakeEntries.length);
    allBrakeEntries.forEach((entry: any) => {
      console.log(`[DEBUG] - vehicleId: ${entry.vehicleId}, data:`, entry.data);
    });
    res.json({ count: allBrakeEntries.length, entries: allBrakeEntries });
  } catch (error) {
    res.status(500).json({ error: 'Error' });
  }
});

// Get latest service entries for a vehicle (mobile app)
app.get('/auth/vehicles/:id/service-entries', async (req, res) => {
  try {
    const auth = await getAuthenticatedUserAndCustomer(req, res);
    if (!auth) return;

    const { id } = req.params;
    const { serviceType } = req.query;

    // Verify vehicle belongs to this customer
    const vehicle = await Vehicle.findOne({ _id: id, customerId: auth.customer._id, isActive: true });
    if (!vehicle) {
      return res.status(404).json({ error: 'Vehicle not found' });
    }

    const filter: any = { vehicleId: id };
    if (serviceType) filter.serviceType = serviceType;

    const entries = await ServiceEntry.find(filter).sort({ serviceDate: -1 }).lean();

    // Debug: log all service entries for this vehicle
    console.log(`[service-entries] Vehicle ${id} - Found ${entries.length} entries`);
    console.log(`[service-entries] Entry types:`, entries.map((e: any) => e.serviceType));

    // Also return the latest entry per service type for quick access
    const latestByType: Record<string, any> = {};
    const serviceTypes = ['oil_change', 'brake_service', 'tire_service', 'battery_service', 'fluid_service', 'filter_service'];

    for (const type of serviceTypes) {
      const latest = await ServiceEntry.findOne({ vehicleId: id, serviceType: type }).sort({ serviceDate: -1 }).lean();
      console.log(`[service-entries] ${type}: ${latest ? 'found' : 'not found'}`);
      if (latest) {
        latestByType[type] = latest;
      }
    }

    console.log(`[service-entries] latestByType keys:`, Object.keys(latestByType));

    res.json({
      success: true,
      data: entries,
      latestByType,
    });
  } catch (error) {
    console.error('Error fetching service entries:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// ============================================================================
// Admin API - OBD Data Endpoints
// ============================================================================

// Get OBD data history for a vehicle (supports graphing)
app.get('/api/v1/vehicles/:id/obd-data', requireAdmin, async (req, res) => {
  try {
    const { id } = req.params;
    const {
      limit = 500,
      offset = 0,
      from,
      to,
      fields, // Comma-separated list of fields to return (for smaller responses)
      downsample, // If set, return every Nth record for large datasets
    } = req.query;

    const query: any = { vehicleId: id };

    // Date range filtering
    if (from || to) {
      query.timestamp = {};
      if (from) query.timestamp.$gte = new Date(from as string);
      if (to) query.timestamp.$lte = new Date(to as string);
    }

    // Build projection if specific fields requested
    let projection: any = {};
    if (fields) {
      const fieldList = (fields as string).split(',').map(f => f.trim());
      fieldList.forEach(f => projection[f] = 1);
      projection.timestamp = 1; // Always include timestamp
      projection.vehicleId = 1;
    }

    // Get total count for pagination
    const totalCount = await OBDData.countDocuments(query);

    // Fetch data
    let dataQuery = OBDData.find(query, Object.keys(projection).length > 0 ? projection : undefined)
      .sort({ timestamp: -1 })
      .skip(Number(offset))
      .limit(Math.min(Number(limit), 10000)); // Cap at 10,000

    let data = await dataQuery.lean();

    // Downsample if requested (take every Nth record)
    if (downsample && Number(downsample) > 1) {
      const n = Number(downsample);
      data = data.filter((_, i) => i % n === 0);
    }

    res.json({
      success: true,
      data: data.reverse(), // Chronological order
      pagination: {
        total: totalCount,
        offset: Number(offset),
        limit: Number(limit),
        hasMore: totalCount > Number(offset) + data.length,
      },
    });
  } catch (error) {
    console.error('Error fetching OBD data:', error);
    res.status(500).json({ success: false, error: 'Internal server error' });
  }
});

// Get OBD data stats for a vehicle
app.get('/api/v1/vehicles/:id/obd-data/stats', requireAdmin, async (req, res) => {
  try {
    const { id } = req.params;

    const [count, oldest, newest] = await Promise.all([
      OBDData.countDocuments({ vehicleId: id }),
      OBDData.findOne({ vehicleId: id }).sort({ timestamp: 1 }).select('timestamp').lean(),
      OBDData.findOne({ vehicleId: id }).sort({ timestamp: -1 }).select('timestamp').lean(),
    ]);

    res.json({
      success: true,
      stats: {
        totalRecords: count,
        oldestRecord: oldest?.timestamp || null,
        newestRecord: newest?.timestamp || null,
        maxRecords: 10000,
      },
    });
  } catch (error) {
    console.error('Error fetching OBD stats:', error);
    res.status(500).json({ success: false, error: 'Internal server error' });
  }
});

// Get latest OBD data for a vehicle
app.get('/api/v1/vehicles/:id/obd-data/latest', requireAdmin, async (req, res) => {
  try {
    const { id } = req.params;

    // Check in-memory first
    const realtime = latestOBDData.get(id);
    if (realtime) {
      return res.json({
        success: true,
        data: realtime,
        isRealtime: true,
      });
    }

    // Fall back to database
    const data = await OBDData.findOne({ vehicleId: id }).sort({ timestamp: -1 });

    res.json({
      success: true,
      data: data || null,
      isRealtime: false,
    });
  } catch (error) {
    console.error('Error fetching latest OBD data:', error);
    res.status(500).json({ success: false, error: 'Internal server error' });
  }
});

// Get active OBD sessions
app.get('/api/v1/obd-sessions/active', requireAdmin, async (req, res) => {
  try {
    const sessions = await OBDSession.find({ isActive: true })
      .populate('vehicleId', 'make model year licensePlate')
      .populate('customerId', 'firstName lastName phone')
      .sort({ startedAt: -1 });

    res.json({
      success: true,
      data: sessions,
    });
  } catch (error) {
    console.error('Error fetching active OBD sessions:', error);
    res.status(500).json({ success: false, error: 'Internal server error' });
  }
});

// Get OBD session history for a vehicle
app.get('/api/v1/vehicles/:id/obd-sessions', requireAdmin, async (req, res) => {
  try {
    const { id } = req.params;
    const { limit = 20 } = req.query;

    const sessions = await OBDSession.find({ vehicleId: id })
      .sort({ startedAt: -1 })
      .limit(Number(limit));

    res.json({
      success: true,
      data: sessions,
    });
  } catch (error) {
    console.error('Error fetching OBD sessions:', error);
    res.status(500).json({ success: false, error: 'Internal server error' });
  }
});

// ============================================================================
// Admin API - Workshop Customers Management
// ============================================================================

// Get all customers (for admin panel)
app.get('/api/v1/workshop/customers', requireAdmin, async (req, res) => {
  try {
    const page = parseInt(req.query.page as string) || 1;
    const limit = parseInt(req.query.limit as string) || 10;
    const search = req.query.search as string;
    const isActive = req.query.isActive as string;

    const query: any = {};

    if (search) {
      // Search by name or phone
      query.$or = [
        { firstName: { $regex: search, $options: 'i' } },
        { lastName: { $regex: search, $options: 'i' } },
        { phone: { $regex: search, $options: 'i' } },
        { email: { $regex: search, $options: 'i' } },
      ];
    }

    if (isActive !== undefined) {
      query.isActive = isActive === 'true';
    }

    const total = await Customer.countDocuments(query);
    const customers = await Customer.find(query)
      .sort({ createdAt: -1 })
      .skip((page - 1) * limit)
      .limit(limit);

    // Get vehicle counts for each customer
    const customerIds = customers.map(c => c._id);
    const vehicleCounts = await Vehicle.aggregate([
      { $match: { customerId: { $in: customerIds }, isActive: true } },
      { $group: { _id: '$customerId', count: { $sum: 1 } } },
    ]);
    const vehicleCountMap = new Map(vehicleCounts.map(v => [v._id.toString(), v.count]));

    res.json({
      success: true,
      data: customers.map(c => ({
        _id: c._id,
        userId: c.userId,
        firstName: c.firstName || '',
        lastName: c.lastName || '',
        email: c.email,
        phone: c.phone,
        countryCode: c.countryCode,
        address: c.address,
        notes: c.notes,
        tags: c.tags,
        source: c.source || (c.userId ? 'app' : 'walk-in'),
        totalSpent: c.totalSpent,
        visitCount: c.visitCount,
        lastVisit: c.lastVisit,
        isActive: c.isActive,
        vehicles: Array(vehicleCountMap.get(c._id.toString()) || 0).fill(null),
        createdAt: c.createdAt,
        updatedAt: c.updatedAt,
      })),
      pagination: {
        page,
        limit,
        total,
        pages: Math.ceil(total / limit),
      },
    });
  } catch (error) {
    console.error('Error fetching customers:', error);
    res.status(500).json({ success: false, error: 'Internal server error' });
  }
});

// Get a single customer by ID
app.get('/api/v1/workshop/customers/:id', requireAdmin, async (req, res) => {
  try {
    const { id } = req.params;

    const customer = await Customer.findById(id);
    if (!customer) {
      return res.status(404).json({ success: false, error: 'Customer not found' });
    }

    res.json({
      success: true,
      data: {
        _id: customer._id,
        userId: customer.userId,
        firstName: customer.firstName || '',
        lastName: customer.lastName || '',
        email: customer.email,
        phone: customer.phone,
        countryCode: customer.countryCode,
        address: customer.address,
        notes: customer.notes,
        tags: customer.tags,
        source: customer.source || (customer.userId ? 'app' : 'walk-in'),
        totalSpent: customer.totalSpent,
        visitCount: customer.visitCount,
        lastVisit: customer.lastVisit,
        isActive: customer.isActive,
        createdAt: customer.createdAt,
        updatedAt: customer.updatedAt,
      },
    });
  } catch (error) {
    console.error('Error fetching customer:', error);
    res.status(500).json({ success: false, error: 'Internal server error' });
  }
});

// Get customer vehicles
app.get('/api/v1/workshop/customers/:id/vehicles', requireAdmin, async (req, res) => {
  try {
    const { id } = req.params;

    const vehicles = await Vehicle.find({ customerId: id, isActive: true })
      .sort({ createdAt: -1 });

    res.json({
      success: true,
      data: vehicles.map(v => ({
        _id: v._id,
        make: v.make,
        model: v.model,
        year: v.year,
        vin: v.vin,
        licensePlate: v.licensePlate,
        color: v.color,
        mileage: v.mileage,
        fuelType: v.fuelType,
        transmission: v.transmission,
        healthStatus: 'good',
        isActive: v.isActive,
        createdAt: v.createdAt,
      })),
    });
  } catch (error) {
    console.error('Error fetching customer vehicles:', error);
    res.status(500).json({ success: false, error: 'Internal server error' });
  }
});

// Get customer stats
app.get('/api/v1/workshop/customers/:id/stats', requireAdmin, async (req, res) => {
  try {
    const { id } = req.params;

    const customer = await Customer.findById(id);
    if (!customer) {
      return res.status(404).json({ success: false, error: 'Customer not found' });
    }

    const vehicleCount = await Vehicle.countDocuments({ customerId: id, isActive: true });

    res.json({
      success: true,
      data: {
        totalSpent: customer.totalSpent,
        visitCount: customer.visitCount,
        vehicleCount,
        memberSince: customer.createdAt,
      },
    });
  } catch (error) {
    console.error('Error fetching customer stats:', error);
    res.status(500).json({ success: false, error: 'Internal server error' });
  }
});

// Create a new customer (manual entry)
app.post('/api/v1/workshop/customers', requireAdmin, async (req, res) => {
  try {
    const { firstName, lastName, phone, countryCode, email, address, notes, tags, source } = req.body;

    if (!phone) {
      return res.status(400).json({ success: false, error: 'Phone is required' });
    }

    // Check if customer with this phone already exists
    const existing = await Customer.findOne({ phone });
    if (existing) {
      return res.status(400).json({ success: false, error: 'Customer with this phone already exists' });
    }

    const customer = await Customer.create({
      firstName,
      lastName,
      phone,
      countryCode,
      email,
      address,
      notes,
      tags,
      source: source || 'walk-in',
    });

    res.status(201).json({
      success: true,
      data: customer,
    });
  } catch (error) {
    console.error('Error creating customer:', error);
    res.status(500).json({ success: false, error: 'Internal server error' });
  }
});

// Update a customer
app.put('/api/v1/workshop/customers/:id', requireAdmin, async (req, res) => {
  try {
    const { id } = req.params;
    const { firstName, lastName, email, address, notes, tags } = req.body;

    const customer = await Customer.findByIdAndUpdate(
      id,
      {
        firstName,
        lastName,
        email,
        address,
        notes,
        tags,
        updatedAt: new Date(),
      },
      { new: true }
    );

    if (!customer) {
      return res.status(404).json({ success: false, error: 'Customer not found' });
    }

    res.json({
      success: true,
      data: customer,
    });
  } catch (error) {
    console.error('Error updating customer:', error);
    res.status(500).json({ success: false, error: 'Internal server error' });
  }
});

// Deactivate a customer
app.post('/api/v1/workshop/customers/:id/deactivate', requireAdmin, async (req, res) => {
  try {
    const { id } = req.params;

    const customer = await Customer.findByIdAndUpdate(
      id,
      { isActive: false, updatedAt: new Date() },
      { new: true }
    );

    if (!customer) {
      return res.status(404).json({ success: false, error: 'Customer not found' });
    }

    res.json({ success: true, data: customer });
  } catch (error) {
    console.error('Error deactivating customer:', error);
    res.status(500).json({ success: false, error: 'Internal server error' });
  }
});

// Reactivate a customer
app.post('/api/v1/workshop/customers/:id/reactivate', requireAdmin, async (req, res) => {
  try {
    const { id } = req.params;

    const customer = await Customer.findByIdAndUpdate(
      id,
      { isActive: true, updatedAt: new Date() },
      { new: true }
    );

    if (!customer) {
      return res.status(404).json({ success: false, error: 'Customer not found' });
    }

    res.json({ success: true, data: customer });
  } catch (error) {
    console.error('Error reactivating customer:', error);
    res.status(500).json({ success: false, error: 'Internal server error' });
  }
});

// Get latest service data for a vehicle (mobile app) - legacy endpoint
app.get('/auth/vehicles/:id/service-data', async (req, res) => {
  try {
    const auth = await getAuthenticatedUserAndCustomer(req, res);
    if (!auth) return;

    const { id } = req.params;

    // Verify vehicle belongs to this customer
    const vehicle = await Vehicle.findOne({ _id: id, customerId: auth.customer._id, isActive: true });
    if (!vehicle) {
      return res.status(404).json({ error: 'Vehicle not found' });
    }

    // Get the latest service record
    const latestRecord = await ServiceRecord.findOne({ vehicleId: id })
      .sort({ serviceDate: -1 });

    if (!latestRecord) {
      return res.json({
        success: true,
        hasServiceData: false,
        serviceData: null,
      });
    }

    res.json({
      success: true,
      hasServiceData: true,
      serviceData: {
        serviceDate: latestRecord.serviceDate,
        mileageAtService: latestRecord.mileageAtService,
        oil: latestRecord.oil,
        brakeFluid: latestRecord.brakeFluid,
        transmissionFluid: latestRecord.transmissionFluid,
        coolant: latestRecord.coolant,
        powerSteeringFluid: latestRecord.powerSteeringFluid,
        brakePads: latestRecord.brakePads,
        tires: latestRecord.tires,
        battery: latestRecord.battery,
        airFilter: latestRecord.airFilter,
        cabinAirFilter: latestRecord.cabinAirFilter,
        wipers: latestRecord.wipers,
        lights: latestRecord.lights,
        overallHealth: latestRecord.overallHealth,
        notes: latestRecord.notes,
        recommendations: latestRecord.recommendations,
      },
    });
  } catch (error) {
    console.error('Error fetching service data:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Connect to MongoDB and start server
async function startServer() {
  try {
    console.log('Connecting to MongoDB...');
    await mongoose.connect(MONGODB_URI);
    console.log('✅ Connected to MongoDB');

    // Drop old problematic indexes
    try {
      await mongoose.connection.collection('users').dropIndex('email_1');
      console.log('✅ Dropped old email index');
    } catch (e) {
      // Index doesn't exist, that's fine
    }

    // Auto-seed admin user
    await seedAdmin();

    server.listen(PORT, () => {
      console.log(`AxleWorks API running on port ${PORT}`);
      console.log(`WebSocket server available at ws://localhost:${PORT}/ws`);
    });
  } catch (error) {
    console.error('Failed to connect to MongoDB:', error);
    process.exit(1);
  }
}

startServer();
