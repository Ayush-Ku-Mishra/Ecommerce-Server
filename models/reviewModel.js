import mongoose from "mongoose";

const reviewSchema = new mongoose.Schema({
  // Product reference
  productId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "Product",
    required: true,
    index: true,
  },
  
  // Order reference (for verified purchases)
  orderId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "Order",
    index: true,
  },
  
  // User reference
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "User",
    required: true,
    index: true,
  },
  
  // Review details
  rating: {
    type: Number,
    required: true,
    min: 1,
    max: 5,
  },
  
  title: {
    type: String,
    trim: true,
    maxLength: 100,
  },
  
  text: {
    type: String,
    required: true,
    trim: true,
    maxLength: 1000, // Changed from 2000 to 1000 as per your requirement
  },
  
  // Image URLs from Cloudinary (max 5 images)
  images: [{
    url: {
      type: String,
      required: true,
    },
    publicId: {
      type: String,
      required: true,
    },
  }],
  
  // User preferences
  isAnonymous: {
    type: Boolean,
    default: false,
  },
  
  isVerifiedPurchase: {
    type: Boolean,
    default: false,
  },
  
  // Review interactions
  likes: [{
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
    },
    likedAt: {
      type: Date,
      default: Date.now,
    },
  }],
  
  dislikes: [{
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
    },
    dislikedAt: {
      type: Date,
      default: Date.now,
    },
  }],
  
  // Report system
  reports: [{
    reportedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    reason: {
      type: String,
      enum: ["spam", "inappropriate", "fake", "offensive", "other"],
      required: true,
    },
    description: {
      type: String,
      maxLength: 500,
    },
    reportedAt: {
      type: Date,
      default: Date.now,
    },
  }],
  
  // Admin actions
  isHidden: {
    type: Boolean,
    default: false,
  },
  
  hiddenBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "User",
  },
  
  hiddenAt: {
    type: Date,
  },
  
  hiddenReason: {
    type: String,
  },
  
  // Response from seller/admin
  response: {
    text: {
      type: String,
      maxLength: 1000,
    },
    respondedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
    },
    respondedAt: {
      type: Date,
    },
    role: {
      type: String,
      enum: ["seller", "admin"],
    },
  },
  
  // Metadata
  helpfulCount: {
    type: Number,
    default: 0,
  },
  
  unhelpfulCount: {
    type: Number,
    default: 0,
  },
  
  viewCount: {
    type: Number,
    default: 0,
  },
  
}, {
  timestamps: true,
  toJSON: { virtuals: true },
  toObject: { virtuals: true },
});

// Indexes for better performance
reviewSchema.index({ productId: 1, createdAt: -1 });
reviewSchema.index({ userId: 1, createdAt: -1 });
reviewSchema.index({ rating: 1 });
reviewSchema.index({ isHidden: 1 });
reviewSchema.index({ isVerifiedPurchase: 1 });
reviewSchema.index({ helpfulCount: -1 });

// Compound unique index to prevent duplicate reviews per product-user-order
reviewSchema.index(
  { productId: 1, userId: 1, orderId: 1 },
  { 
    unique: true,
    partialFilterExpression: { orderId: { $exists: true } }
  }
);

// Virtual for display name
reviewSchema.virtual('displayName').get(function() {
  if (this.isAnonymous) {
    return 'Anonymous';
  }
  return this.userId?.name || 'User';
});

// Virtual for net helpful score
reviewSchema.virtual('netHelpfulScore').get(function() {
  return this.helpfulCount - this.unhelpfulCount;
});

// Pre-save middleware to update helpful counts and validate images
reviewSchema.pre('save', function(next) {
  this.helpfulCount = this.likes.length;
  this.unhelpfulCount = this.dislikes.length;
  
  // Ensure max 5 images
  if (this.images && this.images.length > 5) {
    this.images = this.images.slice(0, 5);
  }
  
  next();
});

// Static method to get average rating for a product
reviewSchema.statics.getAverageRating = async function(productId) {
  const result = await this.aggregate([
    {
      $match: {
        productId: new mongoose.Types.ObjectId(productId),
        isHidden: false,
      }
    },
    {
      $group: {
        _id: null,
        averageRating: { $avg: '$rating' },
        totalReviews: { $sum: 1 },
        ratingDistribution: {
          $push: '$rating'
        }
      }
    }
  ]);
  
  if (result.length > 0) {
    const distribution = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 };
    result[0].ratingDistribution.forEach(rating => {
      distribution[rating]++;
    });
    
    return {
      averageRating: Math.round(result[0].averageRating * 10) / 10,
      totalReviews: result[0].totalReviews,
      distribution,
    };
  }
  
  return {
    averageRating: 0,
    totalReviews: 0,
    distribution: { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 },
  };
};

// Instance method to check if user has interacted with review
reviewSchema.methods.getUserInteraction = function(userId) {
  const hasLiked = this.likes.some(like => like.user.toString() === userId.toString());
  const hasDisliked = this.dislikes.some(dislike => dislike.user.toString() === userId.toString());
  
  return {
    hasLiked,
    hasDisliked,
    hasReported: this.reports.some(report => report.reportedBy.toString() === userId.toString()),
  };
};

const ReviewModel = mongoose.model("Review", reviewSchema);

export default ReviewModel;