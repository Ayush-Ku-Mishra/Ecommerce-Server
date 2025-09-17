import express from "express";
import {
  register,
  verifyOTP,
  resendOTP,
  clientLogin,
  adminLogin,
  logout,
  getUser,
  forgotPassword,
  resetPassword,
  userAvatarController,
  removeImageFromCloudinary,
  updateProfile,
  changePassword,
  getUsersCount,
  getAllUsers,
  deleteUser,
  bulkDeleteUsers,
  authWithGoogle,
  googleLogin,
  setPasswordForGoogleUser,
  setPassword,
  getUsersByMonth,
} from "../controllers/userController.js";
import { isAuthenticated, authorizeRoles, adminOnly, userOrAdmin } from "../middlewares/auth.js";
import { googleAuth } from "../controllers/authController.js";
import upload from "../middlewares/multer.js";

const router = express.Router();

// Public routes
router.post("/register", register);
router.post("/otp-verification", verifyOTP);
router.post("/resend-otp", resendOTP);

// Login routes
router.post("/login", clientLogin); // Only for users
router.post("/admin/login", adminLogin); // Only for admins

// Google authentication routes
router.post("/google", googleAuth);
router.post("/authWithGoogle", authWithGoogle);
router.post("/googleLogin", googleLogin);

// Protected user routes
router.get("/logout", isAuthenticated, logout);
router.get("/me", isAuthenticated, getUser);
router.put("/profile", isAuthenticated, updateProfile);
router.put("/change-password", isAuthenticated, changePassword);
router.put("/set-password", isAuthenticated, setPassword);
router.post("/setPasswordForGoogleUser", setPasswordForGoogleUser);

// Password reset routes
router.post("/password/forgot", forgotPassword);
router.put("/password/reset/:token", resetPassword);

// Avatar routes
router.put(
  "/user-avtar",
  isAuthenticated,
  upload.single("avatar"),
  userAvatarController
);
router.delete("/deleteImage", isAuthenticated, removeImageFromCloudinary);

// Admin-only routes - require admin role
router.get("/count", isAuthenticated, adminOnly, getUsersCount);
router.get("/all", isAuthenticated, adminOnly, getAllUsers);
router.get("/users-by-month", isAuthenticated, adminOnly, getUsersByMonth);
router.delete("/bulk-delete", isAuthenticated, adminOnly, bulkDeleteUsers);
router.delete("/:id", isAuthenticated, adminOnly, deleteUser);

export default router;
