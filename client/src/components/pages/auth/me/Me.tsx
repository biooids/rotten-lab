//src/components/pages/auth/me/Me.tsx
"use client";

import React, { useState, useEffect } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useDispatch, useSelector } from "react-redux";
import { RootState } from "@/lib/store";
import {
  updateUser,
  logout as logoutAction,
} from "@/lib/features/auth/authSlice";
import {
  useUpdateAccountMutation,
  useChangePasswordMutation,
  useDeleteAccountMutation,
  useLogoutMutation,
} from "@/lib/features/auth/authApiSlice";
import { useTestGeminiConnectionMutation } from "@/lib/features/ai/gemini/geminiApiSlice";
import { useTestClaudeConnectionMutation } from "@/lib/features/ai/claude/claudeApiSlice";
import {
  updateSchema,
  changePasswordSchema,
} from "@/lib/features/auth/authSchema";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import CornerFlourish from "@/components/shared/CornerFlourish";
import {
  User,
  Key,
  Save,
  Trash2,
  Eye,
  EyeOff,
  AlertTriangle,
  Check,
  LogOut,
  ShieldAlert,
  Server,
  Activity,
} from "lucide-react";
import { cn } from "@/lib/utils";
import AuthGuard from "@/components/shared/AuthGuard";
import { AuthState } from "@/lib/features/auth/authTypes";

export default function Me() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const dispatch = useDispatch();

  const { user } = useSelector((state: RootState) => state.auth as AuthState);

  const targetId = searchParams.get("id");
  const isEditingOther = !!targetId && user?.role === "super_admin";

  const [updateAccount, { isLoading: isUpdatingProfile }] =
    useUpdateAccountMutation();
  const [changePassword, { isLoading: isChangingPassword }] =
    useChangePasswordMutation();
  const [deleteAccount, { isLoading: isDeleting }] = useDeleteAccountMutation();
  const [logoutApi] = useLogoutMutation();

  const [testGemini, { isLoading: isTestingGemini }] =
    useTestGeminiConnectionMutation();
  const [testClaude, { isLoading: isTestingClaude }] =
    useTestClaudeConnectionMutation();

  const [username, setUsername] = useState(user?.username || "");
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");

  const [geminiApiKey, setGeminiApiKey] = useState("");
  const [claudeApiKey, setClaudeApiKey] = useState("");
  const [showGeminiKey, setShowGeminiKey] = useState(false);
  const [showClaudeKey, setShowClaudeKey] = useState(false);
  const [apiKeyFormError, setApiKeyFormError] = useState("");

  const [geminiStatus, setGeminiStatus] = useState<{
    type: "idle" | "success" | "error";
    text: string;
  }>({ type: "idle", text: "" });
  const [claudeStatus, setClaudeStatus] = useState<{
    type: "idle" | "success" | "error";
    text: string;
  }>({ type: "idle", text: "" });

  const [showCurrentPassword, setShowCurrentPassword] = useState(false);
  const [showNewPassword, setShowNewPassword] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);

  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [profileFormError, setProfileFormError] = useState("");
  const [passwordFormError, setPasswordFormError] = useState("");

  // TRACK TARGETED BUTTON STATES
  const [updatingTarget, setUpdatingTarget] = useState<
    "profile" | "keys" | "clear-gemini" | "clear-claude" | null
  >(null);

  // GLOBAL UI LOCKOUT
  const isAnyLoading =
    isUpdatingProfile ||
    isChangingPassword ||
    isDeleting ||
    isTestingGemini ||
    isTestingClaude;

  const isAdmin = user?.role === "admin" || user?.role === "super_admin";

  useEffect(() => {
    if (user && !isEditingOther) setUsername(user.username);
  }, [user, isEditingOther]);

  useEffect(() => {
    const timer = setTimeout(() => {
      const errors: Record<string, string> = {};

      const profileVal = updateSchema.safeParse({ username });
      if (!profileVal.success) {
        profileVal.error.issues.forEach((is) => {
          errors.username = is.message;
        });
      }

      if (newPassword || currentPassword) {
        const passVal = changePasswordSchema.safeParse({
          currentPassword: isEditingOther ? "ADMIN_OVERRIDE" : currentPassword,
          newPassword,
          confirmPassword,
        });
        if (!passVal.success) {
          passVal.error.issues.forEach((is) => {
            if (is.path[0]) errors[is.path[0].toString()] = is.message;
          });
        }
      }
      setFieldErrors(errors);
    }, 200);
    return () => clearTimeout(timer);
  }, [username, currentPassword, newPassword, confirmPassword, isEditingOther]);

  const flashSuccess = (msg: string) => {
    setSuccess(msg);
    setError("");
    setTimeout(() => setSuccess(""), 3000);
  };

  const handleLogout = async () => {
    try {
      await logoutApi().unwrap();
    } catch {
      /* ignored */
    } finally {
      dispatch(logoutAction());
      router.push("/auth");
    }
  };

  const handleUpdateProfile = async () => {
    setProfileFormError("");
    const validation = updateSchema.safeParse({ username });
    if (!validation.success) {
      setProfileFormError(
        validation.error.issues[0]?.message || "Invalid input",
      );
      return;
    }

    setUpdatingTarget("profile");
    try {
      const result = await updateAccount({
        username,
        id: targetId || undefined,
      }).unwrap();

      if (!isEditingOther) {
        dispatch(updateUser(result.user));
      }
      flashSuccess(
        isEditingOther
          ? "User profile updated."
          : "Profile updated successfully.",
      );
    } catch (err: any) {
      if (err.status === 409 && err.data?.code === "USERNAME_TAKEN") {
        setProfileFormError(
          err.data?.error || "Username already taken. Pick a different one.",
        );
      } else if (err.status === "FETCH_ERROR" || err.status === undefined) {
        setProfileFormError(
          "Couldn't reach the server. Check your connection and try again.",
        );
      } else {
        setProfileFormError(err.data?.error || "Failed to update profile.");
      }
    } finally {
      setUpdatingTarget(null);
    }
  };

  const handleUpdateApiKeys = async () => {
    setApiKeyFormError("");
    const payload: any = { id: targetId || undefined };
    let hasUpdates = false;

    if (geminiApiKey.trim()) {
      payload.geminiApiKey = geminiApiKey.trim();
      hasUpdates = true;
    }
    if (claudeApiKey.trim()) {
      payload.claudeApiKey = claudeApiKey.trim();
      hasUpdates = true;
    }

    if (!hasUpdates) {
      setApiKeyFormError("Please enter a key to update.");
      return;
    }

    setUpdatingTarget("keys");
    try {
      const result = await updateAccount(payload).unwrap();
      if (!isEditingOther) {
        dispatch(updateUser(result.user));
      }
      setGeminiApiKey("");
      setClaudeApiKey("");
      setGeminiStatus({ type: "idle", text: "" });
      setClaudeStatus({ type: "idle", text: "" });
      flashSuccess("API configuration updated successfully.");
    } catch (err: any) {
      setApiKeyFormError(err.data?.error || "Failed to update API keys.");
    } finally {
      setUpdatingTarget(null);
    }
  };

  const handleClearApiKey = async (engine: "gemini" | "claude") => {
    setApiKeyFormError("");
    const payload: any = { id: targetId || undefined };

    if (engine === "gemini") {
      payload.geminiApiKey = "";
      setGeminiStatus({ type: "idle", text: "" });
    }
    if (engine === "claude") {
      payload.claudeApiKey = "";
      setClaudeStatus({ type: "idle", text: "" });
    }

    setUpdatingTarget(engine === "gemini" ? "clear-gemini" : "clear-claude");
    try {
      const result = await updateAccount(payload).unwrap();
      if (!isEditingOther) {
        dispatch(updateUser(result.user));
      }
      flashSuccess(`${engine.toUpperCase()} key removed securely.`);
    } catch (err: any) {
      setApiKeyFormError(err.data?.error || `Failed to remove ${engine} key.`);
    } finally {
      setUpdatingTarget(null);
    }
  };

  const handleUpdatePassword = async () => {
    setPasswordFormError("");

    const validation = changePasswordSchema.safeParse({
      currentPassword: isEditingOther ? "ADMIN_OVERRIDE" : currentPassword,
      newPassword,
      confirmPassword,
    });

    if (!validation.success) {
      setPasswordFormError(
        validation.error.issues[0]?.message || "Invalid input",
      );
      return;
    }
    try {
      await changePassword({
        currentPassword: isEditingOther ? undefined : currentPassword,
        newPassword,
        confirmPassword,
        id: targetId || undefined,
      }).unwrap();

      setCurrentPassword("");
      setNewPassword("");
      setConfirmPassword("");
      flashSuccess(
        isEditingOther
          ? "User password reset successful."
          : "Password changed successfully.",
      );
    } catch (err: any) {
      setPasswordFormError(err.data?.error || "Update failed.");
    }
  };

  const handleDeleteUser = async () => {
    try {
      await deleteAccount(targetId || undefined).unwrap();

      if (!isEditingOther) {
        dispatch(logoutAction());
        router.push("/auth");
      } else {
        flashSuccess("Target account purged successfully.");
        router.push("/admin/dashboard");
      }
    } catch {
      setError("Failed to delete user.");
    }
  };

  const handleTestGemini = async () => {
    setGeminiStatus({ type: "idle", text: "" });
    try {
      const res = await testGemini().unwrap();
      setGeminiStatus({
        type: "success",
        text: `Gemini response: "${res.aiResponse}" [via ${res.source}, ${res.latencyMs}ms]`,
      });
    } catch (err: any) {
      setGeminiStatus({
        type: "error",
        text: err.data?.details || err.data?.error || "Authentication failed.",
      });
    }
  };

  const handleTestClaude = async () => {
    setClaudeStatus({ type: "idle", text: "" });
    try {
      const res = await testClaude().unwrap();
      setClaudeStatus({
        type: "success",
        text: `Claude response: "${res.aiResponse}" [via ${res.source}, ${res.latencyMs}ms]`,
      });
    } catch (err: any) {
      setClaudeStatus({
        type: "error",
        text: err.data?.details || err.data?.error || "Authentication failed.",
      });
    }
  };

  return (
    <AuthGuard
      message="Account terminal locked. Please provide credentials to access security and profile settings."
      level="critical"
    >
      <section className="p-3 lg:p-6 min-h-screen border-3 border-double flex flex-col gap-6">
        {/* --- HEADER --- */}
        <div className="relative border-3 border-double p-3 flex flex-col gap-3">
          <CornerFlourish className="-top-1 -left-1" />
          <CornerFlourish className="-top-1 -right-1 rotate-90" />
          <CornerFlourish className="-bottom-1 -left-1 -rotate-90" />
          <CornerFlourish className="-bottom-1 -right-1 rotate-180" />

          <div className="flex gap-1 items-center text-primary">
            <h1 className="bg-primary text-primary-foreground font-bold p-1 w-fit">
              {isEditingOther ? "Administrative Override" : "Manage Account"}
            </h1>
          </div>
          <div className="border-l-3 border-double pl-3">
            <p className="text-sm font-bold">
              {isEditingOther
                ? `You are managing account ID: ${targetId}.`
                : "You are the only user. Update profile or manage security settings."}
            </p>
          </div>
        </div>

        {/* --- MESSAGE BANNER --- */}
        {(error || success) && (
          <div
            className={cn(
              "border-3 border-double p-3 flex items-center gap-2",
              error
                ? "border-destructive bg-destructive/10"
                : "border-primary bg-primary/10",
            )}
          >
            {error ? (
              <AlertTriangle className="h-4 w-4 text-destructive" />
            ) : (
              <Check className="h-4 w-4 text-primary" />
            )}
            <p className="text-xs font-bold">{error || success}</p>
          </div>
        )}

        {/* --- PROFILE SECTION --- */}
        <div className="relative border-3 border-double p-3 flex flex-col gap-3">
          <CornerFlourish className="-top-1 -left-1" />
          <CornerFlourish className="-bottom-1 -right-1 rotate-180" />

          <div className="flex gap-1 items-center text-primary">
            <h4 className="bg-primary text-primary-foreground font-bold p-1 w-fit text-sm">
              {isEditingOther ? "Target User Details" : "Profile Details"}
            </h4>
          </div>

          <div className="border-l-3 border-double pl-3 flex flex-col gap-3">
            <div className="flex flex-col gap-1">
              <label className="text-xs font-bold text-primary">Username</label>
              <Input
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                placeholder="protocols_farmer"
                className="border-3 border-double rounded-none text-xs"
                disabled={isAnyLoading}
              />
              {fieldErrors.username && (
                <p className="text-xs text-destructive font-bold">
                  {fieldErrors.username}
                </p>
              )}
            </div>

            <Button
              onClick={handleUpdateProfile}
              disabled={isAnyLoading}
              className="border-3 border-double rounded-none w-full sm:w-fit gap-1"
            >
              <Save className="h-4 w-4" />
              <span>
                {isUpdatingProfile && updatingTarget === "profile"
                  ? "Saving..."
                  : isEditingOther
                    ? "Update Target Profile"
                    : "Update Profile"}
              </span>
            </Button>

            {profileFormError && (
              <p className="text-xs text-destructive font-bold">
                {profileFormError}
              </p>
            )}
          </div>
        </div>

        {/* --- API KEYS CONFIGURATION SECTION (BYOK) --- */}
        <div className="relative border-3 border-double p-3 flex flex-col gap-3">
          <CornerFlourish className="-top-1 -left-1" />
          <CornerFlourish className="-bottom-1 -right-1 rotate-180" />

          <div className="flex gap-1 items-center text-primary">
            <h4 className="bg-primary text-primary-foreground font-bold p-1 w-fit text-sm">
              AI Processing Keys (BYOK)
            </h4>
          </div>

          <div className="border-l-3 border-double pl-3 flex flex-col gap-4">
            <p className="text-xs font-bold opacity-80 max-w-2xl">
              Provide your own API keys to bypass rate limits and utilize
              premium AI models for security audits. Keys are encrypted at rest
              and never displayed after saving.
            </p>

            {/* Gemini Input */}
            <div className="flex flex-col gap-1">
              <div className="flex items-center justify-between gap-2 flex-wrap">
                <label className="text-xs font-bold text-blue-500">
                  Google Gemini API Key
                </label>
                <div className="flex gap-3 items-center">
                  {user?.hasGeminiKey ? (
                    <span className="text-[10px] font-bold text-primary bg-primary/10 border-3 border-double px-2">
                      [ PERSONAL KEY ]
                    </span>
                  ) : isAdmin ? (
                    <span className="text-[10px] font-bold text-primary bg-primary/10 border-3 border-double px-2">
                      [ SYSTEM DEFAULT ]
                    </span>
                  ) : null}

                  {(user?.hasGeminiKey || isAdmin) && (
                    <button
                      onClick={handleTestGemini}
                      disabled={isAnyLoading}
                      className="text-[10px] font-bold text-blue-500 hover:text-blue-500/80 outline-none flex items-center gap-1 uppercase disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      <Activity className="h-3 w-3" />
                      {isTestingGemini ? "Pinging..." : "Test Link"}
                    </button>
                  )}

                  {user?.hasGeminiKey && (
                    <button
                      onClick={() => handleClearApiKey("gemini")}
                      disabled={isAnyLoading}
                      className="text-[10px] font-bold text-destructive hover:underline outline-none uppercase disabled:opacity-50 disabled:cursor-not-allowed disabled:no-underline"
                    >
                      {isUpdatingProfile && updatingTarget === "clear-gemini"
                        ? "Clearing..."
                        : "Clear Key"}
                    </button>
                  )}
                </div>
              </div>
              <div className="relative">
                <Input
                  type={showGeminiKey ? "text" : "password"}
                  value={geminiApiKey}
                  onChange={(e) => setGeminiApiKey(e.target.value)}
                  placeholder={
                    user?.hasGeminiKey
                      ? "Enter new key to overwrite existing..."
                      : "AIzaSy..."
                  }
                  className="border-3 border-double rounded-none text-xs pr-10 border-blue-500/50 focus-visible:ring-blue-500"
                  disabled={isAnyLoading}
                />
                <button
                  type="button"
                  onClick={() => setShowGeminiKey(!showGeminiKey)}
                  className="absolute right-2 top-1/2 -translate-y-1/2 text-blue-500 hover:text-blue-500/70 disabled:opacity-50"
                  tabIndex={-1}
                  disabled={isAnyLoading}
                >
                  {showGeminiKey ? (
                    <EyeOff className="h-4 w-4" />
                  ) : (
                    <Eye className="h-4 w-4" />
                  )}
                </button>
              </div>
              {geminiStatus.text && (
                <div
                  className={cn(
                    "text-[11px] font-bold mt-1 p-2 border-3 border-double flex gap-2 items-center",
                    geminiStatus.type === "success"
                      ? "bg-emerald-500/10 text-emerald-500 border-emerald-500/30"
                      : "bg-destructive/10 text-destructive border-destructive/30",
                  )}
                >
                  {geminiStatus.type === "success" ? (
                    <Check className="h-3 w-3 shrink-0" />
                  ) : (
                    <AlertTriangle className="h-3 w-3 shrink-0" />
                  )}
                  <span>{geminiStatus.text}</span>
                </div>
              )}
            </div>

            {/* Claude Input */}
            <div className="flex flex-col gap-1 mt-2">
              <div className="flex items-center justify-between gap-2 flex-wrap">
                <label className="text-xs font-bold text-orange-500">
                  Anthropic Claude API Key
                </label>
                <div className="flex gap-3 items-center">
                  {user?.hasClaudeKey ? (
                    <span className="text-[10px] font-bold text-primary bg-primary/10 border-3 border-double px-2">
                      [ PERSONAL KEY ]
                    </span>
                  ) : isAdmin ? (
                    <span className="text-[10px] font-bold text-primary bg-primary/10 border-3 border-double px-2">
                      [ SYSTEM DEFAULT ]
                    </span>
                  ) : null}

                  {(user?.hasClaudeKey || isAdmin) && (
                    <button
                      onClick={handleTestClaude}
                      disabled={isAnyLoading}
                      className="text-[10px] font-bold text-orange-500 hover:text-orange-500/80 outline-none flex items-center gap-1 uppercase disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      <Activity className="h-3 w-3" />
                      {isTestingClaude ? "Pinging..." : "Test Link"}
                    </button>
                  )}

                  {user?.hasClaudeKey && (
                    <button
                      onClick={() => handleClearApiKey("claude")}
                      disabled={isAnyLoading}
                      className="text-[10px] font-bold text-destructive hover:underline outline-none uppercase disabled:opacity-50 disabled:cursor-not-allowed disabled:no-underline"
                    >
                      {isUpdatingProfile && updatingTarget === "clear-claude"
                        ? "Clearing..."
                        : "Clear Key"}
                    </button>
                  )}
                </div>
              </div>
              <div className="relative">
                <Input
                  type={showClaudeKey ? "text" : "password"}
                  value={claudeApiKey}
                  onChange={(e) => setClaudeApiKey(e.target.value)}
                  placeholder={
                    user?.hasClaudeKey
                      ? "Enter new key to overwrite existing..."
                      : "sk-ant-..."
                  }
                  className="border-3 border-double rounded-none text-xs pr-10 border-orange-500/50 focus-visible:ring-orange-500"
                  disabled={isAnyLoading}
                />
                <button
                  type="button"
                  onClick={() => setShowClaudeKey(!showClaudeKey)}
                  className="absolute right-2 top-1/2 -translate-y-1/2 text-orange-500 hover:text-orange-500/70 disabled:opacity-50"
                  tabIndex={-1}
                  disabled={isAnyLoading}
                >
                  {showClaudeKey ? (
                    <EyeOff className="h-4 w-4" />
                  ) : (
                    <Eye className="h-4 w-4" />
                  )}
                </button>
              </div>
              {claudeStatus.text && (
                <div
                  className={cn(
                    "text-[11px] font-bold mt-1 p-2 border-3 border-double flex gap-2 items-center",
                    claudeStatus.type === "success"
                      ? "bg-emerald-500/10 text-emerald-500 border-emerald-500/30"
                      : "bg-destructive/10 text-destructive border-destructive/30",
                  )}
                >
                  {claudeStatus.type === "success" ? (
                    <Check className="h-3 w-3 shrink-0" />
                  ) : (
                    <AlertTriangle className="h-3 w-3 shrink-0" />
                  )}
                  <span>{claudeStatus.text}</span>
                </div>
              )}
            </div>

            <Button
              onClick={handleUpdateApiKeys}
              disabled={isAnyLoading}
              className="border-3 border-double rounded-none w-full sm:w-fit gap-1 mt-1"
            >
              <Server className="h-4 w-4" />
              <span>
                {isUpdatingProfile && updatingTarget === "keys"
                  ? "Encrypting..."
                  : "Update Saved Keys"}
              </span>
            </Button>

            {apiKeyFormError && (
              <p className="text-xs text-destructive font-bold mt-1">
                {apiKeyFormError}
              </p>
            )}
          </div>
        </div>

        {/* --- PASSWORD SECTION --- */}
        <div className="relative border-3 border-double p-3 flex flex-col gap-3">
          <CornerFlourish className="-top-1 -left-1" />
          <CornerFlourish className="-bottom-1 -right-1 rotate-180" />

          <div className="flex gap-1 items-center text-primary">
            <h4 className="bg-primary text-primary-foreground font-bold p-1 w-fit text-sm">
              {isEditingOther ? "Reset Target Password" : "Change Password"}
            </h4>
          </div>

          <div className="border-l-3 border-double pl-3 flex flex-col gap-3">
            {!isEditingOther && (
              <div className="flex flex-col gap-1">
                <label className="text-xs font-bold text-primary">
                  Current Password
                </label>
                <div className="relative">
                  <Input
                    type={showCurrentPassword ? "text" : "password"}
                    value={currentPassword}
                    onChange={(e) => setCurrentPassword(e.target.value)}
                    placeholder="Enter current password"
                    className="border-3 border-double rounded-none text-xs pr-10"
                    disabled={isAnyLoading}
                  />
                  <button
                    type="button"
                    onClick={() => setShowCurrentPassword(!showCurrentPassword)}
                    className="absolute right-2 top-1/2 -translate-y-1/2 text-primary hover:text-primary/70 disabled:opacity-50"
                    tabIndex={-1}
                    disabled={isAnyLoading}
                  >
                    {showCurrentPassword ? (
                      <EyeOff className="h-4 w-4" />
                    ) : (
                      <Eye className="h-4 w-4" />
                    )}
                  </button>
                </div>
                {fieldErrors.currentPassword && (
                  <p className="text-xs text-destructive font-bold">
                    {fieldErrors.currentPassword}
                  </p>
                )}
              </div>
            )}

            <div className="flex flex-col gap-1">
              <label className="text-xs font-bold text-primary">
                {isEditingOther ? "New System Password" : "New Password"}
              </label>
              <div className="relative">
                <Input
                  type={showNewPassword ? "text" : "password"}
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  placeholder="Min. 6 characters"
                  className="border-3 border-double rounded-none text-xs pr-10"
                  disabled={isAnyLoading}
                />
                <button
                  type="button"
                  onClick={() => setShowNewPassword(!showNewPassword)}
                  className="absolute right-2 top-1/2 -translate-y-1/2 text-primary hover:text-primary/70 disabled:opacity-50"
                  tabIndex={-1}
                  disabled={isAnyLoading}
                >
                  {showNewPassword ? (
                    <EyeOff className="h-4 w-4" />
                  ) : (
                    <Eye className="h-4 w-4" />
                  )}
                </button>
              </div>
              {fieldErrors.newPassword && (
                <p className="text-xs text-destructive font-bold">
                  {fieldErrors.newPassword}
                </p>
              )}
            </div>

            <div className="flex flex-col gap-1">
              <label className="text-xs font-bold text-primary">
                Confirm New Password
              </label>
              <Input
                type="password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                placeholder="Repeat new password"
                className="border-3 border-double rounded-none text-xs"
                disabled={isAnyLoading}
              />
              {fieldErrors.confirmPassword && (
                <p className="text-xs text-destructive font-bold">
                  {fieldErrors.confirmPassword}
                </p>
              )}
            </div>

            <Button
              onClick={handleUpdatePassword}
              disabled={isAnyLoading}
              className="border-3 border-double rounded-none w-full sm:w-fit gap-1"
            >
              <Key className="h-4 w-4" />
              <span>
                {isChangingPassword
                  ? "Updating..."
                  : isEditingOther
                    ? "Force Password Reset"
                    : "Change Password"}
              </span>
            </Button>

            {passwordFormError && (
              <p className="text-xs text-destructive font-bold">
                {passwordFormError}
              </p>
            )}
          </div>
        </div>

        {/* --- DANGER ZONE --- */}
        <div className="relative border-3 border-double border-destructive p-3 flex flex-col gap-3">
          <CornerFlourish className="-top-1 -left-1 text-destructive" />
          <CornerFlourish className="-top-1 -right-1 rotate-90 text-destructive" />
          <CornerFlourish className="-bottom-1 -left-1 -rotate-90 text-destructive" />
          <CornerFlourish className="-bottom-1 -right-1 rotate-180 text-destructive" />

          <div className="flex gap-1 items-center text-destructive">
            <h4 className=" font-bold p-1 w-fit text-xs">Danger Zone</h4>
          </div>

          <div className="border-l-3 border-double border-destructive pl-3 flex flex-col gap-3">
            <p className="text-xs">
              {isEditingOther
                ? "Permanently purge this user account from the system."
                : "Permanently remove your identity or end the session."}
            </p>

            {!isEditingOther && (
              <Button
                onClick={handleLogout}
                variant="outline"
                disabled={isAnyLoading}
                className="border-3 border-double border-destructive text-destructive rounded-none w-full sm:w-fit gap-1 hover:bg-destructive hover:text-destructive-foreground disabled:opacity-50"
              >
                <LogOut className="h-4 w-4" />
                <span>Logout</span>
              </Button>
            )}

            {!showDeleteConfirm ? (
              <Button
                onClick={() => setShowDeleteConfirm(true)}
                variant="outline"
                disabled={isAnyLoading}
                className="border-3 border-double border-destructive text-destructive rounded-none w-full sm:w-fit gap-1 hover:bg-destructive hover:text-destructive-foreground disabled:opacity-50"
              >
                <Trash2 className="h-4 w-4" />
                <span>
                  {isEditingOther ? "Delete User Account" : "Delete My Account"}
                </span>
              </Button>
            ) : (
              <div className="flex flex-col gap-3 p-3 border-3 border-double border-destructive">
                <p className="text-xs font-bold text-destructive">
                  Are you sure? This action cannot be undone.
                </p>
                <div className="flex gap-3">
                  <Button
                    onClick={handleDeleteUser}
                    disabled={isAnyLoading}
                    className="border-3 border-double rounded-none bg-destructive text-destructive-foreground gap-1 flex-1 disabled:opacity-50"
                  >
                    <Trash2 className="h-4 w-4" />
                    <span>
                      {isDeleting
                        ? "Deleting..."
                        : isEditingOther
                          ? "Delete User"
                          : "Delete Account"}
                    </span>
                  </Button>
                  <Button
                    onClick={() => setShowDeleteConfirm(false)}
                    variant="outline"
                    disabled={isAnyLoading}
                    className="border-3 border-double rounded-none disabled:opacity-50"
                  >
                    Cancel
                  </Button>
                </div>
              </div>
            )}
          </div>
        </div>
      </section>
    </AuthGuard>
  );
}
