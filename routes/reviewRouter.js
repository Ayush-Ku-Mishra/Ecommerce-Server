import express from "express";
import {
  uploadReviewImages,
  createReview,
  getProductReviews,
  getUserReviews,
  updateReview,
  deleteReview,
  toggleReviewLike,
  toggleReviewDislike,
  reportReview,
  getReportedReviews,
  toggleReviewVisibility,
  addReviewResponse,
  getReviewAnalytics,
  removeReviewImage,
} from "../controllers/reviewController.js";
import { isAuthenticated, authorizeRoles } from "../middlewares/auth.js";
import upload from "../middlewares/multer.js";

const reviewRouter = express.Router();

// Public routes
reviewRouter.get("/product/:productId", getProductReviews); // Get all reviews for a product

// Protected routes (require authentication)
reviewRouter.post("/", isAuthenticated, createReview); // Create new review
reviewRouter.get("/user/my-reviews", isAuthenticated, getUserReviews); // Get user's reviews
reviewRouter.put("/:id", isAuthenticated, updateReview); // Update review
reviewRouter.delete("/:id", isAuthenticated, deleteReview); // Delete review

// Image upload routes
reviewRouter.post(
  "/upload-images",
  isAuthenticated,
  upload.array("images", 5), // Max 5 images
  uploadReviewImages
);
reviewRouter.delete(
  "/:reviewId/remove-image",
  isAuthenticated,
  removeReviewImage
);

// Review interaction routes
reviewRouter.post("/:id/like", isAuthenticated, toggleReviewLike); // Like/unlike review
reviewRouter.post("/:id/dislike", isAuthenticated, toggleReviewDislike); // Dislike/remove dislike
reviewRouter.post("/:id/report", isAuthenticated, reportReview); // Report review

// Seller/Admin routes
reviewRouter.post(
  "/:id/response",
  isAuthenticated,
  authorizeRoles("seller", "admin"),
  addReviewResponse
); // Add response to review

// Admin only routes
reviewRouter.get(
  "/admin/reported",
  isAuthenticated,
  authorizeRoles("admin"),
  getReportedReviews
); // Get reported reviews

reviewRouter.patch(
  "/admin/:id/visibility",
  isAuthenticated,
  authorizeRoles("admin"),
  toggleReviewVisibility
); // Hide/unhide review

reviewRouter.get(
  "/admin/analytics",
  isAuthenticated,
  authorizeRoles("admin"),
  getReviewAnalytics
); // Get review analytics

export default reviewRouter;