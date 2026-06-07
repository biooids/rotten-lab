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

    // MODIFIED: Expanded payload type to accept geminiApiKey and claudeApiKey
    // Made username optional in case we only want to update API keys
    updateAccount: builder.mutation<
      AuthResponse,
      {
        username?: string;
        geminiApiKey?: string;
        claudeApiKey?: string;
        id?: string;
      }
    >({
      // MODIFIED: Destructured the new keys and added them to the request body
      query: ({ username, geminiApiKey, claudeApiKey, id }) => ({
        url: id ? `/auth/update?id=${id}` : "/auth/update",
        method: "PATCH",
        body: { username, geminiApiKey, claudeApiKey },
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
  useUpdateAccountMutation,
  useChangePasswordMutation,
  useDeleteAccountMutation,
} = authApiSlice;
