import express from "express";
import cookieParser from "cookie-parser";
import cors from "cors";
import morgan from "morgan";
import helmet from "helmet";

import { config } from "dotenv";
// CRITICAL: Load environment variables FIRST, before importing any other modules
config({ path: "./config.env" });

// Put the console logs here to verify env variables
console.log(
  "CLOUDINARY_CLOUD_NAME:",
  process.env.CLOUDINARY_CLOUD_NAME ? "✅ Loaded" : "❌ Missing"
);
console.log(
  "CLOUDINARY_API_KEY:",
  process.env.CLOUDINARY_API_KEY ? "✅ Loaded" : "❌ Missing"
);
console.log(
  "CLOUDINARY_API_SECRET:",
  process.env.CLOUDINARY_API_SECRET ? "✅ Loaded" : "❌ Missing"
);

// Add Razorpay environment variable checks
console.log(
  "RAZORPAY_KEY_ID:",
  process.env.RAZORPAY_KEY_ID ? "✅ Loaded" : "❌ Missing"
);
console.log(
  "RAZORPAY_KEY_SECRET:",
  process.env.RAZORPAY_KEY_SECRET ? "✅ Loaded" : "❌ Missing"
);

import { v2 as cloudinary } from "cloudinary";

cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
  secure: true,
});

export const app = express();

console.log("🔍 Environment Check:");
console.log(
  "GOOGLE_CLIENT_ID:",
  process.env.GOOGLE_CLIENT_ID ? "✅ Loaded" : "❌ Missing"
);
console.log(
  "GOOGLE_CLIENT_SECRET:",
  process.env.GOOGLE_CLIENT_SECRET ? "✅ Loaded" : "❌ Missing"
);
console.log("GOOGLE_REDIRECT_URI:", process.env.GOOGLE_REDIRECT_URI);
console.log(
  "TWILIO_ACCOUNT_SID:",
  process.env.TWILIO_ACCOUNT_SID ? "✅ Loaded" : "❌ Missing"
);
console.log(
  "TWILIO_AUTH_TOKEN:",
  process.env.TWILIO_AUTH_TOKEN ? "✅ Loaded" : "❌ Missing"
);
console.log(
  "TWILIO_PHONE_NUMBER:",
  process.env.TWILIO_PHONE_NUMBER ? "✅ Loaded" : "❌ Missing"
);

// NOW import other modules after environment variables are loaded
import { connection } from "./database/dbConnection.js";
import { errorMiddleware } from "./middlewares/error.js";
import { removeUnverifiedAccounts } from "./automation/removeUnverifiedAccounts.js";
import userRouter from "./routes/userRouter.js";
import CategoryRouter from "./routes/categoryRouter.js";
import ProductRouter from "./routes/productRouter.js";
import CartRouter from "./routes/cartRouter.js";
import WishlistRouter from "./routes/wishlistRouter.js";
import AddressRouter from "./routes/addressRouter.js";
import SizeChartRouter from "./routes/sizeChartRouter.js";
import logoRouter from "./routes/logoRoutes.js";
import reviewRouter from "./routes/reviewRouter.js";
import SliderRouter from "./routes/SliderRouter.js";
import orderRouter from "./routes/orderRouter.js";
import notificationRouter from "./routes/notificationRoutes.js";
import clientNotificationRouter from "./routes/clientNotificationRoutes.js";
import returnRouter from "./routes/returnRoutes.js";

// Request logger middleware
app.use((req, res, next) => {
  console.log(`Request from origin: ${req.headers.origin}`);
  next();
});

// SINGLE CORS configuration for both development and production
app.use(
  cors({
    origin: function(origin, callback) {
      // For development - allow localhost or no origin (like Postman)
      if (!origin || origin.startsWith('http://localhost:')) {
        callback(null, true);
      } 
      // For production - check against allowed domains
      else if (process.env.NODE_ENV === 'production') {
        const allowedOrigins = [
          process.env.FRONTEND_CLIENT_URL_PROD,
          process.env.FRONTEND_ADMIN_URL_PROD
        ];
        if (allowedOrigins.indexOf(origin) !== -1) {
          callback(null, true);
        } else {
          callback(new Error('Not allowed by CORS'));
        }
      }
      // Fallback - allow
      else {
        callback(null, true);
      }
    },
    credentials: true,
    methods: ["GET", "POST", "PUT", "DELETE", "PATCH", "OPTIONS"],
    allowedHeaders: [
      "Content-Type", 
      "Authorization", 
      "Origin", 
      "X-Requested-With", 
      "Accept"
    ],
    optionsSuccessStatus: 204
  })
);

// Middleware for cookies, JSON and urlencoded
app.use(cookieParser());
app.use(express.json());
app.use(morgan());
app.use(
  helmet({
    crossOriginResourcePolicy: false,
  })
);
app.use(express.urlencoded({ extended: true }));

// Router registrations
app.use("/api/v1/user", userRouter);
app.use("/api/v1/category", CategoryRouter);
app.use("/api/v1/product", ProductRouter);
app.use("/api/v1/cart", CartRouter);
app.use("/api/v1/wishlist", WishlistRouter);
app.use("/api/v1/address", AddressRouter);
app.use("/api/v1/sizecharts", SizeChartRouter);
app.use("/api/v1/slider", SliderRouter);
app.use("/api/v1/logo", logoRouter);
app.use("/api/v1/reviews", reviewRouter);
app.use("/api/v1/payment", orderRouter);
app.use("/api/v1/notifications", notificationRouter);
app.use("/api/v1/client-notifications", clientNotificationRouter);
app.use("/api/v1/returns", returnRouter);

app.get("/debug/env", (req, res) => {
  res.json({
    googleClientId: process.env.GOOGLE_CLIENT_ID ? "Set" : "Not Set",
    googleClientSecret: process.env.GOOGLE_CLIENT_SECRET ? "Set" : "Not Set",
    googleRedirectUri: process.env.GOOGLE_REDIRECT_URI,
    twilioSid: process.env.TWILIO_ACCOUNT_SID ? "Set" : "Not Set",
    twilioToken: process.env.TWILIO_AUTH_TOKEN ? "Set" : "Not Set",
    twilioPhone: process.env.TWILIO_PHONE_NUMBER ? "Set" : "Not Set",
    razorpayKeyId: process.env.RAZORPAY_KEY_ID ? "Set" : "Not Set",
    razorpayKeySecret: process.env.RAZORPAY_KEY_SECRET ? "Set" : "Not Set",
  });
});

removeUnverifiedAccounts();

// Connect to database
connection();

app.use(errorMiddleware);

// Add server listen
const PORT = process.env.PORT || 8000;
app.listen(PORT, () => {
  console.log(`🚀 Server running on port ${PORT}`);
});