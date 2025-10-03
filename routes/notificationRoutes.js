// routes/notificationRoutes.js
import { Router } from "express";
import { isAuthenticated } from "../middlewares/auth.js";
import { 
  getNotifications, 
  markAsRead, 
  markAllAsRead,
  deleteNotification,
  getAdminGeneratedNotifications,
} from "../controllers/notificationController.js";

const notificationRouter = Router();

notificationRouter.get('/all', isAuthenticated, getNotifications);
notificationRouter.put('/mark-read/:notificationId', isAuthenticated, markAsRead);
notificationRouter.put('/mark-all-read', isAuthenticated, markAllAsRead);
notificationRouter.delete('/delete/:notificationId', isAuthenticated, deleteNotification);
notificationRouter.get('/admin-generated', isAuthenticated, getAdminGeneratedNotifications);

export default notificationRouter;