import express from "express";
import authMiddleware from "../middleware/authMiddleware.js";

const router = express.Router();

// --- LOGIN ---
router.post("/login", (req, res) => {
  res.send("Login route works!");
});

// --- REGISTER ---
router.post("/register", (req, res) => {
  res.send("Register route works!");
});

// --- VERIFY TOKEN (Dashboard uses this) ---
router.get("/verify", authMiddleware, (req, res) => {
  res.status(200).json({
    status: "ok",
    message: "Token valid",
    user: req.user
  });
});

// ✅ Only ONE export
export default router;
