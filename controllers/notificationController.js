import { NotificationModel } from "../models/notification.model.js";

// Create notification for new order
export const createOrderNotification = async (orderData) => {
  try {
    const notification = new NotificationModel({
      type: "new_order",
      title: "New Order Received",
      message: `New ${orderData.paymentMethod === "COD" ? "COD" : "online"} order from ${orderData.customerName}`,
      orderId: orderData.orderId,
      customerName: orderData.customerName,
      orderAmount: orderData.amount,
      paymentMethod: orderData.paymentMethod
    });
    
    await notification.save();
    console.log(`Notification created for order: ${orderData.orderId}`);
    return notification;
  } catch (error) {
    console.error("Error creating notification:", error);
  }
};

// Get all notifications for admin
export const getNotifications = async (req, res) => {
  try {
    const notifications = await NotificationModel
      .find({})
      .sort({ createdAt: -1 })
      .limit(50); // Last 50 notifications
    
    const unreadCount = await NotificationModel.countDocuments({ isRead: false });
    
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

// Mark notification as read
export const markAsRead = async (req, res) => {
  try {
    const { notificationId } = req.params;
    
    await NotificationModel.findByIdAndUpdate(
      notificationId, 
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

// Mark all as read
export const markAllAsRead = async (req, res) => {
  try {
    await NotificationModel.updateMany(
      { isRead: false }, 
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

// Delete notification
export const deleteNotification = async (req, res) => {
  try {
    const { notificationId } = req.params;
    
    const deletedNotification = await NotificationModel.findByIdAndDelete(notificationId);
    
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