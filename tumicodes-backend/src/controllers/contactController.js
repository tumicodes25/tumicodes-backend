const Contact = require('../models/Contact');
const telegram = require('../config/telegram');
exports.submit = async (req, res, next) => {
  try {
    const { name, email, subject, message } = req.body;
    const doc = await Contact.create({ name, email, subject, message });
    const text = `📨 New contact form\nName: ${name}\nEmail: ${email}\nSubject: ${subject}\nMessage: ${message}`;
    telegram.sendAdmin(text).catch(()=>{});
    res.json({ ok: true, doc });
  } catch (err) { next(err); }
};