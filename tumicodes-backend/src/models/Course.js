const mongoose = require('mongoose');
const CourseSchema = new mongoose.Schema({
  title: String,
  slug: { type: String, unique: true },
  description: String,
  duration: String,
  difficulty: String,
  instructor: String,
  published: { type: Boolean, default: false },
  lessons: { type: Array, default: [] },
  createdAt: { type: Date, default: Date.now }
});
module.exports = mongoose.model('Course', CourseSchema);