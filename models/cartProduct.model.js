import mongoose from "mongoose";

const cartProductSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    productId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Product",
      required: true,
    },
    quantity: {
      type: Number,
      default: 1,
      min: 1,
    },
    selectedSize: {
      type: String,
      default: null, // For products without size variants
    },
    selectedColor: {
      type: String,
      default: null,
    },
    variantId: {
      type: String, // To handle different product variants
      default: null,
    },
    price: {
      type: Number,
      required: true,
    },
    originalPrice: {
      type: Number,
      required: true,
    },
    // Store product details for faster cart loading
    productName: {
      type: String,
      required: true,
    },
    productBrand: {
      type: String,
      default: "",
    },
    productImage: {
      type: String,
      default: "",
    },
    discount: {
      type: String,
      default: "",
    },
  },
  {
    timestamps: true,
  }
);

// Compound index to prevent duplicate cart items with same product, size, and color
cartProductSchema.index({ 
  userId: 1, 
  productId: 1, 
  selectedSize: 1, 
  selectedColor: 1, 
  variantId: 1 
}, { unique: true });

const CartProductModel = mongoose.model("cartProduct", cartProductSchema);
export default CartProductModel;