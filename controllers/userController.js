import ErrorHandler from "../middlewares/error.js";
import { catchAsyncError } from "../middlewares/catchAsyncError.js";
import { User } from "../models/userModel.js";
import { sendEmail } from "../utils/sendEmail.js";
import { sendToken } from "../utils/sendToken.js";
import twilio from "twilio";
import crypto from "crypto";

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

    const existingUser = await User.findOne({
      $or: [
        {
          email,
          accountVerified: true,
        },
        {
          phone,
          accountVerified: true,
        },
      ],
    });

    if (existingUser) {
      return next(new ErrorHandler("Phone or Email is already used.", 400));
    }

    const registerationAttemptsByUser = await User.find({
      $or: [
        { phone, accountVerified: false },
        { email, accountVerified: false },
      ],
    });

    if (registerationAttemptsByUser.length > 3) {
      return next(
        new ErrorHandler(
          "You have exceeded the maximum number of attempts (3). Please try again after an hour.",
          400
        )
      );
    }

    const userData = {
      name,
      email,
      phone,
      password,
    };

    const user = await User.create(userData);
    const verificationCode = await user.generateVerificationCode();
    await user.save();

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
Your Pickora verification code is: ${verificationCode}

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

// FIXED VERIFY OTP - AMAZON/FLIPKART STYLE
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

    // STEP 7: Mark account as verified
    user.accountVerified = true;
    user.verificationCode = null;
    user.verificationCodeExpire = null;
    await user.save({ validateModifiedOnly: true });

    // STEP 8: Auto-login user after verification (like Amazon/Flipkart)
    sendToken(
      user,
      200,
      "Account verified successfully! Welcome to Pickora.",
      res
    );
  } catch (error) {
    console.error("OTP Verification Error:", error);
    return next(
      new ErrorHandler("Something went wrong. Please try again.", 500)
    );
  }
});

export const login = catchAsyncError(async (req, res, next) => {
  const { email, password } = req.body;
  if (!email || !password) {
    return next(new ErrorHandler("Email and password are required.", 400));
  }
  const user = await User.findOne({ email, accountVerified: true }).select(
    "+password"
  );
  if (!user) {
    return next(new ErrorHandler("Invalid email or password.", 400));
  }
  const isPasswordMatched = await user.comparePassword(password);
  if (!isPasswordMatched) {
    return next(new ErrorHandler("Invalid email or password.", 400));
  }
  sendToken(user, 200, "User logged in successfully.", res);
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

export const getUser = catchAsyncError(async (req, res, next) => {
  const user = req.user;
  res.status(200).json({
    success: true,
    user,
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
  await user.save();

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
