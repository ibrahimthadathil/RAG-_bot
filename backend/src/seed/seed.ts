import { readFile } from "node:fs/promises";
import path from "node:path";
import dotenv from "dotenv";
import OpenAI from "openai";
import type { Collection, Document } from "mongodb";
import { getCollection, closeConn } from "../db/db.js";

dotenv.config();

const apiKey = process.env.OPENAI_API_KEY;
if (!apiKey) {
  throw new Error("❌ Missing OPENAI_API_KEY in environment variables.");
}

const openai = new OpenAI({ apiKey });

export interface Claim {
  claimId: string | number;
  date: string;
  amount: number;
  reason: string;
  status: string;
}
export interface InsuranceRecord {
  policyNumber: string;
  name: string;
  age: number;
  insuranceType: string;
  plan: string;
  premium: number;
  coverage: number;
  startDate: string;
  endDate: string;
  claims?: Claim[];
}

export interface InsuranceEmbeddingDocument extends Document {
  text: string;
  embedding: number[];
  policyNumber: string;
  customerName: string;
  insuranceType: string;
  createdAt: Date;
}

export const flattenInsuranceRecord = (record: InsuranceRecord): string => {
  const {
    policyNumber,
    name,
    age,
    insuranceType,
    plan,
    premium,
    coverage,
    startDate,
    endDate,
    claims = [],
  } = record;
  const claimText =
    claims.length > 0
      ? claims
          .map(
            (c, i) =>
              `Claim ${i + 1}: ID ${c.claimId}, Date ${c.date}, Amount ₹${c.amount}, Reason: ${c.reason}, Status: ${c.status}`,
          )
          .join("; ")
      : "No claim history";
  return `Policy Number: ${policyNumber}. Customer Name: ${name}, Age: ${age}. Insurance Type: ${insuranceType}. Plan: ${plan}. Premium: ₹${premium}, Coverage: ₹${coverage}. Policy Period: ${startDate} to ${endDate}. Claims: ${claimText}.`.trim();
};

const generateAndStoreEmbeddings = async (): Promise<void> => {
  try {
    const filePath = path.resolve(process.cwd(), "seed/insurance_data.json");
    const fileContent = await readFile(filePath, "utf-8");
    const parsedData: unknown = JSON.parse(fileContent);
    if (!Array.isArray(parsedData) || parsedData.length === 0) {
      console.log("⚠️ No records found to process.");
      return;
    }

    const insuranceArray = parsedData as InsuranceRecord[];

    console.log(`📄 Loaded ${insuranceArray.length} insurance records`);

    // Prepare text chunks
    const preparedChunks = insuranceArray.map((record) => ({
      record,
      textChunk: flattenInsuranceRecord(record),
    }));

    const BATCH_SIZE = 100;

    const documents: InsuranceEmbeddingDocument[] = [];

    // Process records in batches
    for (let i = 0; i < preparedChunks.length; i += BATCH_SIZE) {
      const batch = preparedChunks.slice(i, i + BATCH_SIZE);

      const batchInputs = batch.map((item) => item.textChunk);

      console.log(
        `⏳ Requesting embeddings for batch ${Math.floor(i / BATCH_SIZE) + 1} (${batch.length} items)...`,
      );

      const response = await openai.embeddings.create({
        model: "text-embedding-3-small",
        input: batchInputs,
        dimensions: 512,
      });

      // Match each embedding with its original record
      response.data.forEach((item) => {
        const corresponding = batch[item.index];

        if (!corresponding) return;

        documents.push({
          text: corresponding.textChunk,
          embedding: item.embedding,
          policyNumber: corresponding.record.policyNumber,
          customerName: corresponding.record.name,
          insuranceType: corresponding.record.insuranceType,
          createdAt: new Date(),
        });
      });
    }

    // Store all generated embeddings in MongoDB
    if (documents.length > 0) {
      const collection: Collection<InsuranceEmbeddingDocument> =
        await getCollection<InsuranceEmbeddingDocument>("insurance_embeddings");

      const result = await collection.insertMany(documents);

      console.log(
        `🎯 Successfully inserted ${result.insertedCount} embeddings into MongoDB.`,
      );
    }
  } catch (error: unknown) {
    console.error("❌ Error during embedding generation:", error);
  } finally {
    await closeConn();
  }
};
generateAndStoreEmbeddings();
