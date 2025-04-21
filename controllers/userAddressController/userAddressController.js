const User = require("../../models/User/User");
const UserAddress = require("../../models/User/UserAddress");

// Create a new address
exports.createAddress = async (req, res) => {
  try {
    const { userId } = req.user;
    const {
      name,
      phoneNumber,
      email,
      pincode,
      addressLine1,
      addressLine2,
      cityTown,
      state,
      country,
      addressType,
      isDefault,
    } = req.body;

    // Validate user exists
    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }

    // Create new address detail object
    const newAddressDetail = {
      name,
      phoneNumber,
      email,
      pincode,
      addressLine1,
      addressLine2,
      cityTown,
      state,
      country,
      addressType: addressType || "Home",
      isDefault: isDefault || false,
    };

    // Check if address already exists for user
    let address = await UserAddress.findOne({ userId });

    if (address) {
      // Add new address to existing addressDetail array
      address.addressDetail.push(newAddressDetail);

      // If isDefault is true for new address, set others to false
      if (newAddressDetail.isDefault) {
        address.addressDetail = address.addressDetail.map((addr, index) => ({
          ...addr,
          isDefault: index === address.addressDetail.length - 1 ? true : false,
        }));
      }
    } else {
      // Create new address document
      address = new UserAddress({
        userId,
        addressDetail: [newAddressDetail],
      });
    }

    await address.save();

    // Update user's isAddress flag
    user.isAddress = true;
    await user.save();

    res.status(201).json({
      message: "Address created successfully",
      address,
    });
  } catch (error) {
    res
      .status(500)
      .json({ message: "Error creating address", error: error.message });
  }
};

exports.editAddress = async (req, res) => {
  try {
    const { userId } = req.user;
    const { addressId } = req.params;
    const {
      name,
      phoneNumber,
      email,
      pincode,
      addressLine1,
      addressLine2,
      cityTown,
      state,
      country,
      addressType,
      isDefault,
    } = req.body;

    const addressDoc = await UserAddress.findOne({ userId });
    if (!addressDoc) {
      return res.status(404).json({ message: "Address not found" });
    }

    const address = addressDoc.addressDetail.id(addressId);
    if (!address) {
      return res.status(404).json({ message: "Specific address not found" });
    }

    // Update each field if provided
    if (name !== undefined) address.name = name;
    if (phoneNumber !== undefined) address.phoneNumber = phoneNumber;
    if (email !== undefined) address.email = email;
    if (pincode !== undefined) address.pincode = pincode;
    if (addressLine1 !== undefined) address.addressLine1 = addressLine1;
    if (addressLine2 !== undefined) address.addressLine2 = addressLine2;
    if (cityTown !== undefined) address.cityTown = cityTown;
    if (state !== undefined) address.state = state;
    if (country !== undefined) address.country = country;
    if (addressType !== undefined) address.addressType = addressType;
    if (isDefault !== undefined) address.isDefault = isDefault;

    // Set isDefault false for others if current is set to true
    if (isDefault) {
      addressDoc.addressDetail.forEach((addr) => {
        addr.isDefault = addr._id.toString() === addressId;
      });
    }

    await addressDoc.save();

    res.status(200).json({
      message: "Address updated successfully",
      address: addressDoc,
    });
  } catch (error) {
    res
      .status(500)
      .json({ message: "Error updating address", error: error.message });
  }
};

// Delete an address
exports.deleteAddress = async (req, res) => {
  try {
    const { userId } = req.user;
    const { addressId } = req.params;

    const address = await UserAddress.findOne({ userId });
    if (!address) {
      return res.status(404).json({ message: "Address not found" });
    }

    // Filter out the address to delete
    address.addressDetail = address.addressDetail.filter(
      (addr) => addr._id.toString() !== addressId
    );

    // Update user's isAddress flag if no addresses remain
    if (address.addressDetail.length === 0) {
      const user = await User.findById(userId);
      user.isAddress = false;
      await user.save();
    }

    await address.save();

    res.status(200).json({
      message: "Address deleted successfully",
      address,
    });
  } catch (error) {
    res
      .status(500)
      .json({ message: "Error deleting address", error: error.message });
  }
};



exports.fetchAddress = async (req, res) => {
  try {
    const { userId } = req.user;

    const addressDoc = await UserAddress.findOne({ userId });

    if (!addressDoc || addressDoc.addressDetail.length === 0) {
      return res.status(404).json({ message: "No addresses found" });
    }

    res.status(200).json({
      message: "Addresses fetched successfully",
      addresses: addressDoc,
    });
  } catch (error) {
    res.status(500).json({
      message: "Error fetching addresses",
      error: error.message,
    });
  }
};
