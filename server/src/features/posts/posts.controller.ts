//src/features/posts/posts.controller.ts
import type { IncomingMessage, ServerResponse } from "node:http";
import { json } from "node:stream/consumers";
import Busboy from "busboy";
import jwt from "jsonwebtoken";
import { postsService } from "./posts.service.js";
import { mediaStorage } from "../../db/cloudinary.js";
import { redisClient } from "../../db/redis.js";
import type { CreatePostDTO, UpdatePostDTO, Post } from "./posts.types.js";
import type { JWTPayload } from "../auth/auth.types.js";

const ACCESS_TOKEN_SECRET = process.env["ACCESS_TOKEN_SECRET"];

if (!ACCESS_TOKEN_SECRET) {
  process.stderr.write("FATAL ERROR: ACCESS_TOKEN_SECRET is not defined.\n");
  process.exit(1);
}

const URL_REGEX = /^(https?:\/\/)?([\w\d\-_]+\.)+\.?[\w\d\-_]+(\/.*)?$/i;
const GITHUB_REGEX =
  /^(https?:\/\/)?(www\.)?github\.com\/[\w\d\-_]+\/[\w\d\-_]+.*$/i;
const IMAGE_REGEX = /\.(jpeg|jpg|gif|png|webp|avif)$/i;

export const postsController = {
  async uploadMedia(req: IncomingMessage, res: ServerResponse): Promise<void> {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      res.statusCode = 401;
      res.setHeader("Content-Type", "application/json");
      res.end(JSON.stringify({ error: "Unauthorized" }));
      return;
    }

    let decoded: JWTPayload;
    try {
      decoded = jwt.verify(
        authHeader.split(" ")[1] as string,
        ACCESS_TOKEN_SECRET as string,
      ) as JWTPayload;
    } catch {
      res.statusCode = 401;
      res.setHeader("Content-Type", "application/json");
      res.end(JSON.stringify({ error: "Invalid token" }));
      return;
    }

    // --- MANUAL REDIS RATE LIMITING (Max 10 uploads per hour per user) ---
    try {
      const uploadLimitKey = `ratelimit:upload:${decoded.id}`;
      const uploadsCount = await redisClient.incr(uploadLimitKey);

      if (uploadsCount === 1) {
        await redisClient.expire(uploadLimitKey, 3600); // 1 hour TTL
      }

      if (uploadsCount > 10) {
        res.statusCode = 429;
        res.setHeader("Content-Type", "application/json");
        res.end(
          JSON.stringify({
            error:
              "Upload limit exceeded. Maximum 10 media uploads per hour to prevent storage abuse.",
          }),
        );
        return;
      }
    } catch (err: any) {
      process.stderr.write(`[uploadMedia] Redis Error: ${err.message}\n`);
      // Fail open if Redis crashes so legitimate users can still upload
    }
    // ---------------------------------------------------------------------

    const bb = Busboy({
      headers: req.headers,
      limits: { files: 1, fileSize: 5 * 1024 * 1024 },
    });

    let fileProcessed = false;

    bb.on("file", (_name, file, info) => {
      fileProcessed = true;
      if (!info.mimeType.startsWith("image/")) {
        res.statusCode = 415;
        res.setHeader("Content-Type", "application/json");
        res.end(JSON.stringify({ error: "Only images allowed" }));
        file.resume();
        return;
      }

      file.on("data", function checkMagic(chunk) {
        const hex = chunk.toString("hex", 0, 4).toUpperCase();
        const signatures: Record<string, string> = {
          "89504E47": "png",
          FFD8FF: "jpg",
          "47494638": "gif",
          "52494646": "webp",
        };
        const isValid = Object.keys(signatures).some((sig) =>
          hex.startsWith(sig),
        );

        if (!isValid) {
          file.destroy(new Error("INVALID_MAGIC_NUMBER"));
        }
        file.removeListener("data", checkMagic);
      });

      file.on("error", (err) => {
        if (err.message === "INVALID_MAGIC_NUMBER" && !res.writableEnded) {
          res.statusCode = 415;
          res.setHeader("Content-Type", "application/json");
          res.end(JSON.stringify({ error: "Spoofed file type detected" }));
        }
      });

      const uploadStream = mediaStorage.uploader.upload_stream(
        {
          folder: "portfolio/posts",
          resource_type: "auto",
          allowed_formats: ["jpg", "jpeg", "png", "webp", "gif"],
        },
        (error, result) => {
          if (error && !res.writableEnded) {
            res.statusCode = 500;
            res.setHeader("Content-Type", "application/json");
            res.end(JSON.stringify({ error: "Upload failed" }));
            return;
          }
          if (result && !res.writableEnded) {
            res.statusCode = 200;
            res.setHeader("Content-Type", "application/json");
            res.end(JSON.stringify({ url: result.secure_url }));
          }
        },
      );

      file.pipe(uploadStream);
    });

    bb.on("finish", () => {
      if (!fileProcessed && !res.writableEnded) {
        res.statusCode = 400;
        res.setHeader("Content-Type", "application/json");
        res.end(JSON.stringify({ error: "No file uploaded" }));
      }
    });

    req.pipe(bb);
  },

  async getAllPosts(
    _req: IncomingMessage,
    res: ServerResponse,
    url: URL,
  ): Promise<void> {
    try {
      const page = parseInt(url.searchParams.get("page") || "1", 10);
      const limit = 12;
      const results = await postsService.getAllPosts(page, limit);
      const totalCount =
        results.rows.length > 0 ? parseInt(results.rows[0].full_count, 10) : 0;

      res.statusCode = 200;
      res.setHeader("Content-Type", "application/json");
      res.end(
        JSON.stringify({
          posts: results.rows,
          total: totalCount,
          page: page,
          totalPages: Math.ceil(totalCount / limit),
        }),
      );
    } catch (err: any) {
      res.statusCode = 500;
      res.setHeader("Content-Type", "application/json");
      res.end(JSON.stringify({ error: "Failed to fetch posts" }));
    }
  },

  async getPost(
    _req: IncomingMessage,
    res: ServerResponse,
    postId: string,
  ): Promise<void> {
    try {
      const results = await postsService.getPost(postId);
      if (results.rows.length === 0) {
        res.statusCode = 404;
        res.setHeader("Content-Type", "application/json");
        res.end(JSON.stringify({ error: "Post not found" }));
        return;
      }
      res.statusCode = 200;
      res.setHeader("Content-Type", "application/json");
      res.end(JSON.stringify({ post: results.rows[0] }));
    } catch (err: any) {
      res.statusCode = 500;
      res.setHeader("Content-Type", "application/json");
      res.end(JSON.stringify({ error: "Retrieval failed" }));
    }
  },

  async searchPosts(
    _req: IncomingMessage,
    res: ServerResponse,
    url: URL,
  ): Promise<void> {
    try {
      const q = url.searchParams.get("q") || "";
      const page = parseInt(url.searchParams.get("page") || "1", 10);
      const limit = 12;

      if (!q.trim()) {
        res.statusCode = 400;
        res.setHeader("Content-Type", "application/json");
        res.end(JSON.stringify({ error: "Query required" }));
        return;
      }

      const results = await postsService.searchPosts(q, page, limit);
      const totalCount =
        results.rows.length > 0 ? parseInt(results.rows[0].full_count, 10) : 0;

      res.statusCode = 200;
      res.setHeader("Content-Type", "application/json");
      res.end(
        JSON.stringify({
          posts: results.rows,
          total: totalCount,
          page: page,
          totalPages: Math.ceil(totalCount / limit),
        }),
      );
    } catch (err: any) {
      res.statusCode = 500;
      res.setHeader("Content-Type", "application/json");
      res.end(JSON.stringify({ error: "Search failed" }));
    }
  },

  async filterByTag(
    _req: IncomingMessage,
    res: ServerResponse,
    url: URL,
  ): Promise<void> {
    try {
      const tag = url.searchParams.get("tag");
      const page = parseInt(url.searchParams.get("page") || "1", 10);
      const limit = 12;

      if (!tag) {
        res.statusCode = 400;
        res.setHeader("Content-Type", "application/json");
        res.end(JSON.stringify({ error: "Tag required" }));
        return;
      }

      const results = await postsService.filterByTag(tag, page, limit);
      const totalCount =
        results.rows.length > 0 ? parseInt(results.rows[0].full_count, 10) : 0;

      res.statusCode = 200;
      res.setHeader("Content-Type", "application/json");
      res.end(
        JSON.stringify({
          posts: results.rows,
          total: totalCount,
          page: page,
          totalPages: Math.ceil(totalCount / limit),
        }),
      );
    } catch (err: any) {
      res.statusCode = 500;
      res.setHeader("Content-Type", "application/json");
      res.end(JSON.stringify({ error: "Tag filter failed" }));
    }
  },

  async filterByCategory(
    _req: IncomingMessage,
    res: ServerResponse,
    url: URL,
  ): Promise<void> {
    try {
      const cat = url.searchParams.get("category");
      const sub = url.searchParams.get("subcategory");
      const page = parseInt(url.searchParams.get("page") || "1", 10);
      const limit = 12;

      if (!cat) {
        res.statusCode = 400;
        res.setHeader("Content-Type", "application/json");
        res.end(JSON.stringify({ error: "Category required" }));
        return;
      }

      const results = sub
        ? await postsService.filterBySubcategory(cat, sub, page, limit)
        : await postsService.filterByCategory(cat, page, limit);

      const totalCount =
        results.rows.length > 0 ? parseInt(results.rows[0].full_count, 10) : 0;

      res.statusCode = 200;
      res.setHeader("Content-Type", "application/json");
      res.end(
        JSON.stringify({
          posts: results.rows,
          total: totalCount,
          page: page,
          totalPages: Math.ceil(totalCount / limit),
        }),
      );
    } catch (err: any) {
      res.statusCode = 500;
      res.setHeader("Content-Type", "application/json");
      res.end(JSON.stringify({ error: "Filter failed" }));
    }
  },

  async sortPosts(
    _req: IncomingMessage,
    res: ServerResponse,
    url: URL,
  ): Promise<void> {
    try {
      const by = url.searchParams.get("by") || "date";
      const order =
        url.searchParams.get("order")?.toUpperCase() === "ASC" ? "ASC" : "DESC";
      const page = parseInt(url.searchParams.get("page") || "1", 10);
      const limit = 12;

      const results =
        by === "title"
          ? await postsService.sortPostsByTitle(order as any, page, limit)
          : await postsService.sortPostsByDate(order as any, page, limit);

      const totalCount =
        results.rows.length > 0 ? parseInt(results.rows[0].full_count, 10) : 0;

      res.statusCode = 200;
      res.setHeader("Content-Type", "application/json");
      res.end(
        JSON.stringify({
          posts: results.rows,
          total: totalCount,
          page: page,
          totalPages: Math.ceil(totalCount / limit),
        }),
      );
    } catch (err: any) {
      res.statusCode = 500;
      res.setHeader("Content-Type", "application/json");
      res.end(JSON.stringify({ error: "Sorting failed" }));
    }
  },

  async createPost(req: IncomingMessage, res: ServerResponse): Promise<void> {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      res.statusCode = 401;
      res.setHeader("Content-Type", "application/json");
      res.end(JSON.stringify({ error: "Unauthorized" }));
      return;
    }

    let decoded: JWTPayload;
    try {
      decoded = jwt.verify(
        authHeader.split(" ")[1] as string,
        ACCESS_TOKEN_SECRET as string,
      ) as JWTPayload;
    } catch {
      res.statusCode = 401;
      res.setHeader("Content-Type", "application/json");
      res.end(JSON.stringify({ error: "Invalid token" }));
      return;
    }

    // --- MANUAL REDIS RATE LIMITING (Max 5 posts per hour per user) ---
    try {
      const createLimitKey = `ratelimit:createpost:${decoded.id}`;
      const createsCount = await redisClient.incr(createLimitKey);

      if (createsCount === 1) {
        await redisClient.expire(createLimitKey, 3600); // 1 hour TTL
      }

      if (createsCount > 5) {
        res.statusCode = 429;
        res.setHeader("Content-Type", "application/json");
        res.end(
          JSON.stringify({
            error:
              "Creation limit exceeded. Maximum 5 posts per hour to prevent database abuse.",
          }),
        );
        return;
      }
    } catch (err: any) {
      process.stderr.write(`[createPost] Redis Error: ${err.message}\n`);
    }
    // ------------------------------------------------------------------

    let data: CreatePostDTO;
    try {
      data = (await json(req)) as CreatePostDTO;
    } catch {
      res.statusCode = 400;
      res.setHeader("Content-Type", "application/json");
      res.end(JSON.stringify({ error: "Invalid JSON format." }));
      return;
    }

    try {
      if (!data.title || data.title.length < 5 || data.title.length > 150) {
        res.statusCode = 400;
        res.end(JSON.stringify({ error: "Title must be 5-150 characters." }));
        return;
      }
      if (
        !data.short_description ||
        data.short_description.length < 10 ||
        data.short_description.length > 300
      ) {
        res.statusCode = 400;
        res.end(
          JSON.stringify({ error: "Description must be 10-300 characters." }),
        );
        return;
      }
      if (
        !data.main_content ||
        data.main_content.length < 50 ||
        data.main_content.length > 15000
      ) {
        res.statusCode = 400;
        res.end(
          JSON.stringify({ error: "Content must be 50-15,000 characters." }),
        );
        return;
      }

      if (data.thumbnail && data.thumbnail.length > 2048) {
        res.statusCode = 400;
        res.end(
          JSON.stringify({ error: "Thumbnail URL too long (max 2048)." }),
        );
        return;
      }
      if (
        data.thumbnail &&
        !IMAGE_REGEX.test(data.thumbnail.split("?")[0] ?? "")
      ) {
        res.statusCode = 400;
        res.end(
          JSON.stringify({ error: "Thumbnail must be a valid image URL." }),
        );
        return;
      }

      if (
        !Array.isArray(data.post_images) ||
        data.post_images.length < 1 ||
        data.post_images.length > 5
      ) {
        res.statusCode = 400;
        res.end(JSON.stringify({ error: "Provide between 1 and 5 images." }));
        return;
      }
      for (const url of data.post_images) {
        if (
          !url ||
          url.length > 2048 ||
          !IMAGE_REGEX.test(url.split("?")[0] ?? "")
        ) {
          res.statusCode = 400;
          res.end(
            JSON.stringify({
              error: "Invalid or too long image URL in gallery.",
            }),
          );
          return;
        }
      }

      if (
        !Array.isArray(data.tags) ||
        data.tags.length < 1 ||
        data.tags.length > 5
      ) {
        res.statusCode = 400;
        res.end(JSON.stringify({ error: "Provide between 1 and 5 tags." }));
        return;
      }
      const uniqueTags = new Set<string>();
      for (const tag of data.tags) {
        const cleaned = tag.trim();
        if (
          cleaned.includes(" ") ||
          cleaned.length < 2 ||
          cleaned.length > 25 ||
          uniqueTags.has(cleaned.toLowerCase())
        ) {
          res.statusCode = 400;
          res.end(
            JSON.stringify({
              error: "Tags must be unique, 2-25 chars, and no spaces.",
            }),
          );
          return;
        }
        uniqueTags.add(cleaned.toLowerCase());
      }

      if (
        data.external_link &&
        (data.external_link.length > 2048 ||
          !URL_REGEX.test(data.external_link))
      ) {
        res.statusCode = 400;
        res.end(JSON.stringify({ error: "Invalid or too long external URL." }));
        return;
      }

      if (
        data.github_link &&
        (data.github_link.length > 2048 || !GITHUB_REGEX.test(data.github_link))
      ) {
        res.statusCode = 400;
        res.end(
          JSON.stringify({
            error:
              "Invalid GitHub link. Expected: github.com/username/reponame or the error is due to too long GitHub URL.",
          }),
        );
        return;
      }

      if (data.category === "projects") {
        if (
          !data.subcategory ||
          !["serious", "random"].includes(data.subcategory)
        ) {
          res.statusCode = 400;
          res.end(
            JSON.stringify({ error: "Subcategory required for projects." }),
          );
          return;
        }
        if (data.subcategory === "serious" && !data.github_link) {
          res.statusCode = 400;
          res.end(
            JSON.stringify({
              error: "Serious projects must have a GitHub link.",
            }),
          );
          return;
        }
      }

      const result = await postsService.createPost({
        ...data,
        author_id: decoded.id,
      });
      res.statusCode = 201;
      res.setHeader("Content-Type", "application/json");
      res.end(
        JSON.stringify({ message: "Post created", post: result.rows[0] }),
      );
    } catch (err: any) {
      console.error("❌ BASEMENT CRASH IN CREATE_POST:", err);
      res.statusCode = 500;
      res.end(JSON.stringify({ error: "Creation failed" }));
    }
  },

  async updatePost(
    req: IncomingMessage,
    res: ServerResponse,
    postId: string,
  ): Promise<void> {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      res.statusCode = 401;
      res.setHeader("Content-Type", "application/json");
      res.end(JSON.stringify({ error: "Unauthorized" }));
      return;
    }

    let decoded: JWTPayload;
    try {
      decoded = jwt.verify(
        authHeader.split(" ")[1] as string,
        ACCESS_TOKEN_SECRET as string,
      ) as JWTPayload;
    } catch {
      res.statusCode = 401;
      res.setHeader("Content-Type", "application/json");
      res.end(JSON.stringify({ error: "Invalid token" }));
      return;
    }

    try {
      const existing = await postsService.getPost(postId);
      if (existing.rows.length === 0) {
        res.statusCode = 404;
        res.end(JSON.stringify({ error: "Post not found" }));
        return;
      }

      const post = existing.rows[0] as Post;

      if (post.author_id !== decoded.id && decoded.role !== "super_admin") {
        res.statusCode = 403;
        res.setHeader("Content-Type", "application/json");
        res.end(
          JSON.stringify({
            error: "Forbidden: You are not the author or a Super Admin.",
          }),
        );
        return;
      }

      let incomingData: UpdatePostDTO;
      try {
        incomingData = (await json(req)) as UpdatePostDTO;
      } catch {
        res.statusCode = 400;
        res.setHeader("Content-Type", "application/json");
        res.end(JSON.stringify({ error: "Invalid JSON format." }));
        return;
      }

      if (
        incomingData.title &&
        (incomingData.title.length < 5 || incomingData.title.length > 150)
      ) {
        res.statusCode = 400;
        res.end(JSON.stringify({ error: "Invalid title length." }));
        return;
      }

      if (
        incomingData.main_content &&
        (incomingData.main_content.length < 50 ||
          incomingData.main_content.length > 15000)
      ) {
        res.statusCode = 400;
        res.end(
          JSON.stringify({ error: "Content must be 50-15,000 characters." }),
        );
        return;
      }

      if (
        incomingData.thumbnail &&
        (incomingData.thumbnail.length > 2048 ||
          !IMAGE_REGEX.test(incomingData.thumbnail.split("?")[0] ?? ""))
      ) {
        res.statusCode = 400;
        res.end(
          JSON.stringify({ error: "Invalid or too long thumbnail URL." }),
        );
        return;
      }

      if (incomingData.post_images) {
        for (const url of incomingData.post_images) {
          if (
            url &&
            (url.length > 2048 || !IMAGE_REGEX.test(url.split("?")[0] ?? ""))
          ) {
            res.statusCode = 400;
            res.end(
              JSON.stringify({
                error: "Invalid or too long image URL in gallery.",
              }),
            );
            return;
          }
        }
      }

      if (incomingData.tags) {
        const unique = new Set<string>();
        for (const t of incomingData.tags) {
          if (
            t.includes(" ") ||
            t.length < 2 ||
            t.length > 25 ||
            unique.has(t.toLowerCase())
          ) {
            res.statusCode = 400;
            res.end(JSON.stringify({ error: "Invalid or duplicate tags." }));
            return;
          }
          unique.add(t.toLowerCase());
        }
      }

      if (
        incomingData.github_link &&
        (incomingData.github_link.length > 2048 ||
          !GITHUB_REGEX.test(incomingData.github_link))
      ) {
        res.statusCode = 400;
        res.end(
          JSON.stringify({
            error:
              "Invalid GitHub link. Expected: github.com/username/reponame or the error is due to too long GitHub link.",
          }),
        );
        return;
      }

      const ALLOWED = [
        "category",
        "subcategory",
        "thumbnail",
        "post_images",
        "title",
        "short_description",
        "main_content",
        "tags",
        "external_link",
        "github_link",
      ];
      const keys = Object.keys(incomingData).filter((k) => ALLOWED.includes(k));
      if (keys.length === 0) {
        res.statusCode = 400;
        res.end(JSON.stringify({ error: "No valid fields." }));
        return;
      }

      const values = keys.map((k) => (incomingData as any)[k]);
      const setClause = keys.map((k, i) => `${k} = $${i + 1}`).join(", ");
      const result = await postsService.updatePost(setClause, [
        ...values,
        postId,
      ]);

      if (result.rows.length === 0) {
        res.statusCode = 404;
        res.end(JSON.stringify({ error: "Post not found" }));
        return;
      }

      res.statusCode = 200;
      res.setHeader("Content-Type", "application/json");
      res.end(
        JSON.stringify({ message: "Post updated", post: result.rows[0] }),
      );
    } catch (err: any) {
      res.statusCode = 500;
      res.end(JSON.stringify({ error: "Update failed" }));
    }
  },

  async deletePost(
    req: IncomingMessage,
    res: ServerResponse,
    postId: string,
  ): Promise<void> {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      res.statusCode = 401;
      res.setHeader("Content-Type", "application/json");
      res.end(JSON.stringify({ error: "Unauthorized" }));
      return;
    }

    let decoded: JWTPayload;
    try {
      decoded = jwt.verify(
        authHeader.split(" ")[1] as string,
        ACCESS_TOKEN_SECRET as string,
      ) as JWTPayload;
    } catch {
      res.statusCode = 401;
      res.setHeader("Content-Type", "application/json");
      res.end(JSON.stringify({ error: "Invalid token" }));
      return;
    }

    try {
      const existing = await postsService.getPost(postId);
      if (existing.rows.length === 0) {
        res.statusCode = 404;
        res.end(JSON.stringify({ error: "Post not found" }));
        return;
      }

      const post = existing.rows[0] as Post;

      if (post.author_id !== decoded.id && decoded.role !== "super_admin") {
        res.statusCode = 403;
        res.setHeader("Content-Type", "application/json");
        res.end(
          JSON.stringify({
            error: "Forbidden: You are not the author or a Super Admin.",
          }),
        );
        return;
      }

      const result = await postsService.deletePost(postId);
      if (result.rowCount === 0) {
        res.statusCode = 404;
        res.end(JSON.stringify({ error: "Post not found" }));
        return;
      }
      res.statusCode = 200;
      res.setHeader("Content-Type", "application/json");
      res.end(JSON.stringify({ message: "Post deleted" }));
    } catch (err: any) {
      res.statusCode = 500;
      res.end(JSON.stringify({ error: "Deletion failed" }));
    }
  },

  async getOwnPosts(
    req: IncomingMessage,
    res: ServerResponse,
    url: URL,
  ): Promise<void> {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      res.statusCode = 401;
      res.end(JSON.stringify({ error: "Unauthorized" }));
      return;
    }

    let decoded: JWTPayload;
    try {
      decoded = jwt.verify(
        authHeader.split(" ")[1] as string,
        ACCESS_TOKEN_SECRET as string,
      ) as JWTPayload;
    } catch {
      res.statusCode = 401;
      res.end(JSON.stringify({ error: "Invalid token" }));
      return;
    }

    try {
      const page = parseInt(url.searchParams.get("page") || "1", 10);
      const limit = 12;
      const results = await postsService.getPostsByAuthor(
        decoded.id,
        page,
        limit,
      );
      const totalCount =
        results.rows.length > 0 ? parseInt(results.rows[0].full_count, 10) : 0;

      res.statusCode = 200;
      res.setHeader("Content-Type", "application/json");
      res.end(
        JSON.stringify({
          posts: results.rows,
          total: totalCount,
          page: page,
          totalPages: Math.ceil(totalCount / limit),
        }),
      );
    } catch (err: any) {
      res.statusCode = 500;
      res.end(JSON.stringify({ error: "Failed to fetch your posts" }));
    }
  },

  async getSuperAdminSeriousProjects(
    _req: IncomingMessage,
    res: ServerResponse,
    url: URL,
  ): Promise<void> {
    try {
      const page = parseInt(url.searchParams.get("page") || "1", 10);
      const limit = 12;

      const results = await postsService.getSuperAdminSeriousProjects(
        page,
        limit,
      );
      const totalCount =
        results.rows.length > 0 ? parseInt(results.rows[0].full_count, 10) : 0;

      res.statusCode = 200;
      res.setHeader("Content-Type", "application/json");
      res.end(
        JSON.stringify({
          posts: results.rows,
          total: totalCount,
          page: page,
          totalPages: Math.ceil(totalCount / limit),
        }),
      );
    } catch (err: any) {
      res.statusCode = 500;
      res.setHeader("Content-Type", "application/json");
      res.end(
        JSON.stringify({ error: "Failed to fetch super admin projects" }),
      );
    }
  },

  async getSuperAdminDiary(
    _req: IncomingMessage,
    res: ServerResponse,
    url: URL,
  ): Promise<void> {
    try {
      const page = parseInt(url.searchParams.get("page") || "1", 10);
      const limit = 12;

      const results = await postsService.getSuperAdminDiary(page, limit);
      const totalCount =
        results.rows.length > 0 ? parseInt(results.rows[0].full_count, 10) : 0;

      res.statusCode = 200;
      res.setHeader("Content-Type", "application/json");
      res.end(
        JSON.stringify({
          posts: results.rows,
          total: totalCount,
          page: page,
          totalPages: Math.ceil(totalCount / limit),
        }),
      );
    } catch (err: any) {
      res.statusCode = 500;
      res.setHeader("Content-Type", "application/json");
      res.end(JSON.stringify({ error: "Failed to fetch super admin diary" }));
    }
  },
};
