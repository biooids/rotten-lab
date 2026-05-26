//src/features/posts/posts.service.ts
import { pool } from "../../db/psql.js";
import type { CreatePostDTO } from "./posts.types.js";

export const postsService = {
  async getAllPosts(page: number = 1, limit: number = 12) {
    const offset = (page - 1) * limit;
    const sql = `
      SELECT *, count(*) OVER() AS full_count 
      FROM posts  
      ORDER BY created_at DESC 
      LIMIT $1 OFFSET $2;
    `;
    return await pool.query(sql, [limit, offset]);
  },

  async getPost(postId: string) {
    return await pool.query("SELECT * FROM posts WHERE id = $1", [postId]);
  },

  async createPost(data: CreatePostDTO & { author_id: string }) {
    const sql = `
      INSERT INTO posts (
        author_id, category, subcategory, thumbnail, post_images, 
        title, short_description, main_content, tags, 
        external_link, github_link
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
      RETURNING *;
    `;
    const values = [
      data.author_id,
      data.category,
      data.subcategory || null,
      data.thumbnail,
      data.post_images,
      data.title,
      data.short_description,
      data.main_content,
      data.tags,
      data.external_link || null,
      data.github_link || null,
    ];
    return await pool.query(sql, values);
  },

  async updatePost(setClause: string, params: any[]) {
    const sql = `
      UPDATE posts 
      SET ${setClause}, updated_at = CURRENT_TIMESTAMP
      WHERE id = $${params.length}
      RETURNING *;
    `;
    return await pool.query(sql, params);
  },

  async deletePost(postId: string) {
    return await pool.query("DELETE FROM posts WHERE id = $1", [postId]);
  },

  async searchPosts(searchTerm: string, page: number = 1, limit: number = 12) {
    const offset = (page - 1) * limit;
    const sql = `
      SELECT *, 
             ts_rank(search_vector, websearch_to_tsquery('english', $1)) AS rank,
             count(*) OVER() AS full_count
      FROM posts
      WHERE search_vector @@ websearch_to_tsquery('english', $1)
      ORDER BY rank DESC, created_at DESC
      LIMIT $2 OFFSET $3;
    `;
    return await pool.query(sql, [searchTerm, limit, offset]);
  },

  async filterByTag(tag: string, page: number = 1, limit: number = 12) {
    const offset = (page - 1) * limit;
    const sql = `
      SELECT *, count(*) OVER() AS full_count 
      FROM posts 
      WHERE $1 = ANY(tags) 
      ORDER BY created_at DESC
      LIMIT $2 OFFSET $3;
    `;
    return await pool.query(sql, [tag, limit, offset]);
  },

  async filterByCategory(
    category: string,
    page: number = 1,
    limit: number = 12,
  ) {
    const offset = (page - 1) * limit;
    const sql = `
      SELECT *, count(*) OVER() AS full_count 
      FROM posts 
      WHERE category = $1 
      ORDER BY created_at DESC
      LIMIT $2 OFFSET $3;
    `;
    return await pool.query(sql, [category, limit, offset]);
  },

  async filterBySubcategory(
    category: string,
    subcategory: string,
    page: number = 1,
    limit: number = 12,
  ) {
    const offset = (page - 1) * limit;
    const sql = `
      SELECT *, count(*) OVER() AS full_count 
      FROM posts 
      WHERE category = $1 AND subcategory = $2 
      ORDER BY created_at DESC
      LIMIT $3 OFFSET $4;
    `;
    return await pool.query(sql, [category, subcategory, limit, offset]);
  },

  async sortPostsByDate(
    order: "ASC" | "DESC",
    page: number = 1,
    limit: number = 12,
  ) {
    const offset = (page - 1) * limit;
    const sql = `
      SELECT *, count(*) OVER() AS full_count 
      FROM posts 
      ORDER BY created_at ${order}
      LIMIT $1 OFFSET $2;
    `;
    return await pool.query(sql, [limit, offset]);
  },

  async sortPostsByTitle(
    order: "ASC" | "DESC",
    page: number = 1,
    limit: number = 12,
  ) {
    const offset = (page - 1) * limit;
    const sql = `
      SELECT *, count(*) OVER() AS full_count 
      FROM posts 
      ORDER BY title ${order}
      LIMIT $1 OFFSET $2;
    `;
    return await pool.query(sql, [limit, offset]);
  },

  async getPostsByAuthor(
    authorId: string,
    page: number = 1,
    limit: number = 12,
  ) {
    const offset = (page - 1) * limit;
    const sql = `
      SELECT *, count(*) OVER() AS full_count 
      FROM posts 
      WHERE author_id = $1 
      ORDER BY created_at DESC
      LIMIT $2 OFFSET $3;
    `;
    return await pool.query(sql, [authorId, limit, offset]);
  },

  async getSuperAdminSeriousProjects(page: number = 1, limit: number = 12) {
    const offset = (page - 1) * limit;
    const sql = `
      SELECT p.*, count(p.id) OVER() AS full_count 
      FROM posts p
      JOIN users u ON p.author_id = u.id
      WHERE p.category = 'projects' 
        AND p.subcategory = 'serious' 
        AND u.role = 'super_admin'
      ORDER BY p.created_at DESC
      LIMIT $1 OFFSET $2;
    `;
    return await pool.query(sql, [limit, offset]);
  },

  async getSuperAdminDiary(page: number = 1, limit: number = 12) {
    const offset = (page - 1) * limit;
    const sql = `
      SELECT p.*, count(p.id) OVER() AS full_count 
      FROM posts p
      JOIN users u ON p.author_id = u.id
      WHERE p.category = 'diary' 
        AND u.role = 'super_admin'
      ORDER BY p.created_at DESC
      LIMIT $1 OFFSET $2;
    `;
    return await pool.query(sql, [limit, offset]);
  },
};
