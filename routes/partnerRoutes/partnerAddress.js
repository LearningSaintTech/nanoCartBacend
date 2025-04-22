const express = require('express');
const router = express.Router();
const { createAddress, editAddress, deleteAddress,fetchAddress } = require("../../controllers/partnerController/partnerAddress");

const {verifyToken}=require("../../middlewares/verifyToken")
const {isPartner}=require("../../middlewares/isPartner")

// Create a new address
router.post('/create', verifyToken,isPartner, createAddress);

// Edit an existing address
router.put('/:addressId', verifyToken,isPartner, editAddress);

// Delete an address
router.delete('/:addressId', verifyToken,isPartner,deleteAddress);

//Fetch address details
router.get('/', verifyToken,isPartner,fetchAddress);

module.exports = router;