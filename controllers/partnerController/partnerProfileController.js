const Partner = require("../../models/Partner/Partner");
const PartnerProfile = require("../../models/Partner/PartnerProfile"); 
const { apiResponse } = require("../../utils/apiResponse");

exports.updatePartnerProfile = async (req, res) => {
  try {
    const { partnerId } = req.user;
    const {
      shopName,
      gstNumber,
      panNumber,
      shopAddress,
      pincode,
      townCity,
      state,
    } = req.body;

    const partner = await Partner.findById(partnerId);
    if (!partner) {
      return res.status(404).json(apiResponse(404, false, "Partner not found"));
    }

    // Check if partner is verified and active
    if (!partner.isVerified || !partner.isActive) {
      return res
        .status(403)
        .json(apiResponse(403, false, "Partner is not verified or active"));
    }

    // Find the existing profile
    let partnerProfile = await PartnerProfile.findOne({ partnerId });
    if (!partnerProfile) {
      return res
        .status(404)
        .json(apiResponse(404, false, "Partner profile not found"));
    }

    // Update only provided fields
    if (shopName) partnerProfile.shopName = shopName;
    if (gstNumber) partnerProfile.gstNumber = gstNumber;
    if (panNumber) partnerProfile.panNumber = panNumber;
    if (shopAddress) partnerProfile.shopAddress = shopAddress;
    if (pincode) partnerProfile.pincode = pincode;
    if (townCity) partnerProfile.townCity = townCity;
    if (state) partnerProfile.state = state;

    // Save updated profile
    await partnerProfile.save();

    return res
      .status(200)
      .json(
        apiResponse(
          200,
          true,
          "Partner profile updated successfully",
          partnerProfile
        )
      );
  } catch (error) {
    console.error("Update Partner Profile Error:", error.message);
    return res
      .status(400)
      .json(apiResponse(400, false, `${field} already exists`));
  }
};
