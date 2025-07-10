const express = require('express');
const router = express.Router();

const { generateFakeUsers,deleteFakeUsers,getAllFakeUsers,deleteOneFakeUser } = require("../../controllers/fakeDataController/fakeUserController"); // Adjust path if needed
const {verifyToken}=require("../../middlewares/verifyToken");
const {isAdmin}=require("../../middlewares/isAdmin")


//Generate Fake User
router.post('/generate',verifyToken,isAdmin, generateFakeUsers);

//Delete Fake USer
router.delete("/",verifyToken,isAdmin,deleteFakeUsers)

// Route to get all fake users
router.get('/', verifyToken, isAdmin, getAllFakeUsers);

// Route to delete a single fake user
router.delete('/delete-one-fake-user', verifyToken, isAdmin, deleteOneFakeUser);

module.exports = router;
