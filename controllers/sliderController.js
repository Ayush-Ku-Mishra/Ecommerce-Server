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
      user_filename: true,
      unique_filename: false,
      overwrite: false,
      folder: "sliders", // Organize images in folders
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
      message: "Images uploaded successfully.",
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

    if (!fullPublicId) {
      return next(new ErrorHandler("Invalid image URL.", 400));
    }

    try {
      const result = await cloudinary.uploader.destroy(fullPublicId);

      if (result && result.result === "ok") {
        return res.status(200).json({
          success: true,
          message: "Image deleted from Cloudinary.",
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

// Create new slider
export const createSlider = catchAsyncError(async (req, res, next) => {
  const { type, imageUrl, bannerImage, title, subtitle, price, link, order, isActive } = req.body;

  if (!type || !['simple', 'banner'].includes(type)) {
    return next(new ErrorHandler('Invalid type. Allowed values: simple, banner', 400));
  }

  if (type === 'simple' && !imageUrl) {
    return next(new ErrorHandler('imageUrl is required for simple slider', 400));
  }

  if (type === 'banner' && !bannerImage) {
    return next(new ErrorHandler('bannerImage is required for banner slider', 400));
  }

  const slider = new SliderModel({
    type,
    imageUrl: type === 'simple' ? imageUrl : undefined,
    bannerImage: type === 'banner' ? bannerImage : undefined,
    title: type === 'banner' ? title || '' : undefined,
    subtitle: type === 'banner' ? subtitle || '' : undefined,
    price: type === 'banner' ? price || '' : undefined,
    link: type === 'banner' ? link || '' : undefined,
    order: order || 0,
    isActive: isActive !== undefined ? isActive : true,
  });

  await slider.save();

  res.status(201).json({
    success: true,
    message: 'Slider created successfully',
    slider,
  });
});

// Get all sliders (admin)
export const getAllSliders = catchAsyncError(async (req, res, next) => {
  const { type, isActive } = req.query;
  
  const filter = {};
  if (type) filter.type = type;
  if (isActive !== undefined) filter.isActive = isActive === 'true';

  const sliders = await SliderModel.find(filter).sort({ order: 1, createdAt: -1 });

  res.status(200).json({
    success: true,
    count: sliders.length,
    sliders,
  });
});

// Get all active sliders for public (client website)
export const getActiveSliders = catchAsyncError(async (req, res, next) => {
  const { type } = req.query;
  
  const filter = { isActive: true };
  if (type) filter.type = type;

  const sliders = await SliderModel.find(filter).sort({ order: 1 });

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
  const { type } = req.body;

  if (type && !['simple', 'banner'].includes(type)) {
    return next(new ErrorHandler('Invalid type. Allowed values: simple, banner', 400));
  }

  let slider = await SliderModel.findById(req.params.id);
  if (!slider) {
    return next(new ErrorHandler('Slider not found', 404));
  }

  const updatedData = { ...req.body };

  // Clean up data based on type
  if (type === 'simple') {
    delete updatedData.bannerImage;
    delete updatedData.title;
    delete updatedData.subtitle;
    delete updatedData.price;
    delete updatedData.link;
  } else if (type === 'banner') {
    delete updatedData.imageUrl;
  }

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

// Toggle slider active status
export const toggleSliderStatus = catchAsyncError(async (req, res, next) => {
  const slider = await SliderModel.findById(req.params.id);

  if (!slider) {
    return next(new ErrorHandler('Slider not found', 404));
  }

  slider.isActive = !slider.isActive;
  await slider.save();

  res.status(200).json({
    success: true,
    message: `Slider ${slider.isActive ? 'activated' : 'deactivated'} successfully`,
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

// Delete slider by ID
export const deleteSlider = catchAsyncError(async (req, res, next) => {
  const slider = await SliderModel.findById(req.params.id);

  if (!slider) {
    return next(new ErrorHandler('Slider not found', 404));
  }

  // Optional: Delete associated images from cloudinary
  try {
    if (slider.imageUrl) {
      const urlParts = slider.imageUrl.split("/");
      const imageWithExtension = urlParts[urlParts.length - 1];
      const publicId = imageWithExtension.split(".")[0];
      await cloudinary.uploader.destroy(`sliders/${publicId}`);
    }
    if (slider.bannerImage) {
      const urlParts = slider.bannerImage.split("/");
      const imageWithExtension = urlParts[urlParts.length - 1];
      const publicId = imageWithExtension.split(".")[0];
      await cloudinary.uploader.destroy(`sliders/${publicId}`);
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