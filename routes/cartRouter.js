import express from "express";
import { isAuthenticated } from "../middlewares/auth.js";
import {
  addToCartItemController, 
  getCartController, 
  updateCartItemQuantityController, 
  deleteCartItemController,
  syncCartController,
  emptyCartController,
  clearCartController
} from "../controllers/cartController.js";

const CartRouter = express.Router();

CartRouter.post("/createCart", isAuthenticated, addToCartItemController);
CartRouter.get("/getCartItems", isAuthenticated, getCartController);
CartRouter.put("/updateQuantity", isAuthenticated, updateCartItemQuantityController);
CartRouter.delete("/deleteCartItem", isAuthenticated, deleteCartItemController);
CartRouter.post("/syncCart", isAuthenticated, syncCartController); // New sync route
CartRouter.delete("/emptyCart/:id", isAuthenticated, emptyCartController);
CartRouter.delete("/clearCart", isAuthenticated, clearCartController);

export default CartRouter;