import mongoose from "mongoose";

const addressSchema = new mongoose.Schema(
  {
    address_line: {
      type: String,
      default: "",
    },
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    name: {
      type: String,
      required: true,
    }, // Name of the recipient
    phone: {
      type: String,
      required: true,
    }, // Mobile number
    locality: {
      type: String,
      required: true,
    },
    city: {
      type: String,
      required: true,
    },
    state: {
      type: String,
      required: true,
    },
    pincode: {
      type: String,
      required: true,
    },
    status: {
      type: Boolean,
      default: true,
    },
    default: {
      type: Boolean,
      default: false,
    }, // Default shipping address
    type: {
      type: String,
      enum: ["Home", "Work"],
      default: "Home",
    },
  },
  {
    timestamps: true,
  }
);

const AddressModel = mongoose.model("address", addressSchema);
export default AddressModel;
