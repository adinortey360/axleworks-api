import express from 'express';
import cors from 'cors';
import { v4 as uuidv4 } from 'uuid';

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());

// In-memory storage (replace with database in production)
const users: Map<string, { id: string; phone: string; countryCode: string; createdAt: string }> = new Map();
const otpStore: Map<string, { otp: string; expiresAt: number; phone: string; countryCode: string }> = new Map();
const sessions: Map<string, { userId: string; createdAt: string; expiresAt: string }> = new Map();

// Generate 6-digit OTP
function generateOTP(): string {
  return Math.floor(100000 + Math.random() * 900000).toString();
}

// Health check
app.get('/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

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
app.post('/auth/verify-otp', (req, res) => {
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

  // Find or create user
  let user = Array.from(users.values()).find(
    u => u.phone === phone && u.countryCode === countryCode
  );

  if (!user) {
    user = {
      id: uuidv4(),
      phone,
      countryCode,
      createdAt: new Date().toISOString(),
    };
    users.set(user.id, user);
  }

  // Create session
  const sessionId = uuidv4();
  const sessionExpiry = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000); // 30 days
  
  sessions.set(sessionId, {
    userId: user.id,
    createdAt: new Date().toISOString(),
    expiresAt: sessionExpiry.toISOString(),
  });

  res.json({
    success: true,
    token: sessionId,
    user: {
      id: user.id,
      phone: user.phone,
      countryCode: user.countryCode,
    },
  });
});

// Validate session
app.get('/auth/me', (req, res) => {
  const authHeader = req.headers.authorization;
  
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'No token provided' });
  }

  const token = authHeader.substring(7);
  const session = sessions.get(token);

  if (!session) {
    return res.status(401).json({ error: 'Invalid session' });
  }

  if (new Date(session.expiresAt) < new Date()) {
    sessions.delete(token);
    return res.status(401).json({ error: 'Session expired' });
  }

  const user = users.get(session.userId);
  
  if (!user) {
    return res.status(401).json({ error: 'User not found' });
  }

  res.json({
    user: {
      id: user.id,
      phone: user.phone,
      countryCode: user.countryCode,
    },
  });
});

// Logout
app.post('/auth/logout', (req, res) => {
  const authHeader = req.headers.authorization;
  
  if (authHeader && authHeader.startsWith('Bearer ')) {
    const token = authHeader.substring(7);
    sessions.delete(token);
  }

  res.json({ success: true });
});

app.listen(PORT, () => {
  console.log(`AxleWorks API running on port ${PORT}`);
});
