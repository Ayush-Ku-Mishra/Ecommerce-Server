import ErrorHandler from "../middlewares/error.js";
import { catchAsyncError } from "../middlewares/catchAsyncError.js";
import { v2 as cloudinary } from "cloudinary";
import { Logo } from "../models/logoModel.js"; 
import fs from "fs";

// Helper function to extract public ID from Cloudinary URL
const getPublicIdFromUrl = (url) => {
  try {
    const urlParts = url.split("/");
    const publicIdWithExtension = urlParts[urlParts.length - 1];
    const publicId = publicIdWithExtension.split(".")[0];
    return publicId;
  } catch (error) {
    console.error("Error extracting public ID:", error);
    return null;
  }
};

// Helper function to delete image from Cloudinary
const deleteFromCloudinary = async (imageUrl) => {
  try {
    const publicId = getPublicIdFromUrl(imageUrl);
    if (!publicId) {
      throw new Error("Invalid image URL");
    }
    
    const result = await cloudinary.uploader.destroy(publicId);
    return result;
  } catch (error) {
    console.error("Cloudinary deletion error:", error);
    throw error;
  }
};

export const uploadImages = catchAsyncError(async (req, res, next) => {
  try {
    const files = req.files;
    const imagesArr = [];

    const options = {
      user_filename: true,
      unique_filename: false,
      overwrite: false,
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

export const removeImageFromCloudinary = catchAsyncError(
  async (req, res, next) => {
    const imgUrl = req.query.img;

    if (!imgUrl) {
      return next(new ErrorHandler("Image URL is required.", 400));
    }

    try {
      const result = await deleteFromCloudinary(imgUrl);

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

// Get all logos
export const getAllLogos = catchAsyncError(async (req, res, next) => {
  try {
    const logos = await Logo.find().sort({ createdAt: -1 });
    
    res.status(200).json({
      success: true,
      logos,
      message: "Logos retrieved successfully"
    });
  } catch (error) {
    console.error('Get logos error:', error);
    next(new ErrorHandler('Failed to fetch logos', 500));
  }
});

// Create new logo
export const createLogo = catchAsyncError(async (req, res, next) => {
  try {
    const { url, name } = req.body;
    
    if (!url) {
      return next(new ErrorHandler('Logo URL is required', 400));
    }
    
    const logo = await Logo.create({
      url,
      name: name || 'Untitled Logo',
      uploadedBy: req.user._id
    });
    
    res.status(201).json({
      success: true,
      logo,
      message: "Logo created successfully"
    });
  } catch (error) {
    console.error('Create logo error:', error);
    next(new ErrorHandler('Failed to create logo', 500));
  }
});

// Update logo
export const updateLogo = catchAsyncError(async (req, res, next) => {
  try {
    const { id } = req.params;
    const { url, name } = req.body;
    
    const logo = await Logo.findById(id);
    if (!logo) {
      return next(new ErrorHandler('Logo not found', 404));
    }
    
    // If URL is being updated, delete the old image from Cloudinary
    if (url && url !== logo.url) {
      try {
        await deleteFromCloudinary(logo.url);
        console.log("Old logo image deleted from Cloudinary");
      } catch (error) {
        console.warn("Failed to delete old image from Cloudinary:", error.message);
        // Continue with update even if old image deletion fails
      }
    }
    
    logo.url = url || logo.url;
    logo.name = name || logo.name;
    logo.updatedAt = new Date();
    
    await logo.save();
    
    res.status(200).json({
      success: true,
      logo,
      message: "Logo updated successfully"
    });
  } catch (error) {
    console.error('Update logo error:', error);
    next(new ErrorHandler('Failed to update logo', 500));
  }
});

// Delete logo
export const deleteLogo = catchAsyncError(async (req, res, next) => {
  try {
    const { id } = req.params;
    
    const logo = await Logo.findById(id);
    if (!logo) {
      return next(new ErrorHandler('Logo not found', 404));
    }
    
    // Delete image from Cloudinary first
    try {
      await deleteFromCloudinary(logo.url);
      console.log("Logo image deleted from Cloudinary");
    } catch (error) {
      console.warn("Failed to delete image from Cloudinary:", error.message);
      // Continue with database deletion even if Cloudinary deletion fails
    }
    
    // Delete from database
    await Logo.findByIdAndDelete(id);
    
    res.status(200).json({
      success: true,
      message: "Logo deleted successfully"
    });
  } catch (error) {
    console.error('Delete logo error:', error);
    next(new ErrorHandler('Failed to delete logo', 500));
  }
});