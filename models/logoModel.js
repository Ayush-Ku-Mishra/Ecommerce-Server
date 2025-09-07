import mongoose from "mongoose";

const logoSchema = new mongoose.Schema({
  name: {
    type: String,
    required: true,
    default: "Untitled Logo"
  },
  url: {
    type: String,
    required: true
  },
  uploadedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "User",
    required: true
  },
  createdAt: {
    type: Date,
    default: Date.now
  },
  updatedAt: {
    type: Date,
    default: Date.now
  }
});

export const Logo = mongoose.model("Logo", logoSchema);