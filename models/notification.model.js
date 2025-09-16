import mongoose from "mongoose";

const notificationSchema = new mongoose.Schema({
  type: {
    type: String,
    enum: ["new_order", "payment_received", "order_cancelled", "status_update"],
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
    required: true
  },
  customerName: {
    type: String,
    required: true
  },
  orderAmount: {
    type: Number,
    required: true
  },
  paymentMethod: {
    type: String,
    enum: ["ONLINE", "COD"],
    required: true
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

export const NotificationModel = mongoose.model("Notification", notificationSchema);