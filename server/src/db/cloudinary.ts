import { v2 as cloudinary } from "cloudinary";

// Initialize Cloudinary with environment variables
cloudinary.config({
  cloud_name: process.env["CLOUDINARY_CLOUD_NAME"]!,
  api_key: process.env["CLOUDINARY_API_KEY"]!,
  api_secret: process.env["CLOUDINARY_API_SECRET"]!,
  secure: true,
});

export const mediaStorage = cloudinary;

// Verify both the presence of variables AND their authenticity
export const verifyCloudinary = async (): Promise<void> => {
  const cloudName = process.env["CLOUDINARY_CLOUD_NAME"];
  const apiKey = process.env["CLOUDINARY_API_KEY"];
  const apiSecret = process.env["CLOUDINARY_API_SECRET"];

  // 1. Syntax Validation: Check if the variables are actually present in the environment
  // This SHOULD be fatal, because it means the .env file is broken.
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

  // 2. Authentication Validation: Actively ping the API to ensure the credentials work
  try {
    await cloudinary.api.ping();
    console.log("🥹  Cloudinary configuration loaded and authenticated.");
  } catch (err: any) {
    // This is NO LONGER fatal. We log the exact error so you can see if it's a network drop
    // or invalid keys, but we allow the backend to continue booting so text/auth still works.
    const errorBody = JSON.stringify({
      level: "WARNING",
      message:
        "🫩  Cloudinary unreachable on startup (Network drop or invalid keys)",
      error: err.message || "Invalid Cloudinary credentials or network issue.",
      timestamp: new Date().toISOString(),
    });

    process.stderr.write(errorBody + "\n");
    process.stderr.write(
      "⚠️  WARNING: Backend is starting, but image uploads will fail until network to Cloudinary is restored.\n",
    );
  }
};
