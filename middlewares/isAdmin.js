const { apiResponse } = require("../utils/apiResponse"); 
exports.isAdmin = (req, res, next) => {
  if (!req.user || req.user.role !== "Admin") {
    return res.status(403).json(
      apiResponse(403, false, "Admin access required")
    );
  }
  next();
};