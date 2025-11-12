const jwt = require('jsonwebtoken');
const User = require('../models/User');
const telegram = require('../config/telegram');

exports.register = async (req, res, next) => {
  try {
    const { name, email } = req.body;
    if (!name || !email) return res.status(400).json({ error: 'Missing fields' });
    let user = await User.findOne({ email });
    if (!user) user = await User.create({ name, email });
    const token = jwt.sign({ id: user._id, role: user.role }, process.env.JWT_SECRET || 'dev', { expiresIn: '7d' });
    // notify admin via telegram
    telegram.sendAdmin(`👤 New registration: ${name} — ${email}`).catch(()=>{});
    res.json({ user, token });
  } catch (err) { next(err); }
};

exports.login = async (req, res, next) => {
  try {
    const { email } = req.body;
    if (!email) return res.status(400).json({ error: 'Missing email' });
    const user = await User.findOne({ email });
    if (!user) return res.status(404).json({ error: 'User not found' });
    const token = jwt.sign({ id: user._id, role: user.role }, process.env.JWT_SECRET || 'dev', { expiresIn: '7d' });
    res.json({ user, token });
  } catch (err) { next(err); }
};