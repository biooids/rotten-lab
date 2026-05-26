//src/db/cloudinary.ts
import { v2 as cloudinary } from "cloudinary";

cloudinary.config({
  cloud_name: process.env["CLOUDINARY_CLOUD_NAME"]!,
  api_key: process.env["CLOUDINARY_API_KEY"]!,
  api_secret: process.env["CLOUDINARY_API_SECRET"]!,
  secure: true,
});

export const mediaStorage = cloudinary;

export const verifyCloudinary = (): void => {
  const cloudName = process.env["CLOUDINARY_CLOUD_NAME"];
  const apiKey = process.env["CLOUDINARY_API_KEY"];
  const apiSecret = process.env["CLOUDINARY_API_SECRET"];

  if (!cloudName || !apiKey || !apiSecret) {
    const errorBody = JSON.stringify({
      level: "FATAL",
      message: "🫩  Missing Cloudinary configuration",
      missing_fields: {
        cloudName: !cloudName,
        apiKey: !apiKey,
        apiSecret: !apiSecret,
      },
      timestamp: new Date().toISOString(),
    });

    process.stderr.write(errorBody + "\n");

    throw new Error("FATAL: Cloudinary environment variables are not set.");
  }
  console.log("🥹  Cloudinary configuration loaded.");
};
