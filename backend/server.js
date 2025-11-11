import express from "express";
import http from "http";
import { Server } from "socket.io";
import dotenv from "dotenv";
import cors from "cors";
import connectDB from "./config/db.js";
import authRoutes from "./routes/authRoutes.js";
import User from "./models/User.js"; // ✅ no curly braces
import mongoose from "mongoose";



dotenv.config();
connectDB();

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: { origin: "*" },
});

app.use(cors());
app.use(express.json());
app.use("/api/auth", authRoutes);

app.get("/", (req, res) => {
  res.send("✅ Server is running fine!");
});


// SOCKET.IO CONNECTION
io.on("connection", async (socket) => {
  const userId = socket.handshake.query.userId;

  // Validate userId
  if (userId && mongoose.Types.ObjectId.isValid(userId)) {
    try {
      await User.findByIdAndUpdate(userId, { socketId: socket.id });
      console.log(`🟢 User ${userId} connected with socket ${socket.id}`);
    } catch (err) {
      console.error("Socket.IO update error:", err.message);
    }
  } else {
    console.log("⚠️  UserId is missing or invalid for socket:", socket.id);
  }

  socket.on("disconnect", async () => {
    try {
      await User.findOneAndUpdate({ socketId: socket.id }, { socketId: "" });
      console.log(`🔴 Socket ${socket.id} disconnected`);
    } catch (err) {
      console.error("Socket.IO disconnect error:", err.message);
    }
  });
});

const PORT = process.env.PORT || 5000;
server.listen(PORT, () => console.log(`🚀 Server running on port ${PORT}`));
