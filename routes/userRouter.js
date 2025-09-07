import express from "express";
import {
  register,
  verifyOTP,
  resendOTP,
  login,
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
} from "../controllers/userController.js";
import { isAuthenticated } from "../middlewares/auth.js";
import { googleAuth } from "../controllers/authController.js";
import upload from "../middlewares/multer.js";

const router = express.Router();

router.post("/register", register);
router.post("/otp-verification", verifyOTP);
router.post("/resend-otp", resendOTP);

router.post("/login", login);
router.get("/logout", isAuthenticated, logout);

router.get("/me", isAuthenticated, getUser);

router.post("/password/forgot", forgotPassword);
router.put("/password/reset/:token", resetPassword);

// Updated Google OAuth route to POST for auth code exchange
router.post("/google", googleAuth);

router.put("/user-avtar", isAuthenticated, upload.single('avatar'), userAvatarController);
router.delete("/deleteImage", isAuthenticated, removeImageFromCloudinary);

router.put("/profile", isAuthenticated, updateProfile);
router.put("/change-password", isAuthenticated, changePassword);

router.get("/count", isAuthenticated, getUsersCount);

router.get("/all", isAuthenticated, getAllUsers);
router.delete("/bulk-delete", isAuthenticated, bulkDeleteUsers);
router.delete("/:id", isAuthenticated, deleteUser);



export default router;
