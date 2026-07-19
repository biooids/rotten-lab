//src/lib/features/admin/adminSchema.ts
import { z } from "zod";

export const updateRoleSchema = z.object({
  targetUserId: z.string().uuid("Invalid User ID format."),
  newRole: z.enum(["user", "admin", "super_admin"], {
    message: "Please select a valid role.",
  }),
});

export const updateMaintenanceSchema = z.object({
  is_maintenance: z.boolean(),

  maintenance_message: z
    .string()
    .min(10, "Message must be at least 10 characters.")
    .max(500, "Message cannot exceed 500 characters."),

  allow_global_gemini: z.boolean(),
  allow_global_claude: z.boolean(),
});

export const updateAiAccessSchema = z.object({
  targetUserId: z.string().uuid("Invalid User ID format."),
  hasAccess: z.boolean(),
  preferSystemKey: z.boolean(), // ADDED
});
