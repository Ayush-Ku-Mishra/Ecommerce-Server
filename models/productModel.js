import mongoose from "mongoose";

const productSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: [true, "Product name is required"],
      trim: true,
    },
    productDetails: {
      type: Map,
      of: String,
      required: true,
    },
    images: [
      {
        type: String,
        required: true,
      },
    ],
    brand: {
      type: String,
      default: "",
    },
    price: {
      type: Number,
      default: 0,
    },
    oldPrice: {
      type: Number,
      default: 0,
    },
    categoryName: {
      type: String,
      default: "",
    },
    categoryId: {
      type: String,
      default: "",
    },
    subCatId: {
      type: String,
      default: "",
    },
    subCatName: {
      type: String,
      default: "",
    },
    thirdSubCatId: {
      type: String,
      default: "",
    },
    thirdSubCatName: {
      type: String,
      default: "",
    },
    /** Added fields for fourth subcategory */
    fourthSubCatId: {
      type: String,
      default: "",
    },
    fourthSubCatName: {
      type: String,
      default: "",
    },
    category: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Category",
    },
    stock: {
      type: Number,
      required: true,
    },
    rating: {
      type: Number,
      default: 0,
    },
    isFeatured: {
      type: Boolean,
      default: false,
    },
    discount: {
      type: Number,
      required: true,
    },
    color: { type: String, required: true },

    // Three separate size types
    dressSizes: [
      {
        size: String, // e.g., "XS", "S", "M", "L", "XL"
        stock: Number,
      },
    ],
    shoesSizes: [
      {
        size: String, // e.g., "6", "7", "8", "9", "10"
        stock: Number,
      },
    ],
    freeSize: {
      type: String,
      enum: ["yes", "no"],
      default: "no",
    },
    weight: [
      {
        type: String,
        default: null,
      },
    ],
    colorVariants: [
      {
        colorName: { type: String, required: true },
        name: {
          type: String,
          default: "",
        },
        images: [
          {
            type: String,
            required: true,
          },
        ],
        price: {
          type: Number,
          default: 0,
        },
        oldPrice: { type: Number, default: 0 },
        stock: { type: Number, required: true },
        discount: { type: Number, default: 0 },
        dressSizes: [
          {
            size: String,
            stock: Number,
          },
        ],
        shoesSizes: [
          {
            size: String,
            stock: Number,
          },
        ],
        freeSize: {
          type: String,
          enum: ["yes", "no"],
          default: "no",
        },
        weight: [
          {
            type: String,
            default: null,
          },
        ],
        brand: { type: String, default: "" },
        rating: { type: Number, default: 0 },
        isFeatured: { type: Boolean, default: false },
        productDetails: {
          type: Map,
          of: String,
          default: {},
        },
        isMainVariant: {
          type: Boolean,
          default: false,
        },
      },
    ],
    sizeChartId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "SizeChart",
      default: null,
    },

    createdAt: {
      type: Date,
      default: Date.now,
    },
  },
  {
    timestamps: true,
  }
);

const ProductModel = mongoose.model("Product", productSchema);

export default ProductModel;
