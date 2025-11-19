import express from "express";
import authMiddleware from "../utils/authMiddleware.js";

const router = express.Router();

// LOGIN
router.post("/login", (req, res) => {
  res.send("Login route works!");
});

// REGISTER
router.post("/register", (req, res) => {
  res.send("Register route works!");
});

// VERIFY TOKEN
router.get("/verify", authMiddleware, (req, res) => {
  res.status(200).json({
    status: "ok",
    message: "Token valid",
    user: req.user
  });
});

export default router;
