// src/server.js
import express from "express";
import cors from "cors";
import rateLimit from "express-rate-limit";
import dotenv from "dotenv";
import connectDB from "./config/db.js"; // Must be default export

// Load env variables
dotenv.config();

const app = express();

// ====== TRUST PROXY (for Render/Vercel) ======
app.set("trust proxy", 1);

// ====== Connect to MongoDB ======
connectDB();

// ====== Middleware ======
app.use(cors());
app.use(express.json());

// ====== Rate Limiter ======
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 min
  max: 200,
  message: { error: "Too many requests, try later" },
  standardHeaders: true,
  legacyHeaders: false,
});
app.use(limiter);

// ====== Health Check ======
app.get("/", (req, res) => {
  res.json({ status: "OK", service: "TumiCodes Backend" });
});

// ====== Routes ======
import authRoutes from "./routes/auth.js";
import coursesRoutes from "./routes/courses.js";
import usersRoutes from "./routes/users.js";
import contactRoutes from "./routes/contact.js";
import adminRoutes from "./routes/admin.js";

app.use("/api/auth", authRoutes);
app.use("/api/courses", coursesRoutes);
app.use("/api/users", usersRoutes);
app.use("/api/contact", contactRoutes);
app.use("/api/admin", adminRoutes);

// ====== 404 ======
app.use((req, res) => {
  res.status(404).json({ error: "Route not found" });
});

// ====== Global Error Handler ======
app.use((err, req, res, next) => {
  console.error("SERVER ERROR:", err);
  res.status(500).json({ error: "Internal server error", message: err.message });
});

// ====== Start Server ======
const PORT = process.env.PORT || 5000;
app.listen(PORT, () => console.log(`🚀 Server running on port ${PORT}`));
