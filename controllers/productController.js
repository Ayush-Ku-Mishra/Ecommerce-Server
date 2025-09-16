import productModel from "../models/productModel.js";
import ErrorHandler from "../middlewares/error.js";
import { catchAsyncError } from "../middlewares/catchAsyncError.js";
import { v2 as cloudinary } from "cloudinary";
import fs from "fs";

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

export const createProduct = catchAsyncError(async (req, res, next) => {
  try {
    // Normalize images and color variants arrays
    const imagesArr = Array.isArray(req.body.images) ? req.body.images : [];

    let colorVariantsArr = Array.isArray(req.body.colorVariants)
      ? req.body.colorVariants
      : [];

    // Find main variant if it exists
    const mainVariantIndex = colorVariantsArr.findIndex(
      (v) => v.isMainVariant === true
    );

    if (mainVariantIndex === -1) {
      // Create default main variant if none present
      colorVariantsArr.unshift({
        colorName: req.body.color || "Default",
        name: req.body.name,
        images: imagesArr,
        price: req.body.price || 0,
        oldPrice: req.body.oldPrice || 0,
        stock: req.body.stock || 0,
        discount: req.body.discount || 0,
        dressSizes: Array.isArray(req.body.dressSizes)
          ? req.body.dressSizes
          : [],
        shoesSizes: Array.isArray(req.body.shoesSizes)
          ? req.body.shoesSizes
          : [],
        freeSize: req.body.freeSize || "no",
        sizes: Array.isArray(req.body.size)
          ? req.body.size.map((s) => ({
              sizeLabel: s,
              stock: req.body.stock || 0,
            }))
          : [],
        weight: Array.isArray(req.body.weight) ? req.body.weight : [],
        brand: req.body.brand || "",
        rating: req.body.rating || 0,
        isFeatured: req.body.isFeatured || false,
        productDetails: req.body.productDetails || {},
        isMainVariant: true,
      });
    } else {
      // Fill missing data in existing main variant
      const mainVariant = colorVariantsArr[mainVariantIndex];

      if (!mainVariant.images || mainVariant.images.length === 0) {
        mainVariant.images = imagesArr;
      }

      if (!mainVariant.colorName) {
        mainVariant.colorName = req.body.color || "Default";
      }

      if (!mainVariant.dressSizes || mainVariant.dressSizes.length === 0) {
        mainVariant.dressSizes = Array.isArray(req.body.dressSizes)
          ? req.body.dressSizes
          : [];
      }

      if (!mainVariant.shoesSizes || mainVariant.shoesSizes.length === 0) {
        mainVariant.shoesSizes = Array.isArray(req.body.shoesSizes)
          ? req.body.shoesSizes
          : [];
      }

      if (sizeChartId && !mongoose.Types.ObjectId.isValid(sizeChartId)) {
        return next(new ErrorHandler("Invalid size chart ID format", 400));
      }

      if (!mainVariant.freeSize) {
        mainVariant.freeSize = req.body.freeSize || "no";
      }

      colorVariantsArr[mainVariantIndex] = mainVariant;
    }

    // Create product document
    const product = new productModel({
      name: req.body.name,
      productDetails: req.body.productDetails,
      images: imagesArr,
      brand: req.body.brand || "",
      price: req.body.price || 0,
      oldPrice: req.body.oldPrice || 0,
      categoryName: req.body.categoryName || "",
      categoryId: req.body.categoryId || "",
      subCatId: req.body.subCatId || "",
      subCatName: req.body.subCatName || "",
      thirdSubCatId: req.body.thirdSubCatId || "",
      thirdSubCatName: req.body.thirdSubCatName || "",
      fourthSubCatId: req.body.fourthSubCatId || "", // Add 4th subcat fields if supported
      fourthSubCatName: req.body.fourthSubCatName || "",
      stock: req.body.stock,
      rating: req.body.rating || 0,
      isFeatured: req.body.isFeatured || false,
      discount: req.body.discount,
      dressSizes: Array.isArray(req.body.dressSizes) ? req.body.dressSizes : [],
      shoesSizes: Array.isArray(req.body.shoesSizes) ? req.body.shoesSizes : [],
      freeSize: req.body.freeSize || "no",
      size: Array.isArray(req.body.size) ? req.body.size : [],
      weight: Array.isArray(req.body.weight) ? req.body.weight : [],
      colorVariants: colorVariantsArr,
      sizeChart: req.body.sizeChart || {},
      color: req.body.color || "",
      sizes: Array.isArray(req.body.sizes) ? req.body.sizes : [],
    });

    const savedProduct = await product.save();

    if (!savedProduct) {
      return res.status(500).json({
        message: "Product not created",
        error: true,
        success: false,
      });
    }

    res.status(200).json({
      message: "Product created successfully.",
      error: false,
      success: true,
      product: savedProduct,
    });
  } catch (error) {
    console.error("Create product error:", error);
    return next(
      new ErrorHandler(
        error.message || "Failed to create product. Please try again.",
        500
      )
    );
  }
});

//get All Products
//get All Products - FIXED VERSION
export const getAllProducts = catchAsyncError(async (req, res, next) => {
  try {
    console.log("getAllProducts controller called"); // Debug log
    console.log("Query params:", req.query); // Debug log

    const page = parseInt(req.query.page) || 1;
    const perPage = parseInt(req.query.perPage) || 10; // Default to 10 if not provided

    console.log(`Page: ${page}, PerPage: ${perPage}`); // Debug log

    const totalPosts = await productModel.countDocuments();
    const totalPages = Math.ceil(totalPosts / perPage);

    console.log(`Total products: ${totalPosts}, Total pages: ${totalPages}`); // Debug log

    if (page > totalPages && totalPages > 0) {
      return res.status(404).json({
        success: false,
        message: "Page not found.",
      });
    }

    const products = await productModel
      .find()
      .populate("category")
      .skip((page - 1) * perPage)
      .limit(perPage)
      .exec();

    console.log(`Found ${products.length} products`); // Debug log

    // Don't return 404 if no products exist - return empty array instead
    res.status(200).json({
      success: true,
      count: products.length,
      products: products,
      totalPages: totalPages,
      page: page,
    });
  } catch (error) {
    console.error("Get all products error:", error);
    return next(
      new ErrorHandler("Failed to fetch products. Please try again.", 500)
    );
  }
});

//get all products by category id
export const getAllProductsByCatId = catchAsyncError(async (req, res, next) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const perPage = parseInt(req.query.perPage);
    const totalPosts = await productModel.countDocuments();
    const totalPages = Math.ceil(totalPosts / perPage);

    if (page > totalPages) {
      return res.status(404).json({
        success: false,
        message: "Page not found.",
      });
    }

    const products = await productModel
      .find({ categoryId: req.params.id })
      .populate("category")
      .skip((page - 1) * perPage)
      .limit(perPage)
      .exec();

    if (!products.length) {
      return res.status(404).json({
        success: false,
        message: "No products found.",
      });
    }

    res.status(200).json({
      success: true,
      count: products.length,
      products: products,
      totalPages: totalPages,
      page: page,
    });
  } catch (error) {
    console.error("Get all products error:", error);
    return next(
      new ErrorHandler("Failed to fetch products. Please try again.", 500)
    );
  }
});

//get all products by category name
export const getAllProductsByCatName = catchAsyncError(
  async (req, res, next) => {
    try {
      console.log("getAllProductsByCatName controller called"); // Debug log
      console.log("Query params:", req.query); // Debug log

      const page = parseInt(req.query.page) || 1;
      const perPage = parseInt(req.query.perPage) || 10000;

      const categoryName = req.query.categoryName;
      if (!categoryName) {
        return res.status(400).json({
          success: false,
          message: "Category name is required.",
        });
      }

      console.log(`Searching for category: ${categoryName}`); // Debug log

      // Case-insensitive search using regex
      const products = await productModel
        .find({
          categoryName: {
            $regex: new RegExp(`^${categoryName}$`, "i"),
          },
        })
        .populate("category")
        .skip((page - 1) * perPage)
        .limit(perPage)
        .exec();

      // Debug: Log first product to see raw data
      if (products.length > 0) {
        console.log(
          "Raw product from DB:",
          JSON.stringify(products[0], null, 2)
        );
      }

      // Get total count with the same filter
      const totalPosts = await productModel.countDocuments({
        categoryName: {
          $regex: new RegExp(`^${categoryName}$`, "i"),
        },
      });

      const totalPages = Math.ceil(totalPosts / perPage);

      console.log(`Found ${products.length} products, Total: ${totalPosts}`); // Debug log

      if (page > totalPages && totalPages > 0) {
        return res.status(404).json({
          success: false,
          message: "Page not found.",
        });
      }

      if (!products.length) {
        return res.status(404).json({
          success: false,
          message: "No products found.",
        });
      }

      res.status(200).json({
        success: true,
        count: products.length,
        products: products,
        totalPages: totalPages,
        page: page,
      });
    } catch (error) {
      console.error("Get products by category error:", error);
      return next(
        new ErrorHandler("Failed to fetch products. Please try again.", 500)
      );
    }
  }
);

//get all products by sub category id
export const getAllProductsBySubCatid = catchAsyncError(
  async (req, res, next) => {
    try {
      const page = parseInt(req.query.page) || 1;
      const perPage = parseInt(req.query.perPage) || 10000;
      const totalPosts = await productModel.countDocuments();
      const totalPages = Math.ceil(totalPosts / perPage);

      if (page > totalPages) {
        return res.status(404).json({
          success: false,
          message: "Page not found.",
        });
      }

      const products = await productModel
        .find({ subCatId: req.params.id })
        .populate("category")
        .skip((page - 1) * perPage)
        .limit(perPage)
        .exec();

      if (!products.length) {
        return res.status(404).json({
          success: false,
          message: "No products found.",
        });
      }

      res.status(200).json({
        success: true,
        count: products.length,
        products: products,
        totalPages: totalPages,
        page: page,
      });
    } catch (error) {
      console.error("Get all products error:", error);
      return next(
        new ErrorHandler("Failed to fetch products. Please try again.", 500)
      );
    }
  }
);

//get all products by sub category name
export const getAllProductsBySubCatName = catchAsyncError(
  async (req, res, next) => {
    try {
      const page = parseInt(req.query.page) || 1;
      const perPage = parseInt(req.query.perPage) || 10000;
      const totalPosts = await productModel.countDocuments();
      const totalPages = Math.ceil(totalPosts / perPage);

      if (page > totalPages) {
        return res.status(404).json({
          success: false,
          message: "Page not found.",
        });
      }

      const products = await productModel
        .find({ subCatName: req.query.subCatName })
        .populate("category")
        .skip((page - 1) * perPage)
        .limit(perPage)
        .exec();

      if (!products.length) {
        return res.status(404).json({
          success: false,
          message: "No products found.",
        });
      }

      res.status(200).json({
        success: true,
        count: products.length,
        products: products,
        totalPages: totalPages,
        page: page,
      });
    } catch (error) {
      console.error("Get all products error:", error);
      return next(
        new ErrorHandler("Failed to fetch products. Please try again.", 500)
      );
    }
  }
);

//get all products by Third sub category id
export const getAllProductsByThirdSubCatid = catchAsyncError(
  async (req, res, next) => {
    try {
      const page = parseInt(req.query.page) || 1;
      const perPage = parseInt(req.query.perPage) || 10000;
      const totalPosts = await productModel.countDocuments();
      const totalPages = Math.ceil(totalPosts / perPage);

      if (page > totalPages) {
        return res.status(404).json({
          success: false,
          message: "Page not found.",
        });
      }

      const products = await productModel
        .find({ thirdSubCatId: req.params.id })
        .populate("category")
        .skip((page - 1) * perPage)
        .limit(perPage)
        .exec();

      if (!products.length) {
        return res.status(404).json({
          success: false,
          message: "No products found.",
        });
      }

      res.status(200).json({
        success: true,
        count: products.length,
        products: products,
        totalPages: totalPages,
        page: page,
      });
    } catch (error) {
      console.error("Get all products error:", error);
      return next(
        new ErrorHandler("Failed to fetch products. Please try again.", 500)
      );
    }
  }
);

//get all products by Third sub category name
export const getAllProductsByThirdSubCatName = catchAsyncError(
  async (req, res, next) => {
    try {
      const page = parseInt(req.query.page) || 1;
      const perPage = parseInt(req.query.perPage) || 10000;
      const totalPosts = await productModel.countDocuments();
      const totalPages = Math.ceil(totalPosts / perPage);

      if (page > totalPages) {
        return res.status(404).json({
          success: false,
          message: "Page not found.",
        });
      }

      const products = await productModel
        .find({ thirdSubCatName: req.query.thirdSubCatName })
        .populate("category")
        .skip((page - 1) * perPage)
        .limit(perPage)
        .exec();

      if (!products.length) {
        return res.status(404).json({
          success: false,
          message: "No products found.",
        });
      }

      res.status(200).json({
        success: true,
        count: products.length,
        products: products,
        totalPages: totalPages,
        page: page,
      });
    } catch (error) {
      console.error("Get all products error:", error);
      return next(
        new ErrorHandler("Failed to fetch products. Please try again.", 500)
      );
    }
  }
);

// Get all products by fourthSubCatId (from URL param)
export const getAllProductsByFourthSubCatId = catchAsyncError(
  async (req, res, next) => {
    try {
      const page = parseInt(req.query.page) || 1;
      const perPage = parseInt(req.query.perPage) || 10000;
      const totalPosts = await productModel.countDocuments({
        fourthSubCatId: req.params.id,
      });
      const totalPages = Math.ceil(totalPosts / perPage);

      if (page > totalPages) {
        return res.status(404).json({
          success: false,
          message: "Page not found.",
        });
      }

      const products = await productModel
        .find({ fourthSubCatId: req.params.id })
        .populate("category")
        .skip((page - 1) * perPage)
        .limit(perPage)
        .exec();

      if (!products.length) {
        return res.status(404).json({
          success: false,
          message: "No products found.",
        });
      }

      res.status(200).json({
        success: true,
        count: products.length,
        products: products,
        totalPages: totalPages,
        page: page,
      });
    } catch (error) {
      console.error("Get all products error:", error);
      return next(
        new ErrorHandler("Failed to fetch products. Please try again.", 500)
      );
    }
  }
);

// Get all products by fourthSubCatName (from query string)
export const getAllProductsByFourthSubCatName = catchAsyncError(
  async (req, res, next) => {
    try {
      const page = parseInt(req.query.page) || 1;
      const perPage = parseInt(req.query.perPage) || 10000;
      const totalPosts = await productModel.countDocuments({
        fourthSubCatName: req.query.fourthSubCatName,
      });
      const totalPages = Math.ceil(totalPosts / perPage);

      if (page > totalPages) {
        return res.status(404).json({
          success: false,
          message: "Page not found.",
        });
      }

      const products = await productModel
        .find({ fourthSubCatName: req.query.fourthSubCatName })
        .populate("category")
        .skip((page - 1) * perPage)
        .limit(perPage)
        .exec();

      if (!products.length) {
        return res.status(404).json({
          success: false,
          message: "No products found.",
        });
      }

      res.status(200).json({
        success: true,
        count: products.length,
        products: products,
        totalPages: totalPages,
        page: page,
      });
    } catch (error) {
      console.error("Get all products error:", error);
      return next(
        new ErrorHandler("Failed to fetch products. Please try again.", 500)
      );
    }
  }
);

//get all products by Price
export const getAllProductsByPrice = catchAsyncError(async (req, res, next) => {
  let productList = [];

  if (req.query.categoryId !== "" && req.query.categoryId !== undefined) {
    const productListArr = await productModel
      .find({
        categoryId: req.query.categoryId,
      })
      .populate("category");

    productList = productListArr;
  }

  if (req.query.subCatId !== "" && req.query.subCatId !== undefined) {
    const productListArr = await productModel
      .find({
        subCatId: req.query.subCatId,
      })
      .populate("category");

    productList = productListArr;
  }

  if (req.query.thirdSubCatId !== "" && req.query.thirdSubCatId !== undefined) {
    const productListArr = await productModel
      .find({
        thirdSubCatId: req.query.thirdSubCatId,
      })
      .populate("category");

    productList = productListArr;
  }

  const filterProducts = productList.filter((product) => {
    if (req.query.minPrice && product.price < parseInt(+req.query.minPrice)) {
      return false;
    }

    if (req.query.maxPrice && product.price > parseInt(+req.query.maxPrice)) {
      return false;
    }

    return true;
  });

  return res.status(200).json({
    success: true,
    count: filterProducts.length,
    products: filterProducts,
    totalPages: 0,
    page: 0,
  });
});

//get all products by Rating
export const getAllProductsByRating = catchAsyncError(
  async (req, res, next) => {
    try {
      const page = parseInt(req.query.page) || 1;
      const perPage = parseInt(req.query.perPage) || 10000;
      const totalPosts = await productModel.countDocuments();
      const totalPages = Math.ceil(totalPosts / perPage);

      if (page > totalPages) {
        return res.status(404).json({
          success: false,
          message: "Page not found.",
        });
      }

      let products = [];

      if (req.query.categoryId !== "" && req.query.categoryId !== undefined) {
        products = await productModel
          .find({
            rating: req.query.rating,
            categoryId: req.query.categoryId,
          })
          .populate("category")
          .skip((page - 1) * perPage)
          .limit(perPage)
          .exec();
      }

      if (req.query.subCatId !== "" && req.query.subCatId !== undefined) {
        products = await productModel
          .find({
            rating: req.query.rating,
            subCatId: req.query.subCatId,
          })
          .populate("category")
          .skip((page - 1) * perPage)
          .limit(perPage)
          .exec();
      }

      if (
        req.query.thirdSubCatId !== "" &&
        req.query.thirdSubCatId !== undefined
      ) {
        products = await productModel
          .find({
            rating: req.query.rating,
            thirdSubCatId: req.query.thirdSubCatId,
          })
          .populate("category")
          .skip((page - 1) * perPage)
          .limit(perPage)
          .exec();
      }

      if (!products.length) {
        return res.status(404).json({
          success: false,
          message: "No products found.",
        });
      }

      res.status(200).json({
        success: true,
        count: products.length,
        products: products,
        totalPages: totalPages,
        page: page,
      });
    } catch (error) {
      console.error("Get all products error:", error);
      return next(
        new ErrorHandler("Failed to fetch products. Please try again.", 500)
      );
    }
  }
);

//get products count
export const getProductsCount = catchAsyncError(async (req, res, next) => {
  try {
    // Build filter based on optional query parameters
    let filter = {};

    if (req.query.rating !== undefined) {
      filter.rating = Number(req.query.rating);
    }
    if (req.query.categoryId) {
      filter.categoryId = req.query.categoryId;
    } else if (req.query.subCatId) {
      filter.subCatId = req.query.subCatId;
    } else if (req.query.thirdSubCatId) {
      filter.thirdSubCatId = req.query.thirdSubCatId;
    }

    const count = await productModel.countDocuments(filter);

    res.status(200).json({
      success: true,
      count: count,
      filter: filter,
    });
  } catch (error) {
    console.error("Get products count error:", error);
    return next(
      new ErrorHandler("Failed to fetch product count. Please try again.", 500)
    );
  }
});

//get all featured products
export const getAllFeaturedProducts = catchAsyncError(
  async (req, res, next) => {
    try {
      const products = await productModel
        .find({ isFeatured: true })
        .populate("category")
        .exec();

      if (!products.length) {
        return res.status(404).json({
          success: false,
          message: "No products found.",
        });
      }

      res.status(200).json({
        success: true,
        count: products.length,
        products: products,
      });
    } catch (error) {
      console.error("Get all products error:", error);
      return next(
        new ErrorHandler("Failed to fetch products. Please try again.", 500)
      );
    }
  }
);

//Delete Product
export const deleteProduct = catchAsyncError(async (req, res, next) => {
  const productId = req.params.id;

  const product = await productModel.findById(productId).populate("category");

  if (!product) {
    return res.status(404).json({
      success: false,
      message: "Product not found.",
    });
  }

  const images = product.images;

  for (const img of images) {
    const imgUrl = img;
    const urlArr = imgUrl.split("/");
    const image = urlArr[urlArr.length - 1];

    const imageName = image.split(".")[0];

    if (imageName) {
      cloudinary.uploader.destroy(imageName, (error, result) => {
        // Uncomment to debug
        // console.log(error, result);
      });
    }
  }

  const deleteProduct = await productModel.findByIdAndDelete(productId);

  if (!deleteProduct) {
    return res.status(500).json({
      success: false,
      message: "Failed to delete product.",
    });
  }

  res.status(200).json({
    success: true,
    message: "Product and associated images deleted successfully.",
    product: product,
  });
});

//get single product
export const getProduct = catchAsyncError(async (req, res, next) => {
  try {
    const productId = req.params.id;

    const product = await productModel.findById(productId).populate("category");

    if (!product) {
      return res.status(404).json({
        success: false,
        message: "Product not found.",
      });
    }

    res.status(200).json({
      success: true,
      product: product,
    });
  } catch (error) {
    console.error("Get product error:", error);
    return next(
      new ErrorHandler("Failed to fetch product. Please try again.", 500)
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

//Update Product
export const updateProduct = catchAsyncError(async (req, res, next) => {
  try {
    const productId = req.params.id;

    // Extract fields from the request body (adjust based on what you allow to update)
    const updateData = {
      name: req.body.name,
      productDetails: req.body.productDetails,
      images: Array.isArray(req.body.images) ? req.body.images : undefined,
      brand: req.body.brand,
      price: req.body.price,
      oldPrice: req.body.oldPrice,
      categoryName: req.body.categoryName,
      categoryId: req.body.categoryId,
      subCatId: req.body.subCatId,
      subCatName: req.body.subCatName,
      thirdSubCatId: req.body.thirdSubCatId,
      thirdSubCatName: req.body.thirdSubCatName,
      stock: req.body.stock,
      rating: req.body.rating,
      isFeatured: req.body.isFeatured,
      discount: req.body.discount,
      dressSizes: Array.isArray(req.body.dressSizes)
        ? req.body.dressSizes
        : undefined,
      shoesSizes: Array.isArray(req.body.shoesSizes)
        ? req.body.shoesSizes
        : undefined,
      freeSize: req.body.freeSize,
      size: Array.isArray(req.body.size) ? req.body.size : undefined,
      weight: Array.isArray(req.body.weight) ? req.body.weight : undefined,
      color: req.body.color,
    };

    // Remove undefined fields to avoid overwriting with undefined
    Object.keys(updateData).forEach(
      (key) => updateData[key] === undefined && delete updateData[key]
    );

    const updatedProduct = await productModel
      .findByIdAndUpdate(productId, updateData, {
        new: true,
        runValidators: true,
      })
      .populate("category");

    if (!updatedProduct) {
      return res.status(404).json({
        success: false,
        message: "Product not found.",
      });
    }

    res.status(200).json({
      success: true,
      message: "Product updated successfully.",
      product: updatedProduct,
    });
  } catch (error) {
    console.error("Update product error:", error);
    return next(
      new ErrorHandler("Failed to update product. Please try again.", 500)
    );
  }
});

export const getRelatedProducts = catchAsyncError(async (req, res, next) => {
  try {
    const { productId, categoryName, limit = 10 } = req.query;
    
    const relatedProducts = await productModel
      .find({
        _id: { $ne: productId }, // Exclude current product
        categoryName: categoryName,
      })
      .limit(parseInt(limit))
      .populate("category");
    
    res.status(200).json({
      success: true,
      products: relatedProducts,
    });
  } catch (error) {
    return next(new ErrorHandler("Failed to fetch related products", 500));
  }
});
