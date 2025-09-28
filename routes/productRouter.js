import express from "express";
import { isAuthenticated } from "../middlewares/auth.js";
import upload from "../middlewares/multer.js";
import {
  uploadImages,
  createProduct,
  getAllProducts,
  getAllProductsByCatId,
  getAllProductsByCatName,
  getAllProductsBySubCatid,
  getAllProductsBySubCatName,
  getAllProductsByThirdSubCatName,
  getAllProductsByThirdSubCatid,
  getAllProductsByFourthSubCatId,
  getAllProductsByFourthSubCatName,
  getAllProductsByPrice,
  getAllProductsByRating,
  getProductsCount,
  getAllFeaturedProducts,
  deleteProduct,
  getProduct,
  removeImageFromCloudinary,
  updateProduct,
  getRelatedProducts,
  getSearchSuggestions,
  searchProducts,
  getPopularSearches,
} from "../controllers/productController.js";

const ProductRouter = express.Router();

ProductRouter.post(
  "/upload-images",
  isAuthenticated,
  upload.array("images"),
  uploadImages
);
ProductRouter.post("/create", isAuthenticated, createProduct);
ProductRouter.get("/getAllProducts", getAllProducts);

ProductRouter.get("/getAllProductsByCatId/:id", getAllProductsByCatId);
ProductRouter.get("/getAllProductsByCatName", getAllProductsByCatName);

ProductRouter.get("/getAllProductsBySubCatId/:id", getAllProductsBySubCatid);
ProductRouter.get("/getAllProductsBySubCatName", getAllProductsBySubCatName);

ProductRouter.get(
  "/getAllProductsByThirdSubCatId/:id",
  getAllProductsByThirdSubCatid
);
ProductRouter.get(
  "/getAllProductsByThirdSubCatName",
  getAllProductsByThirdSubCatName
);

ProductRouter.get(
  "/getAllProductsByFourthSubCatId/:id",
  getAllProductsByFourthSubCatId
);
ProductRouter.get(
  "/getAllProductsByFourthSubCatName",
  getAllProductsByFourthSubCatName
);

ProductRouter.get("/getAllProductsByPrice", getAllProductsByPrice);
ProductRouter.get("/getAllProductsByRating", getAllProductsByRating);
ProductRouter.get("/getProductsCount", getProductsCount);
ProductRouter.get("/getAllFeaturedProducts", getAllFeaturedProducts);
ProductRouter.delete("/deleteProduct/:id", isAuthenticated, deleteProduct);
ProductRouter.get("/getProduct/:id", getProduct);
ProductRouter.delete(
  "/deleteImage",
  isAuthenticated,
  removeImageFromCloudinary
);
ProductRouter.put("/update/:id", isAuthenticated, updateProduct);
ProductRouter.get("/getRelatedProducts", isAuthenticated, getRelatedProducts);

ProductRouter.get("/search-suggestions", getSearchSuggestions);
ProductRouter.get("/search", searchProducts);

// ProductRouter.get("/brands", getAvailableBrands);
ProductRouter.get("/popular-searches", getPopularSearches);
// ProductRouter.get("/filter-options", getFilterOptions);

export default ProductRouter;