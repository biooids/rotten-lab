//src/db/redis.ts
import { createClient, type RedisClientType } from "redis";

const redisUrl = process.env["REDIS_URL"];

if (!redisUrl) {
  process.stderr.write(
    "FATAL ERROR: REDIS_URL is not defined in environment variables.\n",
  );
  process.exit(1);
}

export const redisClient: RedisClientType = createClient({
  url: redisUrl,
  socket: {
    connectTimeout: 5000,
    reconnectStrategy: (retries) => {
      if (retries > 10) return new Error("Redis retry limit reached");
      return Math.min(retries * 100, 3000); // Backoff up to 3s
    },
  },
});

redisClient.on("ready", () => {
  console.log("✅ Redis connected and rate limiter active.");
});

/**
 * Logs Redis failures to stderr with full stack traces.
 */
redisClient.on("error", (err: Error) => {
  process.stderr.write(
    JSON.stringify({
      level: "ERROR",
      message: "Redis connection error",
      error: err.message,
      stack: err.stack,
      timestamp: new Date().toISOString(),
    }) + "\n",
  );
});

/**
 * Initializes the connection.
 * If it fails, the error is caught and logged as a structured JSON object.
 */
export const connectRedis = async (): Promise<void> => {
  try {
    await redisClient.connect();
  } catch (err) {
    process.stderr.write(
      JSON.stringify({
        level: "CRITICAL",
        message: "Failed to establish Redis connection",
        error: (err as Error).message,
        stack: (err as Error).stack,
        timestamp: new Date().toISOString(),
      }) + "\n",
    );
  }
};
