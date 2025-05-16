const { apiResponse } = require("../utils/apiResponse");
// Restrict to User Middleware
exports.isUser = (req, res, next) => {
    if (!req.user || req.user.role !== "User") {
      return res.status(403).json(
        apiResponse(403, false, "User access required")
      );
    }
    next();
  };