import express from "express";
import dotenv from "dotenv";
import cors from "cors";
import { buildAggragationPipeline, getAnswerFromLLM, getEmbeddings } from "./lib/vectorPipeline.js";
import { getCollection } from "./db/db.js";
dotenv.config();

const app = express();
app.use(express.json())
 app.use(cors())

// ✅ Ask endpoint - complete RAG pipeline
app.post("/ask", async (req, res) => {
    const { query } = req.body;
    if (!query) return res.status(400).json({ error: "Query is required" });

    try {
        // 1️⃣ Generate query embedding
        const queryEmbedding = await getEmbeddings(query);
        // 2️⃣ Search most relevant chunks from MongoDB
        const collection = await getCollection('insurance_embeddings');
        const pipeline = buildAggragationPipeline(queryEmbedding);
        // R- Retrival Part
        const results = await collection.aggregate(pipeline).toArray();
        if (results.length === 0) {
            return res.json({ answer: "No relevant information found." });
        }
        // Combine top results into context
        const context = results.map((r) => r.text).join("\n\n");
        // 3️⃣ Send to GPT to generate final answer
        const answer = await getAnswerFromLLM(query, context);
        res.json({ answer });
    } catch (error) {
        console.error("❌ Error:", error);
        res.status(500).json({ error: (error as Error).message });
    }
});

const  PORT = process.env.PORT || 4000;

app.listen(() => console.log(`RAG server running on Port ${PORT}`));
