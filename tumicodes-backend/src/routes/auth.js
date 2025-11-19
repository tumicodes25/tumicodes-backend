import express from "express";
import authMiddleware from "../utils/authMiddleware.js";

const router = express.Router();

// Login route (for testing, you can connect Firebase frontend here)
router.post("/login", (req, res) => {
  res.json({ status: "ok", message: "Login route works!" });
});

// Register route (for testing, you can connect Firebase frontend here)
router.post("/register", (req, res) => {
  res.json({ status: "ok", message: "Register route works!" });
});

// Protected route (dashboard)
router.get("/verify", authMiddleware, (req, res) => {
  res.status(200).json({
    status: "ok",
    message: "Token valid",
    user: req.user, // Firebase user info from token
  });
});

export default router;
