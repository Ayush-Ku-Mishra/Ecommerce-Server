import { catchAsyncError } from "./catchAsyncError.js";
import ErrorHandler from "./error.js";

// Admin email whitelist
const ALLOWED_ADMIN_EMAILS = ["amishra59137@gmail.com", "dasrasmi781@gmail.com"];

export const validateAdminEmail = catchAsyncError(async (req, res, next) => {
  const { email } = req.body;

  if (!email) {
    return next(new ErrorHandler("Email is required.", 400));
  }

  if (!ALLOWED_ADMIN_EMAILS.includes(email)) {
    return next(new ErrorHandler("Access denied: unauthorized email for admin access.", 403));
  }

  next();
});

export const ensureAdminRole = catchAsyncError(async (req, res, next) => {
  const { email } = req.body;
  
  if (email && ALLOWED_ADMIN_EMAILS.includes(email)) {
    req.body.role = "admin";
    req.body.isAdminLogin = true;
  }
  
  next();
});

// Check if email should have admin privileges
export const isAdminEmail = (email) => {
  return ALLOWED_ADMIN_EMAILS.includes(email);
};

export { ALLOWED_ADMIN_EMAILS };