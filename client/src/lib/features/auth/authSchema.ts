import { z } from "zod";

const imageExtensions = /\.(jpeg|jpg|gif|png|webp|svg)(\?.*)?(#.*)?$/i;
// Validates Base64 Data URIs and limits size implicitly via string length if needed
const base64ImageRegex =
  /^data:image\/(jpeg|jpg|png|webp|gif|svg\+xml);base64,/;

export const loginSchema = z.object({
  username: z
    .string()
    .trim() // Prevents accidental space typos
    .min(3, "Username must be at least 3 characters.")
    .max(20, "Username cannot exceed 20 characters."),
  password: z
    .string()
    .min(6, "Password must be at least 6 characters.")
    .max(50, "Password cannot exceed 50 characters."),
});

export const signupSchema = z
  .object({
    username: z
      .string()
      .trim()
      .min(3, "Username must be at least 3 characters.")
      .max(20, "Username cannot exceed 20 characters."),
    password: z
      .string()
      .min(6, "Password must be at least 6 characters.")
      .max(50, "Password cannot exceed 50 characters."),
    confirmPassword: z.string().min(1, "Please confirm your password."),
  })
  .refine((data) => data.password === data.confirmPassword, {
    message: "Passwords do not match.",
    path: ["confirmPassword"],
  });

export const updateSchema = z.object({
  username: z
    .string()
    .trim()
    .min(3, "Username must be at least 3 characters.")
    .max(20, "Username cannot exceed 20 characters.")
    .optional(),

  profileTitle: z
    .string()
    .max(100, "Profile title cannot exceed 100 characters.")
    .optional()
    // Transform runs after optional check to ensure fallback works
    .transform((val) => (!val || val.trim() === "" ? "Member" : val.trim())),

  // Validates structure and prevents massive non-image text blobs
  avatarBase64: z
    .string()
    .regex(base64ImageRegex, "Invalid base64 image format")
    .optional()
    .or(z.literal("")),

  avatarUrl: z
    .string()
    .max(2048, "Avatar URL cannot exceed 2048 characters.")
    .trim()
    .or(z.literal("")) // Safely allow empty string first
    .optional() // Allow undefined next
    .refine(
      (val) => {
        if (!val) return true; // Passes if undefined or ""

        const isValidUrl = z.string().url().safeParse(val).success;
        const isImageUrl = imageExtensions.test(val);

        return isValidUrl && isImageUrl;
      },
      {
        message:
          "Please enter a valid image URL ending in .jpg, .png, .gif, etc.",
      },
    ),

  geminiApiKey: z.string().trim().optional().or(z.literal("")),
  claudeApiKey: z.string().trim().optional().or(z.literal("")),
});

export const changePasswordSchema = z
  .object({
    currentPassword: z.string().min(1, "Current password is required."),
    newPassword: z
      .string()
      .min(6, "New password must be at least 6 characters.")
      .max(50, "New password cannot exceed 50 characters."),
    confirmPassword: z.string().min(1, "Please confirm your new password."),
  })
  .refine((data) => data.newPassword === data.confirmPassword, {
    message: "New passwords do not match.",
    path: ["confirmPassword"],
  });
