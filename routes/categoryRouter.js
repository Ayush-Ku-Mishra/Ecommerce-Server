import express from "express";
import { isAuthenticated } from "../middlewares/auth.js";
import upload from "../middlewares/multer.js";
import {
  createCategory,
  getCategories,
  uploadImages,
  getCategoriesCount,
  getSubCategoriesCount,
  getSingleCategory,
  removeImageFromCloudinary,
  deleteCategory,
  updateCategory,
} from "../controllers/categoryController.js";

const CategoryRouter = express.Router();

// Upload images only route with file upload
CategoryRouter.post(
  "/upload-images",
  isAuthenticated,
  upload.array("images"),
  uploadImages
);

CategoryRouter.post("/createCategory", isAuthenticated, createCategory);

CategoryRouter.get("/get-categories", getCategories);

CategoryRouter.get("/get/count", getCategoriesCount);
CategoryRouter.get("/get/count/subCat", getSubCategoriesCount);
CategoryRouter.get("/:id", getSingleCategory);

CategoryRouter.delete(
  "/deleteImage",
  isAuthenticated,
  removeImageFromCloudinary
);
CategoryRouter.delete("/:id", isAuthenticated, deleteCategory);
CategoryRouter.put("/:id", isAuthenticated, updateCategory);

export default CategoryRouter;
