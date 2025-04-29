const PrivacyPolicy = require('../../models/PrivacyPolicy/PrivacyPolicy');



exports.createPrivacyPolicySection = async (req, res) => {
    const { privacyPolicy } = req.body;
    if (!privacyPolicy || !Array.isArray(privacyPolicy)) {
      return res.status(400).json({ message: 'privacyPolicy should be an array' });
    }
  
    try {
      // Look for an existing document. If it doesn't exist, create a new one.
      let privacyPolicyDoc = await PrivacyPolicy.findOne();
      if (!privacyPolicyDoc) {
        privacyPolicyDoc = new PrivacyPolicy({ privacyPolicy: [] });
      }
  
      // Add all new sections to the privacyPolicy array
      privacyPolicyDoc.privacyPolicy = privacyPolicyDoc.privacyPolicy.concat(privacyPolicy);
  
      // Save the updated Privacy Policy document
      await privacyPolicyDoc.save();
      res.status(201).json({ message: 'Privacy Policy sections created successfully', data: privacyPolicyDoc });
    } catch (error) {
      console.error('Error creating Privacy Policy section:', error);
      res.status(500).json({ message: 'Server error, unable to create Privacy Policy sections' });
    }
  };



// Get all Privacy Policy sections
exports.getPrivacyPolicy = async (req, res) => {
  try {
    const policySections = await PrivacyPolicy.find();
    if (!policySections || policySections.length === 0) {
      return res.status(404).json({ message: 'No Privacy Policy sections found' });
    }
    res.status(200).json(policySections);
  } catch (error) {
    console.error('Error fetching Privacy Policy:', error);
    res.status(500).json({ message: 'Server error, unable to fetch Privacy Policy' });
  }
};

