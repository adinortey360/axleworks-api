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

const User = mongoose.model('User', userSchema);
const AdminUser = mongoose.model('AdminUser', adminUserSchema);
const Session = mongoose.model('Session', sessionSchema);
const RefreshToken = mongoose.model('RefreshToken', refreshTokenSchema);

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

    if (!user) {
      user = await User.create({ phone, countryCode });
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
      },
    });
  } catch (error) {
    console.error('Error verifying OTP:', error);
    res.status(500).json({ error: 'Internal server error' });
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

// Connect to MongoDB and start server
async function startServer() {
  try {
    console.log('Connecting to MongoDB...');
    await mongoose.connect(MONGODB_URI);
    console.log('✅ Connected to MongoDB');

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
