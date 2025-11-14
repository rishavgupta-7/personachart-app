import express from "express";
import http from "http";
import { Server } from "socket.io";
import dotenv from "dotenv";
import cors from "cors";
import mongoose from "mongoose";
import jwt from "jsonwebtoken";
import connectDB from "./config/db.js";
import authRoutes from "./routes/authRoutes.js";
import User from "./models/User.js";
import Message from "./models/Message.js";

dotenv.config();
connectDB();

// --- EXPRESS APP ---
const app = express();
app.use(cors({ origin: "http://localhost:3000", credentials: true }));
app.use(express.json());
app.use("/api/auth", authRoutes);

app.get("/", (req, res) => res.send("✅ Server is running"));

// --- HTTP SERVER ---
const server = http.createServer(app);

// --- SOCKET.IO ---
const io = new Server(server, {
  cors: { origin: "http://localhost:3000", methods: ["GET", "POST"], credentials: true },
});

// --- SOCKET AUTH ---
io.use(async (socket, next) => {
  try {
    const token = socket.handshake.auth.token;
    if (!token) return next(new Error("No token provided"));

    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    socket.userId = decoded.id;
    next();
  } catch (err) {
    console.log("❌ Socket auth failed:", err.message);
    next(new Error("Authentication error"));
  }
});

// --- SOCKET CONNECTION ---
io.on("connection", async (socket) => {
  const userId = socket.userId;

  try {
    await User.findByIdAndUpdate(userId, { socketId: socket.id });
    console.log(`🟢 User ${userId} connected (socket: ${socket.id})`);
  } catch (err) {
    console.error("Socket update error:", err.message);
  }

  // --- SEND MESSAGE ---
  socket.on("sendMessage", async ({ receiverPhone, text }) => {
    try {
      const senderId = socket.userId;
      const receiver = await User.findOne({ phoneNumber: receiverPhone });
      if (!receiver) return;

      const message = await Message.create({
        senderId,
        receiverId: receiver._id,
        text,
      });

      // Full payload
      const payload = {
        _id: message._id,
        senderId,
        receiverId: message.receiverId,
        text,
        createdAt: message.createdAt,
      };

      // Emit to receiver if online
      if (receiver.socketId) io.to(receiver.socketId).emit("receiveMessage", payload);

      // Emit to sender
      io.to(socket.id).emit("receiveMessage", payload);
    } catch (err) {
      console.error("Send message error:", err.message);
    }
  });

  // --- DISCONNECT ---
  socket.on("disconnect", async () => {
    try {
      await User.findByIdAndUpdate(socket.userId, { socketId: "" });
      console.log(`🔴 User ${socket.userId} disconnected`);
    } catch (err) {
      console.error("Disconnect error:", err.message);
    }
  });
});

// --- FETCH MESSAGES ---
app.get("/api/messages/:otherUserId", async (req, res) => {
  const currentUserId = req.query.currentUserId;
  const otherUserId = req.params.otherUserId;

  if (!mongoose.Types.ObjectId.isValid(currentUserId) || !mongoose.Types.ObjectId.isValid(otherUserId)) {
    return res.status(400).json({ message: "Invalid user IDs" });
  }

  try {
    const messages = await Message.find({
      $or: [
        { senderId: currentUserId, receiverId: otherUserId },
        { senderId: otherUserId, receiverId: currentUserId },
      ],
    })
      .sort({ createdAt: 1 })
      .select("_id senderId receiverId text createdAt"); // only necessary fields

    res.json(messages);
  } catch (err) {
    console.error("Fetch messages error:", err.message);
    res.status(500).json({ message: "Server error" });
  }
});

// --- START SERVER ---
const PORT = process.env.PORT || 5000;
server.listen(PORT, () => console.log(`🚀 Server running on port ${PORT}`));
