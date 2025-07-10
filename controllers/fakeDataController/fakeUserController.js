const { faker } = require('@faker-js/faker');
const User = require('../../models/User/User');
const { apiResponse } = require('../../utils/apiResponse');
const mongoose=require("mongoose")

exports.generateFakeUsers = async (req, res) => {
  try {
    const { count } = req.body;

    if (!count || typeof count !== 'number' || count <= 0) {
      return res
        .status(400)
        .json(apiResponse(400, false, 'Invalid user count'));
    }

    const users = [];

    for (let i = 0; i < count; i++) {
      const startDigit = faker.helpers.arrayElement(['6', '7', '8', '9']);
      const randomPhone = startDigit + faker.string.numeric(9);
      const emailPrefix = faker.person.fullName().toLowerCase().replace(/[^a-z0-9]/g, '');
      const fakeUser = {
        name: faker.person.fullName(),
        phoneNumber: randomPhone,
        email: `${emailPrefix}${faker.number.int({ min: 1000, max: 9999 })}@gmail.com`,
        role: "User",
        isPhoneVerified: true,
        isEmailVerified: false,
        isActive: true,
        isPartner: false,
        isAddress: false,
        isFakeUser:true,
      };
      users.push(fakeUser);
    }

    const createdUsers = await User.insertMany(users);

    return res
      .status(201)
      .json(apiResponse(201, true, `${createdUsers.length} fake users created`, createdUsers));
  } catch (error) {
    console.error('Error creating fake users:', error);
    return res
      .status(500)
      .json(apiResponse(500, false, 'Server error'));
  }
};


exports.deleteFakeUsers = async (req, res) => {
  try {
    const result = await User.deleteMany({ isFakeUser: true });

    if (result.deletedCount === 0) {
      return res
        .status(404)
        .json(apiResponse(404, false, 'No fake users found to delete'));
    }

    return res
      .status(200)
      .json(apiResponse(200, true, `${result.deletedCount} fake users deleted`));
  } catch (error) {
    console.error('Error deleting fake users:', error);
    return res
      .status(500)
      .json(apiResponse(500, false, 'Server error while deleting fake users'));
  }
};



// GET: Retrieve all fake users
exports.getAllFakeUsers = async (req, res) => {
  try {
    // Find all users marked as fake
    const fakeUsers = await User.find({ isFakeUser: true }).select('_id name email phoneNumber');

    return res.status(200).json(
      apiResponse(200, true, 'Fake users retrieved successfully', {
        count: fakeUsers.length,
        fakeUsers,
      })
    );
  } catch (error) {
    console.error('Get fake users error:', error);
    return res.status(500).json(apiResponse(500, false, error.message));
  }
};

// DELETE: Delete a single fake user by userId
exports.deleteOneFakeUser = async (req, res) => {
  try {
    const { userId } = req.body;

    // Validate userId
    if (!userId || !mongoose.Types.ObjectId.isValid(userId)) {
      return res.status(400).json(apiResponse(400, false, 'Invalid userId'));
    }

    const userObjectId = new mongoose.Types.ObjectId(userId);

    // Check if user exists and is a fake user
    const user = await User.findOne({ _id: userObjectId, isFakeUser: true });
    if (!user) {
      return res.status(404).json(apiResponse(404, false, 'Fake user not found'));
    }

    // Delete the fake user
    await User.deleteOne({ _id: userObjectId });

    return res.status(200).json(
      apiResponse(200, true, 'Fake user deleted successfully', {
        userId,
      })
    );
  } catch (error) {
    console.error('Delete fake user error:', error);
    return res.status(500).json(apiResponse(500, false, 'Server error while deleting fake user'));
  }
};