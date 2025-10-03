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
  verifyForgotPasswordOTP,
  getUserStats,
  getLatestUsers,
  getSingleUser,
  updateUser,
  bulkUpdateUserStatus,
  getMonthlySalesAndUsers,
} from "../controllers/userController.js";
import { isAuthenticated } from "../middlewares/auth.js";
import { googleAuth } from "../controllers/authController.js";
import upload from "../middlewares/multer.js";

const router = express.Router();

router.post("/register", register);
router.post("/otp-verification", verifyOTP);
router.post("/resend-otp", resendOTP);

router.post("/login", clientLogin);
router.post("/admin/login", adminLogin);
router.get("/logout", isAuthenticated, logout);

router.get("/me", isAuthenticated, getUser);

router.post("/password/forgot", forgotPassword);
router.put("/password/reset", resetPassword);

// Updated Google OAuth route to POST for auth code exchange
router.post("/google", googleAuth);

router.put(
  "/user-avtar",
  isAuthenticated,
  upload.single("avatar"),
  userAvatarController
);
router.delete("/deleteImage", isAuthenticated, removeImageFromCloudinary);

router.put("/profile", isAuthenticated, updateProfile);
router.put("/change-password", isAuthenticated, changePassword);

router.get("/count", isAuthenticated, getUsersCount);

router.get("/all", isAuthenticated, getAllUsers);
router.delete("/bulk-delete", isAuthenticated, bulkDeleteUsers);
router.delete("/:id", isAuthenticated, deleteUser);

router.post("/authWithGoogle", authWithGoogle);
router.post("/googleLogin", googleLogin);
router.post("/setPasswordForGoogleUser", setPasswordForGoogleUser);

router.put("/set-password", isAuthenticated, setPassword);

router.get("/users-by-month", isAuthenticated, getUsersByMonth);
router.post("/password/verify-otp", verifyForgotPasswordOTP);

router.get("/stats", isAuthenticated, getUserStats);
router.get("/latest", isAuthenticated, getLatestUsers);
router.get("/:id", isAuthenticated, getSingleUser);
router.patch("/:id", isAuthenticated, updateUser);
router.patch("/bulk-status-update", isAuthenticated, bulkUpdateUserStatus);

router.get("/monthly-sales-users", isAuthenticated, getMonthlySalesAndUsers);

export default router;
