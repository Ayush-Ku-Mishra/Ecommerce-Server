import express from "express";
import { isAuthenticated } from "../middlewares/auth.js";
import upload from "../middlewares/multer.js"; // Your multer config
import {
  uploadImages,
  removeImageFromCloudinary,
  createSlider,
  getAllSliders,
  getActiveSliders,
  getSliderById,
  updateSlider,
  toggleSliderStatus,
  updateSliderOrder,
  deleteSlider,
} from "../controllers/sliderController.js";

const SliderRouter = express.Router();

// Image Upload/Removal
SliderRouter.post("/upload-images", isAuthenticated, upload.array("images", 10), uploadImages);
SliderRouter.delete("/remove-image", isAuthenticated, removeImageFromCloudinary);

// Admin CRUD
SliderRouter.post("/create", isAuthenticated, createSlider);
SliderRouter.get("/admin/all", isAuthenticated, getAllSliders);
SliderRouter.get("/admin/:id", isAuthenticated, getSliderById);
SliderRouter.put("/admin/:id", isAuthenticated, updateSlider);
SliderRouter.patch("/admin/:id/toggle-status", isAuthenticated, toggleSliderStatus);
SliderRouter.put("/admin/update-order", isAuthenticated, updateSliderOrder);
SliderRouter.delete("/admin/:id", isAuthenticated, deleteSlider);

// Public routes
SliderRouter.get("/active", getActiveSliders);
SliderRouter.get("/public/:id", async (req, res, next) => {
  try {
    const slider = await SliderModel.findOne({ _id: req.params.id, isActive: true });
    if (!slider) return res.status(404).json({ success: false, message: "Slider not found or inactive" });
    res.status(200).json({ success: true, slider });
  } catch (error) {
    next(error);
  }
});

export default SliderRouter;
