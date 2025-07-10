const Partner = require("../../models/Partner/Partner");
const PartnerAddress = require("../../models/Partner/PartnerAddress");

// Create a new address
exports.createAddress = async (req, res) => {
  try {
    console.log("[createAddress] Start");

    const { partnerId } = req.user;
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

    console.log("[createAddress] partnerId:", partnerId);

    // Validate user exists
    const partner = await Partner.findById(partnerId);
    if (!partner) {
      console.log("[createAddress] Partner not found");
      return res.status(404).json({ message: "partner not found" });
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

    console.log("[createAddress] New address detail:", newAddressDetail);

    // Check if address already exists for user
    let address = await PartnerAddress.findOne({ partnerId });
    console.log("[createAddress] Existing address document:", !!address);

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
      address = new PartnerAddress({
        partnerId,
        addressDetail: [newAddressDetail],
      });
      console.log("[createAddress] Created new PartnerAddress document");
    }

    await address.save();

    // Update user's isAddress flag
    partner.isAddress = true;
    await partner.save();

    console.log("[createAddress] Address saved and partner updated");

    res.status(201).json({
      message: "Address created successfully",
      address,
    });
  } catch (error) {
    console.error("[createAddress] Error:", error);
    res
      .status(500)
      .json({ message: "Error creating address", error: error.message });
  }
};

exports.editAddress = async (req, res) => {
  try {
    console.log("[editAddress] Start");

    const { partnerId } = req.user;
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

    console.log("[editAddress] partnerId:", partnerId, "addressId:", addressId);

    const addressDoc = await PartnerAddress.findOne({ partnerId });
    if (!addressDoc) {
      console.log("[editAddress] Address document not found");
      return res.status(404).json({ message: "Address not found" });
    }

    const address = addressDoc.addressDetail.id(addressId);
    if (!address) {
      console.log("[editAddress] Specific address not found");
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

    console.log("[editAddress] Updated address:", address);

    // Set isDefault false for others if current is set to true
    if (isDefault) {
      addressDoc.addressDetail.forEach((addr) => {
        addr.isDefault = addr._id.toString() === addressId;
      });
      console.log("[editAddress] isDefault flag updated among addresses");
    }

    await addressDoc.save();

    console.log("[editAddress] Address document saved");

    res.status(200).json({
      message: "Address updated successfully",
      address: addressDoc,
    });
  } catch (error) {
    console.error("[editAddress] Error:", error);
    res
      .status(500)
      .json({ message: "Error updating address", error: error.message });
  }
};

// Delete an address
exports.deleteAddress = async (req, res) => {
  try {
    console.log("[deleteAddress] Start");

    const { partnerId } = req.user;
    const { addressId } = req.params;

    console.log("[deleteAddress] partnerId:", partnerId, "addressId:", addressId);

    const address = await PartnerAddress.findOne({ partnerId });
    if (!address) {
      console.log("[deleteAddress] Address document not found");
      return res.status(404).json({ message: "Address not found" });
    }

    // Filter out the address to delete
    const beforeCount = address.addressDetail.length;
    address.addressDetail = address.addressDetail.filter(
      (addr) => addr._id.toString() !== addressId
    );
    const afterCount = address.addressDetail.length;

    console.log(`[deleteAddress] Removed address: before=${beforeCount}, after=${afterCount}`);

    // Update user's isAddress flag if no addresses remain
    if (address.addressDetail.length === 0) {
      const partner = await Partner.findById(partnerId);
      partner.isAddress = false;
      await partner.save();
      console.log("[deleteAddress] No addresses remain, partner.isAddress set to false");
    }

    await address.save();

    console.log("[deleteAddress] Address document saved after deletion");

    res.status(200).json({
      message: "Address deleted successfully",
      address,
    });
  } catch (error) {
    console.error("[deleteAddress] Error:", error);
    res
      .status(500)
      .json({ message: "Error deleting address", error: error.message });
  }
};

exports.fetchAddress = async (req, res) => {
  try {
    console.log("[fetchAddress] Start");

    const { partnerId } = req.user;
    console.log("[fetchAddress] partnerId:", partnerId);

    const addressDoc = await PartnerAddress.findOne({ partnerId });

    if (!addressDoc || addressDoc.addressDetail.length === 0) {
      console.log("[fetchAddress] No addresses found");
      return res.status(404).json({ message: "No addresses found" });
    }

    console.log("[fetchAddress] Addresses found:", addressDoc.addressDetail.length);

    res.status(200).json({
      message: "Addresses fetched successfully",
      addresses: addressDoc,
    });
  } catch (error) {
    console.error("[fetchAddress] Error:", error);
    res.status(500).json({
      message: "Error fetching addresses",
      error: error.message,
    });
  }
};
