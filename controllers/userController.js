import ErrorHandler from "../middlewares/error.js";
import { catchAsyncError } from "../middlewares/catchAsyncError.js";
import { User } from "../models/userModel.js";
import { sendEmail } from "../utils/sendEmail.js";
import { sendToken } from "../utils/sendToken.js";
import twilio from "twilio";
import crypto from "crypto";
import { v2 as cloudinary } from "cloudinary";
import fs from "fs";
import OrderModel from "../models/order.model.js";

// Function to initialize Twilio (called when needed, not at module load)
function initializeTwilio() {
  console.log("🔍 Twilio Configuration Check:");
  console.log(
    "TWILIO_ACCOUNT_SID:",
    process.env.TWILIO_ACCOUNT_SID ? "✅ Set" : "❌ Missing"
  );
  console.log(
    "TWILIO_AUTH_TOKEN:",
    process.env.TWILIO_AUTH_TOKEN ? "✅ Set" : "❌ Missing"
  );
  console.log(
    "TWILIO_PHONE_NUMBER:",
    process.env.TWILIO_PHONE_NUMBER ? "✅ Set" : "❌ Missing"
  );

  if (process.env.TWILIO_ACCOUNT_SID && process.env.TWILIO_AUTH_TOKEN) {
    try {
      const client = twilio(
        process.env.TWILIO_ACCOUNT_SID,
        process.env.TWILIO_AUTH_TOKEN
      );
      console.log("✅ Twilio client initialized successfully");
      return client;
    } catch (error) {
      console.error("❌ Twilio initialization failed:", error.message);
      return null;
    }
  } else {
    console.warn("⚠️ Twilio credentials missing - SMS functionality disabled");
    return null;
  }
}

// Function to format phone number as "+91 98272 86625"
function formatIndianPhoneNumber(phone) {
  // Assuming phone is in format +919827286625
  if (!phone || phone.length !== 13 || !phone.startsWith("+91")) return phone;
  const part1 = phone.slice(0, 3); // +91
  const part2 = phone.slice(3, 8); // 98272
  const part3 = phone.slice(8, 13); // 86625
  return `${part1} ${part2} ${part3}`;
}

export const register = catchAsyncError(async (req, res, next) => {
  try {
    const {
      name,
      email,
      phone,
      password,
      verificationMethod,
      isAdminRegistration = false,
    } = req.body;

    if (!name || !email || !phone || !password || !verificationMethod) {
      return next(new ErrorHandler("All fields are required.", 400));
    }

    function validatePhoneNumber(phone) {
      const phoneRegex = /^\+91[7-9]\d{9}$/;
      return phoneRegex.test(phone);
    }

    if (!validatePhoneNumber(phone)) {
      return next(new ErrorHandler("Invalid phone number.", 400));
    }

    // Define allowed admin emails
    const allowedAdminEmails = ["amishra59137@gmail.com"];

    // Check if this is admin registration attempt
    if (isAdminRegistration && !allowedAdminEmails.includes(email)) {
      return next(
        new ErrorHandler(
          "Access denied: This email is not authorized for admin registration.",
          403
        )
      );
    }

    const suspendedAccount = await User.findOne({
      $or: [
        { email, status: "suspended" },
        { phone, status: "suspended" },
      ],
    });

    if (suspendedAccount) {
      return next(
        new ErrorHandler(
          "This account has been suspended. Please contact customer support for assistance.",
          403
        )
      );
    }

    // Check for existing VERIFIED users first
    const existingVerifiedUser = await User.findOne({
      $or: [
        { email, accountVerified: true },
        { phone, accountVerified: true },
      ],
    });

    if (existingVerifiedUser) {
      return next(
        new ErrorHandler(
          "Phone or Email is already registered. Please login instead.",
          400
        )
      );
    }

    const now = Date.now();

    // Find and DELETE old unverified accounts with same email/phone
    await User.deleteMany({
      $or: [
        { phone, accountVerified: false },
        { email, accountVerified: false },
      ],
    });

    console.log(`🗑️ Cleaned up old unverified accounts for ${email}/${phone}`);

    // Check rate limiting for registration attempts from this IP/device
    const recentAttempts = await User.find({
      $or: [
        { phone, accountVerified: false },
        { email, accountVerified: false },
      ],
      createdAt: { $gt: new Date(now - 30 * 60 * 1000) }, // last 30 minutes
    });

    if (recentAttempts.length >= 3) {
      return next(
        new ErrorHandler(
          "You have exceeded the maximum number of attempts. Please try again later.",
          429
        )
      );
    }

    // Determine user role based on registration type and email
    let userRole = "user";
    if (isAdminRegistration && allowedAdminEmails.includes(email)) {
      userRole = "admin";
    }

    const userData = {
      name,
      email,
      phone,
      password,
      role: userRole,
      signUpWithGoogle: false, // Explicitly set for manual registration
    };

    const user = await User.create(userData);
    const verificationCode = await user.generateVerificationCode();
    await user.save({ validateModifiedOnly: true });

    console.log(
      `✅ New ${userRole} user created: ${email}, OTP: ${verificationCode}`
    );

    await sendVerificationCode(
      verificationMethod,
      verificationCode,
      name,
      email,
      phone,
      res
    );
  } catch (error) {
    console.error("❌ Registration error:", error);

    // Handle specific Mongoose validation errors
    if (error.name === "ValidationError") {
      const messages = Object.values(error.errors).map((err) => err.message);
      return next(new ErrorHandler(messages.join(". "), 400));
    }

    // Handle duplicate key errors (shouldn't happen now due to cleanup)
    if (error.code === 11000) {
      return next(
        new ErrorHandler(
          "Email or phone already exists. Please login instead.",
          400
        )
      );
    }

    next(error);
  }
});

async function sendVerificationCode(
  verificationMethod,
  verificationCode,
  name,
  email,
  phone,
  res
) {
  try {
    console.log("🔍 Starting verification process:", {
      method: verificationMethod,
      email: email,
      phone: phone,
      hasCode: !!verificationCode,
      codeValue: verificationCode, // Temporarily log the actual code for debugging
    });

    if (verificationMethod === "email") {
      console.log("📧 Processing email verification...");

      try {
        const message = generateEmailTemplate(verificationCode);
        console.log("✅ Email template generated successfully");

        await sendEmail({
          email,
          subject: "Your Verification Code",
          message,
        });

        console.log("✅ Email sent successfully to:", email);

        return res.status(200).json({
          success: true,
          message: `Verification email successfully sent to ${name}`,
        });
      } catch (emailError) {
        console.error("❌ Email sending failed:", {
          error: emailError.message,
          code: emailError.code,
          response: emailError.response,
        });
        throw new Error(`Email sending failed: ${emailError.message}`);
      }
    } else if (verificationMethod === "phone") {
      console.log("📱 Processing SMS verification...");

      // Check environment variables
      const requiredEnvVars = {
        TWILIO_ACCOUNT_SID: process.env.TWILIO_ACCOUNT_SID,
        TWILIO_AUTH_TOKEN: process.env.TWILIO_AUTH_TOKEN,
        TWILIO_PHONE_NUMBER: process.env.TWILIO_PHONE_NUMBER,
      };

      console.log("🔍 Twilio Environment Check:", {
        hasAccountSid: !!requiredEnvVars.TWILIO_ACCOUNT_SID,
        hasAuthToken: !!requiredEnvVars.TWILIO_AUTH_TOKEN,
        hasPhoneNumber: !!requiredEnvVars.TWILIO_PHONE_NUMBER,
        accountSidPreview:
          requiredEnvVars.TWILIO_ACCOUNT_SID?.substring(0, 10) + "...",
        phoneNumber: requiredEnvVars.TWILIO_PHONE_NUMBER,
      });

      const missingVars = Object.entries(requiredEnvVars)
        .filter(([key, value]) => !value)
        .map(([key]) => key);

      if (missingVars.length > 0) {
        throw new Error(
          `Missing Twilio credentials: ${missingVars.join(", ")}`
        );
      }

      // Initialize Twilio client
      console.log("🔄 Initializing Twilio client...");
      const client = initializeTwilio();

      if (!client) {
        throw new Error(
          "SMS service not configured. Twilio client initialization failed."
        );
      }
      console.log("✅ Twilio client initialized successfully");

      // Format phone number
      const formattedPhone = formatIndianPhoneNumber(phone);
      console.log("📱 Formatted phone number:", formattedPhone);

      console.log(
        `📤 Sending SMS to ${formattedPhone} with code: ${verificationCode}`
      );

      try {
        const messageResult = await client.messages.create({
          body: `
REGISTER to your Pickora account using OTP: ${verificationCode}

⚠️ DO NOT share this code with anyone, including delivery agents.

Visit www.pickora.com for assistance.
          `.trim(),
          from: process.env.TWILIO_PHONE_NUMBER,
          to: formattedPhone,
        });

        console.log("✅ SMS sent successfully:", {
          sid: messageResult.sid,
          status: messageResult.status,
          to: messageResult.to,
        });

        return res.status(200).json({
          success: true,
          message: `OTP sent via SMS to ${formattedPhone}`,
        });
      } catch (twilioError) {
        console.error("❌ Twilio SMS error:", {
          code: twilioError.code,
          message: twilioError.message,
          moreInfo: twilioError.moreInfo,
          status: twilioError.status,
        });
        throw new Error(
          `SMS sending failed: ${twilioError.message} (Code: ${twilioError.code})`
        );
      }
    } else {
      console.error("❌ Invalid verification method:", verificationMethod);
      return res.status(400).json({
        success: false,
        message: "Invalid verification method. Use 'email' or 'phone'.",
      });
    }
  } catch (error) {
    console.error("❌ Verification code send error:", {
      message: error.message,
      stack: process.env.NODE_ENV === "development" ? error.stack : undefined,
    });

    // Provide specific error messages based on error type
    let errorMessage = "Verification code failed to send.";

    if (error.message.includes("Email sending failed")) {
      errorMessage =
        "Failed to send verification email. Please check your email configuration.";
    } else if (error.message.includes("SMS sending failed")) {
      errorMessage =
        "Failed to send SMS. Please try email verification instead.";
    } else if (error.message.includes("Missing Twilio credentials")) {
      errorMessage = "SMS service not configured properly.";
    } else if (error.code === 21608) {
      errorMessage = "Invalid phone number format for SMS.";
    } else if (error.code === 21614) {
      errorMessage = "SMS service not available for this number.";
    } else if (error.code === 20003) {
      errorMessage = "SMS service authentication failed.";
    }

    return res.status(500).json({
      success: false,
      message: errorMessage,
      details:
        process.env.NODE_ENV === "development"
          ? {
              originalError: error.message,
              code: error.code,
            }
          : undefined,
    });
  }
}

export const authWithGoogle = catchAsyncError(async (req, res, next) => {
  try {
    const {
      name,
      email,
      avatar,
      phone,
      role = "user",
      isAdminLogin = false,
    } = req.body;

    if (!name || !email) {
      return next(
        new ErrorHandler(
          "Name and email are required for Google authentication.",
          400
        )
      );
    }

    const allowedAdminEmails = ["amishra59137@gmail.com"];

    // Check admin access first
    if (isAdminLogin && !allowedAdminEmails.includes(email)) {
      return next(
        new ErrorHandler(
          "Access denied: This email is not authorized for admin access.",
          403
        )
      );
    }

    let existingUser = await User.findOne({ email });

    if (existingUser) {
      // Check if the account is suspended - ADDED THIS CHECK
      if (existingUser.status === "suspended") {
        return next(
          new ErrorHandler(
            "Your account has been suspended. Please contact support for assistance.",
            403
          )
        );
      }

      if (existingUser.accountVerified) {
        // For admin login, upgrade user to admin if they're in whitelist
        if (isAdminLogin && allowedAdminEmails.includes(email)) {
          existingUser.role = "admin"; // Automatically upgrade to admin
        } else if (isAdminLogin && existingUser.role !== "admin") {
          return next(
            new ErrorHandler(
              "Access denied: User account does not have admin privileges.",
              403
            )
          );
        }

        existingUser.status = "active";
        existingUser.last_login_date = new Date();

        if (avatar && existingUser.avatar !== avatar) {
          existingUser.avatar = avatar;
        }
        if (!existingUser.signUpWithGoogle) {
          existingUser.signUpWithGoogle = true;
        }
        await existingUser.save({ validateModifiedOnly: true });

        return sendToken(existingUser, 200, "Login successful!", res);
      } else {
        // Auto-verify and set appropriate role
        let userRole = existingUser.role;
        if (isAdminLogin && allowedAdminEmails.includes(email)) {
          userRole = "admin";
        }

        existingUser.accountVerified = true;
        existingUser.status = "active";
        existingUser.last_login_date = new Date();
        existingUser.signUpWithGoogle = true;
        existingUser.name = name;
        existingUser.role = userRole;

        if (avatar) existingUser.avatar = avatar;

        await existingUser.save({ validateModifiedOnly: true });

        return sendToken(
          existingUser,
          200,
          "Google account linked successfully! Welcome to Pickora.",
          res
        );
      }
    } else {
      // Creating new user
      let userRole = "user";
      if (isAdminLogin && allowedAdminEmails.includes(email)) {
        userRole = "admin";
      } else if (isAdminLogin && !allowedAdminEmails.includes(email)) {
        return next(
          new ErrorHandler(
            "Access denied: This email is not authorized for admin access.",
            403
          )
        );
      }

      const newUserData = {
        name,
        email,
        password: crypto.randomBytes(16).toString("hex"),
        phone: phone || null,
        avatar: avatar || "",
        role: userRole,
        accountVerified: true,
        status: "active",
        last_login_date: new Date(),
        signUpWithGoogle: true,
        hasGooglePassword: false,
      };

      const newUser = await User.create(newUserData);

      const welcomeMessage =
        userRole === "admin"
          ? "Admin Google account created successfully! Welcome to Pickora Admin Panel."
          : "Google account created successfully! Welcome to Pickora.";

      return sendToken(newUser, 201, welcomeMessage, res);
    }
  } catch (error) {
    if (error.name === "ValidationError") {
      const messages = Object.values(error.errors).map((err) => err.message);
      return next(
        new ErrorHandler(`Validation failed: ${messages.join(". ")}`, 400)
      );
    }
    if (error.code === 11000) {
      return next(
        new ErrorHandler("An account with this email already exists.", 400)
      );
    }
    return next(
      new ErrorHandler("Google authentication failed. Please try again.", 500)
    );
  }
});

export const googleLogin = catchAsyncError(async (req, res, next) => {
  try {
    const { email, isAdminLogin = false } = req.body;

    if (!email) {
      return next(new ErrorHandler("Email is required.", 400));
    }

    const allowedAdminEmails = ["amishra59137@gmail.com"];

    // Check admin access
    if (isAdminLogin && !allowedAdminEmails.includes(email)) {
      return next(
        new ErrorHandler(
          "Access denied: This email is not authorized for admin access.",
          403
        )
      );
    }

    const user = await User.findOne({
      email,
      accountVerified: true,
      signUpWithGoogle: true,
    });

    if (!user) {
      return next(
        new ErrorHandler(
          "Google account not found. Please sign up with Google first.",
          404
        )
      );
    }

    // For admin login, ensure user has admin role
    if (isAdminLogin && user.role !== "admin") {
      return next(
        new ErrorHandler(
          "Access denied: User account does not have admin privileges.",
          403
        )
      );
    }

    // Check for suspended account - IMPROVED MESSAGE
    if (user.status === "suspended") {
      return next(
        new ErrorHandler(
          "Your account has been suspended. Please contact support for assistance.",
          403
        )
      );
    }

    user.status = "active";
    user.last_login_date = new Date();
    await user.save({ validateModifiedOnly: true });

    const loginMessage = isAdminLogin
      ? "Admin Google login successful!"
      : "Google login successful!";
    sendToken(user, 200, loginMessage, res);
  } catch (error) {
    return next(
      new ErrorHandler("Google login failed. Please try again.", 500)
    );
  }
});

// New function for Google users to set a manual password
export const setPasswordForGoogleUser = catchAsyncError(
  async (req, res, next) => {
    try {
      const { email, newPassword } = req.body;

      if (!email || !newPassword) {
        return next(
          new ErrorHandler("Email and new password are required.", 400)
        );
      }

      if (newPassword.length < 6) {
        return next(
          new ErrorHandler("Password must be at least 6 characters long.", 400)
        );
      }

      const user = await User.findOne({
        email,
        accountVerified: true,
        signUpWithGoogle: true,
      });

      if (!user) {
        return next(new ErrorHandler("Google account not found.", 404));
      }

      // Set the new password
      user.password = newPassword; // Will be hashed by pre-save middleware
      user.hasGooglePassword = true;
      await user.save();

      console.log(`✅ Password set for Google user: ${user.email}`);

      res.status(200).json({
        success: true,
        message:
          "Password set successfully! You can now login with email and password.",
      });
    } catch (error) {
      console.error("❌ Set password error:", error);

      if (error.name === "ValidationError") {
        const messages = Object.values(error.errors).map((err) => err.message);
        return next(new ErrorHandler(messages.join(". "), 400));
      }

      return next(
        new ErrorHandler("Failed to set password. Please try again.", 500)
      );
    }
  }
);

// Rest of your functions remain the same...
function generateEmailTemplate(verificationCode) {
  return `
    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; border: 1px solid #ddd; border-radius: 8px; background-color: #f9f9f9;">
      <h2 style="color: #4CAF50; text-align: center;">Verification Code</h2>
      <p style="font-size: 16px; color: #333;">Dear User,</p>
      <p style="font-size: 16px; color: #333;">Your verification code is:</p>
      <div style="text-align: center; margin: 20px 0;">
        <span style="display: inline-block; font-size: 24px; font-weight: bold; color: #4CAF50; padding: 10px 20px; border: 1px solid #4CAF50; border-radius: 5px; background-color: #e8f5e9;">
          ${verificationCode}
        </span>
      </div>
      <p style="font-size: 16px; color: #333;">Please use this code to verify your email address. The code will expire in 10 minutes.</p>
      <p style="font-size: 16px; color: #333;">If you did not request this, please ignore this email.</p>
      <footer style="margin-top: 20px; text-align: center; font-size: 14px; color: #999;">
        <p style="margin-bottom: 2px;">Thank you,<br>Pickora Team</p>
        <p style="font-size: 12px; color: #aaa;">This is an automated message. Please do not reply to this email.</p>
      </footer>
    </div>
  `;
}

// FIXED VERIFY OTP - AMAZON/FLIPKART STYLE - Updates status and login date
export const verifyOTP = catchAsyncError(async (req, res, next) => {
  const { email, otp, phone } = req.body;

  function validatePhoneNumber(phone) {
    const phoneRegex = /^\+91[7-9]\d{9}$/;
    return phoneRegex.test(phone);
  }

  if (!validatePhoneNumber(phone)) {
    return next(new ErrorHandler("Invalid phone number.", 400));
  }

  try {
    // STEP 1: Find user by email/phone (regardless of verification status)
    const user = await User.findOne({
      $or: [{ email }, { phone }],
    }).sort({ createdAt: -1 });

    if (!user) {
      return next(new ErrorHandler("User not found.", 404));
    }

    // STEP 2: Check if already verified (Amazon/Flipkart behavior)
    if (user.accountVerified) {
      return res.status(200).json({
        success: true,
        message: "Account is already verified. You can login directly.",
        accountVerified: true,
      });
    }

    // STEP 3: Handle multiple unverified accounts (clean up duplicates)
    const unverifiedUsers = await User.find({
      $or: [
        { email, accountVerified: false },
        { phone, accountVerified: false },
      ],
    }).sort({ createdAt: -1 });

    // If multiple unverified accounts exist, keep the latest one
    if (unverifiedUsers.length > 1) {
      const latestUser = unverifiedUsers[0];

      // Delete older duplicate unverified accounts
      await User.deleteMany({
        _id: { $ne: latestUser._id },
        $or: [
          { phone, accountVerified: false },
          { email, accountVerified: false },
        ],
      });
    }

    // STEP 4: Check if OTP exists
    if (!user.verificationCode) {
      return next(
        new ErrorHandler("OTP has expired. Please request a new one.", 400)
      );
    }

    // STEP 5: Validate OTP
    if (user.verificationCode !== Number(otp)) {
      return next(new ErrorHandler("Invalid OTP. Please try again.", 400));
    }

    // STEP 6: Check if OTP has expired
    const currentTime = Date.now();
    const verificationCodeExpire = new Date(
      user.verificationCodeExpire
    ).getTime();

    console.log("Current time:", currentTime);
    console.log("Expiry time:", verificationCodeExpire);

    if (currentTime > verificationCodeExpire) {
      // Clear expired OTP
      user.verificationCode = null;
      user.verificationCodeExpire = null;
      await user.save({ validateModifiedOnly: true });

      return next(
        new ErrorHandler("OTP has expired. Please request a new one.", 400)
      );
    }

    // STEP 7: Mark account as verified AND update status and login date
    user.accountVerified = true;
    user.status = "active"; // ✅ Set status to active
    user.last_login_date = new Date(); // ✅ Set last login date
    user.verificationCode = null;
    user.verificationCodeExpire = null;
    await user.save({ validateModifiedOnly: true });

    const welcomeMessage =
      user.role === "admin"
        ? "Admin account registered successfully! Welcome to Pickora Admin Panel."
        : "Account registered successfully! Welcome to Pickora.";

    console.log(
      `✅ User ${user.email} account verified and activated as ${user.role}`
    );

    // STEP 8: Auto-login user after verification (like Amazon/Flipkart)
    sendToken(user, 200, welcomeMessage, res);
  } catch (error) {
    console.error("OTP Verification Error:", error);
    return next(
      new ErrorHandler("Something went wrong. Please try again.", 500)
    );
  }
});

// ✅ UPDATED LOGIN - Updates status to active and last login date
export const clientLogin = catchAsyncError(async (req, res, next) => {
  const { email, password } = req.body;

  // Validate input
  if (!email || !password) {
    return next(new ErrorHandler("Email and password are required.", 400));
  }

  // Find user with verified account
  const user = await User.findOne({ email, accountVerified: true }).select(
    "+password"
  );

  // Handle missing user
  if (!user) {
    return next(new ErrorHandler("Invalid email or password.", 401)); // Using 401 for security (don't reveal if email exists)
  }

  // Check account status
  if (user.status === "suspended") {
    return next(
      new ErrorHandler(
        "Your account has been suspended. Please contact support for assistance.",
        403
      )
    ); // Using 403 Forbidden for suspended accounts
  }

  // Validate password
  const isPasswordMatched = await user.comparePassword(password);
  if (!isPasswordMatched) {
    return next(new ErrorHandler("Invalid email or password.", 401)); // Using 401 for authentication failure
  }

  // Update user status and login timestamp
  user.status = "active";
  user.last_login_date = new Date();
  await user.save({ validateModifiedOnly: true });

  // Generate and send token
  sendToken(user, 200, "Login successful", res);
});

export const adminLogin = catchAsyncError(async (req, res, next) => {
  const { email, password } = req.body;

  const allowedAdminEmails = ["amishra59137@gmail.com"]; // Your whitelist

  if (!email || !password) {
    return next(new ErrorHandler("Email and password are required.", 400));
  }

  if (!allowedAdminEmails.includes(email)) {
    return next(
      new ErrorHandler(
        "Access denied: This email is not authorized for admin access.",
        403
      )
    );
  }

  const user = await User.findOne({
    email,
    accountVerified: true,
    role: "admin",
  }).select("+password");

  if (!user) return next(new ErrorHandler("Admin user not registered.", 400));
  if (user.status === "suspended") {
    return next(
      new ErrorHandler("Admin account suspended. Contact support.", 400)
    );
  }

  const isPasswordMatched = await user.comparePassword(password);
  if (!isPasswordMatched) {
    return next(new ErrorHandler("Invalid email or password.", 400));
  }

  user.status = "active";
  user.last_login_date = new Date();
  await user.save({ validateModifiedOnly: true });

  sendToken(user, 200, "Admin login successful", res);
});

export const logout = catchAsyncError(async (req, res, next) => {
  res
    .status(200)
    .cookie("token", "", {
      expires: new Date(Date.now()),
      httpOnly: true,
    })
    .json({
      success: true,
      message: "Logged out successfully.",
    });
});

// ✅ UPDATED getUser - Include status and last login date in response
export const getUser = catchAsyncError(async (req, res, next) => {
  const user = req.user;
  res.status(200).json({
    success: true,
    user: {
      ...user.toObject(),
      status: user.status,
      last_login_date: user.last_login_date,
    },
  });
});

export const forgotPassword = catchAsyncError(async (req, res, next) => {
  try {
    if (!req.body.email) {
      return next(new ErrorHandler("Email is required", 400));
    }

    console.log("2. Finding user:", req.body.email);
    const user = await User.findOne({
      email: req.body.email,
      accountVerified: true,
    });

    if (!user) {
      return next(new ErrorHandler("User not found or not verified", 404));
    }

    if (user.status === "suspended") {
      console.log("User account is suspended:", user.email);
      return next(
        new ErrorHandler(
          "This account has been suspended. Please contact customer support for assistance.",
          403
        )
      );
    }

    console.log("3. User found, generating OTP");
    const verificationCode = Math.floor(10000 + Math.random() * 90000);

    const message = `
      <!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Your Verification Code</title>
</head>
<body style="margin: 0; padding: 0; font-family: Arial, sans-serif; background-color: #f7f7f7;">
  <div style="max-width: 600px; margin: 0 auto; padding: 20px; background-color: white;">
    <!-- Important Notice -->
    <div style="margin-bottom: 15px; padding: 8px; background-color: #f8f8f8; border-radius: 4px; font-size: 12px; color: #666;">
      <p>This message contains your verification code for Pickora. To ensure you receive our emails in the future, please add <strong>amishra59137@gmail.com</strong> to your contacts.</p>
    </div>
    
    <h2 style="color: #333; text-align: center; margin-top: 30px;">Verification Code</h2>
    
    <!-- OTP Container -->
    <div style="margin: 30px auto; padding: 15px; text-align: center; background-color: #f9f9f9; border-radius: 8px;">
      <p style="font-size: 16px; margin-bottom: 10px;">Your verification code is:</p>
      <div style="font-size: 30px; font-weight: bold; letter-spacing: 5px; color: #4CAF50; margin: 20px 0;">
        ${verificationCode}
      </div>
      <p style="font-size: 14px; color: #666;">This code will expire in 15 minutes</p>
    </div>
    
    <p style="margin-top: 30px; color: #666;">If you did not request this code, you can safely ignore this email.</p>
    
    <!-- Security Notice -->
    <div style="margin-top: 30px; padding: 15px; border-top: 1px solid #eee; font-size: 12px; color: #999;">
      <p>This is an automated message from Pickora. Please do not reply to this email.</p>
      <p>For account security, never share this verification code with anyone, including Pickora support.</p>
      <p>If you're having trouble, please visit our <a href="https://pickora.netlify.app/help" style="color: #4CAF50; text-decoration: none;">Help Center</a>.</p>
    </div>
  </div>
</body>
</html>
    `;

    console.log("4. Attempting to send email");
    try {
      await sendEmail({
        email: user.email,
        subject: `Your Pickora verification code: ${verificationCode.substring(
          0,
          2
        )}XXX`,
        message,
      });
      console.log("5. Email sent successfully");

      console.log("6. Saving OTP to user");
      user.verificationCode = verificationCode;
      user.verificationCodeExpire = new Date(Date.now() + 15 * 60 * 1000);
      await user.save({ validateBeforeSave: false });
      console.log("7. OTP saved successfully");

      res.status(200).json({
        success: true,
        message: `OTP sent to ${user.email} successfully`,
      });
    } catch (emailError) {
      console.error("❌ Email send error:", emailError);
      console.error("Error details:", {
        code: emailError.code,
        command: emailError.command,
        response: emailError.response,
      });

      user.verificationCode = undefined;
      user.verificationCodeExpire = undefined;
      await user.save({ validateBeforeSave: false });

      return next(
        new ErrorHandler("Failed to send email. Please try again.", 500)
      );
    }
  } catch (error) {
    console.error("❌ Main error:", error);
    return next(
      new ErrorHandler(error.message || "Internal server error", 500)
    );
  }
});

// Update the existing resetPassword controller
export const resetPassword = catchAsyncError(async (req, res, next) => {
  const { email, otp, newPassword, confirmPassword } = req.body;

  if (newPassword !== confirmPassword) {
    return next(
      new ErrorHandler("Password & confirm password do not match.", 400)
    );
  }

  const user = await User.findOne({
    email,
    verificationCode: Number(otp),
    verificationCodeExpire: { $gt: Date.now() },
  });

  if (!user) {
    return next(new ErrorHandler("Invalid or expired OTP.", 400));
  }

  // Update password and clear OTP
  user.password = newPassword;
  user.verificationCode = null;
  user.verificationCodeExpire = null;
  user.resetPasswordToken = undefined;
  user.resetPasswordExpire = undefined;
  user.status = "active";
  user.last_login_date = new Date();

  await user.save();

  console.log(
    `✅ User ${user.email} password reset successfully. Status: ${user.status}`
  );

  sendToken(user, 200, "Reset Password Successfully.", res);
});

// BONUS: Resend OTP functionality (essential for e-commerce)
export const resendOTP = catchAsyncError(async (req, res, next) => {
  const { email, phone, verificationMethod } = req.body;

  function validatePhoneNumber(phone) {
    const phoneRegex = /^\+91[7-9]\d{9}$/;
    return phoneRegex.test(phone);
  }

  if (!validatePhoneNumber(phone)) {
    return next(new ErrorHandler("Invalid phone number.", 400));
  }

  try {
    const user = await User.findOne({
      $or: [{ email }, { phone }],
    });

    if (!user) {
      return next(new ErrorHandler("User not found.", 404));
    }

    if (user.accountVerified) {
      return next(new ErrorHandler("Account is already verified.", 400));
    }

    // Generate new OTP
    const verificationCode = user.generateVerificationCode();
    await user.save({ validateModifiedOnly: true });

    // Send new OTP based on method
    if (verificationMethod === "email") {
      const message = generateEmailTemplate(verificationCode);
      await sendEmail({
        email,
        subject: "Your New Verification Code",
        message,
      });
      res.status(200).json({
        success: true,
        message: "New OTP sent to your email successfully.",
      });
    } else if (verificationMethod === "phone") {
      const client = initializeTwilio();
      if (!client) {
        return next(new ErrorHandler("SMS service not available.", 500));
      }

      const formattedPhone = formatIndianPhoneNumber(phone);
      await client.messages.create({
        body: `${verificationCode} is your new Pickora verification code. DO NOT share this code with anyone. @www.pickora.com`,
        from: process.env.TWILIO_PHONE_NUMBER,
        to: formattedPhone,
      });

      res.status(200).json({
        success: true,
        message: `New OTP sent via SMS to ${formattedPhone}`,
      });
    } else {
      return next(new ErrorHandler("Invalid verification method.", 400));
    }
  } catch (error) {
    console.error("Resend OTP Error:", error);
    return next(
      new ErrorHandler("Failed to resend OTP. Please try again.", 500)
    );
  }
});

//Image Upload
export const userAvatarController = catchAsyncError(async (req, res, next) => {
  const userId = req.user?._id;
  const file = req.file;

  const options = {
    user_filename: true,
    unique_filename: false,
    overwrite: false,
    folder: "user_avatars", // Organize in folders
    transformation: [
      { width: 300, height: 300, crop: "fill" }, // Optimize image size
      { quality: "auto" }, // Auto quality optimization
    ],
  };

  if (!userId) {
    return next(new ErrorHandler("User ID not found in request.", 400));
  }

  if (!file) {
    return next(new ErrorHandler("No image file provided.", 400));
  }

  // Verify user exists
  const user = await User.findById(userId);

  if (!user) {
    return next(new ErrorHandler("User not found.", 404));
  }

  try {
    // Step 1: Get the old avatar URL to delete later
    const oldAvatarUrl = user.avatar;
    let oldPublicId = null;

    // Extract public_id from old avatar URL if it exists and is from Cloudinary
    if (oldAvatarUrl && oldAvatarUrl.includes("cloudinary.com")) {
      try {
        // Extract public_id from Cloudinary URL
        // URL format: https://res.cloudinary.com/your-cloud/image/upload/v123456/user_avatars/filename.jpg
        const urlParts = oldAvatarUrl.split("/");
        const uploadIndex = urlParts.findIndex((part) => part === "upload");
        if (uploadIndex !== -1 && urlParts[uploadIndex + 2]) {
          // Get folder and filename part
          const folderAndFile = urlParts.slice(uploadIndex + 2).join("/");
          // Remove file extension
          oldPublicId = folderAndFile.replace(/\.[^/.]+$/, "");
        }
      } catch (error) {
        console.warn("Could not extract public_id from old avatar URL:", error);
      }
    }

    // Step 2: Upload new image to Cloudinary
    const result = await cloudinary.uploader.upload(file.path, options);

    // Step 3: Clean up local file
    fs.unlinkSync(file.path);

    // Step 4: Update user avatar in database
    user.avatar = result.secure_url;
    await user.save({ validateModifiedOnly: true });

    // Step 5: Delete old image from Cloudinary (if exists)
    if (oldPublicId) {
      try {
        await cloudinary.uploader.destroy(oldPublicId);
        console.log(`Old avatar deleted: ${oldPublicId}`);
      } catch (deleteError) {
        // Don't fail the request if old image deletion fails
        console.warn("Failed to delete old avatar:", deleteError);
      }
    }

    res.status(200).json({
      _id: userId,
      avatar: result.secure_url,
      success: true,
      message: "Avatar uploaded & saved successfully.",
      user: {
        ...user.toObject(),
        avatar: result.secure_url,
      },
    });
  } catch (error) {
    console.error("Avatar upload error:", error);

    // Clean up local file if upload fails
    if (fs.existsSync(file.path)) {
      fs.unlinkSync(file.path);
    }

    return next(
      new ErrorHandler("Image upload failed. Please try again.", 500)
    );
  }
});

export const removeImageFromCloudinary = catchAsyncError(
  async (req, res, next) => {
    const userId = req.user?._id;
    const imgUrl = req.query.img;

    if (!userId) {
      return next(new ErrorHandler("User ID not found in request.", 400));
    }

    if (!imgUrl) {
      return next(new ErrorHandler("Image URL is required.", 400));
    }

    const urlArr = imgUrl.split("/");
    const image = urlArr[urlArr.length - 1];
    const imageName = image.split(".")[0];

    if (!imageName) {
      return next(new ErrorHandler("Invalid image URL.", 400));
    }

    // Remove image from Cloudinary
    const result = await cloudinary.uploader.destroy(imageName);

    if (result) {
      // Find user and clear avatar field if it matches the removed image URL
      const user = await User.findById(userId);
      if (user && user.avatar === imgUrl) {
        user.avatar = ""; // or null as per your schema
        await user.save({ validateModifiedOnly: true });
      }
      return res.status(200).json({
        success: true,
        message: "Image deleted and user avatar cleared.",
        data: result,
      });
    }
  }
);

export const updateProfile = catchAsyncError(async (req, res, next) => {
  const userId = req.user._id;
  const { name, phone, gender } = req.body;

  if (!userId) {
    return next(new ErrorHandler("User ID not found.", 400));
  }

  // Validate inputs
  if (!name || name.trim().length < 2) {
    return next(
      new ErrorHandler("Name must be at least 2 characters long.", 400)
    );
  }

  if (phone && !/^\+?[\d\s\-\(\)]{10,}$/.test(phone)) {
    return next(new ErrorHandler("Please enter a valid phone number.", 400));
  }

  if (gender && !["male", "female", "other"].includes(gender.toLowerCase())) {
    return next(
      new ErrorHandler("Gender must be male, female, or other.", 400)
    );
  }

  try {
    const user = await User.findById(userId);
    if (!user) {
      return next(new ErrorHandler("User not found.", 404));
    }

    // Update only provided fields
    if (name) user.name = name.trim();
    if (phone) user.phone = phone.trim();
    if (gender) user.gender = gender.toLowerCase();

    await user.save({ validateModifiedOnly: true });

    // Return updated user (without password)
    const updatedUser = await User.findById(userId).select(
      "-password -verificationCode -resetPasswordToken"
    );

    res.status(200).json({
      success: true,
      message: "Profile updated successfully.",
      user: updatedUser,
    });
  } catch (error) {
    console.error("Profile update error:", error);
    return next(
      new ErrorHandler("Failed to update profile. Please try again.", 500)
    );
  }
});

// Add this new function to your user controller
export const setPassword = catchAsyncError(async (req, res, next) => {
  const userId = req.user._id;
  const { newPassword, confirmPassword } = req.body;

  if (!userId) {
    return next(new ErrorHandler("User ID not found.", 400));
  }

  if (!newPassword || !confirmPassword) {
    return next(
      new ErrorHandler("Password and confirm password are required.", 400)
    );
  }

  if (newPassword !== confirmPassword) {
    return next(new ErrorHandler("Passwords do not match.", 400));
  }

  if (newPassword.length < 8) {
    return next(
      new ErrorHandler("Password must be at least 8 characters long.", 400)
    );
  }

  if (newPassword.length > 32) {
    return next(new ErrorHandler("Password cannot exceed 32 characters.", 400));
  }

  try {
    // Get user
    const user = await User.findById(userId);
    if (!user) {
      return next(new ErrorHandler("User not found.", 404));
    }

    // Set/Update password (pre-save middleware will hash it)
    user.password = newPassword;
    await user.save();

    res.status(200).json({
      success: true,
      message: "Password set successfully.",
    });
  } catch (error) {
    console.error("Password set error:", error);
    return next(
      new ErrorHandler("Failed to set password. Please try again.", 500)
    );
  }
});

// Also, update your existing changePassword function to handle both cases
export const changePassword = catchAsyncError(async (req, res, next) => {
  const userId = req.user._id;
  const { currentPassword, newPassword, confirmPassword } = req.body;

  if (!userId) {
    return next(new ErrorHandler("User ID not found.", 400));
  }

  if (!newPassword || !confirmPassword) {
    return next(
      new ErrorHandler("New password and confirm password are required.", 400)
    );
  }

  if (newPassword !== confirmPassword) {
    return next(new ErrorHandler("New passwords do not match.", 400));
  }

  if (newPassword.length < 8) {
    return next(
      new ErrorHandler("New password must be at least 8 characters long.", 400)
    );
  }

  if (newPassword.length > 32) {
    return next(
      new ErrorHandler("New password cannot exceed 32 characters.", 400)
    );
  }

  try {
    // Get user with password
    const user = await User.findById(userId).select("+password");
    if (!user) {
      return next(new ErrorHandler("User not found.", 404));
    }

    // Check if user has a password (for social login users)
    if (!user.password) {
      // If no password exists, allow setting password without current password
      user.password = newPassword;
      await user.save();

      return res.status(200).json({
        success: true,
        message: "Password set successfully.",
      });
    }

    // If user has existing password, require current password
    if (!currentPassword) {
      return next(new ErrorHandler("Current password is required.", 400));
    }

    if (currentPassword === newPassword) {
      return next(
        new ErrorHandler(
          "New password must be different from current password.",
          400
        )
      );
    }

    // Verify current password
    const isCurrentPasswordValid = await user.comparePassword(currentPassword);
    if (!isCurrentPasswordValid) {
      return next(new ErrorHandler("Current password is incorrect.", 400));
    }

    // Update password (pre-save middleware will hash it)
    user.password = newPassword;
    await user.save();

    res.status(200).json({
      success: true,
      message: "Password changed successfully.",
    });
  } catch (error) {
    console.error("Password change/set error:", error);
    return next(
      new ErrorHandler("Failed to change password. Please try again.", 500)
    );
  }
});

export const getUsersCount = catchAsyncError(async (req, res, next) => {
  try {
    const userCount = await User.countDocuments({});
    res.status(200).json({
      success: true,
      count: userCount,
      message: "User count retrieved",
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message || "Failed to get user count",
    });
  }
});

// Get all users (with pagination and search)
export const getAllUsers = catchAsyncError(async (req, res, next) => {
  try {
    // Check if user is admin
    if (req.user.role !== "admin") {
      return res.status(403).json({
        success: false,
        message: "Unauthorized access",
      });
    }
    const { page = 1, limit = 50, search = "" } = req.query;

    // Build search query
    let query = {};
    if (search) {
      query = {
        $or: [
          { name: { $regex: search, $options: "i" } },
          { email: { $regex: search, $options: "i" } },
          { phone: { $regex: search, $options: "i" } },
        ],
      };
    }

    // Calculate pagination
    const skip = (parseInt(page) - 1) * parseInt(limit);

    // Get users with pagination
    const users = await User.find(query)
      .select("-password -verificationCode -resetPasswordToken")
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(parseInt(limit));

    const totalUsers = await User.countDocuments(query);

    // Calculate statistics
    const stats = {
      total: await User.countDocuments(),
      active: await User.countDocuments({ status: "active" }),
      inactive: await User.countDocuments({ status: "inactive" }),
      suspended: await User.countDocuments({ status: "suspended" }),
      verified: await User.countDocuments({ accountVerified: true }),
      googleUsers: await User.countDocuments({ signUpWithGoogle: true }),
      adminUsers: await User.countDocuments({ role: "admin" }),
    };

    res.status(200).json({
      success: true,
      users,
      totalUsers,
      currentPage: parseInt(page),
      totalPages: Math.ceil(totalUsers / parseInt(limit)),
      stats, // Add this to your response
    });
  } catch (error) {
    console.error("Get all users error:", error);
    next(new ErrorHandler("Failed to fetch users", 500));
  }
});

// Delete single user
export const deleteUser = catchAsyncError(async (req, res, next) => {
  try {
    const { id } = req.params;

    const user = await User.findById(id);
    if (!user) {
      return next(new ErrorHandler("User not found", 404));
    }

    // Prevent admin from deleting themselves
    if (req.user._id.toString() === id) {
      return next(new ErrorHandler("Cannot delete your own account", 400));
    }

    // Delete user's avatar from Cloudinary if exists
    if (user.avatar && user.avatar.includes("cloudinary.com")) {
      try {
        const urlParts = user.avatar.split("/");
        const uploadIndex = urlParts.findIndex((part) => part === "upload");
        if (uploadIndex !== -1 && urlParts[uploadIndex + 2]) {
          const folderAndFile = urlParts.slice(uploadIndex + 2).join("/");
          const publicId = folderAndFile.replace(/\.[^/.]+$/, "");
          await cloudinary.uploader.destroy(publicId);
        }
      } catch (cloudinaryError) {
        console.warn(
          "Failed to delete user avatar from Cloudinary:",
          cloudinaryError
        );
      }
    }

    await User.findByIdAndDelete(id);

    res.status(200).json({
      success: true,
      message: "User deleted successfully",
    });
  } catch (error) {
    console.error("Delete user error:", error);
    next(new ErrorHandler("Failed to delete user", 500));
  }
});

// Bulk delete users
export const bulkDeleteUsers = catchAsyncError(async (req, res, next) => {
  try {
    const { userIds } = req.body;

    if (!userIds || !Array.isArray(userIds) || userIds.length === 0) {
      return next(new ErrorHandler("User IDs are required", 400));
    }

    // Prevent admin from deleting themselves
    if (userIds.includes(req.user._id.toString())) {
      return next(new ErrorHandler("Cannot delete your own account", 400));
    }

    // Get users to delete their avatars
    const usersToDelete = await User.find({ _id: { $in: userIds } });

    // Delete avatars from Cloudinary
    for (const user of usersToDelete) {
      if (user.avatar && user.avatar.includes("cloudinary.com")) {
        try {
          const urlParts = user.avatar.split("/");
          const uploadIndex = urlParts.findIndex((part) => part === "upload");
          if (uploadIndex !== -1 && urlParts[uploadIndex + 2]) {
            const folderAndFile = urlParts.slice(uploadIndex + 2).join("/");
            const publicId = folderAndFile.replace(/\.[^/.]+$/, "");
            await cloudinary.uploader.destroy(publicId);
          }
        } catch (cloudinaryError) {
          console.warn(
            `Failed to delete avatar for user ${user._id}:`,
            cloudinaryError
          );
        }
      }
    }

    const result = await User.deleteMany({ _id: { $in: userIds } });

    res.status(200).json({
      success: true,
      message: `${result.deletedCount} users deleted successfully`,
      deletedCount: result.deletedCount,
    });
  } catch (error) {
    console.error("Bulk delete users error:", error);
    next(new ErrorHandler("Failed to delete users", 500));
  }
});

// Get users count grouped by month
export const getUsersByMonth = async (req, res) => {
  try {
    const result = await User.aggregate([
      {
        $group: {
          _id: { $month: "$createdAt" },
          count: { $sum: 1 },
        },
      },
      { $sort: { _id: 1 } },
    ]);

    res.json({ success: true, data: result });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

export const verifyForgotPasswordOTP = catchAsyncError(
  async (req, res, next) => {
    try {
      console.log("OTP Verification Starting with data:", {
        email: req.body.email,
        otpProvided: req.body.otp,
        otpLength: req.body.otp?.length,
      });

      const { email, otp } = req.body;

      if (!email || !otp) {
        return next(new ErrorHandler("Email and OTP are required", 400));
      }

      // Try to convert OTP to number safely
      let numericOtp;
      try {
        numericOtp = Number(otp);
        if (isNaN(numericOtp)) {
          console.error("OTP is not a valid number:", otp);
          return next(new ErrorHandler("Invalid OTP format", 400));
        }
      } catch (convErr) {
        console.error("Error converting OTP to number:", convErr);
        return next(new ErrorHandler("Invalid OTP format", 400));
      }

      console.log("Looking for user with email and OTP:", email, numericOtp);

      // Add timeout to database query
      const user = await Promise.race([
        User.findOne({
          email,
          verificationCode: numericOtp,
          verificationCodeExpire: { $gt: Date.now() },
        }),
        new Promise((_, reject) =>
          setTimeout(() => reject(new Error("Database query timeout")), 10000)
        ),
      ]);

      console.log(
        "User lookup result:",
        user ? "User found" : "User not found"
      );

      if (!user) {
        return next(new ErrorHandler("Invalid or expired OTP", 400));
      }

      res.status(200).json({
        success: true,
        message: "OTP verified successfully",
      });
    } catch (error) {
      console.error("OTP verification error:", error.message, error.stack);
      return next(
        new ErrorHandler(`OTP verification failed: ${error.message}`, 500)
      );
    }
  }
);

export const getSingleUser = catchAsyncError(async (req, res, next) => {
  try {
    const { id } = req.params;

    // Check if user is admin
    if (req.user.role !== "admin") {
      return res.status(403).json({
        success: false,
        message: "Unauthorized access",
      });
    }

    const user = await User.findById(id)
      .select(
        "-password -verificationCode -resetPasswordToken -resetPasswordExpire"
      )
      .populate("address_details")
      .populate("shopping_cart")
      .populate("order_history");

    if (!user) {
      return next(new ErrorHandler("User not found", 404));
    }

    res.status(200).json({
      success: true,
      user,
    });
  } catch (error) {
    console.error("Get single user error:", error);
    next(new ErrorHandler("Failed to fetch user details", 500));
  }
});

// Update user details (admin)
export const updateUser = catchAsyncError(async (req, res, next) => {
  try {
    const { id } = req.params;
    const { name, email, phone, role, status, accountVerified } = req.body;

    // Check if user is admin
    if (req.user.role !== "admin") {
      return res.status(403).json({
        success: false,
        message: "Unauthorized access",
      });
    }

    // Check if user exists
    const user = await User.findById(id);
    if (!user) {
      return next(new ErrorHandler("User not found", 404));
    }

    // Validate email if it's being changed
    if (email && email !== user.email) {
      const existingUser = await User.findOne({ email, accountVerified: true });
      if (existingUser) {
        return next(
          new ErrorHandler(
            "Email already in use by another verified account",
            400
          )
        );
      }
    }

    // Prevent admin from demoting themselves
    if (
      req.user._id.toString() === id &&
      role === "user" &&
      user.role === "admin"
    ) {
      return next(
        new ErrorHandler("You cannot demote yourself from admin role", 403)
      );
    }

    // Update user fields
    const updatedFields = {};
    if (name) updatedFields.name = name;
    if (email) updatedFields.email = email;
    if (phone !== undefined) updatedFields.phone = phone;
    if (role) updatedFields.role = role;
    if (status) updatedFields.status = status;
    if (accountVerified !== undefined)
      updatedFields.accountVerified = accountVerified;

    const updatedUser = await User.findByIdAndUpdate(
      id,
      { $set: updatedFields },
      { new: true, runValidators: true }
    ).select(
      "-password -verificationCode -resetPasswordToken -resetPasswordExpire"
    );

    res.status(200).json({
      success: true,
      message: "User updated successfully",
      user: updatedUser,
    });
  } catch (error) {
    console.error("Update user error:", error);
    next(new ErrorHandler("Failed to update user", 500));
  }
});

// Bulk update user status
export const bulkUpdateUserStatus = catchAsyncError(async (req, res, next) => {
  try {
    const { userIds, status } = req.body;

    // Check if user is admin
    if (req.user.role !== "admin") {
      return res.status(403).json({
        success: false,
        message: "Unauthorized access",
      });
    }

    if (!userIds || !Array.isArray(userIds) || userIds.length === 0) {
      return next(new ErrorHandler("User IDs are required", 400));
    }

    if (!status || !["active", "inactive", "suspended"].includes(status)) {
      return next(new ErrorHandler("Invalid status value", 400));
    }

    // Update user status
    const result = await User.updateMany(
      { _id: { $in: userIds } },
      { $set: { status } }
    );

    res.status(200).json({
      success: true,
      message: `${result.modifiedCount} users updated to ${status} status`,
      modifiedCount: result.modifiedCount,
    });
  } catch (error) {
    console.error("Bulk update user status error:", error);
    next(new ErrorHandler("Failed to update user status", 500));
  }
});

// Get user statistics for dashboard
export const getUserStats = catchAsyncError(async (req, res, next) => {
  try {
    // Check if user is admin
    if (req.user.role !== "admin") {
      return res.status(403).json({
        success: false,
        message: "Unauthorized access",
      });
    }

    const totalUsers = await User.countDocuments();
    const activeUsers = await User.countDocuments({ status: "active" });
    const inactiveUsers = await User.countDocuments({ status: "inactive" });
    const suspendedUsers = await User.countDocuments({ status: "suspended" });
    const verifiedUsers = await User.countDocuments({ accountVerified: true });
    const googleUsers = await User.countDocuments({ signUpWithGoogle: true });
    const adminUsers = await User.countDocuments({ role: "admin" });

    // Recent signups - last 30 days
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
    const recentSignups = await User.countDocuments({
      createdAt: { $gte: thirtyDaysAgo },
    });

    // Recent activity - last 7 days
    const sevenDaysAgo = new Date();
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
    const recentActive = await User.countDocuments({
      last_login_date: { $gte: sevenDaysAgo },
    });

    res.status(200).json({
      success: true,
      stats: {
        total: totalUsers,
        active: activeUsers,
        inactive: inactiveUsers,
        suspended: suspendedUsers,
        verified: verifiedUsers,
        googleUsers,
        adminUsers,
        recentSignups,
        recentActive,
      },
    });
  } catch (error) {
    console.error("Get user stats error:", error);
    next(new ErrorHandler("Failed to fetch user statistics", 500));
  }
});

// Get latest users for dashboard
export const getLatestUsers = catchAsyncError(async (req, res, next) => {
  try {
    // Check if user is admin
    if (req.user.role !== "admin") {
      return res.status(403).json({
        success: false,
        message: "Unauthorized access",
      });
    }

    const limit = parseInt(req.query.limit) || 5;

    const latestUsers = await User.find()
      .sort({ createdAt: -1 })
      .limit(limit)
      .select("name email avatar createdAt status accountVerified");

    res.status(200).json({
      success: true,
      users: latestUsers,
    });
  } catch (error) {
    console.error("Get latest users error:", error);
    next(new ErrorHandler("Failed to fetch latest users", 500));
  }
});

export const getMonthlySalesAndUsers = catchAsyncError(
  async (req, res, next) => {
    try {
      // Check if user is admin
      if (req.user.role !== "admin") {
        return res.status(403).json({
          success: false,
          message: "Unauthorized access",
        });
      }

      // Get current year
      const currentYear = new Date().getFullYear();

      // Initialize response array with all months
      const monthlyData = [
        { month: "JAN", TotalUsers: 0, TotalSales: 0 },
        { month: "FEB", TotalUsers: 0, TotalSales: 0 },
        { month: "MAR", TotalUsers: 0, TotalSales: 0 },
        { month: "APRIL", TotalUsers: 0, TotalSales: 0 },
        { month: "MAY", TotalUsers: 0, TotalSales: 0 },
        { month: "JUNE", TotalUsers: 0, TotalSales: 0 },
        { month: "JULY", TotalUsers: 0, TotalSales: 0 },
        { month: "AUG", TotalUsers: 0, TotalSales: 0 },
        { month: "SEP", TotalUsers: 0, TotalSales: 0 },
        { month: "OCT", TotalUsers: 0, TotalSales: 0 },
        { month: "NOV", TotalUsers: 0, TotalSales: 0 },
        { month: "DEC", TotalUsers: 0, TotalSales: 0 },
      ];

      // Get monthly user registration counts
      const usersByMonth = await User.aggregate([
        {
          $match: {
            createdAt: {
              $gte: new Date(`${currentYear}-01-01`),
              $lte: new Date(`${currentYear}-12-31`),
            },
          },
        },
        {
          $group: {
            _id: { $month: "$createdAt" },
            count: { $sum: 1 },
          },
        },
        {
          $sort: { _id: 1 },
        },
      ]);

      // Get monthly sales totals
      const salesByMonth = await OrderModel.aggregate([
        {
          $match: {
            createdAt: {
              $gte: new Date(`${currentYear}-01-01`),
              $lte: new Date(`${currentYear}-12-31`),
            },
            status: "delivered", // Only count completed orders
          },
        },
        {
          $group: {
            _id: { $month: "$createdAt" },
            total: { $sum: "$totalAmount" },
          },
        },
        {
          $sort: { _id: 1 },
        },
      ]);

      // Fill in real data for users
      usersByMonth.forEach((item) => {
        const monthIndex = item._id - 1; // MongoDB months are 1-12
        if (monthIndex >= 0 && monthIndex < 12) {
          monthlyData[monthIndex].TotalUsers = item.count;
        }
      });

      // Fill in real data for sales
      salesByMonth.forEach((item) => {
        const monthIndex = item._id - 1; // MongoDB months are 1-12
        if (monthIndex >= 0 && monthIndex < 12) {
          monthlyData[monthIndex].TotalSales = item.total;
        }
      });

      // If no real data, provide sample data for demo purposes
      if (salesByMonth.length === 0) {
        monthlyData[2].TotalSales = 1200000;
        monthlyData[3].TotalSales = 13200000;
        monthlyData[4].TotalSales = 12800000;
        monthlyData[5].TotalSales = 1800000;
        monthlyData[6].TotalSales = 25245261;
      }

      res.status(200).json({
        success: true,
        data: monthlyData,
      });
    } catch (error) {
      console.error("Analytics error:", error);
      return next(new ErrorHandler("Failed to fetch analytics data", 500));
    }
  }
);
