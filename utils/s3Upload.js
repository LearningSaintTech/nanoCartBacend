const {
  S3Client,
  CreateMultipartUploadCommand,
  UploadPartCommand,
  CompleteMultipartUploadCommand,
  AbortMultipartUploadCommand,
  PutObjectCommand,
  DeleteObjectCommand,
} = require("@aws-sdk/client-s3");
const mime = require("mime-types");
require("dotenv").config();

const s3 = new S3Client({
  region: process.env.AWS_REGION,
  credentials: {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
  },
});

// Upload function
const uploadImageToS3 = async (file, folderName) => {
  if (!file || !file.buffer || !file.originalname) {
    throw new Error("Invalid file upload");
  }

  const fileName = `${folderName}/${Date.now()}_${file.originalname}`;
  const fileSize = file.buffer.length;
  const contentType = file.mimetype || mime.lookup(file.originalname) || "application/octet-stream";

  // Single-part upload for files < 5MB
  if (fileSize < 5 * 1024 * 1024) {
    try {
      const uploadCommand = new PutObjectCommand({
        Bucket: process.env.AWS_S3_BUCKET_NAME,
        Key: fileName,
        Body: file.buffer,
        ContentType: contentType,
      });
      await s3.send(uploadCommand);
      return `https://${process.env.AWS_S3_BUCKET_NAME}.s3.${process.env.AWS_REGION}.amazonaws.com/${fileName}`;
    } catch (err) {
      throw new Error("Single-part upload failed.");
    }
  }

  // Multipart upload for files >= 5MB
  const createUpload = new CreateMultipartUploadCommand({
    Bucket: process.env.AWS_S3_BUCKET_NAME,
    Key: fileName,
    ContentType: contentType,
  });

  const uploadResponse = await s3.send(createUpload);
  const uploadId = uploadResponse.UploadId;

  try {
    const partSize = 5 * 1024 * 1024;
    const totalParts = Math.ceil(fileSize / partSize);
    const uploadPromises = [];

    for (let partNumber = 1; partNumber <= totalParts; partNumber++) {
      const start = (partNumber - 1) * partSize;
      const end = Math.min(start + partSize, fileSize);
      const chunk = file.buffer.slice(start, end);

      const uploadPartCommand = new UploadPartCommand({
        Bucket: process.env.AWS_S3_BUCKET_NAME,
        Key: fileName,
        UploadId: uploadId,
        PartNumber: partNumber,
        Body: chunk,
      });

      uploadPromises.push(
        s3.send(uploadPartCommand).then((partUploadResponse) => ({
          ETag: partUploadResponse.ETag,
          PartNumber: partNumber,
        }))
      );
    }

    const uploadedParts = await Promise.all(uploadPromises);

    const completeUpload = new CompleteMultipartUploadCommand({
      Bucket: process.env.AWS_S3_BUCKET_NAME,
      Key: fileName,
      UploadId: uploadId,
      MultipartUpload: { Parts: uploadedParts },
    });

    await s3.send(completeUpload);

    return `https://${process.env.AWS_S3_BUCKET_NAME}.s3.${process.env.AWS_REGION}.amazonaws.com/${fileName}`;
  } catch (error) {
    await s3.send(
      new AbortMultipartUploadCommand({
        Bucket: process.env.AWS_S3_BUCKET_NAME,
        Key: fileName,
        UploadId: uploadId,
      })
    );
    throw new Error("Multipart upload failed.");
  }
};

const deleteFromS3 = async (fileUrl) => {
  try {
    const urlParts = new URL(fileUrl);
    const key = urlParts.pathname.substring(1); // Removes leading "/"

    const deleteCommand = new DeleteObjectCommand({
      Bucket: process.env.AWS_S3_BUCKET_NAME,
      Key: key,
    });

    await s3.send(deleteCommand);
    console.log("File deleted from S3:", fileUrl);
  } catch (error) {
    console.error("Error deleting file from S3:", error);
    throw new Error("S3 delete failed");
  }
};


const updateFromS3 = async (existingImageUrl, file, folderName) => {
  try {
    if (existingImageUrl) {
      await deleteFromS3(existingImageUrl);
    }

    if (!file || !file.buffer || !file.originalname) {
      throw new Error("Invalid file input for update.");
    }

    return await uploadImageToS3(file, folderName);
  } catch (error) {
    console.error("Error updating image on S3:", error);
    throw new Error("Failed to update image on S3.");
  }
};


const uploadMultipleImagesToS3 = async (files = [], folderName) => {
  if (!Array.isArray(files) || files.length === 0) {
    throw new Error("No files provided for upload.");
  }

  try {
    const uploadPromises = files.map((file) => uploadImageToS3(file, folderName));
    const imageUrls = await Promise.all(uploadPromises);
    return imageUrls;
  } catch (error) {
    console.error("Error uploading multiple images to S3:", error);
    throw new Error("One or more image uploads failed.");
  }
};
module.exports = { uploadImageToS3, deleteFromS3, updateFromS3, uploadMultipleImagesToS3 };