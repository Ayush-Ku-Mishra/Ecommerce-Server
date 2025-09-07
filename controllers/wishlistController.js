import WishlistModel from '../models/wishlistModel.js'
import ErrorHandler from "../middlewares/error.js";
import { catchAsyncError } from "../middlewares/catchAsyncError.js";

export const addToWishlistController = catchAsyncError(async (req, res, next) => {
  try {
    const userId = req.user._id;  // get from authenticated user
    const {
      productId,
      productTitle,
      image,
      rating,
      price,
      discount,
      oldPrice,
      brand,
    } = req.body;

    // Validate required fields
    if (
      !productId ||
      !productTitle ||
      !image ||
      rating == null || 
      price == null ||
      discount == null ||
      oldPrice == null ||
      !brand
    ) {
      return res.status(400).json({
        message: "All product fields are required",
        error: true,
        success: false,
      });
    }

    // Check if item already in wishlist for this user
    const alreadyExists = await WishlistModel.findOne({ userId, productId });

    if (alreadyExists) {
      return res.status(409).json({
        message: "Item already in wishlist",
        error: true,
        success: false,
      });
    }

    // Create a new wishlist item
    const wishlistItem = new WishlistModel({
      userId,
      productId,
      productTitle,
      image,
      rating,
      price,
      discount,
      oldPrice,
      brand,
    });

    await wishlistItem.save();

    return res.status(201).json({
      message: "Item added to wishlist successfully",
      error: false,
      success: true,
      data: wishlistItem,
    });
  } catch (error) {
    console.error("Add to wishlist error:", error);
    return next(
      new ErrorHandler("Failed to add item to wishlist. Please try again.", 500)
    );
  }
});


export const deleteFromWishlistController = catchAsyncError(async (req, res, next) => {
  try {
    const userId = req.user._id;
    const wishlistItemId = req.params.id;

    if (!wishlistItemId) {
      return res.status(400).json({
        message: "Wishlist item id is required",
        error: true,
        success: false,
      });
    }

    // Find wishlist item by ID and userId (ownership check)
    const wishlistItem = await WishlistModel.findOne({ _id: wishlistItemId, userId: userId });

    if (!wishlistItem) {
      return res.status(404).json({
        message: "Item not found in wishlist",
        error: true,
        success: false,
      });
    }

    // Delete the wishlist item
    await wishlistItem.deleteOne();

    return res.status(200).json({
      message: "Item removed from wishlist successfully",
      error: false,
      success: true,
    });

  } catch (error) {
    console.error("Delete from wishlist error:", error);
    return next(
      new ErrorHandler("Failed to remove item from wishlist. Please try again.", 500)
    );
  }
});


export const getWishlistController = catchAsyncError(async (req, res, next) => {
  try {
    const userId = req.user._id;

    // Find all wishlist items for authenticated user
    const wishlistItems = await WishlistModel.find({ userId }).lean();

    return res.status(200).json({
      message: "Wishlist fetched successfully",
      error: false,
      success: true,
      data: wishlistItems,
    });
  } catch (error) {
    console.error("Get wishlist error:", error);
    return next(new ErrorHandler("Failed to fetch wishlist. Please try again.", 500));
  }
});
