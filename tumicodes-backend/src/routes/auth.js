import express from "express";
import User from "../models/User.js";

const router = express.Router();

// Test route
router.get("/test", (req, res) => {
  res.json({ message: "Auth route working" });
});

export default router;
