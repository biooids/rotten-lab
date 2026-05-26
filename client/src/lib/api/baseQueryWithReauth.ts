//src/lib/api/baseQueryWithReauth.ts
import { fetchBaseQuery } from "@reduxjs/toolkit/query";
import type {
  BaseQueryFn,
  FetchArgs,
  FetchBaseQueryError,
} from "@reduxjs/toolkit/query";
import { Mutex } from "async-mutex";
import { setCredentials, logout } from "../features/auth/authSlice";
import type { RootState } from "../store";
import type { AuthResponse } from "../features/auth/authTypes";

const baseUrl = process.env.NEXT_PUBLIC_API_URL;

if (!baseUrl) {
  console.error("FATAL: NEXT_PUBLIC_API_URL is missing from .env.local");
}

const mutex = new Mutex();

const rawBaseQuery = fetchBaseQuery({
  baseUrl: baseUrl,
  credentials: "include",
  prepareHeaders: (headers, { getState }) => {
    const token = (getState() as RootState).auth.accessToken;
    if (token) {
      headers.set("Authorization", `Bearer ${token}`);
    }
    return headers;
  },
});

export const baseQueryWithReauth: BaseQueryFn<
  string | FetchArgs,
  unknown,
  FetchBaseQueryError
> = async (args, api, extraOptions) => {
  await mutex.waitForUnlock();

  let result = await rawBaseQuery(args, api, extraOptions);

  if (result.error && result.error.status === 401) {
    const url = typeof args === "string" ? args : args.url;

    // FIX: Identify auth endpoints that naturally return 401 on failure
    const isAuthRequest =
      url?.includes("/auth/login") || url?.includes("/auth/signup");

    // FIX: If it's a login or signup failing, just return the error immediately.
    // Do not attempt to refresh a token for someone who isn't logged in.
    if (isAuthRequest) {
      return result;
    }

    const isRefreshRequest = url?.includes("/auth/refresh");

    if (isRefreshRequest) {
      // The refresh call itself returned 401. Either the refresh token expired
      // (legitimate) or the server detected reuse (security breach — backend now
      // returns code: "REFRESH_REUSE_DETECTED"). Either way the user is logged out,
      // but we propagate the actual server message so the auth screen can show it
      // instead of just dropping the user on /auth with no context.
      api.dispatch(logout());
      return result;
    }

    if (!mutex.isLocked()) {
      const release = await mutex.acquire();
      try {
        console.warn("Access token expired. Attempting silent refresh...");

        const refreshResult = await rawBaseQuery(
          { url: "/auth/refresh", method: "POST" },
          api,
          extraOptions,
        );

        if (refreshResult.data) {
          console.log("Token rotated successfully. Retrying original request.");

          const authData = refreshResult.data as AuthResponse;
          api.dispatch(setCredentials(authData));

          result = await rawBaseQuery(args, api, extraOptions);
        } else {
          // Refresh failed. Log out, BUT preserve the upstream error so the component
          // can show something useful instead of seeing a generic 401 on the original
          // request. Replace `result.error` with the refresh-call error so any catch
          // block reading `err.data.error` shows the real reason ("Security breach
          // detected" / "Refresh token expired").
          console.warn(
            "Silent refresh failed — logging out and surfacing reason to caller.",
          );
          api.dispatch(logout());
          if (refreshResult.error) {
            result = { error: refreshResult.error };
          }
        }
      } finally {
        release();
      }
    } else {
      await mutex.waitForUnlock();

      result = await rawBaseQuery(args, api, extraOptions);
    }
  }

  return result;
};
