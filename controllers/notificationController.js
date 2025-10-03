import { NotificationModel } from "../models/notification.model.js";

// Create notification for new order
export const createOrderNotification = async (orderData) => {
  try {
    const notification = new NotificationModel({
      type: "new_order",
      title: "New Order Received",
      message: `New ${
        orderData.paymentMethod === "COD" ? "COD" : "online"
      } order from ${orderData.customerName}`,
      orderId: orderData.orderId,
      customerName: orderData.customerName,
      orderAmount: orderData.amount,
      paymentMethod: orderData.paymentMethod,
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
    // Check if user is admin
    if (req.user.role !== "admin") {
      return res.status(403).json({
        success: false,
        message: "Unauthorized access",
      });
    }
    // Only get client-generated notification types
    const clientNotificationTypes = ["new_order", "new_return"];

    const notifications = await NotificationModel.find({
      type: { $in: clientNotificationTypes },
    })
      .sort({ createdAt: -1 })
      .limit(50);

    // Count only unread client notifications
    const unreadCount = await NotificationModel.countDocuments({
      type: { $in: clientNotificationTypes },
      isRead: false,
    });

    res.json({
      success: true,
      notifications,
      unreadCount,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message,
    });
  }
};

// Mark notification as read
export const markAsRead = async (req, res) => {
  try {
    const { notificationId } = req.params;

    await NotificationModel.findByIdAndUpdate(notificationId, { isRead: true });

    res.json({ success: true });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message,
    });
  }
};

// Mark all as read
export const markAllAsRead = async (req, res) => {
  try {
    await NotificationModel.updateMany({ isRead: false }, { isRead: true });

    res.json({ success: true });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message,
    });
  }
};

// Delete notification
export const deleteNotification = async (req, res) => {
  try {
    const { notificationId } = req.params;

    const deletedNotification = await NotificationModel.findByIdAndDelete(
      notificationId
    );

    if (!deletedNotification) {
      return res.status(404).json({
        success: false,
        message: "Notification not found",
      });
    }

    res.json({
      success: true,
      message: "Notification deleted successfully",
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message,
    });
  }
};

export const createReturnNotification = async (returnData) => {
  try {
    console.log("Creating return notification with data:", returnData);

    const notification = new NotificationModel({
      type: "new_return",
      title: "New Return Request",
      message: `New ${returnData.returnType} request for order #${returnData.orderId}`,
      orderId: returnData.orderId,
      returnId: returnData._id,
      returnType: returnData.returnType,
      customerName: returnData.customerName || "Customer",
    });

    console.log("Notification object created:", notification);

    const savedNotification = await notification.save();
    console.log("Notification saved to database:", savedNotification);

    return savedNotification;
  } catch (error) {
    console.error("Error creating return notification:", error, error.stack);
    // Re-throw the error to be caught by the calling function
    throw error;
  }
};

// Create notification for return status update
export const createReturnUpdateNotification = async (
  returnData,
  previousStatus
) => {
  try {
    const notification = new NotificationModel({
      type: "return_updated",
      title: "Return Status Updated",
      message: `Return for order #${returnData.orderId} updated from ${previousStatus} to ${returnData.status}`,
      orderId: returnData.orderId,
      returnId: returnData._id,
      returnType: returnData.returnType,
      returnStatus: returnData.status,
    });

    await notification.save();
    console.log(`Update notification created for return: ${returnData._id}`);
    return notification;
  } catch (error) {
    console.error("Error creating return update notification:", error);
  }
};

// Create notification for cancelled return
export const createReturnCancelledNotification = async (returnData) => {
  try {
    const notification = new NotificationModel({
      type: "return_cancelled",
      title: "Return Request Cancelled",
      message: `Return request for order #${returnData.orderId} has been cancelled`,
      orderId: returnData.orderId,
      returnId: returnData._id,
      returnType: returnData.returnType,
    });

    await notification.save();
    console.log(
      `Cancellation notification created for return: ${returnData._id}`
    );
    return notification;
  } catch (error) {
    console.error("Error creating return cancellation notification:", error);
  }
};


export const getAdminGeneratedNotifications = async (req, res) => {
  try {
    // Admin-generated notification types
    const adminNotificationTypes = ["return_updated", "return_cancelled", "status_update"];
    
    const notifications = await NotificationModel
      .find({ 
        type: { $in: adminNotificationTypes }
      })
      .sort({ createdAt: -1 })
      .limit(50);
    
    const unreadCount = await NotificationModel.countDocuments({ 
      type: { $in: adminNotificationTypes },
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
