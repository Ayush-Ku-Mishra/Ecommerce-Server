import express from "express";
import {
  adminLogin,
  logout,
  getUser,
  getUsersCount,
  getAllUsers,
  deleteUser,
  bulkDeleteUsers,
  authWithGoogle,
  googleLogin,
  getUsersByMonth,
} from "../controllers/userController.js";
import { isAuthenticated, adminOnly } from "../middlewares/auth.js";

const adminRouter = express.Router();

// Admin authentication routes
adminRouter.post("/login", adminLogin);
adminRouter.post("/auth/google", (req, res, next) => {
  req.body.isAdminLogin = true; // Force admin login flag
  authWithGoogle(req, res, next);
});
adminRouter.post("/auth/google-login", (req, res, next) => {
  req.body.isAdminLogin = true; // Force admin login flag
  googleLogin(req, res, next);
});

// Protected admin routes - all require authentication + admin role
adminRouter.use(isAuthenticated, adminOnly); // Apply to all routes below

adminRouter.get("/logout", logout);
adminRouter.get("/me", getUser);
adminRouter.get("/users/count", getUsersCount);
adminRouter.get("/users/all", getAllUsers);
adminRouter.get("/users/by-month", getUsersByMonth);
adminRouter.delete("/users/bulk-delete", bulkDeleteUsers);
adminRouter.delete("/users/:id", deleteUser);

// Admin dashboard stats
adminRouter.get("/dashboard/stats", async (req, res, next) => {
  try {
    const totalUsers = await User.countDocuments();
    const activeUsers = await User.countDocuments({ status: "active" });
    const suspendedUsers = await User.countDocuments({ status: "suspended" });
    const adminUsers = await User.countDocuments({ role: "admin" });

    res.status(200).json({
      success: true,
      stats: {
        totalUsers,
        activeUsers,
        suspendedUsers,
        adminUsers,
        regularUsers: totalUsers - adminUsers,
      }
    });
  } catch (error) {
    next(error);
  }
});

export default adminRouter;