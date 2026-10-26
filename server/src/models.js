import mongoose from 'mongoose';

const userSchema = new mongoose.Schema({
  email: { type: String, required: true, unique: true, lowercase: true, trim: true },
  passwordHash: { type: String, required: true, select: false },
  purchasedVideoIds: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Media' }]
}, { timestamps: true });

const mediaSchema = new mongoose.Schema({
  title: { type: String, required: true },
  description: { type: String, required: true },
  genre: { type: String, required: true },
  year: { type: Number, required: true },
  duration: { type: String, required: true },
  price: { type: Number, required: true, min: 0 },
  storageKey: { type: String, required: true },
  posterTone: { type: String, default: 'ember' },
  featured: { type: Boolean, default: false }
}, { timestamps: true });

const orderSchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  mediaId: { type: mongoose.Schema.Types.ObjectId, ref: 'Media', required: true },
  status: { type: String, enum: ['pending', 'paid', 'failed'], default: 'pending', index: true },
  paymentIntentId: { type: String, default: null },
  paymentId: { type: String, default: null },
  amount: { type: Number, required: true },
  provider: { type: String, enum: ['demo', 'razorpay'], required: true }
}, { timestamps: true });

export const User = mongoose.model('User', userSchema);
export const Media = mongoose.model('Media', mediaSchema);
export const Order = mongoose.model('Order', orderSchema);
