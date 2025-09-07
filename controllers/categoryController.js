import CategoryModel from "../models/categoryModel.js";
import ErrorHandler from "../middlewares/error.js";
import { catchAsyncError } from "../middlewares/catchAsyncError.js";
import { v2 as cloudinary } from "cloudinary";
import fs from "fs";

// Upload Images only - existing function kept as is, placed first
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

// Create Category - requires name and optionally images array in request body
export const createCategory = catchAsyncError(async (req, res, next) => {
  try {
    let category = new CategoryModel({
      name: req.body.name,
      images: req.body.images || [],
      parentCatName: req.body.parentCatName,
      parentId: req.body.parentId,
    });

    if (!category) {
      return res.status(500).json({
        message: "Category not created",
        error: true,
        success: false,
      });
    }

    category = await category.save();

    return res.status(200).json({
      success: true,
      category: category,
    });
  } catch (error) {
    console.error("Create category error:", error);
    return next(
      new ErrorHandler("Category creation failed. Please try again.", 500)
    );
  }
});

// Get categories - unchanged
export const getCategories = catchAsyncError(async (req, res, next) => {
  try {
    const categories = await CategoryModel.find();
    const categoryMap = {};

    categories.forEach((category) => {
      categoryMap[category._id.toString()] = {
        ...category._doc,
        children: [],
      };
    });

    const rootCategories = [];

    categories.forEach((category) => {
      if (category.parentId && categoryMap[category.parentId.toString()]) {
        categoryMap[category.parentId.toString()].children.push(
          categoryMap[category._id.toString()]
        );
      } else {
        rootCategories.push(categoryMap[category._id.toString()]);
      }
    });

    return res.status(200).json({
      error: false,
      data: rootCategories,
      success: true,
      message: "Categories fetched successfully.",
    });
  } catch (error) {
    console.error("Get categories error:", error);
    return next(
      new ErrorHandler("Failed to fetch categories. Please try again.", 500)
    );
  }
});

// Get category count - unchanged
export const getCategoriesCount = catchAsyncError(async (req, res, next) => {
  try {
    // Include categories where parentId is null, missing, empty string, false, or 0
    const filter = {
      $or: [
        { parentId: null },
        { parentId: { $exists: false } },
        { parentId: "" },
        { parentId: false },
        { parentId: 0 },
      ],
    };

    const categoryCount = await CategoryModel.countDocuments(filter);

    // Optional: log the matched root categories count
    const filteredCategories = await CategoryModel.find(filter);
    console.log(
      "Categories matched for counting (root categories):",
      filteredCategories.length
    );

    res.status(200).json({
      success: true,
      count: categoryCount,
      message: "Category count retrieved",
    });
  } catch (error) {
    console.error("Error fetching category count:", error);
    return res.status(500).json({
      message: error.message || error,
      error: true,
      success: false,
    });
  }
});

// Get sub-category count - unchanged
export const getSubCategoriesCount = catchAsyncError(async (req, res, next) => {
  try {
    const subCategoryCount = await CategoryModel.countDocuments({
      parentId: { $exists: true, $ne: null },
    });

    return res.status(200).json({
      success: true,
      subCategoryCount,
      message: "Sub-category count retrieved successfully.",
    });
  } catch (error) {
    console.error("Error fetching sub-category count:", error);
    return res.status(500).json({
      message: error.message || error,
      error: true,
      success: false,
    });
  }
});

// Get single category - unchanged
export const getSingleCategory = catchAsyncError(async (req, res, next) => {
  try {
    const category = await CategoryModel.findById(req.params.id);

    if (!category) {
      return res.status(404).json({
        message: "The category with the given ID was not found.",
        error: true,
        success: false,
      });
    }

    return res.status(200).json({
      success: true,
      error: false,
      category,
    });
  } catch (error) {
    console.error("Error fetching single category:", error);
    return res.status(500).json({
      message: error.message || error,
      error: true,
      success: false,
    });
  }
});

// Remove image from Cloudinary - unchanged
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

// Delete Category - unchanged
export const deleteCategory = catchAsyncError(async (req, res, next) => {
  const { id } = req.params;

  const category = await CategoryModel.findById(id);
  if (!category) {
    return res.status(404).json({
      success: false,
      message: "Category not found.",
      error: true,
    });
  }

  if (category.images && category.images.length) {
    for (const imgUrl of category.images) {
      const urlParts = imgUrl.split("/");
      const imageFile = urlParts[urlParts.length - 1];
      const imageName = imageFile.split(".")[0];
      try {
        await cloudinary.uploader.destroy(imageName);
      } catch (error) {
        console.warn(
          `Failed to remove image from Cloudinary: ${imageName}`,
          error.message
        );
      }
    }
  }

  const subCategories = await CategoryModel.find({ parentId: id });

  for (let i = 0; i < subCategories.length; i++) {
    const subCat = subCategories[i];

    if (subCat.images && subCat.images.length) {
      for (const imgUrl of subCat.images) {
        const urlParts = imgUrl.split("/");
        const imageFile = urlParts[urlParts.length - 1];
        const imageName = imageFile.split(".")[0];
        try {
          await cloudinary.uploader.destroy(imageName);
        } catch (error) {
          console.warn(
            `Failed to remove image from Cloudinary: ${imageName}`,
            error.message
          );
        }
      }
    }

    const thirdSubCategories = await CategoryModel.find({
      parentId: subCat._id,
    });
    for (let j = 0; j < thirdSubCategories.length; j++) {
      const thirdSubCat = thirdSubCategories[j];

      if (thirdSubCat.images && thirdSubCat.images.length) {
        for (const imgUrl of thirdSubCat.images) {
          const urlParts = imgUrl.split("/");
          const imageFile = urlParts[urlParts.length - 1];
          const imageName = imageFile.split(".")[0];
          try {
            await cloudinary.uploader.destroy(imageName);
          } catch (error) {
            console.warn(
              `Failed to remove image from Cloudinary: ${imageName}`,
              error.message
            );
          }
        }
      }

      await CategoryModel.findByIdAndDelete(thirdSubCat._id);
    }

    await CategoryModel.findByIdAndDelete(subCat._id);
  }

  await CategoryModel.findByIdAndDelete(id);

  return res.status(200).json({
    success: true,
    message:
      "Category and all related images & subcategories deleted successfully.",
    error: false,
  });
});

// Update Category - modified to fix issue and keep unchanged otherwise
export const updateCategory = catchAsyncError(async (req, res, next) => {
  const { id } = req.params;

  let category = await CategoryModel.findById(id);
  if (!category) {
    return res.status(404).json({
      success: false,
      message: "Category not found.",
      error: true,
    });
  }

  let imagesArr = category.images || [];

  if (req.files && req.files.length > 0) {
    // Delete old images from Cloudinary
    if (imagesArr.length > 0) {
      for (const imgUrl of imagesArr) {
        const urlParts = imgUrl.split("/");
        const imageFile = urlParts[urlParts.length - 1];
        const imageName = imageFile.split(".")[0];
        try {
          await cloudinary.uploader.destroy(imageName);
        } catch (error) {
          console.warn(
            `Failed to remove old image from Cloudinary: ${imageName}`,
            error.message
          );
        }
      }
    }

    // Upload new images
    imagesArr = [];
    const options = {
      user_filename: true,
      unique_filename: false,
      overwrite: false,
    };

    for (const file of req.files) {
      const result = await cloudinary.uploader.upload(file.path, options);
      imagesArr.push(result.secure_url);

      try {
        fs.unlinkSync(file.path);
      } catch (err) {
        console.warn("Failed to delete file:", err.message);
      }
    }
  } else if (req.body.images && Array.isArray(req.body.images)) {
    // Delete old images from Cloudinary before replacing with new URLs
    if (imagesArr.length > 0) {
      for (const imgUrl of imagesArr) {
        const urlParts = imgUrl.split("/");
        const imageFile = urlParts[urlParts.length - 1];
        const imageName = imageFile.split(".")[0];
        try {
          await cloudinary.uploader.destroy(imageName);
        } catch (error) {
          console.warn(
            `Failed to remove old image from Cloudinary: ${imageName}`,
            error.message
          );
        }
      }
    }

    imagesArr = req.body.images;
  }

  category.name = req.body.name || category.name;
  category.images = imagesArr;
  category.parentCatName = req.body.parentCatName || category.parentCatName;
  category.parentId = req.body.parentId || category.parentId;

  category = await category.save();

  return res.status(200).json({
    success: true,
    message: "Category updated successfully.",
    category,
  });
});
