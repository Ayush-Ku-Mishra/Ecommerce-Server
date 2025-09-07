import AddressModel from "../models/address.model.js";
import { User } from "../models/userModel.js";
import mongoose from "mongoose";

export const getAllAddressesController = async (req, res) => {
  try {
    const userId = req.user._id;

    // Find all addresses for the authenticated user
    const addresses = await AddressModel.find({ userId }).sort({
      createdAt: -1,
    });

    // Map the addresses to include both field names for compatibility
    const mappedAddresses = addresses.map((addr) => {
      const addressObj = addr.toObject(); // Convert mongoose document to plain object
      return {
        ...addressObj,
        isDefault: addressObj.default, // Add isDefault field for frontend compatibility
      };
    });

    return res.status(200).json({
      success: true,
      message: "Addresses fetched successfully",
      addresses: mappedAddresses,
    });
  } catch (error) {
    console.error("Get addresses error:", error);
    return res.status(500).json({
      success: false,
      message: "Server error while fetching addresses",
      error: error.message,
    });
  }
};

// Controller to add a new address for the authenticated user
export const addAddressController = async (req, res) => {
  try {
    const userId = req.user._id;
    const {
      address_line,
      name,
      phone,
      locality,
      city,
      state,
      pincode,
      default: isDefault,
      isDefault: frontendDefault, // Handle both field names from frontend
      type,
      landmark,
      alternatePhone,
    } = req.body;

    // Use either 'default' or 'isDefault' from request
    const defaultValue = isDefault || frontendDefault || false;

    // Validate required fields
    if (
      !name ||
      !phone ||
      !locality ||
      !city ||
      !state ||
      !pincode ||
      !address_line
    ) {
      return res.status(400).json({
        success: false,
        message: "Please provide all required fields.",
      });
    }

    // If the new address is marked as default, unset existing default addresses for the user
    if (defaultValue) {
      await AddressModel.updateMany(
        { userId: userId, default: true },
        { $set: { default: false } }
      );
    }

    // Create the new address document
    const newAddress = new AddressModel({
      userId,
      address_line: address_line || "",
      name,
      phone,
      locality,
      city,
      state,
      pincode,
      default: defaultValue,
      type: type || "Home",
      landmark: landmark || "",
      alternatePhone: alternatePhone || "",
    });

    // Save in DB
    await newAddress.save();

    // Push new address _id into User's address_details array
    await User.findByIdAndUpdate(
      userId,
      { $push: { address_details: newAddress._id } },
      { new: true }
    );

    // Return address with both field names for frontend compatibility
    const responseAddress = {
      ...newAddress.toObject(),
      isDefault: newAddress.default,
    };

    return res.status(201).json({
      success: true,
      message: "Address added successfully",
      address: responseAddress,
    });
  } catch (error) {
    console.error("Add address error:", error);
    return res.status(500).json({
      success: false,
      message: "Server error while adding address",
      error: error.message,
    });
  }
};

export const handleDefaultController = async (req, res) => {
  try {
    const userId = req.user._id;
    const addressId = req.params.id;

    // Validate ObjectId
    if (!mongoose.Types.ObjectId.isValid(addressId)) {
      return res
        .status(400)
        .json({ success: false, message: "Invalid address ID" });
    }

    const address = await AddressModel.findOne({ _id: addressId, userId });
    if (!address) {
      return res
        .status(404)
        .json({ success: false, message: "Address not found" });
    }

    // Unset default from other addresses
    await AddressModel.updateMany(
      { userId, default: true },
      { $set: { default: false } }
    );

    // Set default on chosen address
    address.default = true;
    await address.save();

    // Return address with both field names for frontend compatibility
    const responseAddress = {
      ...address.toObject(),
      isDefault: address.default,
    };

    return res.status(200).json({
      success: true,
      message: "Default address set successfully",
      address: responseAddress,
    });
  } catch (error) {
    console.error("handleDefaultController error:", error);
    res.status(500).json({
      success: false,
      message: "Server error while setting default address",
      error: error.message,
    });
  }
};

// Controller to delete an address for the authenticated user
export const deleteAddressController = async (req, res) => {
  try {
    const userId = req.user._id;
    const addressId = req.params.id;

    // Validate ObjectId format
    if (!mongoose.Types.ObjectId.isValid(addressId)) {
      return res
        .status(400)
        .json({ success: false, message: "Invalid address ID" });
    }

    // Find the address belonging to the user
    const address = await AddressModel.findOne({ _id: addressId, userId });
    if (!address) {
      return res
        .status(404)
        .json({ success: false, message: "Address not found" });
    }

    // Remove address from user's address_details array
    await User.findByIdAndUpdate(
      userId,
      { $pull: { address_details: address._id } },
      { new: true }
    );

    // Delete the address document
    await AddressModel.deleteOne({ _id: addressId });

    return res.status(200).json({
      success: true,
      message: "Address deleted successfully",
      deletedAddressId: addressId,
    });
  } catch (error) {
    console.error("deleteAddressController error:", error);
    return res.status(500).json({
      success: false,
      message: "Server error while deleting address",
      error: error.message,
    });
  }
};

export const editAddressController = async (req, res) => {
  try {
    const userId = req.user._id;
    const addressId = req.params.id;

    // Validate ObjectId
    if (!mongoose.Types.ObjectId.isValid(addressId)) {
      return res
        .status(400)
        .json({ success: false, message: "Invalid address ID" });
    }

    const {
      address_line,
      name,
      phone,
      locality,
      city,
      state,
      pincode,
      default: isDefault,
      isDefault: frontendDefault, // Handle both field names from frontend
      type,
      landmark,
      alternatePhone,
    } = req.body;

    // Use either 'default' or 'isDefault' from request
    const defaultValue = isDefault || frontendDefault || false;

    // Validate required fields
    if (
      !name ||
      !phone ||
      !locality ||
      !city ||
      !state ||
      !pincode ||
      !address_line
    ) {
      return res.status(400).json({
        success: false,
        message: "Please provide all required fields.",
      });
    }

    // Find existing address and ensure belongs to user
    const existingAddress = await AddressModel.findOne({
      _id: addressId,
      userId,
    });
    if (!existingAddress) {
      return res
        .status(404)
        .json({ success: false, message: "Address not found" });
    }

    // If updating to default, unset other addresses as default
    if (defaultValue) {
      await AddressModel.updateMany(
        { userId, default: true },
        { $set: { default: false } }
      );
    }

    // Update address fields
    existingAddress.address_line = address_line;
    existingAddress.name = name;
    existingAddress.phone = phone;
    existingAddress.locality = locality;
    existingAddress.city = city;
    existingAddress.state = state;
    existingAddress.pincode = pincode;
    existingAddress.default = defaultValue;
    existingAddress.type = type || "Home";
    existingAddress.landmark = landmark || "";
    existingAddress.alternatePhone = alternatePhone || "";

    // Save updated address
    await existingAddress.save();

    // Return address with both field names for frontend compatibility
    const responseAddress = {
      ...existingAddress.toObject(),
      isDefault: existingAddress.default,
    };

    return res.status(200).json({
      success: true,
      message: "Address updated successfully",
      address: responseAddress,
    });
  } catch (error) {
    console.error("editAddressController error:", error);
    return res.status(500).json({
      success: false,
      message: "Server error while updating address",
      error: error.message,
    });
  }
};
