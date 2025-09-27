import ErrorHandler from "../middlewares/error.js";
import { catchAsyncError } from "../middlewares/catchAsyncError.js";
import { v2 as cloudinary } from "cloudinary";
import fs from "fs";
import SliderModel from "../models/sliderModel.js";

// Upload multiple images to cloudinary
export const uploadImages = catchAsyncError(async (req, res, next) => {
  try {
    const files = req.files;
    
    if (!files || files.length === 0) {
      return next(new ErrorHandler("No files provided for upload.", 400));
    }

    const imagesArr = [];

    const options = {
      use_filename: true,
      unique_filename: false,
      overwrite: false,
      folder: "sliders", // Organize images in folders
      quality: "auto",
      fetch_format: "auto"
    };

    for (const file of files) {
      const result = await cloudinary.uploader.upload(file.path, options);
      imagesArr.push(result.secure_url);

      // Clean up local file
      try {
        fs.unlinkSync(file.path);
      } catch (err) {
        console.warn("Failed to delete local file:", err.message);
      }
    }

    return res.status(200).json({
      success: true,
      images: imagesArr,
      message: "Images uploaded successfully to Cloudinary.",
    });
  } catch (error) {
    console.error("Upload images error:", error);
    return next(
      new ErrorHandler("Image upload failed. Please try again.", 500)
    );
  }
});

// Remove image from cloudinary
export const removeImageFromCloudinary = catchAsyncError(
  async (req, res, next) => {
    const imgUrl = req.query.img;

    if (!imgUrl) {
      return next(new ErrorHandler("Image URL is required.", 400));
    }

    try {
      // Extract public_id from cloudinary URL
      const urlParts = imgUrl.split("/");
      const imageWithExtension = urlParts[urlParts.length - 1];
      const publicId = imageWithExtension.split(".")[0];

      // If image is in a folder, include the folder path
      const folderIndex = urlParts.indexOf("sliders");
      let fullPublicId = publicId;
      if (folderIndex !== -1) {
        const folderPath = urlParts.slice(folderIndex, -1).join("/");
        fullPublicId = `${folderPath}/${publicId}`;
      }

      const result = await cloudinary.uploader.destroy(fullPublicId);

      if (result && result.result === "ok") {
        return res.status(200).json({
          success: true,
          message: "Image deleted from Cloudinary successfully.",
          data: result,
        });
      } else {
        return res.status(400).json({
          success: false,
          message: "Image could not be deleted from Cloudinary.",
          data: result,
        });
      }
    } catch (error) {
      return next(
        new ErrorHandler(error.message || "Cloudinary delete failed.", 500)
      );
    }
  }
);

// Create new slider (simplified)
export const createSlider = catchAsyncError(async (req, res, next) => {
  const { imageUrl, type = 'simple', order } = req.body;

  // Validation
  if (!imageUrl) {
    return next(new ErrorHandler('Image URL is required', 400));
  }

  // If no order specified, make it the last one
  let sliderOrder = order;
  if (!sliderOrder) {
    const lastSlider = await SliderModel.findOne().sort({ order: -1 });
    sliderOrder = lastSlider ? lastSlider.order + 1 : 1;
  }

  const slider = new SliderModel({
    type,
    imageUrl,
    order: sliderOrder
  });

  await slider.save();

  res.status(201).json({
    success: true,
    message: 'Slider created successfully',
    slider,
  });
});

// Get all sliders (simplified - no active/inactive distinction)
export const getAllSliders = catchAsyncError(async (req, res, next) => {
  const { type } = req.query;
  
  const filter = {};
  if (type) filter.type = type;

  const sliders = await SliderModel.find(filter).sort({ order: 1, createdAt: -1 });

  res.status(200).json({
    success: true,
    count: sliders.length,
    sliders,
  });
});

// Get slider by ID
export const getSliderById = catchAsyncError(async (req, res, next) => {
  const slider = await SliderModel.findById(req.params.id);

  if (!slider) {
    return next(new ErrorHandler('Slider not found', 404));
  }

  res.status(200).json({
    success: true,
    slider,
  });
});

// Update slider by ID
export const updateSlider = catchAsyncError(async (req, res, next) => {
  let slider = await SliderModel.findById(req.params.id);
  if (!slider) {
    return next(new ErrorHandler('Slider not found', 404));
  }

  const updatedData = { ...req.body };

  slider = await SliderModel.findByIdAndUpdate(req.params.id, updatedData, {
    new: true,
    runValidators: true,
  });

  res.status(200).json({
    success: true,
    message: 'Slider updated successfully',
    slider,
  });
});

// Update slider order
export const updateSliderOrder = catchAsyncError(async (req, res, next) => {
  const { slidersOrder } = req.body; // Array of { id, order }

  if (!Array.isArray(slidersOrder)) {
    return next(new ErrorHandler('slidersOrder must be an array', 400));
  }

  try {
    const updatePromises = slidersOrder.map(({ id, order }) =>
      SliderModel.findByIdAndUpdate(id, { order }, { new: true })
    );

    await Promise.all(updatePromises);

    res.status(200).json({
      success: true,
      message: 'Slider order updated successfully',
    });
  } catch (error) {
    return next(new ErrorHandler('Failed to update slider order', 500));
  }
});

// Delete slider by ID (with Cloudinary cleanup)
export const deleteSlider = catchAsyncError(async (req, res, next) => {
  const slider = await SliderModel.findById(req.params.id);

  if (!slider) {
    return next(new ErrorHandler('Slider not found', 404));
  }

  // Delete associated image from cloudinary
  try {
    if (slider.imageUrl) {
      const urlParts = slider.imageUrl.split("/");
      const imageWithExtension = urlParts[urlParts.length - 1];
      const publicId = imageWithExtension.split(".")[0];
      
      // Include folder path if exists
      const folderIndex = urlParts.indexOf("sliders");
      let fullPublicId = publicId;
      if (folderIndex !== -1) {
        const folderPath = urlParts.slice(folderIndex, -1).join("/");
        fullPublicId = `${folderPath}/${publicId}`;
      }
      
      await cloudinary.uploader.destroy(fullPublicId);
    }
  } catch (error) {
    console.warn("Failed to delete image from cloudinary:", error.message);
  }

  await SliderModel.findByIdAndDelete(req.params.id);

  res.status(200).json({
    success: true,
    message: 'Slider deleted successfully',
  });
});

// Batch create sliders (useful for multiple image upload)
export const batchCreateSliders = catchAsyncError(async (req, res, next) => {
  const { imageUrls, type = 'simple' } = req.body;

  if (!Array.isArray(imageUrls) || imageUrls.length === 0) {
    return next(new ErrorHandler('imageUrls array is required', 400));
  }

  // Get the current highest order
  const lastSlider = await SliderModel.findOne().sort({ order: -1 });
  let currentOrder = lastSlider ? lastSlider.order : 0;

  const sliders = [];
  for (const imageUrl of imageUrls) {
    currentOrder += 1;
    const slider = new SliderModel({
      type,
      imageUrl,
      order: currentOrder
    });
    
    const savedSlider = await slider.save();
    sliders.push(savedSlider);
  }

  res.status(201).json({
    success: true,
    message: `${sliders.length} sliders created successfully`,
    sliders,
  });
});

// Get sliders for frontend display (public route)
export const getPublicSliders = catchAsyncError(async (req, res, next) => {
  const { type, limit } = req.query;
  
  const filter = {};
  if (type) filter.type = type;

  let query = SliderModel.find(filter).sort({ order: 1, createdAt: -1 });
  
  if (limit) {
    query = query.limit(parseInt(limit));
  }

  const sliders = await query;

  res.status(200).json({
    success: true,
    count: sliders.length,
    sliders,
  });
});