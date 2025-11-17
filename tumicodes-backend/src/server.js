import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import connectDB from "./config/db.js";

dotenv.config();
const app = express();

// Middlewares
app.use(cors());
app.use(express.json());

// Database connection
connectDB();

// Routes
import authRoutes from "./routes/auth.js";
import coursesRoutes from "./routes/courses.js";
import usersRoutes from "./routes/users.js";

app.use("/api/auth", authRoutes);
app.use("/api/courses", coursesRoutes);
app.use("/api/users", usersRoutes);

// Health check
app.get("/", (req, res) => {
  res.json({ status: "OK", service: "TumiCodes Backend" });
});

// Start server
const PORT = process.env.PORT || 5000;
app.listen(PORT, () => {
  console.log(`🚀 Server running on port ${PORT}`);
});
