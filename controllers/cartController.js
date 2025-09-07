import ErrorHandler from "../middlewares/error.js";
import { catchAsyncError } from "../middlewares/catchAsyncError.js";
import { User } from "../models/userModel.js";
import CartProductModel from "../models/cartProduct.model.js";

export const addToCartItemController = catchAsyncError(
  async (req, res, next) => {
    try {
      const userId = req.user._id;
      const productId = req.body.productId;

      console.log("userId:", userId);
      if (!userId) {
        return res.status(401).json({ message: "Unauthorized" });
      }

      if (!productId) {
        return res.status(400).json({
          message: "ProductId is required",
          error: true,
          success: false,
        });
      }

      const userExists = await User.exists({ _id: userId });
      if (!userExists) {
        return res.status(404).json({ message: "User not found" });
      }

      const checkItemCart = await CartProductModel.findOne({
        userId,
        productId,
      });
      if (checkItemCart) {
        return res.status(409).json({
          message: "Item already in cart",
          error: true,
          success: false,
        });
      }

      const cartItem = new CartProductModel({ productId, userId, quantity: 1 });
      const save = await cartItem.save();

      const updatedUser = await User.findByIdAndUpdate(
        userId,
        { $push: { shopping_cart: save._id } },
        { new: true }
      );

      console.log("Updated user shopping_cart:", updatedUser.shopping_cart);

      return res.status(200).json({
        message: "Item added to cart",
        error: false,
        success: true,
        data: save,
      });
    } catch (error) {
      console.error("Add to cart error:", error);
      return next(
        new ErrorHandler("Failed to add item to cart. Please try again.", 500)
      );
    }
  }
);

export const getCartController = catchAsyncError(async (req, res, next) => {
  try {
    const userId = req.user._id; // fix: get userId from req.user

    const cartItems = await CartProductModel.find({ userId: userId }).populate(
      "productId"
    );

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

      if(!cartItemId || !quantity) {
        return res.status(400).json({
          message: "cartItemId and quantity are required",
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
      cartItem.quantity = quantity;
      await cartItem.save();

      return res.status(200).json({
        message: "Cart item quantity updated successfully",
        error: false,
        success: true,
        data: cartItem,
      });
    } catch (error) {
      console.error("Update cart item quantity error:", error); // detailed log
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

      // Fetch user document to find the index of cartItemId in shopping_cart array
      const user = await User.findById(userId).select('shopping_cart');
      const indexDeleted = user.shopping_cart.findIndex(
        (id) => id.toString() === cartItemId
      );

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
        deletedIndex: indexDeleted, // zero-based index
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


