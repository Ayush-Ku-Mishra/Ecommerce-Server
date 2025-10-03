// routes/clientNotificationRoutes.js
import { Router } from "express";
import { isAuthenticated } from "../middlewares/auth.js";
import {
  getUserNotifications,
  markUserNotificationAsRead,
  markAllUserNotificationsAsRead,
  deleteUserNotification,
  getAdminUpdatesForUser, 
  markAllAdminNotificationsAsRead, 
} from "../controllers/clientNotificationController.js";

const clientNotificationRouter = Router();

// Existing routes
clientNotificationRouter.get("/user", isAuthenticated, getUserNotifications);
clientNotificationRouter.put(
  "/user/mark-read/:notificationId",
  isAuthenticated,
  markUserNotificationAsRead
);
clientNotificationRouter.put(
  "/user/mark-all-read",
  isAuthenticated,
  markAllUserNotificationsAsRead
);
clientNotificationRouter.delete(
  "/user/delete/:notificationId",
  isAuthenticated,
  deleteUserNotification
);


clientNotificationRouter.get(
  "/user/admin-updates",
  isAuthenticated,
  getAdminUpdatesForUser
);
clientNotificationRouter.put(
  "/user/mark-all-admin-read",
  isAuthenticated,
  markAllAdminNotificationsAsRead
);

export default clientNotificationRouter;
