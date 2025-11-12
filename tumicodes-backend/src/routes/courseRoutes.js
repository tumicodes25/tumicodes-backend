const express = require('express');
const router = express.Router();
const courseController = require('../controllers/courseController');
router.get('/', courseController.list);
router.post('/', courseController.create);
module.exports = router;