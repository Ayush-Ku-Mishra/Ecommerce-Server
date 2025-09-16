import { Router } from "express";
import { isAuthenticated } from "../middlewares/auth.js";
import { 
  createRazorpayOrder, 
  verifyPayment,
  getUserOrders,
  testPayment,
  createCODOrder,
  getOrdersCount,
  getSalesByMonth,
  getAllOrdersForAdmin,
  updateOrderStatus,
} from "../controllers/orderController.js";

const orderRouter = Router();

orderRouter.post('/create-order', isAuthenticated, createRazorpayOrder);
orderRouter.post('/verify-payment', isAuthenticated, verifyPayment);
orderRouter.get('/order-list', isAuthenticated, getUserOrders);
orderRouter.get('/admin/all-orders', isAuthenticated, getAllOrdersForAdmin);
orderRouter.post('/create-cod-order', isAuthenticated, createCODOrder);
orderRouter.get('/orders-count', isAuthenticated, getOrdersCount); 
orderRouter.put('/admin/update-order-status', isAuthenticated, updateOrderStatus);
orderRouter.get("/sales-by-month", isAuthenticated, getSalesByMonth);
orderRouter.get('/test', isAuthenticated, testPayment);
orderRouter.get('/debug-route', (req, res) => {
  console.log("Debug route hit!");
  res.json({ message: "Debug route working" });
});

export default orderRouter;