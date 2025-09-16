import { catchAsyncError } from "./catchAsyncError.js";
import ErrorHandler from "./error.js";
import jwt from "jsonwebtoken";
import { User } from "../models/userModel.js";

export const isAuthenticated = catchAsyncError(async (req, res, next) => {
  let token;

  // Try to get token from cookies first, then Authorization header
  if (req.cookies.token) {
    token = req.cookies.token;
  } else if (
    req.headers.authorization &&
    req.headers.authorization.startsWith("Bearer ")
  ) {
    token = req.headers.authorization.split(" ")[1];
  }

  if (!token) {
    return next(new ErrorHandler("User is not authenticated.", 401));
  }

  try {
    // Verify the token
    const decoded = jwt.verify(token, process.env.JWT_SECRET_KEY);

    // Find user by the decoded ID
    const user = await User.findById(decoded.id);

    if (!user) {
      return next(new ErrorHandler("User not found.", 404));
    }

    // Check if user account is verified
    if (!user.accountVerified) {
      return next(new ErrorHandler("Please verify your account first.", 401));
    }

    req.user = user;
    next();
  } catch (error) {
    if (error.name === "JsonWebTokenError") {
      return next(new ErrorHandler("Invalid token.", 401));
    } else if (error.name === "TokenExpiredError") {
      return next(
        new ErrorHandler("Token has expired. Please login again.", 401)
      );
    } else {
      return next(new ErrorHandler("Authentication failed.", 401));
    }
  }
});

// Role-based authorization middleware
export const authorizeRoles = (...roles) => {
  return catchAsyncError(async (req, res, next) => {
    // Check if user is authenticated first
    if (!req.user) {
      return next(new ErrorHandler("Please login to access this resource.", 401));
    }

    // Check if user has the required role
    if (!roles.includes(req.user.role)) {
      return next(
        new ErrorHandler(
          `Access denied. Required role(s): ${roles.join(", ")}. Your role: ${req.user.role}`,
          403
        )
      );
    }

    next();
  });
};

// Alternative: Check for specific permissions if you have a permission-based system
export const hasPermission = (permission) => {
  return catchAsyncError(async (req, res, next) => {
    if (!req.user) {
      return next(new ErrorHandler("Please login to access this resource.", 401));
    }

    // If user has permissions array
    if (req.user.permissions && req.user.permissions.includes(permission)) {
      return next();
    }

    // Check role-based permissions
    const rolePermissions = {
      admin: ["*"], // Admin has all permissions
      seller: ["manage_products", "respond_reviews", "view_analytics"],
      user: ["create_review", "edit_own_review", "delete_own_review"],
    };

    const userPermissions = rolePermissions[req.user.role] || [];

    if (userPermissions.includes("*") || userPermissions.includes(permission)) {
      return next();
    }

    return next(
      new ErrorHandler(
        `Access denied. Required permission: ${permission}`,
        403
      )
    );
  });
};

// Check if user owns the resource (useful for editing own reviews, etc.)
export const isOwnerOrAdmin = (resourceField = "userId") => {
  return catchAsyncError(async (req, res, next) => {
    if (!req.user) {
      return next(new ErrorHandler("Please login to access this resource.", 401));
    }

    // Admin can access everything
    if (req.user.role === "admin") {
      return next();
    }

    // For other routes, you'll need to implement resource ownership check
    // This is a placeholder - you'll customize based on your needs
    const resourceId = req.params.id;
    
    // Example: Check if user owns the review
    if (req.resource && req.resource[resourceField]) {
      if (req.resource[resourceField].toString() === req.user._id.toString()) {
        return next();
      }
    }

    return next(
      new ErrorHandler("Access denied. You can only access your own resources.", 403)
    );
  });
};

// Middleware to check if user is active/not banned
export const isActiveUser = catchAsyncError(async (req, res, next) => {
  if (!req.user) {
    return next(new ErrorHandler("Please login to access this resource.", 401));
  }

  // Check if user is active (assuming you have an isActive field)
  if (req.user.isActive === false) {
    return next(new ErrorHandler("Your account has been deactivated. Please contact support.", 403));
  }

  // Check if user is banned (assuming you have an isBanned field)
  if (req.user.isBanned === true) {
    return next(new ErrorHandler("Your account has been banned. Please contact support.", 403));
  }

  next();
});

// Rate limiting middleware (basic implementation)
export const createRateLimit = (maxRequests = 10, windowMs = 15 * 60 * 1000) => {
  const requests = new Map();

  return catchAsyncError(async (req, res, next) => {
    const key = req.user ? req.user._id.toString() : req.ip;
    const now = Date.now();
    const windowStart = now - windowMs;

    // Clean old requests
    if (requests.has(key)) {
      const userRequests = requests.get(key).filter(time => time > windowStart);
      requests.set(key, userRequests);
    }

    const currentRequests = requests.get(key) || [];

    if (currentRequests.length >= maxRequests) {
      return next(
        new ErrorHandler(
          `Rate limit exceeded. Maximum ${maxRequests} requests per ${windowMs / 1000 / 60} minutes.`,
          429
        )
      );
    }

    currentRequests.push(now);
    requests.set(key, currentRequests);

    next();
  });
};