import express from "express";
import {
  register,
  verifyOTP,
  resendOTP,
  clientLogin,
  logout,
  getUser,
  forgotPassword,
  resetPassword,
  userAvatarController,
  removeImageFromCloudinary,
  updateProfile,
  changePassword,
  authWithGoogle,
  googleLogin,
  setPasswordForGoogleUser,
  setPassword,
} from "../controllers/userController.js";
import { isAuthenticated, userOrAdmin } from "../middlewares/auth.js";
import { googleAuth } from "../controllers/authController.js";
import upload from "../middlewares/multer.js";

const router = express.Router();

// Public routes
router.post("/register", register);
router.post("/otp-verification", verifyOTP);
router.post("/resend-otp", resendOTP);

// Client login routes
router.post("/login", clientLogin); // Only for regular users

// Google authentication routes for clients
router.post("/google", googleAuth);
router.post("/authWithGoogle", (req, res, next) => {
  req.body.isAdminLogin = false; // Force client login
  authWithGoogle(req, res, next);
});
router.post("/googleLogin", (req, res, next) => {
  req.body.isAdminLogin = false; // Force client login
  googleLogin(req, res, next);
});

// Password reset routes (public)
router.post("/password/forgot", forgotPassword);
router.put("/password/reset/:token", resetPassword);

// Protected user routes
router.get("/logout", isAuthenticated, logout);
router.get("/me", isAuthenticated, getUser);
router.put("/profile", isAuthenticated, updateProfile);
router.put("/change-password", isAuthenticated, changePassword);
router.put("/set-password", isAuthenticated, setPassword);
router.post("/setPasswordForGoogleUser", setPasswordForGoogleUser);

// Avatar routes
router.put(
  "/user-avtar",
  isAuthenticated,
  upload.single("avatar"),
  userAvatarController
);
router.delete("/deleteImage", isAuthenticated, removeImageFromCloudinary);

export default router;