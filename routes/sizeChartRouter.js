import express from "express";
import { isAuthenticated } from "../middlewares/auth.js";
import upload from "../middlewares/multer.js";
import {
  uploadImages,
  createSizeChart,
  getSizeCharts,
  getSizeChartById,
  updateSizeChart,
  deleteSizeChart,
  removeImageFromCloudinary,
  getSizeChartByUnit,
  getAllSizeChartsWithUnit,
} from "../controllers/sizeChartController.js";

const SizeChartRouter = express.Router();

// Upload images for size chart (protected)
SizeChartRouter.post(
  "/upload-images",
  isAuthenticated,
  upload.array("images"),
  uploadImages
);

SizeChartRouter.delete('/remove-image', removeImageFromCloudinary);

// Create a size chart (protected, supports image upload)
SizeChartRouter.post(
  "/create",
  isAuthenticated,
  upload.array("images"),
  createSizeChart
);

// Get all size charts (protected or public as per your need)
SizeChartRouter.get("/all", isAuthenticated, getSizeCharts);

// Get single size chart by ID
SizeChartRouter.get("/:id", isAuthenticated, getSizeChartById);

// Update size chart by ID (support image upload)
SizeChartRouter.put(
  "/update/:id",
  isAuthenticated,
  upload.array("images"),
  updateSizeChart
);

// Delete size chart by ID
SizeChartRouter.delete("/delete/:id", isAuthenticated, deleteSizeChart);

SizeChartRouter.get("/chart/:id/unit", getSizeChartByUnit);
SizeChartRouter.get("/all/unit", getAllSizeChartsWithUnit);

export default SizeChartRouter;
