import { MongoClient, Db, Collection } from "mongodb";
import type { Document } from "mongodb";
import dotenv from "dotenv";
dotenv.config();
const uri = process.env.MONGO_URL as string;
const dbName = "rag";

let client: MongoClient | null = null;
let db: Db | null = null;
let connectionPromise: Promise<Db> | null = null;

export const connectMongoDb = async (): Promise<Db> => {
  if (db) return db;

  connectionPromise ??= new MongoClient(uri)
    .connect()
    .then(client => {
      db = client.db(dbName);
      console.log("✅ MongoDB connected");
      return db;
    })
    .catch(error => {
      connectionPromise = null;
      throw error;
    });

  return connectionPromise;
};

export async function getDB(): Promise<Db> {
  if (!db) {
    return connectMongoDb();
  }
  return db;
}

export async function getCollection<T extends Document = Document>(
  collectionName: string
): Promise<Collection<T>> {
  const database = await getDB();
  return database.collection<T>(collectionName);
}

export async function closeConn(): Promise<void> {
  if (client) {
    await client.close();
    client = null;
    db = null;
    connectionPromise = null;
    console.log('🔌 MongoDB connection closed');
  }
}