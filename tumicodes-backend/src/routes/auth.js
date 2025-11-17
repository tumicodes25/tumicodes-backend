import express from "express";
const router = express.Router();

// Example route
router.post("/login", (req, res) => {
  res.send("Login route works!");
});

router.post("/register", (req, res) => {
  res.send("Register route works!");
});

export default router;
