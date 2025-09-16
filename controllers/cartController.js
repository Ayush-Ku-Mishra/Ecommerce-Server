import ErrorHandler from "../middlewares/error.js";
import { catchAsyncError } from "../middlewares/catchAsyncError.js";
import { User } from "../models/userModel.js";
import CartProductModel from "../models/cartProduct.model.js";

export const addToCartItemController = catchAsyncError(
  async (req, res, next) => {
    try {
      const userId = req.user._id;
      const { 
        productId, 
        quantity = 1, 
        selectedSize, 
        selectedColor, 
        variantId,
        price,
        originalPrice,
        productName,
        productBrand,
        productImage,
        discount
      } = req.body;

      console.log("Add to cart request:", req.body);

      if (!userId) {
        return res.status(401).json({ message: "Unauthorized" });
      }

      if (!productId || !price || !originalPrice || !productName) {
        return res.status(400).json({
          message: "Required fields missing: productId, price, originalPrice, productName",
          error: true,
          success: false,
        });
      }

      const userExists = await User.exists({ _id: userId });
      if (!userExists) {
        return res.status(404).json({ message: "User not found" });
      }

      // Check if item already exists in cart (considering size, color, and variant)
      const existingCartItem = await CartProductModel.findOne({
        userId,
        productId,
        selectedSize: selectedSize || null,
        selectedColor: selectedColor || null,
        variantId: variantId || null,
      });

      if (existingCartItem) {
        // Update quantity if item already exists
        existingCartItem.quantity += Number(quantity);
        await existingCartItem.save();

        return res.status(200).json({
          message: "Cart item quantity updated",
          error: false,
          success: true,
          data: existingCartItem,
        });
      }

      // Create new cart item
      const cartItem = new CartProductModel({
        userId,
        productId,
        quantity: Number(quantity),
        selectedSize: selectedSize || null,
        selectedColor: selectedColor || null,
        variantId: variantId || null,
        price: Number(price),
        originalPrice: Number(originalPrice),
        productName,
        productBrand: productBrand || "",
        productImage: productImage || "",
        discount: discount || "",
      });

      const savedCartItem = await cartItem.save();

      // Update user's shopping_cart array
      const updatedUser = await User.findByIdAndUpdate(
        userId,
        { $push: { shopping_cart: savedCartItem._id } },
        { new: true }
      );

      console.log("Updated user shopping_cart:", updatedUser.shopping_cart);

      return res.status(200).json({
        message: "Item added to cart",
        error: false,
        success: true,
        data: savedCartItem,
      });
    } catch (error) {
      console.error("Add to cart error:", error);
      if (error.code === 11000) {
        return res.status(409).json({
          message: "Item already in cart",
          error: true,
          success: false,
        });
      }
      return next(
        new ErrorHandler("Failed to add item to cart. Please try again.", 500)
      );
    }
  }
);

export const getCartController = catchAsyncError(async (req, res, next) => {
  try {
    const userId = req.user._id;

    const cartItems = await CartProductModel.find({ userId: userId })
      .populate("productId")
      .sort({ createdAt: -1 }); // Show newest items first

    return res.status(200).json({
      message: "Cart fetched successfully",
      error: false,
      success: true,
      data: cartItems,
    });
  } catch (error) {
    console.error("Get cart error:", error);
    return next(new ErrorHandler("Failed to get cart. Please try again.", 500));
  }
});

export const updateCartItemQuantityController = catchAsyncError(
  async (req, res, next) => {
    try {
      const userId = req.user._id;
      const { cartItemId, quantity } = req.body;

      if (!cartItemId || !quantity || quantity < 1) {
        return res.status(400).json({
          message: "cartItemId and valid quantity (>=1) are required",
          error: true,
          success: false,
        });
      }

      // Find the cart item to update and confirm it belongs to the user
      const cartItem = await CartProductModel.findOne({
        _id: cartItemId,
        userId: userId,
      });

      if (!cartItem) {
        return res.status(404).json({
          message: "Cart item not found for this user",
          error: true,
          success: false,
        });
      }

      // Update quantity
      cartItem.quantity = Number(quantity);
      await cartItem.save();

      return res.status(200).json({
        message: "Cart item quantity updated successfully",
        error: false,
        success: true,
        data: cartItem,
      });
    } catch (error) {
      console.error("Update cart item quantity error:", error);
      return next(
        new ErrorHandler(
          "Failed to update cart item quantity. Please try again.",
          500
        )
      );
    }
  }
);

export const deleteCartItemController = catchAsyncError(
  async (req, res, next) => {
    try {
      const userId = req.user._id;
      const { cartItemId } = req.body;

      if (!cartItemId) {
        return res.status(400).json({
          message: "cartItemId is required",
          error: true,
          success: false,
        });
      }

      // Find the cart item and confirm it belongs to the user
      const cartItem = await CartProductModel.findOne({
        _id: cartItemId,
        userId: userId,
      });

      if (!cartItem) {
        return res.status(404).json({
          message: "Cart item not found for this user",
          error: true,
          success: false,
        });
      }

      // Remove cart item document
      await cartItem.deleteOne();

      // Remove the cart item reference from the user's shopping_cart array
      await User.updateOne(
        { _id: userId },
        { $pull: { shopping_cart: cartItemId } }
      );

      return res.status(200).json({
        message: "Cart item deleted successfully",
        error: false,
        success: true,
        data: cartItem,
      });
    } catch (error) {
      console.error("Delete cart item error:", error);
      return next(
        new ErrorHandler(
          "Failed to delete cart item. Please try again.",
          500
        )
      );
    }
  }
);

// Additional controller to sync frontend cart with backend
export const syncCartController = catchAsyncError(async (req, res, next) => {
  try {
    const userId = req.user._id;
    const { cartItems } = req.body; // Array of cart items from frontend

    if (!Array.isArray(cartItems)) {
      return res.status(400).json({
        message: "cartItems must be an array",
        error: true,
        success: false,
      });
    }

    // Clear existing cart items for this user
    await CartProductModel.deleteMany({ userId });
    
    // Remove all cart references from user
    await User.findByIdAndUpdate(
      userId,
      { $set: { shopping_cart: [] } },
      { new: true }
    );

    const syncedItems = [];

    // Add each item to the backend cart
    for (const item of cartItems) {
      if (item.id && item.title && item.price && item.originalPrice) {
        const cartItem = new CartProductModel({
          userId,
          productId: item.id.split('_')[0], // Extract base product ID
          quantity: Number(item.quantity || 1),
          selectedSize: item.selectedSize || null,
          selectedColor: item.color || null,
          variantId: item.id,
          price: Number(item.price),
          originalPrice: Number(item.originalPrice),
          productName: item.title,
          productBrand: item.brand || "",
          productImage: item.image || "",
          discount: item.discount || "",
        });

        const savedItem = await cartItem.save();
        syncedItems.push(savedItem);

        // Update user's shopping_cart array
        await User.findByIdAndUpdate(
          userId,
          { $push: { shopping_cart: savedItem._id } },
          { new: true }
        );
      }
    }

    return res.status(200).json({
      message: "Cart synced successfully",
      error: false,
      success: true,
      data: syncedItems,
    });
  } catch (error) {
    console.error("Sync cart error:", error);
    return next(
      new ErrorHandler("Failed to sync cart. Please try again.", 500)
    );
  }
});

export const emptyCartController = async (request, response) => {
  try {
    const userId = request.params.id; // middleware

    await CartProductModel.deleteMany({ userId: userId });

    return response.status(200).json({
      error: false,
      success: true,
    });
  } catch (error) {
    console.error('Error emptying cart:', error);
    return response.status(500).json({
      error: true,
      success: false,
      message: 'Failed to empty the cart',
      details: error.message,
    });
  }
};

export const clearCartController = catchAsyncError(async (req, res, next) => {
  try {
    const userId = req.user._id;

    if (!userId) {
      return res.status(401).json({ message: "Unauthorized" });
    }

    // Delete all cart items for the user
    await CartProductModel.deleteMany({ userId: userId });

    // Clear user's shopping_cart array
    await User.findByIdAndUpdate(
      userId,
      { $set: { shopping_cart: [] } },
      { new: true }
    );

    return res.status(200).json({
      message: "Cart cleared successfully",
      error: false,
      success: true,
    });
  } catch (error) {
    console.error("Clear cart error:", error);
    return next(new ErrorHandler("Failed to clear cart. Please try again.", 500));
  }
});
