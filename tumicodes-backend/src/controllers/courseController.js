const Course = require('../models/Course');
exports.list = async (req, res, next) => {
  try {
    const courses = await Course.find().sort({ createdAt: -1 });
    res.json(courses);
  } catch (err) { next(err); }
};
exports.create = async (req, res, next) => {
  try {
    const data = req.body;
    data.slug = (data.title || 'course').toLowerCase().replace(/[^a-z0-9]+/g,'-');
    const course = await Course.create(data);
    res.status(201).json(course);
  } catch (err) { next(err); }
};