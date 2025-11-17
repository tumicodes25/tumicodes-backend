import express from "express";
import Course from "../models/Course.js";

const router = express.Router();

// Test route
router.get("/test", (req, res) => {
  res.json({ message: "Courses route working" });
});

export default router;
