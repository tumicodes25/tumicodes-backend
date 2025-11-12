const mongoose = require('mongoose');
const UserSchema = new mongoose.Schema({
  name: { type: String, required: true },
  email: { type: String, required: true, unique: true },
  role: { type: String, enum: ['user','instructor','admin'], default: 'user' },
  createdAt: { type: Date, default: Date.now },
  meta: { type: Object, default: {} }
});
module.exports = mongoose.model('User', UserSchema);