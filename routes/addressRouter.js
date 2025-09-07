import express from "express";
import { isAuthenticated } from "../middlewares/auth.js";
import { addAddressController, handleDefaultController, deleteAddressController, getAllAddressesController, editAddressController } from "../controllers/addressController.js";

const AddressRouter = express.Router();

AddressRouter.get("/addAddress", isAuthenticated, getAllAddressesController);
AddressRouter.post("/addAddress", isAuthenticated, addAddressController);
AddressRouter.patch("/:id/default", isAuthenticated, handleDefaultController);
AddressRouter.delete("/delete/:id", isAuthenticated, deleteAddressController);
AddressRouter.put("/update/:id", isAuthenticated, editAddressController);





export default AddressRouter;