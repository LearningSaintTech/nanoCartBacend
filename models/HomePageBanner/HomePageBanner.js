const mongoose=require("mongoose");

const homePageBannerSchema=new mongoose.Schema({
    bannerName:{type:String},
    bannerImageUrl:{type:String}
})

module.exports = mongoose.model("HomePageBanner", homePageBannerSchema);