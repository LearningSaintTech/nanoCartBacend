const { apiResponse } = require("../utils/apiResponse");

exports.isPartnerOrAdmin = (req, res, next) => {
  if (!req.user || (req.user.role !== "Partner" && req.user.role !== "Admin")) {
    return res.status(403).json(
      apiResponse(403, false, "Partner or Admin access required")
    );
  }
  next();
};