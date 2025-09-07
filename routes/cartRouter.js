import express from "express";
import { isAuthenticated } from "../middlewares/auth.js";
import {addToCartItemController, getCartController, updateCartItemQuantityController, deleteCartItemController} from "../controllers/cartController.js";

const CartRouter = express.Router();

CartRouter.post("/createCart", isAuthenticated, addToCartItemController);
CartRouter.get("/getCartItems", isAuthenticated, getCartController);
CartRouter.put("/updateQuantity", isAuthenticated, updateCartItemQuantityController);
CartRouter.delete("/deleteCartItem", isAuthenticated, deleteCartItemController);



export default CartRouter;
