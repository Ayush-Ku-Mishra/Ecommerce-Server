import ReturnModel from "../models/returnModel.js";
import OrderModel from "../models/order.model.js";
import ProductModel from "../models/productModel.js";
import Razorpay from "razorpay";
import { createClientNotification } from "./clientNotificationController.js";
import {
  revertProductStockAndSales,
  updateProductStockAndSales,
} from "./orderController.js";
import {
  createReturnCancelledNotification,
  createReturnNotification,
  createReturnUpdateNotification,
} from "./notificationController.js";

// Initialize Razorpay only when needed, not at the module level
const getRazorpayInstance = () => {
  if (!process.env.RAZORPAY_KEY_ID || !process.env.RAZORPAY_KEY_SECRET) {
    throw new Error("Razorpay credentials are not configured");
  }

  return new Razorpay({
    key_id: process.env.RAZORPAY_KEY_ID,
    key_secret: process.env.RAZORPAY_KEY_SECRET,
  });
};

// Check if a return request exists for an order
export const checkExistingReturn = async (req, res) => {
  try {
    const { orderId } = req.params;

    const returnDetails = await ReturnModel.findOne({
      orderId,
      user: req.user._id,
    }).sort({ createdAt: -1 });

    if (!returnDetails) {
      return res.status(404).json({
        success: false,
        message: "No return request found for this order",
      });
    }

    res.status(200).json({
      success: true,
      data: returnDetails,
    });
  } catch (error) {
    console.error("Error checking return request:", error);
    console.error("Request params:", req.params);
    console.error("User ID:", req.user?._id);
    return res.status(500).json({
      success: false,
      message: "Failed to check return request",
      error: error.message,
    });
  }
};

// Create a new return request
export const createReturnRequest = async (req, res) => {
  try {
    console.log("Creating return request with data:", req.body);
    const { orderId, returnType, reason, products } = req.body;

    // Validate request
    if (
      !orderId ||
      !returnType ||
      !reason ||
      !products ||
      products.length === 0
    ) {
      return res.status(400).json({
        success: false,
        message: "Missing required fields",
      });
    }

    // Check if order exists and belongs to the user
    const order = await OrderModel.findOne({
      orderId,
      userId: req.user._id,
    });

    if (!order) {
      return res.status(404).json({
        success: false,
        message: "Order not found",
      });
    }

    // Check if order is eligible for return (delivered and within 7 days)
    const deliveryDate = new Date(order.updatedAt);
    const currentDate = new Date();
    const returnWindowMs = 7 * 24 * 60 * 60 * 1000; // 7 days in milliseconds

    if (
      order.status !== "delivered" ||
      currentDate - deliveryDate > returnWindowMs
    ) {
      return res.status(400).json({
        success: false,
        message: "Order is not eligible for return",
      });
    }

    // Check if a return request already exists
    const existingReturn = await ReturnModel.findOne({
      orderId,
      user: req.user._id,
      status: { $ne: "cancelled" }, // Exclude cancelled returns
    });

    if (existingReturn) {
      return res.status(400).json({
        success: false,
        message: "An active return request already exists for this order",
      });
    }

    // Calculate refund amount
    const totalRefundAmount = products.reduce((sum, product) => {
      return sum + product.price * product.quantity;
    }, 0);

    // Create return request
    const returnRequest = new ReturnModel({
      user: req.user._id,
      orderId,
      order: order._id,
      returnType,
      reason,
      products,
      refund_amount: returnType === "refund" ? totalRefundAmount : 0,
      status: "submitted",
      submitted_at: new Date(),
    });

    await returnRequest.save();

    // Create notification for user
    await createClientNotification({
      userId: req.user._id,
      type: "return_created",
      title: "Return Request Submitted",
      message: `Your ${
        returnType === "refund" ? "refund" : "exchange"
      } request for order #${orderId} has been submitted successfully.`,
      orderId: orderId,
      link: `/account/orders/${orderId}/return`,
    });

    // Before creating the notification
    console.log("About to create admin notification for return:", {
      _id: returnRequest._id,
      orderId,
      returnType,
      customerName: req.user.name || "Customer",
    });

    // Create notification for admin
    await createReturnNotification({
      _id: returnRequest._id,
      orderId,
      returnType,
      customerName: req.user.name || "Customer",
    });

    console.log("Admin notification created successfully");

    res.status(201).json({
      success: true,
      message: "Return request submitted successfully",
      data: returnRequest,
    });
  } catch (error) {
    console.error("Error creating return request:", error);
    res.status(500).json({
      success: false,
      message: "Failed to create return request",
    });
  }
};

// Cancel a return request
export const cancelReturnRequest = async (req, res) => {
  try {
    const { returnId } = req.params;

    const returnRequest = await ReturnModel.findOne({
      _id: returnId,
      user: req.user._id,
    });

    if (!returnRequest) {
      return res.status(404).json({
        success: false,
        message: "Return request not found",
      });
    }

    // Check if return can be cancelled (only in submitted or processing state)
    if (
      returnRequest.status !== "submitted" &&
      returnRequest.status !== "processing"
    ) {
      return res.status(400).json({
        success: false,
        message: "Return request cannot be cancelled at this stage",
      });
    }

    // Update return status
    returnRequest.status = "cancelled";
    returnRequest.cancelled_at = new Date();
    returnRequest.cancellation_reason = "Cancelled by user";

    await returnRequest.save();

    // Create notification for user
    await createClientNotification({
      userId: req.user._id,
      type: "return_cancelled",
      title: "Return Request Cancelled",
      message: `Your return request for order #${returnRequest.orderId} has been cancelled.`,
      orderId: returnRequest.orderId,
      link: `/account/orders/${returnRequest.orderId}/return`,
    });

    // Create notification for admin
    await createReturnCancelledNotification(returnRequest);

    res.status(200).json({
      success: true,
      message: "Return request cancelled successfully",
      data: returnRequest,
    });
  } catch (error) {
    console.error("Error cancelling return request:", error);
    res.status(500).json({
      success: false,
      message: "Failed to cancel return request",
    });
  }
};

// Get all returns for a user
export const getUserReturns = async (req, res) => {
  try {
    const returns = await ReturnModel.find({ user: req.user._id })
      .sort({ createdAt: -1 })
      .populate("order");

    res.status(200).json({
      success: true,
      data: returns,
    });
  } catch (error) {
    console.error("Error fetching user returns:", error);
    res.status(500).json({
      success: false,
      message: "Failed to fetch return requests",
    });
  }
};

// Get all return requests (admin only)
export const getAllReturnsForAdmin = async (req, res) => {
  try {
    // Check if user is admin
    if (req.user.role !== "admin") {
      return res.status(403).json({
        success: false,
        message: "Unauthorized access",
      });
    }

    const returns = await ReturnModel.find()
      .sort({ createdAt: -1 })
      .populate("user", "name email")
      .populate("order");

    res.status(200).json({
      success: true,
      data: returns,
    });
  } catch (error) {
    console.error("Error fetching return requests:", error);
    res.status(500).json({
      success: false,
      message: "Failed to fetch return requests",
    });
  }
};

// Update return status (admin only)
export const updateReturnStatus = async (req, res) => {
  try {
    // Check if user is admin
    if (req.user.role !== "admin") {
      return res.status(403).json({
        success: false,
        message: "Unauthorized access",
      });
    }

    const { returnId } = req.params;
    const { status, tracking_id, refund_id } = req.body;

    const returnRequest = await ReturnModel.findById(returnId);

    if (!returnRequest) {
      return res.status(404).json({
        success: false,
        message: "Return request not found",
      });
    }

    const previousStatus = returnRequest.status;

    // Update status and related fields
    returnRequest.status = status;

    // Add timestamp based on status
    if (status === "processing") {
      returnRequest.processing_at = new Date();
    } else if (status === "pickup_scheduled") {
      returnRequest.pickup_scheduled_at = new Date();
    } else if (status === "picked_up") {
      returnRequest.picked_up_at = new Date();
    } else if (status === "completed") {
      returnRequest.completed_at = new Date();

      // Handle refund for "refund" type returns
      if (
        returnRequest.returnType === "refund" &&
        returnRequest.refund_amount > 0
      ) {
        // Process refund via Razorpay if payment was online
        const order = await OrderModel.findById(returnRequest.order);

        if (order && order.paymentMethod !== "COD" && order.paymentId) {
          try {
            // Initialize Razorpay only when needed
            const razorpay = getRazorpayInstance();

            // Initiate refund via Razorpay
            const refund = await razorpay.payments.refund(order.paymentId, {
              amount: Math.round(returnRequest.refund_amount * 100), // Convert to paise
              notes: {
                orderId: returnRequest.orderId,
                returnId: returnRequest._id.toString(),
              },
            });

            returnRequest.refund_id = refund.id;
          } catch (refundError) {
            console.error("Razorpay refund error:", refundError);
            // Continue with the return process even if refund fails
            // Admin can handle refund manually
          }
        }
      }

      // UPDATED: Handle inventory updates using existing functions
      console.log("Processing inventory updates for completed return...");

      if (returnRequest.returnType === "refund") {
        // For refunds: increase stock and decrease sales for returned items
        console.log("Processing refund - restoring inventory");

        // Transform return products to match expected format
        const transformedProducts = returnRequest.products.map((product) => ({
          productId: product.productId,
          quantity: product.quantity,
          selectedSize: product.currentSize || product.selectedSize,
        }));

        // Call revertProductStockAndSales to restore inventory
        await revertProductStockAndSales(transformedProducts);
        console.log("Inventory restored for returned items");
      } else if (returnRequest.returnType === "exchange") {
        console.log("Processing exchange - updating inventory");

        // First handle the returned items (increase stock, decrease sales)
        const returnedProducts = returnRequest.products.map((product) => ({
          productId: product.productId,
          quantity: product.quantity,
          selectedSize: product.currentSize || product.selectedSize,
        }));

        await revertProductStockAndSales(returnedProducts);
        console.log("Inventory restored for returned items");

        // Then handle the new items for exchange (decrease stock)
        const exchangeProducts = returnRequest.products.map((product) => ({
          productId: product.productId,
          quantity: product.quantity,
          selectedSize: product.newSize,
        }));

        // Only process if newSize exists and is different
        const validExchangeProducts = exchangeProducts.filter(
          (product) =>
            product.selectedSize &&
            product.selectedSize !==
              returnedProducts.find((p) => p.productId === product.productId)
                ?.selectedSize
        );

        if (validExchangeProducts.length > 0) {
          await updateProductStockAndSales(validExchangeProducts);
          console.log("Inventory updated for exchange items");
        }
      }
    } else if (status === "cancelled") {
      returnRequest.cancelled_at = new Date();
      returnRequest.cancellation_reason =
        req.body.cancellation_reason || "Cancelled by admin";
    }

    // Update tracking ID if provided
    if (tracking_id) {
      returnRequest.tracking_id = tracking_id;
    }

    // Update refund ID if provided
    if (refund_id) {
      returnRequest.refund_id = refund_id;
    }

    await returnRequest.save();

    // Create notification for user based on status change
    let notificationTitle = "";
    let notificationMessage = "";
    // Define notificationType based on status
    let notificationType = "return_update";

    switch (status) {
      case "processing":
        notificationTitle = "Return Request Processing";
        notificationMessage = `Your return request for order #${returnRequest.orderId} is now being processed.`;
        break;
      case "pickup_scheduled":
        notificationTitle = "Return Pickup Scheduled";
        notificationMessage = `A pickup has been scheduled for your return items from order #${returnRequest.orderId}.`;
        break;
      case "picked_up":
        notificationTitle = "Return Items Picked Up";
        notificationMessage = `Your return items from order #${returnRequest.orderId} have been picked up.`;
        break;
      case "completed":
        if (returnRequest.returnType === "refund") {
          notificationTitle = "Refund Processed";
          notificationMessage = `Your refund for order #${returnRequest.orderId} has been processed.`;
        } else {
          notificationTitle = "Exchange Completed";
          notificationMessage = `Your exchange for order #${returnRequest.orderId} has been completed.`;
        }
        notificationType = "return_completed"; // Set specific type for completed returns
        break;
      case "cancelled":
        notificationTitle = "Return Request Cancelled";
        notificationMessage = `Your return request for order #${returnRequest.orderId} has been cancelled.`;
        notificationType = "return_cancelled"; // Set specific type for cancelled returns
        break;
    }

    if (notificationTitle) {
      // For completed or cancelled returns, link to the order page
      const link =
        status === "completed" || status === "cancelled"
          ? `/account/orders/${returnRequest.orderId}`
          : `/account/orders/${returnRequest.orderId}/return`;

      await createClientNotification({
        userId: returnRequest.user,
        type: notificationType,
        title: notificationTitle,
        message: notificationMessage,
        orderId: returnRequest.orderId,
        link: link,
      });
    }

    // Create admin notification for tracking purposes
    await createReturnUpdateNotification(returnRequest, previousStatus);

    res.status(200).json({
      success: true,
      message: "Return status updated successfully",
      data: returnRequest,
    });
  } catch (error) {
    console.error("Error updating return status:", error);
    res.status(500).json({
      success: false,
      message: "Failed to update return status",
    });
  }
};

// Helper function to update product stock
async function updateProductStock(productId, size, quantityChange) {
  try {
    // Extract base product ID if it contains variant
    const baseProductId = productId.split("_")[0];

    const product = await ProductModel.findById(baseProductId);

    if (!product) return;

    // Update main stock
    product.stock = Math.max(0, product.stock + quantityChange);

    // Update size-specific stock if size is provided
    if (size) {
      if (product.dressSizes?.length > 0) {
        const sizeIndex = product.dressSizes.findIndex((s) => s.size === size);
        if (sizeIndex !== -1) {
          product.dressSizes[sizeIndex].stock = Math.max(
            0,
            product.dressSizes[sizeIndex].stock + quantityChange
          );
        }
      } else if (product.shoesSizes?.length > 0) {
        const sizeIndex = product.shoesSizes.findIndex((s) => s.size === size);
        if (sizeIndex !== -1) {
          product.shoesSizes[sizeIndex].stock = Math.max(
            0,
            product.shoesSizes[sizeIndex].stock + quantityChange
          );
        }
      }
    }

    // If this is a return (positive quantity change), adjust sales count
    if (quantityChange > 0) {
      product.sales = Math.max(0, (product.sales || 0) - quantityChange);
    }

    await product.save();

    console.log(
      `Updated stock for product ${baseProductId}, size ${size}, change: ${quantityChange}`
    );
  } catch (error) {
    console.error("Error updating product stock:", error);
  }
}

// Get return statistics for admin dashboard
export const getReturnStatistics = async (req, res) => {
  try {
    // Check if user is admin
    if (req.user.role !== "admin") {
      return res.status(403).json({
        success: false,
        message: "Unauthorized access",
      });
    }

    // Count returns by status
    const statusCounts = await ReturnModel.aggregate([
      {
        $group: {
          _id: "$status",
          count: { $sum: 1 },
        },
      },
    ]);

    // Count returns by type
    const typeCounts = await ReturnModel.aggregate([
      {
        $group: {
          _id: "$returnType",
          count: { $sum: 1 },
        },
      },
    ]);

    // Get total refund amount
    const totalRefundAmount = await ReturnModel.aggregate([
      {
        $match: {
          returnType: "refund",
          status: "completed",
        },
      },
      {
        $group: {
          _id: null,
          total: { $sum: "$refund_amount" },
        },
      },
    ]);

    // Get returns by month
    const returnsByMonth = await ReturnModel.aggregate([
      {
        $group: {
          _id: {
            month: { $month: "$createdAt" },
            year: { $year: "$createdAt" },
          },
          count: { $sum: 1 },
        },
      },
      { $sort: { "_id.year": 1, "_id.month": 1 } },
    ]);

    res.status(200).json({
      success: true,
      data: {
        statusCounts: statusCounts.reduce((obj, item) => {
          obj[item._id] = item.count;
          return obj;
        }, {}),
        typeCounts: typeCounts.reduce((obj, item) => {
          obj[item._id] = item.count;
          return obj;
        }, {}),
        totalRefundAmount:
          totalRefundAmount.length > 0 ? totalRefundAmount[0].total : 0,
        returnsByMonth,
      },
    });
  } catch (error) {
    console.error("Error fetching return statistics:", error);
    res.status(500).json({
      success: false,
      message: "Failed to fetch return statistics",
    });
  }
};
