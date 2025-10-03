import { Router } from "express";
import { isAuthenticated } from "../middlewares/auth.js";
import { 
  checkExistingReturn,
  createReturnRequest,
  cancelReturnRequest,
  getUserReturns,
  getAllReturnsForAdmin,
  updateReturnStatus,
  getReturnStatistics
} from "../controllers/returnController.js";

const returnRouter = Router();

// User routes
returnRouter.get("/check/:orderId", isAuthenticated, checkExistingReturn);
returnRouter.post("/create", isAuthenticated, createReturnRequest);
returnRouter.post("/cancel/:returnId", isAuthenticated, cancelReturnRequest);
returnRouter.get("/user", isAuthenticated, getUserReturns);

// Admin routes
returnRouter.get("/admin/all", isAuthenticated, getAllReturnsForAdmin);
returnRouter.put("/admin/update/:returnId", isAuthenticated, updateReturnStatus);
returnRouter.get("/admin/statistics", isAuthenticated, getReturnStatistics);

export default returnRouter;