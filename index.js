const express=require("express")
const dotenv=require("dotenv");
dotenv.config();
const cors=require("cors") 
const PORT=process.env.PORT
const app=express();

 

const {connectDB}=require("./config/database")
connectDB();

// Routes
const userRoutes=require("./routes/userAuthRoutes/UserAuthRoutes");
const categoryRoutes=require("./routes/categoryRoutes/category");
const subCategoryRoutes=require("./routes/subCategoryRoutes/subCategory");
const itemsRouter=require("./routes/itemsRoutes/item");
const itemDetailRoutes = require("./routes/itemDetailsRoutes/itemDetails"); 
const userWishlistRoutes=require("./routes/userWishlistRoutes/userWishlistRoutes");
const userCartRoutes=require("./routes/userCartRoutes/userCartRoutes");
const filterRoutes=require("./routes/filterRoutes/filterRoutes");
const userRatingAndReviewRoutes=require("./routes/userRatingAndReview/userRatingAndReview");
const userAddressRoutes=require("./routes/userAdddressRoutes/userAddressRoutes");
const invoiceRoutes=require("./routes/invoiceRoutes/invoiceRoutes");
const userOrderRoutes=require("./routes/userOrderRoutes/userOrderRoutes");
const userTBYBRoutes=require("./routes/userTBYBRoutes/userTBYBRoutes");






const partnerAuthRoutes=require("./routes/partnerRoutes/partnerAuthRoutes");
const partnerWishlistRoutes=require("./routes/partnerRoutes/partnerWishlistRoutes");
const partnerCartRoutes=require("./routes/partnerRoutes/partnerCartRoutes")
const partnerRatingReview=require("./routes/partnerRoutes/partnerRatingAndReview")
const partnerAddress=require("./routes/partnerRoutes/partnerAddress")
const partnerWalletRoutes=require("./routes/partnerRoutes/partnerWalletRoutes")
const partnerOrderRoutes = require("./routes/partnerRoutes/partnerOrderRoutes");


const adminSideRoutes=require("./routes/adminSideRoutes/getTotalRoutes")
const adminRequiredRoutes=require("./routes/adminSideRoutes/getTotalInfoRoutes")

 
//middlewares
app.use(express.json());
app.use(
    cors({
        origin:"http://localhost:5173", 
        credentials:true,
    }) 
)
 
//Routes Mount

app.use("/api/auth",userRoutes)  
app.use("/api/category", categoryRoutes);
app.use("/api/subcategory", subCategoryRoutes); 
app.use("/api/items", itemsRouter); 
app.use("/api/itemDetails", itemDetailRoutes);
app.use("/api/userwishlist",userWishlistRoutes)
app.use("/api/usercart",userCartRoutes)
app.use("/api/filter",filterRoutes)
app.use("/api/user/ratingreview",userRatingAndReviewRoutes)
app.use("/api/user/address",userAddressRoutes)
app.use("/api/invoice",invoiceRoutes)
app.use("/api/user/order",userOrderRoutes)
app.use("/api/user/tbyb",userTBYBRoutes)



app.use("/api/auth/partner",partnerAuthRoutes);
app.use("/api/partner/wishlist",partnerWishlistRoutes)
app.use("/api/partner/cart",partnerCartRoutes)
app.use("/api/partner/ratingreview",partnerRatingReview)
app.use("/api/wallet", partnerWalletRoutes);
app.use("/api/partner/address",partnerAddress)
app.use("/api/partner/order", partnerOrderRoutes);



app.use("/api/total",adminSideRoutes)

app.use("/api/total",adminRequiredRoutes)



//def Routes
app.get("/",(req,res)=>{
    return res.status(200).json({
        success:true,
        message:"Your server is up and running...."
    })
})

app.listen(PORT,()=>{
    console.log(`App is Running on ${PORT}`);
})