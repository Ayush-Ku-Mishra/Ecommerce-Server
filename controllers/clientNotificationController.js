import { ClientNotificationModel } from "../models/clientNotificationModel.js";
import { NotificationModel } from "../models/notification.model.js";
import OrderModel from "../models/order.model.js";
import ReturnModel from "../models/returnModel.js";

// Create notification for client when order status changes
export const createClientNotification = async (notificationData) => {
  try {
    // Check if this is a return-related notification
    const isReturnNotification = notificationData.type.includes("return");

    // If it's ANY return notification, modify the link to point to the order page
    let link = notificationData.link;

    if (isReturnNotification) {
      // If the link contains "/return", remove it to go to the order page
      if (link && link.includes("/return")) {
        const orderId = link.split("/").slice(-2)[0];
        link = `/account/orders/${orderId}`;
      }
    }

    const notification = new ClientNotificationModel({
      userId: notificationData.userId,
      type: notificationData.type,
      title: notificationData.title,
      message: notificationData.message,
      orderId: notificationData.orderId || null,
      link: link || null,
    });

    await notification.save();
    console.log(
      `Client notification created for user: ${notificationData.userId}`
    );
    return notification;
  } catch (error) {
    console.error("Error creating client notification:", error);
  }
};

// Get notifications for specific user
export const getUserNotifications = async (req, res) => {
  try {
    const userId = req.user._id;

    const notifications = await ClientNotificationModel.find({ userId })
      .sort({ createdAt: -1 })
      .limit(50);

    const unreadCount = await ClientNotificationModel.countDocuments({
      userId,
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
      message: error.message,
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
      message: error.message,
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
      userId,
    });

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

export const getAdminUpdatesForUser = async (req, res) => {
  try {
    const userId = req.user._id;

    // Get user's orders
    const userOrders = await OrderModel.find({ userId }).select("orderId");
    const orderIds = userOrders.map((order) => order.orderId);

    // Get user's returns
    const userReturns = await ReturnModel.find({ user: userId }).select("_id");

    // Find admin-generated notifications related to user's orders and returns
    const notifications = await NotificationModel.find({
      $or: [
        // Notifications related to user's orders
        {
          type: {
            $in: ["return_updated", "return_cancelled", "status_update"],
          },
          orderId: { $in: orderIds },
        },
        // Notifications directly related to user's returns
        {
          type: { $in: ["return_updated", "return_cancelled"] },
          returnId: { $in: userReturns.map((r) => r._id) },
        },
      ],
    })
      .sort({ createdAt: -1 })
      .limit(50);

    // Count unread notifications
    const unreadCount = await NotificationModel.countDocuments({
      $or: [
        {
          type: {
            $in: ["return_updated", "return_cancelled", "status_update"],
          },
          orderId: { $in: orderIds },
        },
        {
          type: { $in: ["return_updated", "return_cancelled"] },
          returnId: { $in: userReturns.map((r) => r._id) },
        },
      ],
      isRead: false,
    });

    // Add a source field to each notification to identify it as admin-generated
    const formattedNotifications = notifications.map((notification) => {
      const notifObj = notification.toObject();
      notifObj.source = "admin";

      // ALL return notifications should link to the order page, not the return page
      // Simply always link to the order page for ANY notification
      notifObj.link = `/account/orders/${notification.orderId}`;

      return notifObj;
    });

    res.json({
      success: true,
      notifications: formattedNotifications,
      unreadCount,
    });
  } catch (error) {
    console.error("Error fetching admin updates for user:", error);
    res.status(500).json({
      success: false,
      message: error.message,
    });
  }
};

// Mark all admin notifications as read for a user
export const markAllAdminNotificationsAsRead = async (req, res) => {
  try {
    const userId = req.user._id;

    // Get user's orders
    const userOrders = await OrderModel.find({ userId }).select("orderId");
    const orderIds = userOrders.map((order) => order.orderId);

    // Get user's returns
    const userReturns = await ReturnModel.find({ user: userId }).select("_id");
    const returnIds = userReturns.map((returnReq) => returnReq._id.toString());

    // Update all matching notifications
    await NotificationModel.updateMany(
      {
        $or: [
          {
            type: {
              $in: ["return_updated", "return_cancelled", "status_update"],
            },
            orderId: { $in: orderIds },
          },
          {
            type: { $in: ["return_updated", "return_cancelled"] },
            returnId: { $in: returnIds },
          },
        ],
        isRead: false,
      },
      { isRead: true }
    );

    res.json({ success: true });
  } catch (error) {
    console.error("Error marking all admin notifications as read:", error);
    res.status(500).json({
      success: false,
      message: error.message,
    });
  }
};
