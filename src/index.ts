import express from 'express';
import cors from 'cors';
import mongoose from 'mongoose';
import bcrypt from 'bcryptjs';
import { v4 as uuidv4 } from 'uuid';

const app = express();
const PORT = process.env.PORT || 3000;
const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/axleworks';

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
  address: { type: String },
  city: { type: String },
  notes: { type: String },
  totalSpent: { type: Number, default: 0 },
  visitCount: { type: Number, default: 0 },
  lastVisit: { type: Date },
  isActive: { type: Boolean, default: true },
  createdAt: { type: Date, default: Date.now },
});

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

const User = mongoose.model('User', userSchema);
const AdminUser = mongoose.model('AdminUser', adminUserSchema);
const Session = mongoose.model('Session', sessionSchema);
const RefreshToken = mongoose.model('RefreshToken', refreshTokenSchema);
const Customer = mongoose.model('Customer', customerSchema);
const Vehicle = mongoose.model('Vehicle', vehicleSchema);
const ServiceRecord = mongoose.model('ServiceRecord', serviceRecordSchema);
const ServiceEntry = mongoose.model('ServiceEntry', serviceEntrySchema);

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

      // Create associated customer for new user
      await Customer.create({
        userId: user._id,
        phone,
        countryCode,
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

    // Also return the latest entry per service type for quick access
    const latestByType: Record<string, any> = {};
    const serviceTypes = ['oil_change', 'brake_service', 'tire_service', 'battery_service', 'fluid_service', 'filter_service'];

    for (const type of serviceTypes) {
      const latest = await ServiceEntry.findOne({ vehicleId: id, serviceType: type }).sort({ serviceDate: -1 }).lean();
      if (latest) {
        latestByType[type] = latest;
      }
    }

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

    app.listen(PORT, () => {
      console.log(`AxleWorks API running on port ${PORT}`);
    });
  } catch (error) {
    console.error('Failed to connect to MongoDB:', error);
    process.exit(1);
  }
}

startServer();
