//src/features/admin/admin.routes.ts
import type { IncomingMessage, ServerResponse } from "node:http";
import { adminController } from "./admin.controller.js";

export const adminRoutes = async ({
  req,
  res,
  pathname,
  parseURL,
}: {
  req: IncomingMessage;
  res: ServerResponse;
  pathname: string;
  parseURL: URL;
}): Promise<boolean> => {
  if (!pathname.startsWith("/api/v1/admin")) return false;

  const parts = pathname.split("/");
  const action = parts[4] || "";
  const targetId = parts[5] || "";

  // GET /api/v1/admin/users
  if (action === "users" && req.method === "GET") {
    await adminController.listUsers(req, res);
    return true;
  }

  // PATCH /api/v1/admin/role
  if (action === "role" && req.method === "PATCH") {
    await adminController.changeUserRole(req, res);
    return true;
  }

  // DELETE /api/v1/admin/delete/:userId
  if (action === "delete" && req.method === "DELETE" && targetId) {
    await adminController.removeUser(req, res, targetId);
    return true;
  }

  // GET /api/v1/admin/maintenance
  if (action === "maintenance" && req.method === "GET") {
    await adminController.getSettings(req, res);
    return true;
  }

  // PATCH /api/v1/admin/maintenance
  if (action === "maintenance" && req.method === "PATCH") {
    await adminController.updateSettings(req, res);
    return true;
  }

  // GET /api/v1/admin/logs
  if (action === "logs" && req.method === "GET") {
    await adminController.getLogs(req, res, parseURL);
    return true;
  }

  // --- NEW COMMAND CENTER ROUTES ---

  // POST /api/v1/admin/revoke-sessions
  if (action === "revoke-sessions" && req.method === "POST") {
    await adminController.revokeSessions(req, res);
    return true;
  }

  // GET /api/v1/admin/bans
  if (action === "bans" && req.method === "GET") {
    await adminController.getActiveBans(req, res);
    return true;
  }

  // DELETE /api/v1/admin/bans?key=...
  if (action === "bans" && req.method === "DELETE") {
    await adminController.liftBan(req, res, parseURL);
    return true;
  }

  return false;
};
