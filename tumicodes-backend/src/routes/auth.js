import express from "express";
import authMiddleware from "../middleware/authMiddleware.js";

const router = express.Router();
// Example route
router.post("/login", (req, res) => {
  res.send("Login route works!");
});

router.post("/register", (req, res) => {
  res.send("Register route works!");
});

export default router;

// 🔥 VERIFY TOKEN ENDPOINT (dashboard uses this)
router.get("/verify", authMiddleware, (req, res) => {
    res.status(200).json({
        status: "ok",
        message: "Token valid",
        user: req.user
    });
});

export default router;
