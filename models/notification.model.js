import mongoose from "mongoose";

const notificationSchema = new mongoose.Schema({
  type: {
    type: String,
    enum: [
      "new_order", 
      "payment_received", 
      "order_cancelled", 
      "status_update",
      "new_return",
      "return_updated",
      "return_cancelled"
    ],
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
    default: "Customer"
  },
  orderAmount: {
    type: Number,
    default: 0
  },
  paymentMethod: {
    type: String,
    enum: ["ONLINE", "COD", null],
    default: null
  },
  // Add fields for return notifications
  returnId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "return",
    default: null
  },
  returnType: {
    type: String,
    enum: ["refund", "exchange", null],
    default: null
  },
  returnStatus: {
    type: String,
    default: null
  },
  isRead: {
    type: Boolean,
    default: false
  }
}, {
  timestamps: true // This replaces your manual createdAt field
});

export const NotificationModel = mongoose.model("Notification", notificationSchema);