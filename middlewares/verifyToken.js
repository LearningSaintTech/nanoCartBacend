const jwt = require("jsonwebtoken");
const { apiResponse } = require("../utils/apiResponse");
require("dotenv").config();

exports.verifyToken = async (req, res, next) => {
  try {
    // Extract token only from Authorization header
    const token = req.headers.authorization?.startsWith("Bearer ")
      ? req.headers.authorization.replace("Bearer ", "")
      : null;
    console.log(token);

    if (token === null) {
      return res.status(404).json(apiResponse(false, 401, "Token is Missing"));
    }

    if (!process.env.JWT_SECRET) {
      throw new Error("JWT_SECRET not configured");
    }

    // Verify token (synchronous)
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    console.log("Decoded ->", decoded);
    req.user = decoded;
    return next();

    
  } catch (error) {
    console.error(error);
    if (error.name === "JsonWebTokenError") {
      return res.status(404).json(apiResponse(false, 401, "Token is Invalid"));
    }
    if (error.name === "TokenExpiredError") {
      return res.status(404).json(apiResponse(false, 401, "Token has Expired"));
    }
    return res
      .status(500)
      .json(
        apiResponse(
          false,
          500,
          "Something went wrong while validating the token"
        )
      );
  }
};
