// API Response Template Function
exports.apiResponse = (statusCode,success,message,data) => {
    return{
        statusCode,
        success,
        message,
        data:data||null,   
    }
};
 