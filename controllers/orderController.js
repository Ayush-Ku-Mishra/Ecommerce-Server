import Razorpay from "razorpay";
import crypto from "crypto";
import OrderModel from "../models/order.model.js";
import CartProductModel from "../models/cartProduct.model.js";
import { createOrderNotification } from "./notificationController.js";
import { createClientNotification } from "./clientNotificationController.js";

// Create the actual create-order endpoint - ONLY creates Razorpay order, doesn't save to DB
export const createRazorpayOrder = async (req, res) => {
  try {
    console.log("🚀 CREATE ORDER FUNCTION CALLED!!!");
    console.log("=== CREATE ORDER DEBUG INFO ===");
    console.log("User:", req.user);
    console.log("Request body:", req.body);

    // Check if user is authenticated
    if (!req.user || !req.user._id) {
      console.error("User not authenticated");
      return res.status(401).json({
        success: false,
        message: "User not authenticated",
      });
    }

    // Check if Razorpay environment variables exist
    if (!process.env.RAZORPAY_KEY_ID || !process.env.RAZORPAY_KEY_SECRET) {
      console.error("Razorpay environment variables missing");
      return res.status(500).json({
        success: false,
        message: "Payment gateway configuration error",
      });
    }

    // Initialize Razorpay instance
    console.log("Creating Razorpay instance...");
    const razorpayInstance = new Razorpay({
      key_id: process.env.RAZORPAY_KEY_ID,
      key_secret: process.env.RAZORPAY_KEY_SECRET,
    });
    console.log("Razorpay instance created successfully");

    const { amount, currency = "INR", cart, address, notes } = req.body;
    const userId = req.user._id;

    console.log("Validation data:");
    console.log("- Amount:", amount);
    console.log("- Cart items:", cart?.length);
    console.log("- Address provided:", !!address);
    console.log("- User ID:", userId);

    // Validate input
    if (!amount || amount <= 0) {
      return res.status(400).json({
        success: false,
        message: "Invalid amount",
      });
    }

    if (!cart || cart.length === 0) {
      return res.status(400).json({
        success: false,
        message: "Cart is empty",
      });
    }

    if (!address) {
      return res.status(400).json({
        success: false,
        message: "Delivery address is required",
      });
    }

    // Create order in Razorpay ONLY - Don't save to database yet
    console.log("Creating Razorpay order...");
    console.log("Amount in paisa:", Math.round(amount * 100));

    const razorpayOrder = await razorpayInstance.orders.create({
      amount: Math.round(amount * 100), // Amount in paisa
      currency: currency,
      receipt: `ord_${Date.now().toString().slice(-8)}`, // Shortened receipt (max 40 chars)
      notes: notes || {},
    });

    console.log("Razorpay order created successfully:", razorpayOrder.id);

    console.log("=== ORDER CREATION SUCCESSFUL (Razorpay only) ===");
    res.status(200).json({
      success: true,
      message: "Payment order created successfully",
      order: {
        id: razorpayOrder.id,
        amount: razorpayOrder.amount,
        currency: razorpayOrder.currency,
        receipt: razorpayOrder.receipt,
      },
    });
  } catch (error) {
    console.error("=== ERROR IN CREATE ORDER ===");
    console.error("Error:", error);
    console.error("Error message:", error.message);
    console.error("Error stack:", error.stack);

    res.status(500).json({
      success: false,
      message: "Failed to create order",
      error: error.message,
    });
  }
};

// Verify Payment - NOW this is where we save successful orders
export const verifyPayment = async (req, res) => {
  try {
    console.log("=== VERIFY PAYMENT CALLED ===");
    console.log("Request body:", req.body);

    const {
      razorpay_order_id,
      razorpay_payment_id,
      razorpay_signature,
      cart,
      address,
      amount,
      isBuyNow,
    } = req.body;

    const userId = req.user._id;

    // Validate required data
    if (!cart || !address || !amount) {
      return res.status(400).json({
        success: false,
        message: "Missing order data - cart, address, or amount not provided",
      });
    }

    // Verify signature
    const body = razorpay_order_id + "|" + razorpay_payment_id;
    const expectedSignature = crypto
      .createHmac("sha256", process.env.RAZORPAY_KEY_SECRET)
      .update(body.toString())
      .digest("hex");

    console.log("Signature verification:");
    console.log("Expected:", expectedSignature);
    console.log("Received:", razorpay_signature);

    if (expectedSignature !== razorpay_signature) {
      return res.status(400).json({
        success: false,
        message: "Payment verification failed - Invalid signature",
      });
    }

    console.log("Payment signature verified successfully!");

    // NOW create and save the order to database (only for successful payments)
    const order = new OrderModel({
      userId: userId,
      orderId: razorpay_order_id,
      products: cart.map((item) => ({
        productId: item.id,
        name: item.title,
        brand: item.brand,
        price: item.price,
        originalPrice: item.originalPrice,
        quantity: item.quantity,
        selectedSize: item.selectedSize,
        image: item.image,
      })),
      paymentId: razorpay_payment_id,
      paymentStatus: "completed",
      delivery_address: {
        name: address.name,
        phone: address.phone,
        address_line: address.address_line,
        locality: address.locality,
        city: address.city,
        state: address.state,
        pincode: address.pincode,
        landmark: address.landmark || "",
        alternatePhone: address.alternatePhone || "",
        type: address.type || "Home",
      },
      subTotal_amount: cart.reduce(
        (sum, item) => sum + item.originalPrice * item.quantity,
        0
      ),
      TotalAmount: amount,
      status: "paid",
      invoice_receipt: `ord_${Date.now().toString().slice(-8)}`,
      paymentMethod: "ONLINE",
    });

    await order.save();
    console.log(
      "Order saved to database successfully after payment verification"
    );

    await createOrderNotification({
      orderId: order.orderId,
      customerName: order.delivery_address.name,
      amount: order.TotalAmount,
      paymentMethod: "ONLINE",
    });

    // Create notification for client
    await createClientNotification({
      userId: userId,
      type: "order_placed",
      title: "Order Placed Successfully! 🎉",
      message: `Your order #${order.orderId} has been placed successfully. We'll notify you when it ships!`,
      orderId: order.orderId,
      link: `/account/orders/${order.orderId}`,
    });

    // Clear the user's cart after successful payment (only if not buy now mode)
    if (!isBuyNow) {
      try {
        await CartProductModel.deleteMany({ userId: userId });
        console.log("User cart cleared successfully");
      } catch (cartError) {
        console.error("Error clearing cart:", cartError);
      }
    }

    res.status(200).json({
      success: true,
      message: "Payment verified and order placed successfully",
      orderId: order._id,
      orderNumber: order.orderId,
      paymentId: razorpay_payment_id,
    });
  } catch (error) {
    console.error("Error verifying payment:", error);
    res.status(500).json({
      success: false,
      message: "Payment verification failed",
      error: error.message,
    });
  }
};

// COD Order - Use the SIMPLE working version from Document 4
export const createCODOrder = async (req, res) => {
  try {
    console.log("🚀 COD ORDER FUNCTION CALLED!!!");
    console.log("Request body:", req.body);

    if (!req.user || !req.user._id) {
      return res.status(401).json({
        success: false,
        message: "User not authenticated",
      });
    }

    const { cart, address, notes, amount } = req.body;
    const userId = req.user._id;

    // Validate input
    if (!cart || cart.length === 0) {
      return res.status(400).json({
        success: false,
        message: "Cart is empty",
      });
    }

    if (!address) {
      return res.status(400).json({
        success: false,
        message: "Delivery address is required",
      });
    }

    // Use amount from request or calculate it
    const totalAmount =
      amount ||
      cart.reduce(
        (sum, item) => sum + (item.price || 0) * (item.quantity || 1),
        0
      );

    // Create COD order in database - Using the WORKING structure from Document 4
    const order = new OrderModel({
      userId: userId,
      orderId: `COD_${Date.now()}_${userId.toString().slice(-6)}`,
      products: cart.map((item) => ({
        productId: item.id,
        name: item.title,
        brand: item.brand,
        price: item.price,
        originalPrice: item.originalPrice,
        quantity: item.quantity,
        selectedSize: item.selectedSize,
        image: item.image,
      })),
      paymentId: "COD",
      paymentStatus: "pending",
      delivery_address: {
        name: address.name,
        phone: address.phone,
        address_line: address.address_line,
        locality: address.locality,
        city: address.city,
        state: address.state,
        pincode: address.pincode,
        landmark: address.landmark || "",
        alternatePhone: address.alternatePhone || "",
        type: address.type || "Home",
      },
      subTotal_amount: cart.reduce(
        (sum, item) => sum + (item.originalPrice || 0) * (item.quantity || 1),
        0
      ),
      TotalAmount: totalAmount,
      status: "pending", // Use the same status as Document 4
      invoice_receipt: `COD_${Date.now()}`,
      paymentMethod: "COD",
    });

    await order.save();
    console.log("COD Order saved successfully");

    await createOrderNotification({
      orderId: order.orderId,
      customerName: order.delivery_address.name,
      amount: order.TotalAmount,
      paymentMethod: "COD",
    });

    // Create notification for client
    await createClientNotification({
      userId: userId,
      type: "order_placed",
      title: "COD Order Placed Successfully! 🎉",
      message: `Your COD order #${order.orderId} has been placed successfully. Pay ₹${order.TotalAmount} at delivery.`,
      orderId: order.orderId,
      link: `/account/orders/${order.orderId}`,
    });

    // Clear cart for COD orders
    try {
      await CartProductModel.deleteMany({ userId: userId });
      console.log("User cart cleared after COD order");
    } catch (cartError) {
      console.error("Error clearing cart:", cartError);
    }

    res.status(200).json({
      success: true,
      message: "Order placed successfully",
      orderId: order._id,
      orderNumber: order.orderId,
    });
  } catch (error) {
    console.error("Error creating COD order:", error);
    res.status(500).json({
      success: false,
      message: "Failed to create COD order",
      error: error.message,
    });
  }
};

// Get Order Details
export const getAllOrdersForAdmin = async (req, res) => {
  try {
    console.log("=== GET ALL ORDERS FOR ADMIN ===");

    // Fetch ALL orders from database (not filtered by userId)
    const orders = await OrderModel.find({})
      .populate("userId", "name email phone") // Populate user details
      .sort({
        createdAt: -1, // Sort by newest first
      });

    console.log(`Found ${orders.length} total orders for admin panel`);

    res.json({
      message: "All orders fetched successfully",
      data: orders,
      error: false,
      success: true,
    });
  } catch (error) {
    console.error("Error fetching all orders for admin:", error);
    res.status(500).json({
      message: error.message || error,
      error: true,
      success: false,
    });
  }
};

// Also update the existing getOrderDetails to be more explicit about user-specific orders
export const getUserOrders = async (req, res) => {
  try {
    const userId = req.user._id;

    const orders = await OrderModel.find({ userId: userId })
      .populate("userId", "name email phone")
      .sort({
        createdAt: -1,
      });

    res.json({
      message: "User order list",
      data: orders,
      error: false,
      success: true,
    });
  } catch (error) {
    res.status(500).json({
      message: error.message || error,
      error: true,
      success: false,
    });
  }
};

export const testPayment = async (req, res) => {
  try {
    console.log("=== TEST ENDPOINT HIT ===");
    console.log("User:", req.user);

    res.json({
      success: true,
      message: "Payment route is working",
      user: !!req.user,
      userId: req.user?._id,
      keyExists: !!process.env.RAZORPAY_KEY_ID,
      secretExists: !!process.env.RAZORPAY_KEY_SECRET,
    });
  } catch (error) {
    console.error("Test error:", error);
    res.status(500).json({
      success: false,
      message: error.message,
    });
  }
};

// Get total orders count
export const getOrdersCount = async (req, res) => {
  try {
    const count = await OrderModel.countDocuments(); // count all orders
    res.json({ success: true, count });
  } catch (error) {
    console.error("Error fetching orders count:", error);
    res.status(500).json({
      success: false,
      message: "Failed to fetch orders count",
      error: error.message,
    });
  }
};

// Get total sales grouped by month
export const getSalesByMonth = async (req, res) => {
  try {
    const result = await Order.aggregate([
      {
        $group: {
          _id: { $month: "$createdAt" },
          totalSales: { $sum: "$totalAmount" }, // field you store order price in
        },
      },
      { $sort: { _id: 1 } },
    ]);

    res.json({ success: true, data: result });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

export const updateOrderStatus = async (req, res) => {
  try {
    console.log("=== UPDATE ORDER STATUS CALLED ===");
    console.log("Request body:", req.body);
    console.log("User:", req.user);

    const { orderId, status } = req.body;

    // Validate input
    if (!orderId || !status) {
      return res.status(400).json({
        success: false,
        message: "Order ID and status are required",
      });
    }

    // Validate status value
    const validStatuses = [
      "pending",
      "paid",
      "processing",
      "shipped",
      "delivered",
      "cancelled",
    ];
    if (!validStatuses.includes(status)) {
      return res.status(400).json({
        success: false,
        message: `Invalid status. Valid options: ${validStatuses.join(", ")}`,
      });
    }

    // Find the current order first
    const currentOrder = await OrderModel.findOne({ orderId: orderId });

    if (!currentOrder) {
      return res.status(404).json({
        success: false,
        message: "Order not found",
      });
    }

    console.log(
      `Current order status: ${currentOrder.status}, Payment method: ${currentOrder.paymentMethod}`
    );

    // Business logic: Different progression for COD vs Online payments
    if (
      currentOrder.paymentMethod === "ONLINE" &&
      currentOrder.paymentStatus === "completed"
    ) {
      // Define status progression for online payments
      const statusProgression = [
        "pending",
        "paid",
        "processing",
        "shipped",
        "delivered",
      ];
      const currentStatusIndex = statusProgression.indexOf(currentOrder.status);
      const newStatusIndex = statusProgression.indexOf(status);

      // Prevent moving backwards in status (except to cancelled)
      if (newStatusIndex < currentStatusIndex && status !== "cancelled") {
        return res.status(400).json({
          success: false,
          message: `Cannot change order status backwards from '${currentOrder.status}' to '${status}' for paid orders. You can only move forward in the fulfillment process or cancel the order.`,
        });
      }

      // Prevent changing from delivered back to anything except cancelled
      if (
        currentOrder.status === "delivered" &&
        status !== "delivered" &&
        status !== "cancelled"
      ) {
        return res.status(400).json({
          success: false,
          message: `Cannot change delivered order status to '${status}'. Delivered orders can only be cancelled if needed.`,
        });
      }
    }

    // For COD orders - different business logic (payment happens at delivery)
    if (currentOrder.paymentMethod === "COD") {
      // COD progression: pending -> processing -> shipped -> delivered (no "paid" status)
      const codStatusProgression = [
        "pending",
        "processing",
        "shipped",
        "delivered",
      ];
      const currentStatusIndex = codStatusProgression.indexOf(
        currentOrder.status
      );
      const newStatusIndex = codStatusProgression.indexOf(status);

      // Prevent setting "paid" status for COD orders
      if (status === "paid") {
        return res.status(400).json({
          success: false,
          message: `COD orders cannot be marked as 'paid'. Payment is collected at delivery. Use 'delivered' status when payment is received.`,
        });
      }

      // Prevent moving backwards in status (except to cancelled)
      if (newStatusIndex < currentStatusIndex && status !== "cancelled") {
        return res.status(400).json({
          success: false,
          message: `Cannot change COD order status backwards from '${currentOrder.status}' to '${status}'. You can only move forward in the fulfillment process or cancel the order.`,
        });
      }

      // Prevent changing from delivered back to anything except cancelled
      if (
        currentOrder.status === "delivered" &&
        status !== "delivered" &&
        status !== "cancelled"
      ) {
        return res.status(400).json({
          success: false,
          message: `Cannot change delivered COD order status to '${status}'. Delivered orders can only be cancelled if needed.`,
        });
      }
    }

    // Update the order status
    const updatedOrder = await OrderModel.findOneAndUpdate(
      { orderId: orderId },
      {
        status: status,
        updatedAt: new Date(),
      },
      {
        new: true,
        runValidators: true,
      }
    ).populate("userId", "name email phone");

    console.log(`Order ${orderId} status successfully updated to: ${status}`);

    // CREATE CLIENT NOTIFICATION BASED ON STATUS CHANGE
    let notificationTitle = "";
    let notificationMessage = "";
    let notificationType = "";

    switch (status) {
      case "shipped":
        notificationTitle = "Order Shipped! 📦";
        notificationMessage = `Your order #${orderId} has been shipped and is on its way!`;
        notificationType = "order_shipped";
        break;
      case "delivered":
        notificationTitle = "Order Delivered! ✅";
        notificationMessage = `Your order #${orderId} has been successfully delivered!`;
        notificationType = "order_delivered";
        break;
      case "cancelled":
        notificationTitle = "Order Cancelled ❌";
        notificationMessage = `Your order #${orderId} has been cancelled.`;
        notificationType = "order_cancelled";
        break;
      case "processing":
        notificationTitle = "Order Processing 🔄";
        notificationMessage = `Your order #${orderId} is being processed.`;
        notificationType = "order_placed";
        break;
    }

    // Create notification if we have a title (meaning it's a status we want to notify about)
    if (notificationTitle && updatedOrder.userId && updatedOrder.userId._id) {
      await createClientNotification({
        userId: updatedOrder.userId._id,
        type: notificationType,
        title: notificationTitle,
        message: notificationMessage,
        orderId: orderId,
        link: `/account/orders/${orderId}`,
      });
      console.log(
        `Client notification created for order ${orderId} status change to ${status}`
      );
    }

    // Optional: Log status change for audit purposes
    console.log(
      `STATUS CHANGE LOG: Order ${orderId} changed from '${currentOrder.status}' to '${status}' by admin user ${req.user?._id}`
    );

    res.status(200).json({
      success: true,
      message: `Order status updated to ${status}`,
      data: {
        orderId: updatedOrder.orderId,
        status: updatedOrder.status,
        previousStatus: currentOrder.status,
        paymentMethod: updatedOrder.paymentMethod,
        updatedAt: updatedOrder.updatedAt,
        customerName: updatedOrder.delivery_address?.name,
        customerEmail: updatedOrder.userId?.email,
      },
    });
  } catch (error) {
    console.error("Error updating order status:", error);
    console.error("Error details:", error.message);
    console.error("Error stack:", error.stack);

    res.status(500).json({
      success: false,
      message: "Failed to update order status",
      error: error.message,
    });
  }
};
