import { configureStore } from "@reduxjs/toolkit";
import { authApiSlice } from "./features/auth/authApiSlice";
import { postsApiSlice } from "./features/posts/postsApiSlice";
import { adminApiSlice } from "./features/admin/adminApiSlice";
import { geminiApiSlice } from "./features/ai/gemini/geminiApiSlice";
import { claudeApiSlice } from "./features/ai/claude/claudeApiSlice";
import authReducer from "./features/auth/authSlice";
import postsReducer from "./features/posts/postsSlice";

export const store = configureStore({
  reducer: {
    [authApiSlice.reducerPath]: authApiSlice.reducer,
    [postsApiSlice.reducerPath]: postsApiSlice.reducer,
    [adminApiSlice.reducerPath]: adminApiSlice.reducer,
    [geminiApiSlice.reducerPath]: geminiApiSlice.reducer,
    [claudeApiSlice.reducerPath]: claudeApiSlice.reducer,

    auth: authReducer,
    posts: postsReducer,
  },
  middleware: (getDefaultMiddleware) =>
    getDefaultMiddleware({
      serializableCheck: {
        // 1. Ignore the exact mutation action types for both pending, fulfilled, and rejected
        ignoredActions: [
          "geminiApi/executeMutation/pending",
          "geminiApi/executeMutation/fulfilled",
          "geminiApi/executeMutation/rejected",
          "claudeApi/executeMutation/pending",
          "claudeApi/executeMutation/fulfilled",
          "claudeApi/executeMutation/rejected",
        ],
        // 2. Use RegExp to catch EVERYTHING deeply nested inside payloads and meta data
        ignoredActionPaths: [
          /^payload.*/,
          /^meta\.arg.*/,
          /^meta\.baseQueryMeta.*/,
        ],
        // 3. Use RegExp to catch EVERYTHING deeply nested inside the mutation cache state
        ignoredPaths: [/^geminiApi\.mutations.*/, /^claudeApi\.mutations.*/],
      },
    }).concat(
      authApiSlice.middleware,
      postsApiSlice.middleware,
      adminApiSlice.middleware,
      geminiApiSlice.middleware,
      claudeApiSlice.middleware,
    ),
});

export type RootState = ReturnType<typeof store.getState>;
export type AppDispatch = typeof store.dispatch;
