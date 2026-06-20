//src/lib/store.ts
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
        ignoredActions: [
          "geminiApi/executeMutation/pending",
          "geminiApi/executeMutation/fulfilled",
          "geminiApi/executeMutation/rejected",
          "claudeApi/executeMutation/pending",
          "claudeApi/executeMutation/fulfilled",
          "claudeApi/executeMutation/rejected",
        ],

        ignoredActionPaths: [
          /^payload.*/,
          /^meta\.arg.*/,
          /^meta\.baseQueryMeta.*/,
        ],

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
