import express from "express";
import { isAuthenticated } from "../middlewares/auth.js";
import { addToWishlistController, deleteFromWishlistController, getWishlistController } from "../controllers/wishlistController.js"; // named imports

const WishlistRouter = express.Router();

WishlistRouter.post("/createWishlist", isAuthenticated, addToWishlistController);
WishlistRouter.delete("/deleteWishlist/:id", isAuthenticated, deleteFromWishlistController);
WishlistRouter.get("/getWishlist", isAuthenticated, getWishlistController);

export default WishlistRouter;
