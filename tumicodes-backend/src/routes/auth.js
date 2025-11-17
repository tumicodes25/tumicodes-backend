// src/routes/auth.js
import express from "express";
const router = express.Router();

// Test route to make sure server works
router.get("/test", (req, res) => {
  res.json({ message: "Auth route working" });
});

export default router;
