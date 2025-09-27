import { ClientNotificationModel } from "../models/clientNotificationModel.js";

// Create notification for client when order status changes
export const createClientNotification = async (notificationData) => {
  try {
    const notification = new ClientNotificationModel({
      userId: notificationData.userId,
      type: notificationData.type,
      title: notificationData.title,
      message: notificationData.message,
      orderId: notificationData.orderId || null,
      link: notificationData.link || null
    });
    
    await notification.save();
    console.log(`Client notification created for user: ${notificationData.userId}`);
    return notification;
  } catch (error) {
    console.error("Error creating client notification:", error);
  }
};

// Get notifications for specific user
export const getUserNotifications = async (req, res) => {
  try {
    const userId = req.user._id;
    
    const notifications = await ClientNotificationModel
      .find({ userId })
      .sort({ createdAt: -1 })
      .limit(50);
    
    const unreadCount = await ClientNotificationModel.countDocuments({ 
      userId, 
      isRead: false 
    });
    
    res.json({
      success: true,
      notifications,
      unreadCount
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
};

// Mark user notification as read
export const markUserNotificationAsRead = async (req, res) => {
  try {
    const { notificationId } = req.params;
    const userId = req.user._id;
    
    await ClientNotificationModel.findOneAndUpdate(
      { _id: notificationId, userId },
      { isRead: true }
    );
    
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
};

// Mark all user notifications as read
export const markAllUserNotificationsAsRead = async (req, res) => {
  try {
    const userId = req.user._id;
    
    await ClientNotificationModel.updateMany(
      { userId, isRead: false },
      { isRead: true }
    );
    
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
};

// Delete user notification
export const deleteUserNotification = async (req, res) => {
  try {
    const { notificationId } = req.params;
    const userId = req.user._id;
    
    const deletedNotification = await ClientNotificationModel.findOneAndDelete({
      _id: notificationId,
      userId
    });
    
    if (!deletedNotification) {
      return res.status(404).json({
        success: false,
        message: "Notification not found"
      });
    }
    
    res.json({ 
      success: true,
      message: "Notification deleted successfully"
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
};