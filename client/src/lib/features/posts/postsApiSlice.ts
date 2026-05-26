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

    searchPosts: builder.query<
      PaginatedPostsResponse,
      { q: string; page?: number }
    >({
      query: ({ q, page = 1 }) =>
        `/posts/search?q=${encodeURIComponent(q)}&page=${page}`,
    }),

    filterByCategory: builder.query<
      PaginatedPostsResponse,
      { cat: string; sub?: string; page?: number }
    >({
      query: ({ cat, sub, page = 1 }) =>
        `/posts/filter-category?category=${encodeURIComponent(cat)}${sub ? `&subcategory=${encodeURIComponent(sub)}` : ""}&page=${page}`,
    }),

    filterByTag: builder.query<
      PaginatedPostsResponse,
      { tag: string; page?: number }
    >({
      query: ({ tag, page = 1 }) =>
        `/posts/filter-tag?tag=${encodeURIComponent(tag)}&page=${page}`,
    }),

    sortPosts: builder.query<
      PaginatedPostsResponse,
      { by: string; order: string; page?: number }
    >({
      query: ({ by, order, page = 1 }) =>
        `/posts/sort?by=${encodeURIComponent(by)}&order=${encodeURIComponent(order)}&page=${page}`,
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

    getMyPosts: builder.query<PaginatedPostsResponse, number | void>({
      query: (page = 1) => `/posts/mine?page=${page}`,
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
  }),
});

export const {
  useGetPostsQuery,
  useGetPostQuery,
  useSearchPostsQuery,
  useFilterByCategoryQuery,
  useFilterByTagQuery,
  useSortPostsQuery,
  useUploadMediaMutation,
  useCreatePostMutation,
  useUpdatePostMutation,
  useDeletePostMutation,
  useGetMyPostsQuery,
  useGetSuperAdminSeriousProjectsQuery,
  useGetSuperAdminDiaryQuery,
} = postsApiSlice;
