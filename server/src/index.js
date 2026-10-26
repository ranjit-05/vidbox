import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import mongoose from 'mongoose';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { createHmac, timingSafeEqual } from 'node:crypto';
import { S3Client, GetObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { User, Media, Order } from './models.js';
import { seedCatalog } from './catalog.js';

const app = express();
const port = Number(process.env.PORT || 4000);
const jwtSecret = process.env.JWT_SECRET?.trim();
if (!jwtSecret || jwtSecret === 'replace-with-a-long-random-secret') {
  throw new Error('Set a unique JWT_SECRET in server/.env before starting the API.');
}
const s3 = process.env.S3_BUCKET ? new S3Client({ region: process.env.AWS_REGION || 'ap-south-1' }) : null;

app.use(helmet());
app.use(cors({ origin: process.env.CLIENT_ORIGIN || 'http://localhost:5173' }));

// Razorpay signs the original request bytes; keep this route ahead of express.json().
app.post('/api/webhooks/razorpay', express.raw({ type: 'application/json' }), async (req, res) => {
  const webhookSecret = process.env.RAZORPAY_WEBHOOK_SECRET;
  if (!webhookSecret) return res.status(503).send('Razorpay webhook is not configured');
  const signature = req.headers['x-razorpay-signature'];
  const expected = createHmac('sha256', webhookSecret).update(req.body).digest();
  let received;
  try { received = Buffer.from(String(signature || ''), 'hex'); }
  catch { return res.status(400).send('Invalid webhook signature'); }
  if (received.length !== expected.length || !timingSafeEqual(received, expected)) return res.status(400).send('Invalid webhook signature');
  let event;
  try { event = JSON.parse(req.body.toString('utf8')); }
  catch { return res.status(400).send('Invalid webhook payload'); }
  try {
    const payment = event.payload?.payment?.entity;
    const gatewayOrderId = payment?.order_id || event.payload?.order?.entity?.id;
    if (['payment.captured', 'order.paid'].includes(event.event) && gatewayOrderId) {
      const order = await Order.findOne({ provider: 'razorpay', paymentIntentId: gatewayOrderId });
      if (order) await markOrderPaid(order, payment?.id);
    }
    if (event.event === 'payment.failed' && gatewayOrderId) {
      await Order.updateOne({ provider: 'razorpay', paymentIntentId: gatewayOrderId, status: 'pending' }, { status: 'failed', paymentId: payment?.id || null });
    }
    return res.json({ received: true });
  } catch (error) { console.error('Razorpay webhook processing failed:', error.message); return res.status(500).send('Webhook processing failed'); }
});

app.use(express.json({ limit: '20kb' }));
app.use('/api/auth', rateLimit({ windowMs: 15 * 60 * 1000, limit: 30, standardHeaders: 'draft-7', legacyHeaders: false }));

function tokenFor(user) {
  return jwt.sign({ sub: user.id }, jwtSecret, { expiresIn: '7d' });
}

async function requireUser(req, res, next) {
  const token = req.headers.authorization?.replace(/^Bearer\s+/i, '');
  if (!token) return res.status(401).json({ error: 'Sign in to continue.' });
  try {
    const payload = jwt.verify(token, jwtSecret);
    req.user = await User.findById(payload.sub);
    if (!req.user) return res.status(401).json({ error: 'Account not found. Please sign in again.' });
    next();
  } catch { return res.status(401).json({ error: 'Your session expired. Please sign in again.' }); }
}

function publicUser(user) {
  return { id: user.id, email: user.email, purchasedVideoIds: user.purchasedVideoIds.map(String) };
}

function razorpayAuthorization() {
  const credentials = `${process.env.RAZORPAY_KEY_ID}:${process.env.RAZORPAY_KEY_SECRET}`;
  return `Basic ${Buffer.from(credentials).toString('base64')}`;
}

async function markOrderPaid(order, paymentId) {
  let changed = false;
  if (order.status !== 'paid') {
    order.status = 'paid';
    changed = true;
  }
  if (paymentId && order.paymentId !== paymentId) {
    order.paymentId = paymentId;
    changed = true;
  }
  if (changed) {
    await order.save();
  }
  await User.updateOne({ _id: order.userId }, { $addToSet: { purchasedVideoIds: order.mediaId } });
}

async function createRazorpayOrder(order, item, user) {
  const response = await fetch('https://api.razorpay.com/v1/orders', {
    method: 'POST',
    headers: { Authorization: razorpayAuthorization(), 'Content-Type': 'application/json' },
    body: JSON.stringify({
      amount: item.price * 100,
      currency: 'INR',
      receipt: `vidbox_${order.id}`.slice(0, 40),
      notes: { internalOrderId: order.id, userId: user.id, mediaId: item.id }
    })
  });
  const result = await response.json().catch(() => ({}));
  if (!response.ok) throw Object.assign(new Error(result.error?.description || 'Razorpay could not create this order.'), { status: 502 });
  order.paymentIntentId = result.id;
  await order.save();
  return result;
}

app.get('/api/health', (req, res) => res.json({ status: 'ok', paymentMode: process.env.PAYMENT_MODE === 'razorpay' ? 'razorpay' : 'demo' }));
app.post('/api/auth/register', async (req, res, next) => {
  try {
    const email = String(req.body.email || '').trim().toLowerCase();
    const password = String(req.body.password || '');
    if (!/^\S+@\S+\.\S+$/.test(email)) return res.status(400).json({ error: 'Enter a valid email address.' });
    if (password.length < 8) return res.status(400).json({ error: 'Use a password with at least 8 characters.' });
    if (await User.exists({ email })) return res.status(409).json({ error: 'An account with this email already exists.' });
    const user = await User.create({ email, passwordHash: await bcrypt.hash(password, 12) });
    res.status(201).json({ token: tokenFor(user), user: publicUser(user) });
  } catch (error) { next(error); }
});
app.post('/api/auth/login', async (req, res, next) => {
  try {
    const user = await User.findOne({ email: String(req.body.email || '').trim().toLowerCase() }).select('+passwordHash');
    if (!user || !await bcrypt.compare(String(req.body.password || ''), user.passwordHash)) return res.status(401).json({ error: 'Email or password is incorrect.' });
    await user.populate('purchasedVideoIds');
    res.json({ token: tokenFor(user), user: publicUser(user) });
  } catch (error) { next(error); }
});
app.get('/api/auth/me', requireUser, (req, res) => res.json({ user: publicUser(req.user) }));

app.get('/api/media', async (req, res, next) => {
  try {
    const media = await Media.find().sort({ featured: -1, createdAt: 1 }).lean();
    res.json({ media: media.map(({ _id, storageKey, ...item }) => ({ ...item, id: String(_id) })) });
  } catch (error) { next(error); }
});
app.get('/api/media/:id', async (req, res, next) => {
  try {
    const item = await Media.findById(req.params.id).lean();
    if (!item) return res.status(404).json({ error: 'Film not found.' });
    const { _id, storageKey, ...rest } = item;
    res.json({ media: { ...rest, id: String(_id) } });
  } catch (error) { next(error); }
});

app.get('/api/library', requireUser, async (req, res, next) => {
  try {
    const media = await Media.find({ _id: { $in: req.user.purchasedVideoIds } }).lean();
    res.json({ media: media.map(({ _id, storageKey, ...item }) => ({ ...item, id: String(_id) })) });
  } catch (error) { next(error); }
});

app.post('/api/orders/checkout', requireUser, async (req, res, next) => {
  try {
    const item = await Media.findById(req.body.mediaId);
    if (!item) return res.status(404).json({ error: 'Film not found.' });
    if (req.user.purchasedVideoIds.some((id) => String(id) === item.id)) return res.status(409).json({ error: 'You already own this film.' });
    const mode = process.env.PAYMENT_MODE === 'razorpay' ? 'razorpay' : 'demo';
    if (mode === 'razorpay' && (!process.env.RAZORPAY_KEY_ID || !process.env.RAZORPAY_KEY_SECRET)) {
      return res.status(503).json({ error: 'Razorpay is selected but its API keys are missing from server/.env.' });
    }
    const order = await Order.create({ userId: req.user.id, mediaId: item.id, amount: item.price, provider: mode });
    if (mode === 'demo') return res.status(201).json({ order: { id: order.id, status: order.status }, checkoutUrl: null, paymentMode: 'demo' });
    try {
      const gatewayOrder = await createRazorpayOrder(order, item, req.user);
      res.status(201).json({
        order: { id: order.id, status: order.status },
        paymentMode: 'razorpay',
        razorpay: {
          keyId: process.env.RAZORPAY_KEY_ID,
          orderId: gatewayOrder.id,
          amount: gatewayOrder.amount,
          currency: gatewayOrder.currency,
          name: 'Vidbox',
          description: item.title,
          prefill: { email: req.user.email }
        }
      });
    } catch (error) { await Order.deleteOne({ _id: order.id }); throw error; }
  } catch (error) { next(error); }
});

app.get('/api/orders/:id', requireUser, async (req, res, next) => {
  try {
    const order = await Order.findOne({ _id: req.params.id, userId: req.user.id });
    if (!order) return res.status(404).json({ error: 'Order not found.' });
    res.json({ order: { id: order.id, status: order.status } });
  } catch (error) { next(error); }
});

app.post('/api/orders/:id/verify', requireUser, async (req, res, next) => {
  try {
    if (process.env.PAYMENT_MODE !== 'razorpay' || !process.env.RAZORPAY_KEY_SECRET) return res.status(403).json({ error: 'Razorpay verification is not enabled.' });
    const order = await Order.findOne({ _id: req.params.id, userId: req.user.id, provider: 'razorpay' });
    if (!order) return res.status(404).json({ error: 'Order not found.' });
    const { razorpay_order_id: returnedOrderId, razorpay_payment_id: paymentId, razorpay_signature: signature } = req.body;
    if (!order.paymentIntentId || returnedOrderId !== order.paymentIntentId || !paymentId || !signature) return res.status(400).json({ error: 'Payment details do not match this order.' });
    const expected = createHmac('sha256', process.env.RAZORPAY_KEY_SECRET).update(`${order.paymentIntentId}|${paymentId}`).digest();
    let received;
    try { received = Buffer.from(String(signature), 'hex'); }
    catch { return res.status(400).json({ error: 'Payment signature is invalid.' }); }
    if (received.length !== expected.length || !timingSafeEqual(received, expected)) return res.status(400).json({ error: 'Payment signature is invalid.' });

    const paymentResponse = await fetch(`https://api.razorpay.com/v1/payments/${encodeURIComponent(paymentId)}`, { headers: { Authorization: razorpayAuthorization() } });
    const payment = await paymentResponse.json().catch(() => ({}));
    if (!paymentResponse.ok) return res.status(502).json({ error: 'Could not confirm payment status with Razorpay.' });
    if (payment.order_id !== order.paymentIntentId || payment.amount !== order.amount * 100 || payment.currency !== 'INR') return res.status(400).json({ error: 'Payment details do not match this order.' });
    if (payment.status === 'captured') await markOrderPaid(order, payment.id);
    else if (payment.status === 'failed' && order.status === 'pending') { order.status = 'failed'; order.paymentId = payment.id; await order.save(); }
    res.json({ order: { id: order.id, status: payment.status === 'captured' ? 'paid' : order.status } });
  } catch (error) { next(error); }
});

app.post('/api/orders/:id/demo-complete', requireUser, async (req, res, next) => {
  try {
    if (process.env.PAYMENT_MODE === 'razorpay') return res.status(403).json({ error: 'Demo payments are disabled.' });
    const order = await Order.findOne({ _id: req.params.id, userId: req.user.id, provider: 'demo' });
    if (!order) return res.status(404).json({ error: 'Order not found.' });
    if (order.status === 'pending') {
      order.status = 'paid';
      order.paymentIntentId = `demo_${order.id}`;
      await order.save();
      await User.updateOne({ _id: order.userId }, { $addToSet: { purchasedVideoIds: order.mediaId } });
    }
    res.json({ order: { id: order.id, status: order.status } });
  } catch (error) { next(error); }
});

app.get('/api/media/:id/play', requireUser, async (req, res, next) => {
  try {
    const item = await Media.findById(req.params.id);
    if (!item) return res.status(404).json({ error: 'Film not found.' });
    const owns = req.user.purchasedVideoIds.some((id) => String(id) === item.id);
    if (!owns) return res.status(403).json({ error: 'Purchase this film to start watching.' });
    if (s3) {
      const url = await getSignedUrl(s3, new GetObjectCommand({ Bucket: process.env.S3_BUCKET, Key: item.storageKey }), { expiresIn: 300 });
      return res.json({ url, expiresIn: 300 });
    }
    if (process.env.DEMO_VIDEO_URL) return res.json({ url: process.env.DEMO_VIDEO_URL, expiresIn: 300, demo: true });
    return res.status(503).json({ error: 'Video storage is not configured. Add an S3 bucket or DEMO_VIDEO_URL.' });
  } catch (error) { next(error); }
});

app.use((err, req, res, next) => {
  console.error(err.message);
  if (err.name === 'CastError') return res.status(400).json({ error: 'Invalid item or order ID.' });
  if (err.code === 11000) return res.status(409).json({ error: 'An account with this email already exists.' });
  res.status(err.status || 500).json({ error: err.status && err.status < 500 ? err.message : 'Something went wrong. Please try again.' });
});

await mongoose.connect(process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/reelbox');
await seedCatalog();
app.listen(port, () => console.log(`Vidbox API listening on http://localhost:${port}`));
