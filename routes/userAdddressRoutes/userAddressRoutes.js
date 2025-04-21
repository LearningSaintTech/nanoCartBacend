const express = require('express');
const router = express.Router();
const { createAddress, editAddress, deleteAddress,fetchAddress } = require('../../controllers/userAddressController/userAddressController');

const {verifyToken}=require("../../middlewares/verifyToken")
const {isUser}=require("../../middlewares/isUser")

// Create a new address
router.post('/create', verifyToken,isUser, createAddress);

// Edit an existing address
router.put('/:addressId', verifyToken,isUser, editAddress);

// Delete an address
router.delete('/:addressId', verifyToken,isUser,deleteAddress);

//Fetch address details
router.get('/', verifyToken,isUser,fetchAddress);

module.exports = router;