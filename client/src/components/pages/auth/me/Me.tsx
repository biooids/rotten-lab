// src/components/pages/auth/me/Me.tsx
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

  const [username, setUsername] = useState(user?.username || "");
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");

  const [showCurrentPassword, setShowCurrentPassword] = useState(false);
  const [showNewPassword, setShowNewPassword] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);

  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [profileFormError, setProfileFormError] = useState("");
  const [passwordFormError, setPasswordFormError] = useState("");

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
      // Await backend response strictly so Set-Cookie Max-Age=0 registers in browser
      await logoutApi().unwrap();
    } catch {
      /* ignored */
    } finally {
      // Regardless of network status, clear local RAM and boot user
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
      // The server now sends 409 + { error, field: "username", code: "USERNAME_TAKEN" }
      // when the target name is already used. Still surface as inline form error here
      // because this single form only has one field — the message is already specific.
      if (
        err.status === 409 &&
        err.data?.code === "USERNAME_TAKEN"
      ) {
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
              />
              {fieldErrors.username && (
                <p className="text-xs text-destructive font-bold">
                  {fieldErrors.username}
                </p>
              )}
            </div>

            <Button
              onClick={handleUpdateProfile}
              disabled={isUpdatingProfile}
              className="border-3 border-double rounded-none w-full sm:w-fit gap-1"
            >
              <Save className="h-4 w-4" />
              <span>
                {isUpdatingProfile
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
                  />
                  <button
                    type="button"
                    onClick={() => setShowCurrentPassword(!showCurrentPassword)}
                    className="absolute right-2 top-1/2 -translate-y-1/2 text-primary hover:text-primary/70"
                    tabIndex={-1}
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
                />
                <button
                  type="button"
                  onClick={() => setShowNewPassword(!showNewPassword)}
                  className="absolute right-2 top-1/2 -translate-y-1/2 text-primary hover:text-primary/70"
                  tabIndex={-1}
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
              />
              {fieldErrors.confirmPassword && (
                <p className="text-xs text-destructive font-bold">
                  {fieldErrors.confirmPassword}
                </p>
              )}
            </div>

            <Button
              onClick={handleUpdatePassword}
              disabled={isChangingPassword}
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
                className="border-3 border-double border-destructive text-destructive rounded-none w-full sm:w-fit gap-1 hover:bg-destructive hover:text-destructive-foreground"
              >
                <LogOut className="h-4 w-4" />
                <span>Logout</span>
              </Button>
            )}

            {!showDeleteConfirm ? (
              <Button
                onClick={() => setShowDeleteConfirm(true)}
                variant="outline"
                className="border-3 border-double border-destructive text-destructive rounded-none w-full sm:w-fit gap-1 hover:bg-destructive hover:text-destructive-foreground"
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
                    disabled={isDeleting}
                    className="border-3 border-double rounded-none bg-destructive text-destructive-foreground gap-1 flex-1"
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
                    className="border-3 border-double rounded-none"
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
