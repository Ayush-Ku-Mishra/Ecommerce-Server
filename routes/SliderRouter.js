import express from "express";
import { isAuthenticated } from "../middlewares/auth.js";
import upload from "../middlewares/multer.js";
import {
  uploadImages,
  removeImageFromCloudinary,
  createSlider,
  getAllSliders,
  getSliderById,
  updateSlider,
  updateSliderOrder,
  deleteSlider,
  batchCreateSliders
} from "../controllers/sliderController.js";

const SliderRouter = express.Router();

// Image Upload/Removal (protected routes)
SliderRouter.post("/upload-images", isAuthenticated, upload.array("images", 10), uploadImages);
SliderRouter.delete("/remove-image", isAuthenticated, removeImageFromCloudinary);

// CRUD operations (protected routes)
SliderRouter.post("/create", isAuthenticated, createSlider);
SliderRouter.post("/batch-create", isAuthenticated, batchCreateSliders);
SliderRouter.get("/all", getAllSliders); // No auth needed for fetching
SliderRouter.get("/:id", getSliderById); // No auth needed for fetching
SliderRouter.put("/:id", isAuthenticated, updateSlider);
SliderRouter.put("/update-order", isAuthenticated, updateSliderOrder);
SliderRouter.delete("/:id", isAuthenticated, deleteSlider);

export default SliderRouter;