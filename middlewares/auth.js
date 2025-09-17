import { catchAsyncError } from "./catchAsyncError.js";
import ErrorHandler from "./error.js";
import jwt from "jsonwebtoken";
import { User } from "../models/userModel.js";

export const autoAssignAdminRole = catchAsyncError(async (req, res, next) => {
  const allowedAdminEmails = [
    "amishra59137@gmail.com",
    "dasrasmi781@gmail.com",
  ];

  const { email } = req.body;

  if (email && allowedAdminEmails.includes(email)) {
    // Check if user exists and update their role
    const existingUser = await User.findOne({ email });

    if (existingUser && existingUser.role !== "admin") {
      existingUser.role = "admin";
      await existingUser.save({ validateModifiedOnly: true });
      console.log(`✅ Auto-promoted ${email} to admin role`);
    }

    // Set role in request body for new registrations
    req.body.role = "admin";
  }

  next();
});

// Middleware to ensure proper role separation
export const enforceRoleSeparation = catchAsyncError(async (req, res, next) => {
  const allowedAdminEmails = [
    "amishra59137@gmail.com",
    "dasrasmi781@gmail.com",
  ];
  const { email } = req.body;
  const isAdminRoute = req.originalUrl.includes("/admin/");

  if (isAdminRoute) {
    // Admin route - only allow admin emails
    if (!allowedAdminEmails.includes(email)) {
      return next(
        new ErrorHandler(
          "Access denied: unauthorized email for admin access.",
          403
        )
      );
    }
  } else {
    // Client route - allow all emails but don't auto-promote to admin
    // (users can still be promoted manually later)
  }

  next();
});

// Database hook to ensure roles are properly set
export const ensureProperRoles = catchAsyncError(async (req, res, next) => {
  if (req.user) {
    const allowedAdminEmails = [
      "amishra59137@gmail.com",
      "dasrasmi781@gmail.com",
    ];

    // Check if current user should be admin but isn't
    if (
      allowedAdminEmails.includes(req.user.email) &&
      req.user.role !== "admin"
    ) {
      req.user.role = "admin";
      await req.user.save({ validateModifiedOnly: true });
      console.log(`✅ Updated ${req.user.email} role to admin`);
    }

    // Check if user has admin role but shouldn't
    if (
      !allowedAdminEmails.includes(req.user.email) &&
      req.user.role === "admin"
    ) {
      req.user.role = "user";
      await req.user.save({ validateModifiedOnly: true });
      console.log(
        `⚠️ Demoted ${req.user.email} from admin role - unauthorized email`
      );
    }
  }

  next();
});

// Utility function to bulk update user roles (run this once to fix existing data)
export const fixExistingUserRoles = async () => {
  try {
    const allowedAdminEmails = [
      "amishra59137@gmail.com",
      "dasrasmi781@gmail.com",
    ];

    // Promote allowed emails to admin
    const promoteResult = await User.updateMany(
      {
        email: { $in: allowedAdminEmails },
        role: { $ne: "admin" },
      },
      {
        role: "admin",
      }
    );

    // Demote unauthorized admins to user
    const demoteResult = await User.updateMany(
      {
        email: { $nin: allowedAdminEmails },
        role: "admin",
      },
      {
        role: "user",
      }
    );

    console.log(`✅ Role fix complete:
      - Promoted ${promoteResult.modifiedCount} users to admin
      - Demoted ${demoteResult.modifiedCount} unauthorized admins to user`);

    return {
      promoted: promoteResult.modifiedCount,
      demoted: demoteResult.modifiedCount,
    };
  } catch (error) {
    console.error("❌ Error fixing user roles:", error);
    throw error;
  }
};

// Function to get all users with their roles (for admin dashboard)
export const getUsersWithRoles = catchAsyncError(async (req, res, next) => {
  const page = parseInt(req.query.page) || 1;
  const limit = parseInt(req.query.limit) || 10;
  const role = req.query.role; // Filter by role if provided

  const skip = (page - 1) * limit;

  const filter = {};
  if (role && ["user", "admin", "seller", "moderator"].includes(role)) {
    filter.role = role;
  }

  const users = await User.find(filter)
    .select("-password -verificationCode -resetPasswordToken")
    .skip(skip)
    .limit(limit)
    .sort({ createdAt: -1 });

  const totalUsers = await User.countDocuments(filter);

  res.status(200).json({
    success: true,
    users,
    pagination: {
      currentPage: page,
      totalPages: Math.ceil(totalUsers / limit),
      totalUsers,
      hasNext: page < Math.ceil(totalUsers / limit),
      hasPrev: page > 1,
    },
    roleStats: {
      total: await User.countDocuments(),
      admins: await User.countDocuments({ role: "admin" }),
      users: await User.countDocuments({ role: "user" }),
      sellers: await User.countDocuments({ role: "seller" }),
      moderators: await User.countDocuments({ role: "moderator" }),
    },
  });
});

// Rate limiting middleware (basic implementation)
export const createRateLimit = (
  maxRequests = 10,
  windowMs = 15 * 60 * 1000
) => {
  const requests = new Map();

  return catchAsyncError(async (req, res, next) => {
    const key = req.user ? req.user._id.toString() : req.ip;
    const now = Date.now();
    const windowStart = now - windowMs;

    // Clean old requests
    if (requests.has(key)) {
      const userRequests = requests
        .get(key)
        .filter((time) => time > windowStart);
      requests.set(key, userRequests);
    }

    const currentRequests = requests.get(key) || [];

    if (currentRequests.length >= maxRequests) {
      return next(
        new ErrorHandler(
          `Rate limit exceeded. Maximum ${maxRequests} requests per ${
            windowMs / 1000 / 60
          } minutes.`,
          429
        )
      );
    }

    currentRequests.push(now);
    requests.set(key, currentRequests);

    next();
  });
};
