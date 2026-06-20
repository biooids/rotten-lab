//src/features/posts/posts.service.ts
import { pool } from "../../db/psql.js";
import type { CreatePostDTO } from "./posts.types.js";

export const postsService = {
  async getAllPosts(page: number = 1, limit: number = 12) {
    try {
      const offset = (page - 1) * limit;
      const countSql = "SELECT COUNT(*) FROM posts;";
      const dataSql =
        "SELECT * FROM posts ORDER BY created_at DESC LIMIT $1 OFFSET $2;";

      const [countRes, dataRes] = await Promise.all([
        pool.query(countSql),
        pool.query(dataSql, [limit, offset]),
      ]);

      return {
        rows: dataRes.rows,
        totalCount: parseInt(countRes.rows[0]?.count || "0", 10),
      };
    } catch (err: any) {
      process.stderr.write(
        `[postsService.getAllPosts] RAW DB ERROR: ${err.message}\nStack: ${err.stack}\n`,
      );
      throw err;
    }
  },

  async getPost(postId: string) {
    try {
      return await pool.query("SELECT * FROM posts WHERE id = $1", [postId]);
    } catch (err: any) {
      process.stderr.write(
        `[postsService.getPost] RAW DB ERROR: ${err.message}\nStack: ${err.stack}\n`,
      );
      throw err;
    }
  },

  async createPost(data: CreatePostDTO & { author_id: string }) {
    try {
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
    } catch (err: any) {
      process.stderr.write(
        `[postsService.createPost] RAW DB ERROR: ${err.message}\nStack: ${err.stack}\n`,
      );
      throw err;
    }
  },

  async updatePost(setClause: string, params: any[]) {
    try {
      const sql = `
        UPDATE posts 
        SET ${setClause}, updated_at = CURRENT_TIMESTAMP
        WHERE id = $${params.length}
        RETURNING *;
      `;
      return await pool.query(sql, params);
    } catch (err: any) {
      process.stderr.write(
        `[postsService.updatePost] RAW DB ERROR: ${err.message}\nStack: ${err.stack}\n`,
      );
      throw err;
    }
  },

  async deletePost(postId: string) {
    try {
      return await pool.query("DELETE FROM posts WHERE id = $1", [postId]);
    } catch (err: any) {
      process.stderr.write(
        `[postsService.deletePost] RAW DB ERROR: ${err.message}\nStack: ${err.stack}\n`,
      );
      throw err;
    }
  },

  async searchPosts(searchTerm: string, page: number = 1, limit: number = 12) {
    try {
      const offset = (page - 1) * limit;
      const countSql = `SELECT COUNT(*) FROM posts WHERE search_vector @@ websearch_to_tsquery('english', $1);`;
      const dataSql = `
        SELECT *, ts_rank(search_vector, websearch_to_tsquery('english', $1)) AS rank
        FROM posts
        WHERE search_vector @@ websearch_to_tsquery('english', $1)
        ORDER BY rank DESC, created_at DESC
        LIMIT $2 OFFSET $3;
      `;

      const [countRes, dataRes] = await Promise.all([
        pool.query(countSql, [searchTerm]),
        pool.query(dataSql, [searchTerm, limit, offset]),
      ]);

      return {
        rows: dataRes.rows,
        totalCount: parseInt(countRes.rows[0]?.count || "0", 10),
      };
    } catch (err: any) {
      process.stderr.write(
        `[postsService.searchPosts] RAW DB ERROR: ${err.message}\nStack: ${err.stack}\n`,
      );
      throw err;
    }
  },

  async filterByTag(tag: string, page: number = 1, limit: number = 12) {
    try {
      const offset = (page - 1) * limit;
      const countSql = "SELECT COUNT(*) FROM posts WHERE $1 = ANY(tags);";
      const dataSql =
        "SELECT * FROM posts WHERE $1 = ANY(tags) ORDER BY created_at DESC LIMIT $2 OFFSET $3;";

      const [countRes, dataRes] = await Promise.all([
        pool.query(countSql, [tag]),
        pool.query(dataSql, [tag, limit, offset]),
      ]);

      return {
        rows: dataRes.rows,
        totalCount: parseInt(countRes.rows[0]?.count || "0", 10),
      };
    } catch (err: any) {
      process.stderr.write(
        `[postsService.filterByTag] RAW DB ERROR: ${err.message}\nStack: ${err.stack}\n`,
      );
      throw err;
    }
  },

  async filterByCategory(
    category: string,
    page: number = 1,
    limit: number = 12,
  ) {
    try {
      const offset = (page - 1) * limit;
      const countSql = "SELECT COUNT(*) FROM posts WHERE category = $1;";
      const dataSql =
        "SELECT * FROM posts WHERE category = $1 ORDER BY created_at DESC LIMIT $2 OFFSET $3;";

      const [countRes, dataRes] = await Promise.all([
        pool.query(countSql, [category]),
        pool.query(dataSql, [category, limit, offset]),
      ]);

      return {
        rows: dataRes.rows,
        totalCount: parseInt(countRes.rows[0]?.count || "0", 10),
      };
    } catch (err: any) {
      process.stderr.write(
        `[postsService.filterByCategory] RAW DB ERROR: ${err.message}\nStack: ${err.stack}\n`,
      );
      throw err;
    }
  },

  async filterBySubcategory(
    category: string,
    subcategory: string,
    page: number = 1,
    limit: number = 12,
  ) {
    try {
      const offset = (page - 1) * limit;
      const countSql =
        "SELECT COUNT(*) FROM posts WHERE category = $1 AND subcategory = $2;";
      const dataSql =
        "SELECT * FROM posts WHERE category = $1 AND subcategory = $2 ORDER BY created_at DESC LIMIT $3 OFFSET $4;";

      const [countRes, dataRes] = await Promise.all([
        pool.query(countSql, [category, subcategory]),
        pool.query(dataSql, [category, subcategory, limit, offset]),
      ]);

      return {
        rows: dataRes.rows,
        totalCount: parseInt(countRes.rows[0]?.count || "0", 10),
      };
    } catch (err: any) {
      process.stderr.write(
        `[postsService.filterBySubcategory] RAW DB ERROR: ${err.message}\nStack: ${err.stack}\n`,
      );
      throw err;
    }
  },

  async sortPostsByDate(
    order: "ASC" | "DESC",
    page: number = 1,
    limit: number = 12,
  ) {
    try {
      const offset = (page - 1) * limit;
      const countSql = "SELECT COUNT(*) FROM posts;";
      const dataSql = `SELECT * FROM posts ORDER BY created_at ${order} LIMIT $1 OFFSET $2;`;

      const [countRes, dataRes] = await Promise.all([
        pool.query(countSql),
        pool.query(dataSql, [limit, offset]),
      ]);

      return {
        rows: dataRes.rows,
        totalCount: parseInt(countRes.rows[0]?.count || "0", 10),
      };
    } catch (err: any) {
      process.stderr.write(
        `[postsService.sortPostsByDate] RAW DB ERROR: ${err.message}\nStack: ${err.stack}\n`,
      );
      throw err;
    }
  },

  async sortPostsByTitle(
    order: "ASC" | "DESC",
    page: number = 1,
    limit: number = 12,
  ) {
    try {
      const offset = (page - 1) * limit;
      const countSql = "SELECT COUNT(*) FROM posts;";
      const dataSql = `SELECT * FROM posts ORDER BY title ${order} LIMIT $1 OFFSET $2;`;

      const [countRes, dataRes] = await Promise.all([
        pool.query(countSql),
        pool.query(dataSql, [limit, offset]),
      ]);

      return {
        rows: dataRes.rows,
        totalCount: parseInt(countRes.rows[0]?.count || "0", 10),
      };
    } catch (err: any) {
      process.stderr.write(
        `[postsService.sortPostsByTitle] RAW DB ERROR: ${err.message}\nStack: ${err.stack}\n`,
      );
      throw err;
    }
  },

  async getPostsByAuthor(
    authorId: string,
    page: number = 1,
    limit: number = 12,
  ) {
    try {
      const offset = (page - 1) * limit;
      const countSql = "SELECT COUNT(*) FROM posts WHERE author_id = $1;";
      const dataSql =
        "SELECT * FROM posts WHERE author_id = $1 ORDER BY created_at DESC LIMIT $2 OFFSET $3;";

      const [countRes, dataRes] = await Promise.all([
        pool.query(countSql, [authorId]),
        pool.query(dataSql, [authorId, limit, offset]),
      ]);

      return {
        rows: dataRes.rows,
        totalCount: parseInt(countRes.rows[0]?.count || "0", 10),
      };
    } catch (err: any) {
      process.stderr.write(
        `[postsService.getPostsByAuthor] RAW DB ERROR: ${err.message}\nStack: ${err.stack}\n`,
      );
      throw err;
    }
  },

  async getSuperAdminSeriousProjects(page: number = 1, limit: number = 12) {
    try {
      const offset = (page - 1) * limit;
      const countSql = `
        SELECT COUNT(p.id) FROM posts p
        JOIN users u ON p.author_id = u.id
        WHERE p.category = 'projects' AND p.subcategory = 'serious' AND u.role = 'super_admin';
      `;
      const dataSql = `
        SELECT p.* FROM posts p
        JOIN users u ON p.author_id = u.id
        WHERE p.category = 'projects' AND p.subcategory = 'serious' AND u.role = 'super_admin'
        ORDER BY p.created_at DESC
        LIMIT $1 OFFSET $2;
      `;

      const [countRes, dataRes] = await Promise.all([
        pool.query(countSql),
        pool.query(dataSql, [limit, offset]),
      ]);

      return {
        rows: dataRes.rows,
        totalCount: parseInt(countRes.rows[0]?.count || "0", 10),
      };
    } catch (err: any) {
      process.stderr.write(
        `[postsService.getSuperAdminSeriousProjects] RAW DB ERROR: ${err.message}\nStack: ${err.stack}\n`,
      );
      throw err;
    }
  },

  async getSuperAdminDiary(page: number = 1, limit: number = 12) {
    try {
      const offset = (page - 1) * limit;
      const countSql = `
        SELECT COUNT(p.id) FROM posts p
        JOIN users u ON p.author_id = u.id
        WHERE p.category = 'diary' AND u.role = 'super_admin';
      `;
      const dataSql = `
        SELECT p.* FROM posts p
        JOIN users u ON p.author_id = u.id
        WHERE p.category = 'diary' AND u.role = 'super_admin'
        ORDER BY p.created_at DESC
        LIMIT $1 OFFSET $2;
      `;

      const [countRes, dataRes] = await Promise.all([
        pool.query(countSql),
        pool.query(dataSql, [limit, offset]),
      ]);

      return {
        rows: dataRes.rows,
        totalCount: parseInt(countRes.rows[0]?.count || "0", 10),
      };
    } catch (err: any) {
      process.stderr.write(
        `[postsService.getSuperAdminDiary] RAW DB ERROR: ${err.message}\nStack: ${err.stack}\n`,
      );
      throw err;
    }
  },
};
