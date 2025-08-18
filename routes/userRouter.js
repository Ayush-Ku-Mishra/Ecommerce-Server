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
} from "../controllers/userController.js";
import { isAuthenticated } from "../middlewares/auth.js";
import { googleAuth } from "../controllers/authController.js";

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


export default router;
