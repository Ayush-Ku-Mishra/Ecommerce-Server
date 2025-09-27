// routes/clientNotificationRoutes.js
import { Router } from "express";
import { isAuthenticated } from "../middlewares/auth.js";
import { 
  getUserNotifications,
  markUserNotificationAsRead,
  markAllUserNotificationsAsRead,
  deleteUserNotification
} from "../controllers/notificationController.js";

const clientNotificationRouter = Router();

clientNotificationRouter.get('/user', isAuthenticated, getUserNotifications);
clientNotificationRouter.put('/user/mark-read/:notificationId', isAuthenticated, markUserNotificationAsRead);
clientNotificationRouter.put('/user/mark-all-read', isAuthenticated, markAllUserNotificationsAsRead);
clientNotificationRouter.delete('/user/delete/:notificationId', isAuthenticated, deleteUserNotification);

export default clientNotificationRouter;