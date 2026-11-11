// src/lib/mongodb.ts  (your code is perfect — no changes needed)
import { MongoClient } from "mongodb";

const MONGODB_URI = process.env.MONGODB_URI as string;
const MONGODB_DB = process.env.CHAMAHUB_MONGODB_DB || "Viuckins101";

if (!MONGODB_URI) {
  throw new Error("Please define the MONGODB_URI environment variable in .env.local");
}

let cached = global.mongo;

if (!cached) {
  cached = global.mongo = { client: null, promise: null };
}

async function connectToDatabase(): Promise<import('mongodb').Db> {
  if (cached.client) {
    console.log("Using cached MongoDB connection");
    return cached.client.db(MONGODB_DB);
  }

  if (!cached.promise) {
    const opts = {
      maxPoolSize: 10,
      serverSelectionTimeoutMS: 5000,
      connectTimeoutMS: 10000,
    };

    console.log("Initiating MongoDB connection", { uri: MONGODB_URI.replace(/\/\/.*@/, "//[redacted]@") });
    cached.promise = MongoClient.connect(MONGODB_URI, opts).catch((error) => {
      console.error("MongoDB connection error:", {
        error: (error as Error).message,
        stack: (error as Error).stack,
        uri: MONGODB_URI.replace(/\/\/.*@/, "//[redacted]@"),
      });
      cached.promise = null;
      throw new Error("Failed to connect to MongoDB");
    });
  }

  cached.client = await cached.promise;
  console.log("MongoDB connected successfully");
  return cached.client.db(MONGODB_DB);
}

export default connectToDatabase;