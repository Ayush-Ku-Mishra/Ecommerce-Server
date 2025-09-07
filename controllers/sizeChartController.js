import SizeChartModel from "../models/sizeChartModel.js";
import ErrorHandler from "../middlewares/error.js";
import { catchAsyncError } from "../middlewares/catchAsyncError.js";
import { v2 as cloudinary } from "cloudinary";
import fs from "fs";

export const uploadImages = catchAsyncError(async (req, res, next) => {
  try {
    const files = req.files;
    
    if (!files || files.length === 0) {
      return res.status(400).json({
        success: false,
        message: "No files uploaded."
      });
    }

    const imagesArr = [];

    const options = {
      user_filename: true,
      unique_filename: false,
      overwrite: false,
    };

    for (const file of files) {
      const result = await cloudinary.uploader.upload(file.path, options);
      imagesArr.push(result.secure_url);

      try {
        fs.unlinkSync(file.path);
      } catch (err) {
        console.warn("Failed to delete file:", err.message);
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

//Delete images
export const removeImageFromCloudinary = catchAsyncError(
  async (req, res, next) => {
    const imgUrl = req.query.img;

    if (!imgUrl) {
      return next(new ErrorHandler("Image URL is required.", 400));
    }

    const urlArr = imgUrl.split("/");
    const image = urlArr[urlArr.length - 1];
    const imageName = image.split(".")[0];

    if (!imageName) {
      return next(new ErrorHandler("Invalid image URL.", 400));
    }

    try {
      const result = await cloudinary.uploader.destroy(imageName);

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

// Create Size Chart
export const createSizeChart = catchAsyncError(async (req, res, next) => {
  try {
    const {
      name,
      unit,
      sizes,
      howToMeasureDescription,
      howToMeasureImageUrls, // This comes from the frontend after image upload
    } = req.body;

    // Validate required fields
    if (!name || !name.trim()) {
      return next(new ErrorHandler("Size chart name is required", 400));
    }

    // Parse sizes if sent as string
    const parsedSizes = typeof sizes === "string" ? JSON.parse(sizes) : sizes;

    if (!parsedSizes || !Array.isArray(parsedSizes) || parsedSizes.length === 0) {
      return next(new ErrorHandler("At least one size is required", 400));
    }

    // Validate that each size has a sizeLabel
    for (const size of parsedSizes) {
      if (!size.sizeLabel || !size.sizeLabel.trim()) {
        return next(new ErrorHandler("All sizes must have a label", 400));
      }
    }

    const newChart = new SizeChartModel({
      name: name.trim(),
      unit: unit || "inch",
      sizes: parsedSizes,
      howToMeasureImageUrls: howToMeasureImageUrls || [],
      howToMeasureDescription: howToMeasureDescription || "",
    });

    const savedChart = await newChart.save();

    res.status(201).json({ 
      success: true,
      message: "Size chart created successfully", 
      sizeChart: savedChart 
    });
  } catch (error) {
    console.error("Create size chart error:", error);
    if (error.name === 'ValidationError') {
      return next(new ErrorHandler(error.message, 400));
    }
    next(new ErrorHandler("Failed to create size chart", 500));
  }
});

// Get all size charts
export const getSizeCharts = catchAsyncError(async (req, res, next) => {
  try {
    const charts = await SizeChartModel.find().sort({ createdAt: -1 });
    
    // Format the response to match frontend expectations
    const formattedCharts = charts.map(chart => ({
      ...chart.toObject(),
      createdAt: new Date(chart.createdAt).toLocaleDateString(),
      updatedAt: new Date(chart.updatedAt).toLocaleDateString(),
      howToMeasureImages: chart.howToMeasureImageUrls?.map((url, idx) => ({
        id: idx + Date.now(),
        url: url,
        name: `Image ${idx + 1}`,
      })) || []
    }));

    res.status(200).json(formattedCharts);
  } catch (error) {
    console.error("Get size charts error:", error);
    next(new ErrorHandler("Failed to fetch size charts", 500));
  }
});

// Get single size chart by ID
export const getSizeChartById = catchAsyncError(async (req, res, next) => {
  try {
    const chart = await SizeChartModel.findById(req.params.id);
    
    if (!chart) {
      return next(new ErrorHandler("Size chart not found", 404));
    }

    // Format the response to match frontend expectations
    const formattedChart = {
      ...chart.toObject(),
      createdAt: new Date(chart.createdAt).toLocaleDateString(),
      updatedAt: new Date(chart.updatedAt).toLocaleDateString(),
      howToMeasureImages: chart.howToMeasureImageUrls?.map((url, idx) => ({
        id: idx + Date.now(),
        url: url,
        name: `Image ${idx + 1}`,
      })) || []
    };

    res.status(200).json(formattedChart);
  } catch (error) {
    console.error("Get size chart by ID error:", error);
    if (error.name === 'CastError') {
      return next(new ErrorHandler("Invalid size chart ID", 400));
    }
    next(new ErrorHandler("Failed to fetch size chart", 500));
  }
});

// Update size chart by ID
export const updateSizeChart = catchAsyncError(async (req, res, next) => {
  try {
    const { id } = req.params;
    
    // Validate MongoDB ObjectId format
    if (!id || !id.match(/^[0-9a-fA-F]{24}$/)) {
      return next(new ErrorHandler("Invalid size chart ID format", 400));
    }

    console.log("Updating chart with ID:", id); // Debug log
    console.log("Request body:", req.body); // Debug log

    const chart = await SizeChartModel.findById(id);
    
    if (!chart) {
      return next(new ErrorHandler("Size chart not found", 404));
    }

    const {
      name,
      unit,
      sizes,
      howToMeasureDescription,
      howToMeasureImageUrls, // This comes from the frontend after image upload
    } = req.body;

    // Validate name if provided
    if (name !== undefined && (!name || !name.trim())) {
      return next(new ErrorHandler("Size chart name cannot be empty", 400));
    }

    // Parse and validate sizes if provided
    if (sizes !== undefined) {
      const parsedSizes = typeof sizes === "string" ? JSON.parse(sizes) : sizes;
      
      if (!Array.isArray(parsedSizes) || parsedSizes.length === 0) {
        return next(new ErrorHandler("At least one size is required", 400));
      }

      // Validate that each size has a sizeLabel
      for (const size of parsedSizes) {
        if (!size.sizeLabel || !size.sizeLabel.trim()) {
          return next(new ErrorHandler("All sizes must have a label", 400));
        }
      }
      
      chart.sizes = parsedSizes;
    }

    // Update other fields
    if (name !== undefined) chart.name = name.trim();
    if (unit !== undefined) chart.unit = unit;
    if (howToMeasureDescription !== undefined) chart.howToMeasureDescription = howToMeasureDescription;
    if (howToMeasureImageUrls !== undefined) chart.howToMeasureImageUrls = howToMeasureImageUrls;

    const updatedChart = await chart.save();

    // Format the response to match frontend expectations
    const formattedChart = {
      ...updatedChart.toObject(),
      createdAt: new Date(updatedChart.createdAt).toLocaleDateString(),
      updatedAt: new Date(updatedChart.updatedAt).toLocaleDateString(),
      howToMeasureImages: updatedChart.howToMeasureImageUrls?.map((url, idx) => ({
        id: idx + Date.now(),
        url: url,
        name: `Image ${idx + 1}`,
      })) || []
    };

    res.status(200).json({ 
      success: true,
      message: "Size chart updated successfully", 
      sizeChart: formattedChart 
    });
  } catch (error) {
    console.error("Update size chart error:", error);
    if (error.name === 'ValidationError') {
      return next(new ErrorHandler(error.message, 400));
    }
    if (error.name === 'CastError') {
      return next(new ErrorHandler("Invalid size chart ID", 400));
    }
    next(new ErrorHandler("Failed to update size chart", 500));
  }
});

// Delete size chart by ID
export const deleteSizeChart = catchAsyncError(async (req, res, next) => {
  try {
    const chart = await SizeChartModel.findById(req.params.id);
    
    if (!chart) {
      return next(new ErrorHandler("Size chart not found", 404));
    }

    // Delete associated images from Cloudinary
    if (chart.howToMeasureImageUrls && chart.howToMeasureImageUrls.length > 0) {
      for (const imageUrl of chart.howToMeasureImageUrls) {
        try {
          const urlArr = imageUrl.split("/");
          const image = urlArr[urlArr.length - 1];
          const imageName = image.split(".")[0];
          
          if (imageName) {
            await cloudinary.uploader.destroy(imageName);
          }
        } catch (imgError) {
          console.warn("Failed to delete image from Cloudinary:", imgError.message);
          // Continue with deletion even if image cleanup fails
        }
      }
    }

    // Use findByIdAndDelete instead of deprecated remove()
    await SizeChartModel.findByIdAndDelete(req.params.id);

    res.status(200).json({ 
      success: true,
      message: "Size chart deleted successfully" 
    });
  } catch (error) {
    console.error("Delete size chart error:", error);
    if (error.name === 'CastError') {
      return next(new ErrorHandler("Invalid size chart ID", 400));
    }
    next(new ErrorHandler("Failed to delete size chart", 500));
  }
});

export const getSizeChartByUnit = catchAsyncError(async (req, res, next) => {
  try {
    const { id } = req.params;
    const { unit } = req.query; // inch or cm
    
    const chart = await SizeChartModel.findById(id);
    
    if (!chart) {
      return next(new ErrorHandler("Size chart not found", 404));
    }

    // Convert units if needed
    const convertUnit = (value, fromUnit, toUnit) => {
      if (!value || isNaN(value)) return value;
      const numValue = parseFloat(value);
      if (fromUnit === "inch" && toUnit === "cm") {
        return (numValue * 2.54).toFixed(1);
      } else if (fromUnit === "cm" && toUnit === "inch") {
        return (numValue / 2.54).toFixed(1);
      }
      return value;
    };

    const getConvertedSizes = (sizes, fromUnit, toUnit) => {
      if (!sizes || !Array.isArray(sizes)) return [];
      return sizes.map((size) => {
        const convertedSize = { ...size };
        const fields = ["shoulder", "length", "chest", "waist", "hip", "sleeve", "neck", "thigh"];
        fields.forEach((field) => {
          if (convertedSize[field]) {
            convertedSize[field] = convertUnit(convertedSize[field], fromUnit, toUnit);
          }
        });
        return convertedSize;
      });
    };

    // Get sizes in requested unit
    const requestedUnit = unit || chart.unit;
    const sizes = requestedUnit === chart.unit 
      ? chart.sizes 
      : getConvertedSizes(chart.sizes, chart.unit, requestedUnit);

    const formattedChart = {
      ...chart.toObject(),
      sizes: sizes,
      displayUnit: requestedUnit,
      createdAt: new Date(chart.createdAt).toLocaleDateString(),
      updatedAt: new Date(chart.updatedAt).toLocaleDateString(),
      howToMeasureImages: chart.howToMeasureImageUrls?.map((url, idx) => ({
        id: idx + Date.now(),
        url: url,
        name: `Image ${idx + 1}`,
      })) || []
    };

    res.status(200).json(formattedChart);
  } catch (error) {
    console.error("Get size chart by unit error:", error);
    if (error.name === 'CastError') {
      return next(new ErrorHandler("Invalid size chart ID", 400));
    }
    next(new ErrorHandler("Failed to fetch size chart", 500));
  }
});

// Add this endpoint to get all charts with unit conversion
export const getAllSizeChartsWithUnit = catchAsyncError(async (req, res, next) => {
  try {
    const { unit } = req.query; // inch or cm
    const charts = await SizeChartModel.find().sort({ createdAt: -1 });
    
    const convertUnit = (value, fromUnit, toUnit) => {
      if (!value || isNaN(value)) return value;
      const numValue = parseFloat(value);
      if (fromUnit === "inch" && toUnit === "cm") {
        return (numValue * 2.54).toFixed(1);
      } else if (fromUnit === "cm" && toUnit === "inch") {
        return (numValue / 2.54).toFixed(1);
      }
      return value;
    };

    const getConvertedSizes = (sizes, fromUnit, toUnit) => {
      if (!sizes || !Array.isArray(sizes)) return [];
      return sizes.map((size) => {
        const convertedSize = { ...size };
        const fields = ["shoulder", "length", "chest", "waist", "hip", "sleeve", "neck", "thigh"];
        fields.forEach((field) => {
          if (convertedSize[field]) {
            convertedSize[field] = convertUnit(convertedSize[field], fromUnit, toUnit);
          }
        });
        return convertedSize;
      });
    };

    const formattedCharts = charts.map(chart => {
      const requestedUnit = unit || chart.unit;
      const sizes = requestedUnit === chart.unit 
        ? chart.sizes 
        : getConvertedSizes(chart.sizes, chart.unit, requestedUnit);

      return {
        ...chart.toObject(),
        sizes: sizes,
        displayUnit: requestedUnit,
        createdAt: new Date(chart.createdAt).toLocaleDateString(),
        updatedAt: new Date(chart.updatedAt).toLocaleDateString(),
        howToMeasureImages: chart.howToMeasureImageUrls?.map((url, idx) => ({
          id: idx + Date.now(),
          url: url,
          name: `Image ${idx + 1}`,
        })) || []
      };
    });

    res.status(200).json(formattedCharts);
  } catch (error) {
    console.error("Get size charts with unit error:", error);
    next(new ErrorHandler("Failed to fetch size charts", 500));
  }
});