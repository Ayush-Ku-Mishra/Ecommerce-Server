import mongoose from "mongoose";
import bcrypt from "bcrypt";
import jwt from "jsonwebtoken";
import crypto from "crypto";

const userSchema = new mongoose.Schema({
  role: {
    type: String,
    enum: ["user", "admin", "seller", "moderator"],
    default: "user",
  },
  name: {
    type: String,
    required: [true, "Name is required"],
  },
  email: {
    type: String,
    required: [true, "Email is required"],
    unique: true,
    lowercase: true,
  },
  password: {
    type: String,
    minLength: [6, "Password must have at least 6 characters."],
    maxLength: [128, "Password cannot have more than 128 characters."], // Increased for hashed passwords
    select: false,
    // Password not required for Google users
    required: function () {
      return !this.signUpWithGoogle;
    },
  },
  phone: {
    type: String,
    sparse: true, // Allows multiple null values
  },
  image: String,
  accountVerified: {
    type: Boolean,
    default: function () {
      return this.signUpWithGoogle || false;
    },
  },
  verificationCode: Number,
  verificationCodeExpire: Date,
  resetPasswordToken: String,
  resetPasswordExpire: Date,
  createdAt: {
    type: Date,
    default: Date.now,
  },
  avatar: {
    type: String,
    default: "",
  },
  last_login_date: {
    type: Date,
    default: null,
  },
  status: {
    type: String,
    enum: ["active", "inactive", "suspended"],
    default: function () {
      return this.signUpWithGoogle ? "active" : "inactive";
    },
  },
  address_details: [
    {
      type: mongoose.Schema.Types.ObjectId,
      ref: "address",
    },
  ],
  shopping_cart: [
    {
      type: mongoose.Schema.Types.ObjectId,
      ref: "cartProduct",
    },
  ],
  order_history: [
    {
      type: mongoose.Schema.Types.ObjectId,
      ref: "order",
    },
  ],
  signUpWithGoogle: {
    type: Boolean,
    default: false,
  },
  hasGooglePassword: {
    // New field to track if user has set a manual password
    type: Boolean,
    default: false,
  },
});

// Create compound index for email uniqueness but allow multiple unverified accounts
userSchema.index(
  {
    email: 1,
    accountVerified: 1,
  },
  {
    unique: true,
    partialFilterExpression: { accountVerified: true },
  }
);

// Hash password before save (skip for Google users or if password not modified)
userSchema.pre("save", async function (next) {
  // Skip hashing if password not modified
  if (!this.isModified("password")) {
    return next();
  }

  // Only hash if password exists and it's not already hashed
  if (this.password && !this.password.startsWith("$2b$")) {
    this.password = await bcrypt.hash(this.password, 10);

    // Mark that user has set a manual password (for Google users who later set password)
    if (this.signUpWithGoogle) {
      this.hasGooglePassword = true;
    }
  }

  next();
});

// Compare password method (handle Google users)
userSchema.methods.comparePassword = async function (enteredPassword) {
  // If user signed up with Google and hasn't set a manual password
  if (this.signUpWithGoogle && !this.hasGooglePassword) {
    return false; // Force them to use Google sign-in or set password first
  }

  if (!this.password) {
    return false;
  }

  return await bcrypt.compare(enteredPassword, this.password);
};

// Generate OTP verification code
userSchema.methods.generateVerificationCode = function () {
  function generateRandomFiveDigitNumber() {
    const firstDigit = Math.floor(Math.random() * 9) + 1;
    const remainingDigits = Math.floor(Math.random() * 10000)
      .toString()
      .padStart(4, "0");
    return parseInt(firstDigit + remainingDigits);
  }
  const verificationCode = generateRandomFiveDigitNumber();
  this.verificationCode = verificationCode;
  this.verificationCodeExpire = Date.now() + 10 * 60 * 1000;
  return verificationCode;
};

// Generate JWT token
userSchema.methods.generateToken = function () {
  return jwt.sign(
    { id: this._id, role: this.role }, // include role here
    process.env.JWT_SECRET_KEY,
    { expiresIn: process.env.JWT_EXPIRE }
  );
};

// Generate password reset token (not needed for Google users without manual password)
userSchema.methods.generateResetPasswordToken = function () {
  if (this.signUpWithGoogle && !this.hasGooglePassword) {
    throw new Error(
      "Password reset not available. Please use Google sign-in or set a password first."
    );
  }

  const resetToken = crypto.randomBytes(20).toString("hex");
  this.resetPasswordToken = crypto
    .createHash("sha256")
    .update(resetToken)
    .digest("hex");
  this.resetPasswordExpire = Date.now() + 15 * 60 * 1000;
  return resetToken;
};

export const User = mongoose.model("User", userSchema);
