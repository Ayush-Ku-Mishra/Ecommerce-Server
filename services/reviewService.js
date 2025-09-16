// reviewService.js - Business logic for reviews
import { Review } from "../models/reviewModel.js";
import mongoose from "mongoose";

export class ReviewService {
  // Get reviews with advanced filtering
  static async getReviewsWithFilters(productId, filters = {}) {
    const {
      page = 1,
      limit = 10,
      sortBy = "newest",
      rating,
      verified,
      hasImages,
      userId
    } = filters;

    // Build filter object
    const filter = {
      productId: mongoose.Types.ObjectId(productId),
      isHidden: false,
    };

    if (rating) filter.rating = parseInt(rating);
    if (verified === "true") filter.isVerifiedPurchase = true;
    if (hasImages === "true") filter["images.0"] = { $exists: true };

    // Build sort object
    const sortOptions = {
      newest: { createdAt: -1 },
      oldest: { createdAt: 1 },
      highest: { rating: -1, createdAt: -1 },
      lowest: { rating: 1, createdAt: -1 },
      helpful: { helpfulCount: -1, createdAt: -1 },
      controversial: { 
        $expr: { 
          $abs: { $subtract: ["$helpfulCount", "$unhelpfulCount"] } 
        }
      }
    };

    const sort = sortOptions[sortBy] || sortOptions.newest;
    const skip = (page - 1) * limit;

    // Execute query with pagination
    const [reviews, totalCount, stats] = await Promise.all([
      Review.find(filter)
        .populate('userId', 'name email avatar')
        .populate('response.respondedBy', 'name role')
        .sort(sort)
        .skip(skip)
        .limit(parseInt(limit)),
      Review.countDocuments(filter),
      Review.getAverageRating(productId)
    ]);

    // Add user interaction data if userId provided
    if (userId) {
      reviews.forEach(review => {
        review._doc.userInteraction = review.getUserInteraction(userId);
      });
    }

    return {
      reviews,
      pagination: {
        currentPage: parseInt(page),
        totalPages: Math.ceil(totalCount / limit),
        totalReviews: totalCount,
        hasNextPage: page < Math.ceil(totalCount / limit),
        hasPrevPage: page > 1
      },
      stats
    };
  }

  // Check if user can review product
  static async canUserReviewProduct(userId, productId) {
    // Check if user already reviewed this product
    const existingReview = await Review.findOne({
      userId: mongoose.Types.ObjectId(userId),
      productId: mongoose.Types.ObjectId(productId)
    });

    if (existingReview) {
      return { canReview: false, reason: "Already reviewed" };
    }

    // Here you can add more business logic
    // e.g., check if user purchased the product
    // const hasPurchased = await Order.findOne({
    //   userId: userId,
    //   "items.productId": productId,
    //   status: "delivered"
    // });

    // if (!hasPurchased) {
    //   return { canReview: false, reason: "Must purchase to review" };
    // }

    return { canReview: true };
  }

  // Get review summary for product
  static async getProductReviewSummary(productId) {
    const stats = await Review.getAverageRating(productId);
    
    // Get recent reviews
    const recentReviews = await Review.find({
      productId: mongoose.Types.ObjectId(productId),
      isHidden: false
    })
      .populate('userId', 'name')
      .sort({ createdAt: -1 })
      .limit(3);

    // Get most helpful review
    const mostHelpful = await Review.findOne({
      productId: mongoose.Types.ObjectId(productId),
      isHidden: false,
      helpfulCount: { $gt: 0 }
    })
      .populate('userId', 'name')
      .sort({ helpfulCount: -1 });

    return {
      ...stats,
      recentReviews,
      mostHelpful,
      verifiedPurchaseCount: await Review.countDocuments({
        productId: mongoose.Types.ObjectId(productId),
        isVerifiedPurchase: true,
        isHidden: false
      })
    };
  }

  // Bulk operations for admin
  static async bulkHideReviews(reviewIds, adminId, reason) {
    const result = await Review.updateMany(
      { _id: { $in: reviewIds } },
      {
        $set: {
          isHidden: true,
          hiddenBy: adminId,
          hiddenAt: new Date(),
          hiddenReason: reason
        }
      }
    );

    return result;
  }

  // Get trending reviews (highly interactive)
  static async getTrendingReviews(limit = 10) {
    return await Review.find({
      isHidden: false,
      createdAt: { $gte: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000) } // Last 7 days
    })
      .populate('userId', 'name')
      .populate('productId', 'name images')
      .sort({ 
        helpfulCount: -1,
        'images.length': -1, // Reviews with images get priority
        createdAt: -1 
      })
      .limit(limit);
  }
}

// Notification service for reviews
export class ReviewNotificationService {
  // Notify when review is created
  static async notifyReviewCreated(review) {
    // Implementation would depend on your notification system
    console.log(`New review created for product ${review.productId} by user ${review.userId}`);
    
    // You could:
    // 1. Send email to product owner/seller
    // 2. Create in-app notification
    // 3. Update product rating cache
    // 4. Trigger webhooks
  }

  // Notify when review gets response
  static async notifyReviewResponse(review, response) {
    console.log(`Review ${review._id} received response from ${response.role}`);
    
    // Notify original reviewer about the response
  }

  // Notify when review is reported multiple times
  static async notifyReviewReported(review) {
    if (review.reports.length >= 3) { // Threshold for multiple reports
      console.log(`Review ${review._id} has been reported ${review.reports.length} times`);
      
      // Auto-hide or flag for admin review
    }
  }
}

// Review validation utilities
export class ReviewValidator {
  static validateReviewData(data) {
    const errors = [];

    if (!data.rating || data.rating < 1 || data.rating > 5) {
      errors.push("Rating must be between 1 and 5");
    }

    if (!data.text || data.text.trim().length < 10) {
      errors.push("Review text must be at least 10 characters");
    }

    if (data.text && data.text.length > 2000) {
      errors.push("Review text cannot exceed 2000 characters");
    }

    if (data.title && data.title.length > 100) {
      errors.push("Review title cannot exceed 100 characters");
    }

    if (data.images && data.images.length > 5) {
      errors.push("Maximum 5 images allowed per review");
    }

    return {
      isValid: errors.length === 0,
      errors
    };
  }

  static sanitizeReviewText(text) {
    // Remove potential harmful content, profanity filter, etc.
    return text
      .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '') // Remove scripts
      .replace(/<[^>]+>/g, '') // Remove HTML tags
      .trim();
  }

  static detectSpam(review, userReviews) {
    const spamIndicators = [];

    // Check for duplicate content
    const duplicateContent = userReviews.some(r => 
      r._id.toString() !== review._id?.toString() && 
      r.text.toLowerCase() === review.text.toLowerCase()
    );
    
    if (duplicateContent) {
      spamIndicators.push("Duplicate content detected");
    }

    // Check for excessive capitalization
    const capsRatio = (review.text.match(/[A-Z]/g) || []).length / review.text.length;
    if (capsRatio > 0.7) {
      spamIndicators.push("Excessive capitalization");
    }

    // Check for repeated characters
    const repeatedChars = /(.)\1{4,}/g;
    if (repeatedChars.test(review.text)) {
      spamIndicators.push("Repeated characters detected");
    }

    // Check posting frequency
    const recentReviews = userReviews.filter(r => 
      new Date() - new Date(r.createdAt) < 3600000 // Last hour
    );
    
    if (recentReviews.length > 5) {
      spamIndicators.push("High posting frequency");
    }

    return {
      isSpam: spamIndicators.length > 2,
      indicators: spamIndicators,
      confidence: Math.min(spamIndicators.length / 3, 1)
    };
  }
}

// Review analytics utilities
export class ReviewAnalytics {
  static async getProductInsights(productId, dateRange = 30) {
    const startDate = new Date(Date.now() - dateRange * 24 * 60 * 60 * 1000);
    
    const pipeline = [
      {
        $match: {
          productId: mongoose.Types.ObjectId(productId),
          createdAt: { $gte: startDate },
          isHidden: false
        }
      },
      {
        $group: {
          _id: {
            year: { $year: "$createdAt" },
            month: { $month: "$createdAt" },
            day: { $dayOfMonth: "$createdAt" }
          },
          count: { $sum: 1 },
          averageRating: { $avg: "$rating" },
          totalLikes: { $sum: { $size: "$likes" } },
          totalDislikes: { $sum: { $size: "$dislikes" } }
        }
      },
      { $sort: { "_id.year": 1, "_id.month": 1, "_id.day": 1 } }
    ];

    const dailyStats = await Review.aggregate(pipeline);
    
    return {
      dailyStats,
      insights: {
        trendDirection: this.calculateTrend(dailyStats),
        peakDay: this.findPeakDay(dailyStats),
        avgResponseTime: await this.calculateAvgResponseTime(productId)
      }
    };
  }

  static calculateTrend(dailyStats) {
    if (dailyStats.length < 2) return "insufficient_data";
    
    const recent = dailyStats.slice(-7); // Last 7 days
    const previous = dailyStats.slice(-14, -7); // Previous 7 days
    
    const recentAvg = recent.reduce((sum, day) => sum + day.averageRating, 0) / recent.length;
    const previousAvg = previous.reduce((sum, day) => sum + day.averageRating, 0) / previous.length;
    
    if (recentAvg > previousAvg + 0.2) return "improving";
    if (recentAvg < previousAvg - 0.2) return "declining";
    return "stable";
  }

  static findPeakDay(dailyStats) {
    return dailyStats.reduce((peak, current) => 
      current.count > peak.count ? current : peak
    );
  }

  static async calculateAvgResponseTime(productId) {
    const reviewsWithResponses = await Review.find({
      productId: mongoose.Types.ObjectId(productId),
      "response.respondedAt": { $exists: true }
    });

    if (reviewsWithResponses.length === 0) return null;

    const totalResponseTime = reviewsWithResponses.reduce((sum, review) => {
      const responseTime = new Date(review.response.respondedAt) - new Date(review.createdAt);
      return sum + responseTime;
    }, 0);

    return Math.round(totalResponseTime / reviewsWithResponses.length / (1000 * 60 * 60)); // Hours
  }
}