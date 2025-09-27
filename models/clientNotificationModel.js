import mongoose from "mongoose";

const clientNotificationSchema = new mongoose.Schema({
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "User",
    required: true
  },
  type: {
    type: String,
    enum: ["order_placed", "order_shipped", "order_delivered", "order_cancelled", "offer", "general"],
    required: true
  },
  title: {
    type: String,
    required: true
  },
  message: {
    type: String,
    required: true
  },
  orderId: {
    type: String,
    required: false // Not all notifications are order-related
  },
  link: {
    type: String,
    required: false // Optional link to redirect user
  },
  isRead: {
    type: Boolean,
    default: false
  },
  createdAt: {
    type: Date,
    default: Date.now
  }
});

export const ClientNotificationModel = mongoose.model("ClientNotification", clientNotificationSchema);