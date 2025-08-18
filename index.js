import express from "express";
import { config } from "dotenv";
import cookieParser from "cookie-parser";
import cors from "cors";

export const app = express();

// CRITICAL: Load environment variables FIRST, before importing any other modules
config({ path: "./config.env" });

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
console.log("FRONTEND_URL:", process.env.FRONTEND_URL);

// NOW import other modules after environment variables are loaded
import { connection } from "./database/dbConnection.js";
import { errorMiddleware } from "./middlewares/error.js";
import { removeUnverifiedAccounts } from "./automation/removeUnverifiedAccounts.js";
import userRouter from "./routes/userRouter.js";

// Enable CORS with your frontend URL from env
app.use(
  cors({
    origin: [process.env.FRONTEND_URL],
    methods: ["GET", "POST", "PUT", "DELETE"],
    credentials: true,
  })
);

// Middleware for cookies, JSON and urlencoded
app.use(cookieParser());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

app.use("/api/v1/user", userRouter);

app.get("/debug/env", (req, res) => {
  res.json({
    googleClientId: process.env.GOOGLE_CLIENT_ID ? "Set" : "Not Set",
    googleClientSecret: process.env.GOOGLE_CLIENT_SECRET ? "Set" : "Not Set",
    googleRedirectUri: process.env.GOOGLE_REDIRECT_URI,
    twilioSid: process.env.TWILIO_ACCOUNT_SID ? "Set" : "Not Set",
    twilioToken: process.env.TWILIO_AUTH_TOKEN ? "Set" : "Not Set",
    twilioPhone: process.env.TWILIO_PHONE_NUMBER ? "Set" : "Not Set",
    frontendUrl: process.env.FRONTEND_URL,
  });
});

removeUnverifiedAccounts();

// Connect to database
connection();

app.use(errorMiddleware);

// Add server listen
const PORT = process.env.PORT || 5000;
app.listen(PORT, () => {
  console.log(`🚀 Server running on port ${PORT}`);
});
