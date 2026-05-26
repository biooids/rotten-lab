//src/lib/features/posts/postTypes.ts

export type PostCategory =
  | "bio-engineering"
  | "computer-science"
  | "projects"
  | "diary";
export type PostSubcategory = "serious" | "random";

export interface Post {
  id: string;
  author_id: string;
  category: PostCategory;
  subcategory?: PostSubcategory | null;
  thumbnail: string;
  post_images: string[];
  title: string;
  short_description: string;
  main_content: string;
  tags: string[];

  external_link?: string | null;
  github_link?: string | null;
  created_at: string;
  updated_at: string;
}

export type CreatePostDTO = Omit<
  Post,
  "id" | "created_at" | "updated_at" | "author_id"
>;

export interface PaginatedPostsResponse {
  posts: Post[];
  total: number;
  page: number;
  totalPages: number;
}
