const express = require("express");
const router = express.Router();
const {createOrder,updateOrder,deleteOrder,getOrderById,getAllOrders} = require("../../controllers/userOrderController/userOrderController");

// CREATE a new order
router.post("/", createOrder);

// GET all orders
router.get("/", getAllOrders);

// GET a single order by ID
router.get("/:id", getOrderById);

// UPDATE an order by ID
router.put("/:id", updateOrder);

// DELETE an order by ID
router.delete("/:id", deleteOrder);

module.exports = router;
