import ErrorHandler from "../middlewares/error.js";
import { catchAsyncError } from "../middlewares/catchAsyncError.js";
import { User } from "../models/userModel.js";
import { sendEmail } from "../utils/sendEmail.js";
import { sendToken } from "../utils/sendToken.js";
import twilio from "twilio";
import crypto from "crypto";
import { v2 as cloudinary } from "cloudinary";
import fs from "fs";

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
    const { name, email, phone, password, verificationMethod } = req.body;

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

    // Check for existing VERIFIED users first
    const existingVerifiedUser = await User.findOne({
      $or: [
        { email, accountVerified: true },
        { phone, accountVerified: true },
      ],
    });

    if (existingVerifiedUser) {
      return next(new ErrorHandler("Phone or Email is already registered. Please login instead.", 400));
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

    const userData = {
      name,
      email,
      phone,
      password,
      signUpWithGoogle: false, // Explicitly set for manual registration
    };

    const user = await User.create(userData);
    const verificationCode = await user.generateVerificationCode();
    await user.save({ validateModifiedOnly: true });

    console.log(`✅ New user created: ${email}, OTP: ${verificationCode}`);

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
    if (error.name === 'ValidationError') {
      const messages = Object.values(error.errors).map(err => err.message);
      return next(new ErrorHandler(messages.join('. '), 400));
    }
    
    // Handle duplicate key errors (shouldn't happen now due to cleanup)
    if (error.code === 11000) {
      return next(new ErrorHandler("Email or phone already exists. Please login instead.", 400));
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
    if (verificationMethod === "email") {
      const message = generateEmailTemplate(verificationCode);
      await sendEmail({ email, subject: "Your Verification Code", message });
      res.status(200).json({
        success: true,
        message: `Verification email successfully sent to ${name}`,
      });
    } else if (verificationMethod === "phone") {
      // Initialize Twilio client when needed
      const client = initializeTwilio();

      if (!client) {
        throw new Error(
          "SMS service not configured. Please check Twilio credentials."
        );
      }

      if (!process.env.TWILIO_PHONE_NUMBER) {
        throw new Error("TWILIO_PHONE_NUMBER not configured");
      }

      // Format phone number as "+91 98272 86625"
      const formattedPhone = formatIndianPhoneNumber(phone);

      console.log(
        `📱 Sending SMS to ${formattedPhone} with code: ${verificationCode}`
      );

      await client.messages.create({
        body: `
REGISTER to your Pickora account using OTP: ${verificationCode}

⚠️ DO NOT share this code with anyone, including delivery agents.

Visit www.pickora.com for assistance.
  `.trim(),
        from: process.env.TWILIO_PHONE_NUMBER,
        to: formattedPhone,
      });

      console.log("✅ SMS sent successfully");
      res.status(200).json({
        success: true,
        message: `OTP sent via SMS to ${formattedPhone}`,
      });
    } else {
      return res.status(400).json({
        success: false,
        message: "Invalid verification method. Use 'email' or 'phone'.",
      });
    }
  } catch (error) {
    console.error("❌ Verification code send error:", error);

    // Provide more specific error messages
    let errorMessage = "Verification code failed to send.";

    if (error.code === 21608) {
      errorMessage = "Invalid phone number format for SMS.";
    } else if (error.code === 21614) {
      errorMessage = "SMS service not available for this number.";
    } else if (error.message.includes("username is required")) {
      errorMessage =
        "SMS service configuration error. Please check Twilio credentials.";
    } else if (error.message.includes("not configured")) {
      errorMessage = error.message;
    }

    return res.status(500).json({
      success: false,
      message: errorMessage,
      details:
        process.env.NODE_ENV === "development" ? error.message : undefined,
    });
  }
}

export const authWithGoogle = catchAsyncError(async (req, res, next) => {
  try {
    const { name, email, avatar, phone, role = "user", isAdminLogin = false } = req.body;

    console.log("🔍 Google Auth Request:", { name, email, avatar: !!avatar, phone, role });

    if (!name || !email) {
      return next(new ErrorHandler("Name and email are required for Google authentication.", 400));
    }

    // Whitelist of allowed admin emails
    const allowedAdminEmails = ["admin@example.com", "admin2@example.com"];

    // If this login is for admin panel, enforce whitelist and role check
    if (isAdminLogin) {
      if (!allowedAdminEmails.includes(email)) {
        return next(new ErrorHandler("Access denied: unauthorized email.", 403));
      }
      if (role !== "admin") {
        return next(new ErrorHandler("Access denied: user is not an admin.", 403));
      }
    }

    // Check if user already exists with this email (regardless of verification status)
    let existingUser = await User.findOne({ email: email });

    if (existingUser) {
      console.log(`👤 Existing user found: ${existingUser.email}, Verified: ${existingUser.accountVerified}, Google: ${existingUser.signUpWithGoogle}`);
      
      // CASE 1: User exists and is verified (login scenario)
      if (existingUser.accountVerified) {
        existingUser.status = "active";
        existingUser.last_login_date = new Date();

        if (avatar && existingUser.avatar !== avatar) {
          existingUser.avatar = avatar;
        }

        if (!existingUser.signUpWithGoogle) {
          existingUser.signUpWithGoogle = true;
        }

        await existingUser.save({ validateModifiedOnly: true });

        console.log(`✅ Google user ${existingUser.email} logged in successfully`);
        
        return sendToken(existingUser, 200, "Login successful!", res);
      }
      // CASE 2: User exists but not verified (upgrade to Google account)
      else {
        console.log(`🔄 Converting unverified account to Google account for ${existingUser.email}`);

        existingUser.accountVerified = true;
        existingUser.status = "active";
        existingUser.last_login_date = new Date();
        existingUser.signUpWithGoogle = true;
        existingUser.name = name;
        if (avatar) existingUser.avatar = avatar;

        await existingUser.save({ validateModifiedOnly: true });

        console.log(`✅ Unverified account converted to Google account: ${existingUser.email}`);

        return sendToken(existingUser, 200, "Google account linked successfully! Welcome to Pickora.", res);
      }
    } else {
      // CASE 3: New Google user - create account
      
      // If admin login, ensure email is whitelisted
      if (isAdminLogin && !allowedAdminEmails.includes(email)) {
        return next(new ErrorHandler("Access denied: unauthorized email.", 403));
      }
      
      // If admin login, set role to admin explicitly
      const userRole = isAdminLogin ? "admin" : role;

      console.log(`🆕 Creating new Google account for ${email}`);

      const newUserData = {
        name: name,
        email: email,
        password: crypto.randomBytes(16).toString('hex'),
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

      console.log(`✅ New Google user created: ${newUser.email}`);

      return sendToken(newUser, 201, "Google account created successfully! Welcome to Pickora.", res);
    }
    
  } catch (error) {
    console.error("❌ Google authentication error:", error);

    if (error.name === 'ValidationError') {
      const messages = Object.values(error.errors).map(err => err.message);
      return next(new ErrorHandler(`Validation failed: ${messages.join('. ')}`, 400));
    }

    if (error.code === 11000) {
      return next(new ErrorHandler("An account with this email already exists.", 400));
    }

    return next(new ErrorHandler("Google authentication failed. Please try again.", 500));
  }
});


export const googleLogin = catchAsyncError(async (req, res, next) => {
  try {
    const { email, isAdminLogin = false } = req.body;

    if (!email) {
      return next(new ErrorHandler("Email is required.", 400));
    }

    // Whitelist of allowed admin emails
    const allowedAdminEmails = ["admin@example.com", "admin2@example.com"];

    if (isAdminLogin) {
      if (!allowedAdminEmails.includes(email)) {
        return next(new ErrorHandler("Access denied: unauthorized email.", 403));
      }
    }

    const user = await User.findOne({ 
      email, 
      accountVerified: true,
      signUpWithGoogle: true 
    });

    if (!user) {
      return next(new ErrorHandler("Google account not found. Please sign up with Google first.", 404));
    }

    if (user.status === "suspended") {
      return next(new ErrorHandler("Account suspended. Contact Pickora team for assistance.", 403));
    }

    user.status = "active";
    user.last_login_date = new Date();
    await user.save({ validateModifiedOnly: true });

    console.log(`✅ Google login successful for ${user.email}`);

    sendToken(user, 200, "Google login successful!", res);
  } catch (error) {
    console.error("❌ Google login error:", error);
    return next(new ErrorHandler("Google login failed. Please try again.", 500));
  }
});


// New function for Google users to set a manual password
export const setPasswordForGoogleUser = catchAsyncError(async (req, res, next) => {
  try {
    const { email, newPassword } = req.body;

    if (!email || !newPassword) {
      return next(new ErrorHandler("Email and new password are required.", 400));
    }

    if (newPassword.length < 6) {
      return next(new ErrorHandler("Password must be at least 6 characters long.", 400));
    }

    const user = await User.findOne({ 
      email, 
      accountVerified: true,
      signUpWithGoogle: true 
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
      message: "Password set successfully! You can now login with email and password.",
    });

  } catch (error) {
    console.error("❌ Set password error:", error);
    
    if (error.name === 'ValidationError') {
      const messages = Object.values(error.errors).map(err => err.message);
      return next(new ErrorHandler(messages.join('. '), 400));
    }
    
    return next(new ErrorHandler("Failed to set password. Please try again.", 500));
  }
});

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

    console.log(`✅ User ${user.email} account verified and activated`);

    // STEP 8: Auto-login user after verification (like Amazon/Flipkart)
    sendToken(
      user,
      200,
      "Account registered successfully! Welcome to Pickora.",
      res
    );
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

  if (!email || !password) {
    return next(new ErrorHandler("Email and password are required.", 400));
  }

  const user = await User.findOne({ email, accountVerified: true }).select("+password");

  if (!user) return next(new ErrorHandler("User not registered.", 400));
  if (user.status === "suspended") {
    return next(new ErrorHandler("Account suspended. Contact support.", 400));
  }

  const isPasswordMatched = await user.comparePassword(password);
  if (!isPasswordMatched) {
    return next(new ErrorHandler("Invalid email or password.", 400));
  }

  user.status = "active";
  user.last_login_date = new Date();
  await user.save({ validateModifiedOnly: true });

  sendToken(user, 200, "Login successful", res);
});

export const adminLogin = catchAsyncError(async (req, res, next) => {
  const { email, password } = req.body;

  const allowedAdminEmails = ["amishra59137@gmail.com", "dasrasmi781@gmail.com"]; // Your whitelist

  if (!email || !password) {
    return next(new ErrorHandler("Email and password are required.", 400));
  }

  if (!allowedAdminEmails.includes(email)) {
    return next(new ErrorHandler("Access denied: unauthorized email.", 403));
  }

  const user = await User.findOne({ email, accountVerified: true, role: "admin" }).select("+password");
  
  if (!user) return next(new ErrorHandler("Admin user not registered.", 400));
  if (user.status === "suspended") {
    return next(new ErrorHandler("Admin account suspended. Contact support.", 400));
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
  const user = await User.findOne({
    email: req.body.email,
    accountVerified: true,
  });
  if (!user) {
    return next(new ErrorHandler("User not found.", 404));
  }
  const resetToken = user.generateResetPasswordToken();
  await user.save({ validateBeforeSave: false });
  const resetPasswordUrl = `${process.env.FRONTEND_URL}/password/reset/${resetToken}`;

  const message = `Your Reset Password Token is:- \n\n ${resetPasswordUrl} \n\n If you have not requested this email then please ignore it.`;

  try {
    sendEmail({
      email: user.email,
      subject: "PICKORA RESET PASSWORD",
      message,
    });
    res.status(200).json({
      success: true,
      message: `Email sent to ${user.email} successfully.`,
    });
  } catch (error) {
    user.resetPasswordToken = undefined;
    user.resetPasswordExpire = undefined;
    await user.save({ validateBeforeSave: false });
    return next(
      new ErrorHandler(
        error.message ? error.message : "Cannot send reset password token.",
        500
      )
    );
  }
});

// ✅ UPDATED resetPassword - Updates status and login date after reset
export const resetPassword = catchAsyncError(async (req, res, next) => {
  const { token } = req.params;
  const resetPasswordToken = crypto
    .createHash("sha256")
    .update(token)
    .digest("hex");
  const user = await User.findOne({
    resetPasswordToken,
    resetPasswordExpire: { $gt: Date.now() },
  });
  if (!user) {
    return next(
      new ErrorHandler(
        "Reset password token is invalid or has been expired.",
        400
      )
    );
  }

  if (req.body.password !== req.body.confirmPassword) {
    return next(
      new ErrorHandler("Password & confirm password do not match.", 400)
    );
  }

  user.password = req.body.password;
  user.resetPasswordToken = undefined;
  user.resetPasswordExpire = undefined;

  // ✅ Update status and last login date after password reset
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
    return next(new ErrorHandler("Password and confirm password are required.", 400));
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
    return next(
      new ErrorHandler("Password cannot exceed 32 characters.", 400)
    );
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
    return next(new ErrorHandler("New password and confirm password are required.", 400));
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

    res.status(200).json({
      success: true,
      users,
      totalUsers,
      currentPage: parseInt(page),
      totalPages: Math.ceil(totalUsers / parseInt(limit)),
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
          count: { $sum: 1 }
        }
      },
      { $sort: { _id: 1 } }
    ]);

    res.json({ success: true, data: result });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};
