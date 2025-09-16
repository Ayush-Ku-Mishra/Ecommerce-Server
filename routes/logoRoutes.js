import express from "express";
import {
  getAllLogos,
  createLogo,
  updateLogo,
  deleteLogo,
  uploadImages,
  removeImageFromCloudinary,
} from "../controllers/logoController.js";
import { isAuthenticated } from "../middlewares/auth.js";
import upload from "../middlewares/multer.js";

const logoRouter = express.Router();

logoRouter.get("/all", getAllLogos);
logoRouter.post("/", isAuthenticated, createLogo);
logoRouter.put("/:id", isAuthenticated, updateLogo);
logoRouter.delete("/:id", isAuthenticated, deleteLogo);

logoRouter.post(
  "/upload-images",
  isAuthenticated,
  upload.array("images"),
  uploadImages
);

logoRouter.delete(
  "/deleteImage",
  isAuthenticated,
  removeImageFromCloudinary
);

export default logoRouter;