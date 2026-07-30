//src/lib/features/auth/authApiSlice.ts
import { createApi } from "@reduxjs/toolkit/query/react";
import { baseQueryWithReauth } from "../../api/baseQueryWithReauth";
import { AuthResponse } from "./authTypes";

export const authApiSlice = createApi({
  reducerPath: "authApi",
  baseQuery: baseQueryWithReauth,
  endpoints: (builder) => ({
    banCheck: builder.query<
      { banned: boolean; remainingSeconds: number },
      void
    >({
      query: () => ({
        url: "/auth/ban-check",
        method: "GET",
      }),
    }),

    refreshToken: builder.mutation<AuthResponse, void>({
      query: () => ({
        url: "/auth/refresh",
        method: "POST",
      }),
    }),

    signup: builder.mutation<AuthResponse, any>({
      query: (credentials) => ({
        url: "/auth/signup",
        method: "POST",
        body: credentials,
      }),
    }),

    login: builder.mutation<AuthResponse, any>({
      query: (credentials) => ({
        url: "/auth/login",
        method: "POST",
        body: credentials,
      }),
    }),

    logout: builder.mutation<{ message: string }, void>({
      query: () => ({
        url: "/auth/logout",
        method: "POST",
      }),
    }),

    // --- CHANGED: Added new endpoint to handle multipart/form-data specifically for avatars
    uploadAvatar: builder.mutation<
      { url: string },
      { id?: string; formData: FormData }
    >({
      query: ({ id, formData }) => ({
        url: id ? `/auth/upload-avatar?id=${id}` : "/auth/upload-avatar",
        method: "POST",
        body: formData,
      }),
    }),

    // --- CHANGED: Removed avatarBase64 entirely from payload
    updateAccount: builder.mutation<
      AuthResponse,
      {
        username?: string;
        profileTitle?: string;
        avatarUrl?: string;
        geminiApiKey?: string;
        claudeApiKey?: string;
        preferSystemAiKey?: boolean; // <--- CHANGED: Added toggle to type
        id?: string;
      }
    >({
      query: ({
        username,
        profileTitle,
        avatarUrl,
        geminiApiKey,
        claudeApiKey,
        preferSystemAiKey, // <--- CHANGED: Extracted from arguments
        id,
      }) => ({
        url: id ? `/auth/update?id=${id}` : "/auth/update",
        method: "PATCH",
        body: {
          username,
          profileTitle,
          avatarUrl,
          geminiApiKey,
          claudeApiKey,
          preferSystemAiKey, // <--- CHANGED: Added to request body
        },
      }),
    }),

    changePassword: builder.mutation<
      { message: string },
      {
        currentPassword?: string;
        newPassword: string;
        confirmPassword: string;
        id?: string;
      }
    >({
      query: ({ id, ...data }) => ({
        url: id ? `/auth/change-password?id=${id}` : "/auth/change-password",
        method: "PATCH",
        body: data,
      }),
    }),

    deleteAccount: builder.mutation<{ message: string }, string | void>({
      query: (id) => ({
        url: id ? `/auth/delete?id=${id}` : "/auth/delete",
        method: "DELETE",
      }),
    }),
  }),
});

export const {
  useBanCheckQuery,
  useLazyBanCheckQuery,
  useRefreshTokenMutation,
  useSignupMutation,
  useLoginMutation,
  useLogoutMutation,
  useUploadAvatarMutation, // EXPORTED THE NEW HOOK
  useUpdateAccountMutation,
  useChangePasswordMutation,
  useDeleteAccountMutation,
} = authApiSlice;
