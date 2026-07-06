//src/lib/features/posts/postsApiSlice.ts
import { createApi } from "@reduxjs/toolkit/query/react";
import { baseQueryWithReauth } from "../../api/baseQueryWithReauth";
import { Post, CreatePostDTO, PaginatedPostsResponse } from "./postsTypes";

export const postsApiSlice = createApi({
  reducerPath: "postsApi",
  baseQuery: baseQueryWithReauth,
  tagTypes: ["Post"],
  endpoints: (builder) => ({
    getPosts: builder.query<PaginatedPostsResponse, number | void>({
      query: (page = 1) => `/posts/getall?page=${page}`,
      providesTags: ["Post"],
    }),

    getPost: builder.query<{ post: Post }, string>({
      query: (id) => `/posts/getone/${id}`,
      providesTags: (result, error, id) => [{ type: "Post", id }],
    }),

    // --- NEW UNIFIED FILTER ENDPOINT ---
    // Replaces search, category filter, tag filter, and sort
    getFilteredPosts: builder.query<
      PaginatedPostsResponse,
      {
        page?: number;
        q?: string | null;
        category?: string | null;
        subcategory?: string | null;
        tag?: string | null;
        sortBy?: string | null;
        sortOrder?: string | null;
      }
    >({
      query: ({
        page = 1,
        q,
        category,
        subcategory,
        tag,
        sortBy,
        sortOrder,
      }) => {
        const params = new URLSearchParams();
        params.set("page", String(page));

        if (q) params.set("q", q);
        if (category && category !== "all") params.set("category", category);
        if (subcategory) params.set("subcategory", subcategory);
        if (tag) params.set("tag", tag);
        if (sortBy) params.set("sortBy", sortBy);
        if (sortOrder) params.set("sortOrder", sortOrder);

        return `/posts/filter?${params.toString()}`;
      },
      // Using a generic Post tag ensures updates invalidate the feed
      providesTags: ["Post"],
    }),

    uploadMedia: builder.mutation<{ url: string }, FormData>({
      query: (formData) => ({
        url: "/posts/upload",
        method: "POST",
        body: formData,
      }),
    }),

    createPost: builder.mutation<
      { message: string; post: Post },
      CreatePostDTO
    >({
      query: (newPost) => ({
        url: "/posts/create",
        method: "POST",
        body: newPost,
      }),
      invalidatesTags: ["Post"],
    }),

    updatePost: builder.mutation<
      { message: string; post: Post },
      { id: string; data: Partial<CreatePostDTO> }
    >({
      query: ({ id, data }) => ({
        url: `/posts/update/${id}`,
        method: "PATCH",
        body: data,
      }),
      invalidatesTags: (result, error, { id }) => [
        "Post",
        { type: "Post", id },
      ],
    }),

    deletePost: builder.mutation<{ message: string }, string>({
      query: (id) => ({
        url: `/posts/delete/${id}`,
        method: "DELETE",
      }),
      invalidatesTags: ["Post"],
    }),

    // --- UPDATED MY POSTS ---
    // Now accepts the exact same unified filters as getFilteredPosts
    getMyPosts: builder.query<
      PaginatedPostsResponse,
      {
        page?: number;
        q?: string | null;
        category?: string | null;
        subcategory?: string | null;
        tag?: string | null;
        sortBy?: string | null;
        sortOrder?: string | null;
      } | void
    >({
      query: (args) => {
        const params = new URLSearchParams();
        if (args) {
          params.set("page", String(args.page || 1));
          if (args.q) params.set("q", args.q);
          if (args.category && args.category !== "all")
            params.set("category", args.category);
          if (args.subcategory) params.set("subcategory", args.subcategory);
          if (args.tag) params.set("tag", args.tag);
          if (args.sortBy) params.set("sortBy", args.sortBy);
          if (args.sortOrder) params.set("sortOrder", args.sortOrder);
        } else {
          params.set("page", "1");
        }
        return `/posts/mine?${params.toString()}`;
      },
      providesTags: ["Post"],
    }),

    getSuperAdminSeriousProjects: builder.query<PaginatedPostsResponse, number>(
      {
        query: (page = 1) => `/posts/superadmin-serious?page=${page}`,
        providesTags: ["Post"],
      },
    ),

    getSuperAdminDiary: builder.query<PaginatedPostsResponse, number>({
      query: (page = 1) => `/posts/superadmin-diary?page=${page}`,
      providesTags: ["Post"],
    }),

    // --- UPDATED ALL TAGS ---
    // Now optionally accepts a category to scope the tags down
    getAllTags: builder.query<{ tags: string[] }, string | null | void>({
      query: (category) => {
        if (category && category !== "all") {
          return `/posts/tags?category=${encodeURIComponent(category)}`;
        }
        return `/posts/tags`;
      },
      providesTags: ["Post"],
    }),
  }),
});

export const {
  useGetPostsQuery,
  useGetPostQuery,
  useGetFilteredPostsQuery, // Exported the new unified query
  useUploadMediaMutation,
  useCreatePostMutation,
  useUpdatePostMutation,
  useDeletePostMutation,
  useGetMyPostsQuery,
  useGetSuperAdminSeriousProjectsQuery,
  useGetSuperAdminDiaryQuery,
  useGetAllTagsQuery,
} = postsApiSlice;
