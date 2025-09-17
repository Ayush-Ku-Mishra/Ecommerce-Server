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
import { isAuthenticated, authorizeRoles } from "../middlewares/auth.js";
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
router.get("/count", isAuthenticated, authorizeRoles("admin"), getUsersCount);
router.get("/all", isAuthenticated, authorizeRoles("admin"), getAllUsers);
router.get("/users-by-month", isAuthenticated, authorizeRoles("admin"), getUsersByMonth);
router.delete("/bulk-delete", isAuthenticated, authorizeRoles("admin"), bulkDeleteUsers);
router.delete("/:id", isAuthenticated, authorizeRoles("admin"), deleteUser);

export default router;

// Example of app.js usage with different base paths:
/*
// In your main app.js file:
app.use("/api/v1/user", userRouter); // Client routes
app.use("/api/v1/admin", adminRouter); // Admin routes (if you want separate admin routes)
*/