import ErrorHandler from "../middlewares/error.js";
import { catchAsyncError } from "../middlewares/catchAsyncError.js";
import { v2 as cloudinary } from "cloudinary";
import ReviewModel from "../models/reviewModel.js";
import mongoose from "mongoose";
import fs from "fs";

const MAX_IMAGE_SIZE = 5 * 1024 * 1024; // 5MB
const MAX_IMAGES = 5;
const MAX_TITLE_LENGTH = 100;
const MAX_TEXT_LENGTH = 1000;

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

// Upload review images
export const uploadReviewImages = catchAsyncError(async (req, res, next) => {
  try {
    const files = req.files;
    if (!files || files.length === 0) {
      return next(new ErrorHandler("No images provided", 400));
    }

    if (files.length > MAX_IMAGES) {
      return next(
        new ErrorHandler(`Maximum ${MAX_IMAGES} images allowed per review`, 400)
      );
    }

    // Validate file sizes
    for (const file of files) {
      if (file.size > MAX_IMAGE_SIZE) {
        return next(
          new ErrorHandler(
            `Image ${file.originalname} exceeds 5MB size limit`,
            400
          )
        );
      }
    }

    const imagesArr = [];
    const options = {
      folder: "reviews",
      use_filename: true,
      unique_filename: true,
      overwrite: false,
      resource_type: "image",
      transformation: [
        { width: 1200, height: 1200, crop: "limit" },
        { quality: "auto" },
        { fetch_format: "auto" },
      ],
    };

    for (const file of files) {
      const result = await cloudinary.uploader.upload(file.path, options);
      imagesArr.push({
        url: result.secure_url,
        publicId: result.public_id,
      });

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
      message: "Review images uploaded successfully.",
    });
  } catch (error) {
    console.error("Upload review images error:", error);
    return next(
      new ErrorHandler("Image upload failed. Please try again.", 500)
    );
  }
});

// Create new review
export const createReview = catchAsyncError(async (req, res, next) => {
  try {
    const {
      productId,
      orderId,
      rating,
      title,
      text,
      images = [],
      isAnonymous = false,
      isVerifiedPurchase = false,
    } = req.body;

    // Validate productId
    if (!mongoose.Types.ObjectId.isValid(productId)) {
      return next(new ErrorHandler("Invalid product ID format", 400));
    }

    // Validate text length
    if (!text || text.trim().length === 0) {
      return next(new ErrorHandler("Review text is required", 400));
    }

    if (text.trim().length > MAX_TEXT_LENGTH) {
      return next(
        new ErrorHandler(
          `Review text cannot exceed ${MAX_TEXT_LENGTH} characters`,
          400
        )
      );
    }

    // Validate title length
    if (title && title.trim().length > MAX_TITLE_LENGTH) {
      return next(
        new ErrorHandler(
          `Review title cannot exceed ${MAX_TITLE_LENGTH} characters`,
          400
        )
      );
    }

    // Validate images
    if (images.length > MAX_IMAGES) {
      return next(
        new ErrorHandler(`Maximum ${MAX_IMAGES} images allowed`, 400)
      );
    }

    if (images.length > 0) {
      const validImages = images.every(
        (img) =>
          img.url &&
          typeof img.url === "string" &&
          img.publicId &&
          typeof img.publicId === "string"
      );

      if (!validImages) {
        return next(new ErrorHandler("Invalid image format", 400));
      }
    }

    // Check if user already reviewed this product for this order
    if (orderId) {
      const existingReview = await ReviewModel.findOne({
        productId,
        userId: req.user._id,
        orderId,
      });

      if (existingReview) {
        return next(
          new ErrorHandler(
            "You have already reviewed this product for this order",
            400
          )
        );
      }
    }

    // Create review
    const review = await ReviewModel.create({
      productId,
      orderId,
      userId: req.user._id,
      rating,
      title: title?.trim() || "",
      text: text.trim(),
      images,
      isAnonymous,
      isVerifiedPurchase,
    });

    await review.populate("userId", "name email");

    res.status(201).json({
      success: true,
      review,
      message: "Review created successfully",
    });
  } catch (error) {
    console.error("Create review error:", error);
    return next(
      new ErrorHandler(error.message || "Failed to create review", 500)
    );
  }
});

// Get all reviews for a product
export const getProductReviews = catchAsyncError(async (req, res, next) => {
  try {
    const { productId } = req.params;
    const {
      page = 1,
      limit = 10,
      sortBy = "newest",
      rating,
      verified,
    } = req.query;

    // Convert productId to ObjectId for MongoDB queries
    const productObjectId = new mongoose.Types.ObjectId(productId);

    // Build filter
    const filter = {
      productId: productObjectId, // ✅ Use ObjectId here
      isHidden: { $ne: true },
    };

    if (rating) {
      const ratingNum = parseInt(rating);
      if (ratingNum >= 1 && ratingNum <= 5) {
        filter.rating = ratingNum;
      }
    }

    if (verified === "true") {
      filter.isVerifiedPurchase = true;
    }

    // Build sort
    let sort = {};
    switch (sortBy) {
      case "newest":
        sort = { createdAt: -1 };
        break;
      case "oldest":
        sort = { createdAt: 1 };
        break;
      case "highest":
        sort = { rating: -1, createdAt: -1 };
        break;
      case "lowest":
        sort = { rating: 1, createdAt: -1 };
        break;
      case "helpful":
        sort = { createdAt: -1 };
        break;
      default:
        sort = { createdAt: -1 };
    }

    const skip = (page - 1) * limit;
    const limitNum = parseInt(limit);

    // Get reviews with original userId preserved
    const reviews = await ReviewModel.find(filter)
      .sort(sort)
      .skip(skip)
      .limit(limitNum)
      .lean();

    // Store original userIds before population
    const reviewsWithOriginalIds = reviews.map((review) => ({
      ...review,
      originalUserId: review.userId, // Preserve original ObjectId
    }));

    // Populate user data separately
    const populatedReviews = await ReviewModel.populate(
      reviewsWithOriginalIds,
      {
        path: "userId",
        select: "name email",
      }
    );

    // Get total count
    const totalReviews = await ReviewModel.countDocuments(filter);

    // Get rating statistics - ✅ FIXED: Use ObjectId in aggregation
    const ratingStatsAggregate = await ReviewModel.aggregate([
      {
        $match: {
          productId: productObjectId, // ✅ Use ObjectId here too
          isHidden: { $ne: true },
        },
      },
      {
        $group: {
          _id: null,
          averageRating: { $avg: "$rating" },
          totalReviews: { $sum: 1 },
          distribution: {
            $push: "$rating",
          },
        },
      },
    ]);

    let ratingStats = null;
    if (ratingStatsAggregate.length > 0) {
      const stats = ratingStatsAggregate[0];
      const distribution = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 };

      stats.distribution.forEach((rating) => {
        distribution[rating]++;
      });

      ratingStats = {
        averageRating: Math.round(stats.averageRating * 10) / 10,
        totalReviews: stats.totalReviews,
        distribution,
      };
    }

    // Add user interaction data if user is authenticated
    let reviewsWithInteraction = populatedReviews;
    if (req.user) {
      reviewsWithInteraction = populatedReviews.map((review) => {
        const userLiked = review.likes?.some(
          (like) => like.user?.toString() === req.user._id.toString()
        );
        const userDisliked = review.dislikes?.some(
          (dislike) => dislike.user?.toString() === req.user._id.toString()
        );

        return {
          ...review,
          userInteraction: {
            isLiked: userLiked || false,
            isDisliked: userDisliked || false,
          },
        };
      });
    }

    res.status(200).json({
      success: true,
      reviews: reviewsWithInteraction,
      totalReviews,
      currentPage: parseInt(page),
      totalPages: Math.ceil(totalReviews / limitNum),
      ratingStats,
      message: "Reviews retrieved successfully",
    });
  } catch (error) {
    console.error("Get product reviews error:", error);
    next(new ErrorHandler("Failed to fetch reviews", 500));
  }
});

// Get user's reviews
export const getUserReviews = catchAsyncError(async (req, res, next) => {
  try {
    const { page = 1, limit = 10 } = req.query;
    const skip = (page - 1) * limit;
    const limitNum = parseInt(limit);

    const reviews = await ReviewModel.find({ userId: req.user._id })
      .populate("productId", "name images")
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limitNum);

    const totalReviews = await ReviewModel.countDocuments({
      userId: req.user._id,
    });

    res.status(200).json({
      success: true,
      reviews,
      totalReviews,
      currentPage: parseInt(page),
      totalPages: Math.ceil(totalReviews / limitNum),
      message: "User reviews retrieved successfully",
    });
  } catch (error) {
    console.error("Get user reviews error:", error);
    next(new ErrorHandler("Failed to fetch user reviews", 500));
  }
});

// Update review
export const updateReview = catchAsyncError(async (req, res, next) => {
  try {
    const { id } = req.params;
    const { rating, title, text, images = [], isAnonymous } = req.body;

    const review = await ReviewModel.findById(id);
    if (!review) {
      return next(new ErrorHandler("Review not found", 404));
    }

    // Check ownership
    if (review.userId.toString() !== req.user._id.toString()) {
      return next(
        new ErrorHandler("You can only update your own reviews", 403)
      );
    }

    // Validate text length
    if (text && text.trim().length > MAX_TEXT_LENGTH) {
      return next(
        new ErrorHandler(
          `Review text cannot exceed ${MAX_TEXT_LENGTH} characters`,
          400
        )
      );
    }

    // Validate title length
    if (title && title.trim().length > MAX_TITLE_LENGTH) {
      return next(
        new ErrorHandler(
          `Review title cannot exceed ${MAX_TITLE_LENGTH} characters`,
          400
        )
      );
    }

    // Validate images count
    if (images.length > MAX_IMAGES) {
      return next(
        new ErrorHandler(`Maximum ${MAX_IMAGES} images allowed`, 400)
      );
    }

    // Update fields
    if (rating) review.rating = rating;
    if (title !== undefined) review.title = title?.trim() || "";
    if (text) review.text = text.trim();
    if (images.length >= 0) review.images = images;
    if (isAnonymous !== undefined) review.isAnonymous = isAnonymous;

    await review.save();
    await review.populate("userId", "name email");

    res.status(200).json({
      success: true,
      review,
      message: "Review updated successfully",
    });
  } catch (error) {
    console.error("Update review error:", error);
    next(new ErrorHandler("Failed to update review", 500));
  }
});

// Delete review
export const deleteReview = catchAsyncError(async (req, res, next) => {
  try {
    const { id } = req.params;

    const review = await ReviewModel.findById(id);
    if (!review) {
      return next(new ErrorHandler("Review not found", 404));
    }

    // Check if user owns the review or is admin
    if (
      review.userId.toString() !== req.user._id.toString() &&
      req.user.role !== "admin"
    ) {
      return next(
        new ErrorHandler("You can only delete your own reviews", 403)
      );
    }

    // Delete images from Cloudinary
    if (review.images && review.images.length > 0) {
      for (const image of review.images) {
        try {
          await deleteFromCloudinary(image.url);
        } catch (error) {
          console.warn("Failed to delete image:", error.message);
        }
      }
    }

    await ReviewModel.findByIdAndDelete(id);

    res.status(200).json({
      success: true,
      message: "Review deleted successfully",
    });
  } catch (error) {
    console.error("Delete review error:", error);
    next(new ErrorHandler("Failed to delete review", 500));
  }
});

// Like/Unlike review
export const toggleReviewLike = catchAsyncError(async (req, res, next) => {
  try {
    const { id } = req.params;
    const userId = req.user._id;

    const review = await ReviewModel.findById(id);
    if (!review) {
      return next(new ErrorHandler("Review not found", 404));
    }

    // Initialize arrays if they don't exist
    if (!review.likes) review.likes = [];
    if (!review.dislikes) review.dislikes = [];

    // Check if user already liked
    const likeIndex = review.likes.findIndex(
      (like) => like.user?.toString() === userId.toString()
    );

    // Remove from dislikes if present
    const dislikeIndex = review.dislikes.findIndex(
      (dislike) => dislike.user?.toString() === userId.toString()
    );
    if (dislikeIndex > -1) {
      review.dislikes.splice(dislikeIndex, 1);
    }

    // Toggle like
    if (likeIndex > -1) {
      review.likes.splice(likeIndex, 1);
    } else {
      review.likes.push({ user: userId });
    }

    await review.save();

    res.status(200).json({
      success: true,
      isLiked: likeIndex === -1,
      isDisliked: false,
      likesCount: review.likes.length,
      dislikesCount: review.dislikes.length,
      message: likeIndex > -1 ? "Like removed" : "Review liked",
    });
  } catch (error) {
    console.error("Toggle review like error:", error);
    next(new ErrorHandler("Failed to update like status", 500));
  }
});

// Dislike/Remove dislike review
export const toggleReviewDislike = catchAsyncError(async (req, res, next) => {
  try {
    const { id } = req.params;
    const userId = req.user._id;

    const review = await ReviewModel.findById(id);
    if (!review) {
      return next(new ErrorHandler("Review not found", 404));
    }

    // Initialize arrays if they don't exist
    if (!review.likes) review.likes = [];
    if (!review.dislikes) review.dislikes = [];

    // Check if user already disliked
    const dislikeIndex = review.dislikes.findIndex(
      (dislike) => dislike.user?.toString() === userId.toString()
    );

    // Remove from likes if present
    const likeIndex = review.likes.findIndex(
      (like) => like.user?.toString() === userId.toString()
    );
    if (likeIndex > -1) {
      review.likes.splice(likeIndex, 1);
    }

    // Toggle dislike
    if (dislikeIndex > -1) {
      review.dislikes.splice(dislikeIndex, 1);
    } else {
      review.dislikes.push({ user: userId });
    }

    await review.save();

    res.status(200).json({
      success: true,
      isLiked: false,
      isDisliked: dislikeIndex === -1,
      likesCount: review.likes.length,
      dislikesCount: review.dislikes.length,
      message: dislikeIndex > -1 ? "Dislike removed" : "Review disliked",
    });
  } catch (error) {
    console.error("Toggle review dislike error:", error);
    next(new ErrorHandler("Failed to update dislike status", 500));
  }
});

// Report review
export const reportReview = catchAsyncError(async (req, res, next) => {
  try {
    const { id } = req.params;
    const { reason, description } = req.body;
    const userId = req.user._id;

    if (!reason) {
      return next(new ErrorHandler("Report reason is required", 400));
    }

    const validReasons = [
      "spam",
      "inappropriate",
      "fake",
      "offensive",
      "other",
    ];
    if (!validReasons.includes(reason)) {
      return next(new ErrorHandler("Invalid report reason", 400));
    }

    const review = await ReviewModel.findById(id);
    if (!review) {
      return next(new ErrorHandler("Review not found", 404));
    }

    // Initialize reports array if it doesn't exist
    if (!review.reports) review.reports = [];

    // Check if user already reported this review
    const existingReport = review.reports.find(
      (report) => report.reportedBy?.toString() === userId.toString()
    );

    if (existingReport) {
      return next(
        new ErrorHandler("You have already reported this review", 400)
      );
    }

    // Add report
    review.reports.push({
      reportedBy: userId,
      reason,
      description: description?.trim(),
      reportedAt: new Date(),
    });

    await review.save();

    res.status(200).json({
      success: true,
      message: "Review reported successfully",
    });
  } catch (error) {
    console.error("Report review error:", error);
    next(new ErrorHandler("Failed to report review", 500));
  }
});

// Admin: Get reported reviews
export const getReportedReviews = catchAsyncError(async (req, res, next) => {
  try {
    const { page = 1, limit = 10 } = req.query;
    const skip = (page - 1) * limit;
    const limitNum = parseInt(limit);

    // Only admin can access this
    if (req.user.role !== "admin") {
      return next(new ErrorHandler("Access denied. Admin only.", 403));
    }

    const reviews = await ReviewModel.find({
      "reports.0": { $exists: true }, // Has at least one report
    })
      .populate("userId", "name email")
      .populate("productId", "name")
      .populate("reports.reportedBy", "name email")
      .sort({ "reports.reportedAt": -1 })
      .skip(skip)
      .limit(limitNum);

    const totalReported = await ReviewModel.countDocuments({
      "reports.0": { $exists: true },
    });

    res.status(200).json({
      success: true,
      reviews,
      totalReported,
      currentPage: parseInt(page),
      totalPages: Math.ceil(totalReported / limitNum),
      message: "Reported reviews retrieved successfully",
    });
  } catch (error) {
    console.error("Get reported reviews error:", error);
    next(new ErrorHandler("Failed to fetch reported reviews", 500));
  }
});

// Admin: Hide/Unhide review
export const toggleReviewVisibility = catchAsyncError(
  async (req, res, next) => {
    try {
      const { id } = req.params;
      const { reason } = req.body;

      // Only admin can access this
      if (req.user.role !== "admin") {
        return next(new ErrorHandler("Access denied. Admin only.", 403));
      }

      const review = await ReviewModel.findById(id);
      if (!review) {
        return next(new ErrorHandler("Review not found", 404));
      }

      // Toggle visibility
      review.isHidden = !review.isHidden;

      if (review.isHidden) {
        review.hiddenBy = req.user._id;
        review.hiddenAt = new Date();
        review.hiddenReason = reason?.trim();
      } else {
        review.hiddenBy = undefined;
        review.hiddenAt = undefined;
        review.hiddenReason = undefined;
      }

      await review.save();

      res.status(200).json({
        success: true,
        review,
        message: `Review ${
          review.isHidden ? "hidden" : "unhidden"
        } successfully`,
      });
    } catch (error) {
      console.error("Toggle review visibility error:", error);
      next(new ErrorHandler("Failed to update review visibility", 500));
    }
  }
);

// Add response to review (seller/admin)
export const addReviewResponse = catchAsyncError(async (req, res, next) => {
  try {
    const { id } = req.params;
    const { text } = req.body;

    if (!text || text.trim().length === 0) {
      return next(new ErrorHandler("Response text is required", 400));
    }

    if (text.length > 1000) {
      return next(
        new ErrorHandler("Response cannot exceed 1000 characters", 400)
      );
    }

    const review = await ReviewModel.findById(id);
    if (!review) {
      return next(new ErrorHandler("Review not found", 404));
    }

    // Check if user has permission to respond
    const userRole = req.user.role;
    if (userRole !== "admin" && userRole !== "seller") {
      return next(
        new ErrorHandler("Only sellers and admins can respond to reviews", 403)
      );
    }

    // Check if response already exists
    if (review.response && review.response.text) {
      return next(
        new ErrorHandler("Response already exists for this review", 400)
      );
    }

    // Add response
    review.response = {
      text: text.trim(),
      respondedBy: req.user._id,
      respondedAt: new Date(),
      role: userRole,
    };

    await review.save();
    await review.populate("response.respondedBy", "name");

    res.status(200).json({
      success: true,
      review,
      message: "Response added successfully",
    });
  } catch (error) {
    console.error("Add review response error:", error);
    next(new ErrorHandler("Failed to add response", 500));
  }
});

// Get review analytics (admin)
export const getReviewAnalytics = catchAsyncError(async (req, res, next) => {
  try {
    // Only admin can access this
    if (req.user.role !== "admin") {
      return next(new ErrorHandler("Access denied. Admin only.", 403));
    }

    const { productId, startDate, endDate } = req.query;

    // Build match criteria
    const matchCriteria = { isHidden: { $ne: true } };

    if (productId) {
      matchCriteria.productId = productId;
    }

    if (startDate || endDate) {
      matchCriteria.createdAt = {};
      if (startDate) matchCriteria.createdAt.$gte = new Date(startDate);
      if (endDate) matchCriteria.createdAt.$lte = new Date(endDate);
    }

    const analytics = await ReviewModel.aggregate([
      { $match: matchCriteria },
      {
        $group: {
          _id: null,
          totalReviews: { $sum: 1 },
          averageRating: { $avg: "$rating" },
          totalLikes: { $sum: { $size: { $ifNull: ["$likes", []] } } },
          totalDislikes: { $sum: { $size: { $ifNull: ["$dislikes", []] } } },
          verifiedReviews: {
            $sum: { $cond: ["$isVerifiedPurchase", 1, 0] },
          },
          anonymousReviews: {
            $sum: { $cond: ["$isAnonymous", 1, 0] },
          },
          reviewsWithImages: {
            $sum: {
              $cond: [
                { $gt: [{ $size: { $ifNull: ["$images", []] } }, 0] },
                1,
                0,
              ],
            },
          },
          ratingDistribution: {
            $push: "$rating",
          },
        },
      },
    ]);

    // Calculate rating distribution
    let distribution = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 };
    if (analytics.length > 0 && analytics[0].ratingDistribution) {
      analytics[0].ratingDistribution.forEach((rating) => {
        distribution[rating]++;
      });
    }

    const result =
      analytics.length > 0
        ? {
            ...analytics[0],
            ratingDistribution: distribution,
            averageRating: Math.round(analytics[0].averageRating * 100) / 100,
          }
        : {
            totalReviews: 0,
            averageRating: 0,
            totalLikes: 0,
            totalDislikes: 0,
            verifiedReviews: 0,
            anonymousReviews: 0,
            reviewsWithImages: 0,
            ratingDistribution: distribution,
          };

    res.status(200).json({
      success: true,
      analytics: result,
      message: "Review analytics retrieved successfully",
    });
  } catch (error) {
    console.error("Get review analytics error:", error);
    next(new ErrorHandler("Failed to fetch review analytics", 500));
  }
});

// Remove image from review
export const removeReviewImage = catchAsyncError(async (req, res, next) => {
  try {
    const { reviewId } = req.params;
    const { imageUrl } = req.body;

    if (!imageUrl) {
      return next(new ErrorHandler("Image URL is required", 400));
    }

    const review = await ReviewModel.findById(reviewId);
    if (!review) {
      return next(new ErrorHandler("Review not found", 404));
    }

    // Check ownership
    if (review.userId.toString() !== req.user._id.toString()) {
      return next(
        new ErrorHandler("You can only modify your own reviews", 403)
      );
    }

    // Find image
    const imageIndex = review.images.findIndex((img) => img.url === imageUrl);
    if (imageIndex === -1) {
      return next(new ErrorHandler("Image not found in review", 404));
    }

    const imageToDelete = review.images[imageIndex];

    // Delete from Cloudinary
    try {
      const publicId =
        imageToDelete.publicId || getPublicIdFromUrl(imageToDelete.url);
      if (publicId) {
        await cloudinary.uploader.destroy(publicId);
      }
    } catch (error) {
      console.warn("Failed to delete image from Cloudinary:", error.message);
      // Continue anyway to remove from database
    }

    // Remove from review
    review.images.splice(imageIndex, 1);
    await review.save();

    res.status(200).json({
      success: true,
      message: "Image removed successfully",
      remainingImages: review.images.length,
      images: review.images,
    });
  } catch (error) {
    console.error("Remove review image error:", error);
    next(new ErrorHandler("Failed to remove image", 500));
  }
});
