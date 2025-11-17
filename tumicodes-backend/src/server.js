// src/server.js
import express from "express";
import cors from "cors";
import rateLimit from "express-rate-limit";
import dotenv from "dotenv";
import connectDB from "./config/db.js"; // Make sure this file exports default connectDB

// Load environment variables
dotenv.config();

const app = express();

// ====== REQUIRED FOR HOSTING BEHIND PROXY (Render, Vercel, etc.) ======
app.set("trust proxy", 1);

// ====== Connect to MongoDB ======
connectDB();

// ====== Middleware ======
app.use(cors());
app.use(express.json());

// ====== Rate Limiter ======
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 200, // max 200 requests per IP
  message: { error: "Too many requests, please try again later." },
  standardHeaders: true,
  legacyHeaders: false,
});
app.use(limiter);

// ====== Health Check Route ======
app.get("/", (req, res) => {
  res.json({
    status: "OK",
    service: "TumiCodes Backend",
    timestamp: new Date().toISOString(),
  });
});

// ====== Import Routes ======
import authRoutes from "./routes/auth.js";
import coursesRoutes from "./routes/courses.js";
import usersRoutes from "./routes/users.js";
import contactRoutes from "./routes/contact.js";
import adminRoutes from "./routes/admin.js";

// ====== Mount Routes ======
app.use("/api/auth", authRoutes);
app.use("/api/courses", coursesRoutes);
app.use("/api/users", usersRoutes);
app.use("/api/contact", contactRoutes);
app.use("/api/admin", adminRoutes);

// ====== 404 Route ======
app.use((req, res, next) => {
  res.status(404).json({ error: "Route not found" });
});

// ====== Global Error Handler ======
app.use((err, req, res, next) => {
  console.error("SERVER ERROR:", err);
  res.status(500).json({
    error: "Internal server error",
    message: err.message,
  });
});

// ====== Start Server ======
const PORT = process.env.PORT || 5000;
app.listen(PORT, () => {
  console.log(`🚀 Server running on port ${PORT}`);
});
