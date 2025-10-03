import mongoose from "mongoose";

const returnSchema = new mongoose.Schema(
  {
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true
    },
    orderId: {
      type: String,
      required: true
    },
    order: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "order",
      required: true
    },
    returnType: {
      type: String,
      enum: ["refund", "exchange"],
      required: true
    },
    reason: {
      type: String,
      required: true
    },
    products: [
      {
        productId: {
          type: String,
          required: true
        },
        name: {
          type: String,
          required: true
        },
        price: {
          type: Number,
          required: true
        },
        quantity: {
          type: Number,
          required: true
        },
        currentSize: {
          type: String,
          required: true
        },
        newSize: {
          type: String,
          default: null
        }
      }
    ],
    status: {
      type: String,
      enum: ["draft", "submitted", "processing", "pickup_scheduled", "picked_up", "completed", "cancelled"],
      default: "draft"
    },
    refund_amount: {
      type: Number,
      default: 0
    },
    refund_id: {
      type: String,
      default: null
    },
    tracking_id: {
      type: String,
      default: null
    },
    submitted_at: Date,
    processing_at: Date,
    pickup_scheduled_at: Date,
    picked_up_at: Date,
    completed_at: Date,
    cancelled_at: Date,
    cancellation_reason: String
  },
  { timestamps: true }
);

const ReturnModel = mongoose.model("return", returnSchema);
export default ReturnModel;