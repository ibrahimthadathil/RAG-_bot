import type { Document } from "mongodb";
import OpenAI from "openai";
import dotenv from 'dotenv'
dotenv.config()

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
  baseURL: "https://googleapis.com" 
});

/**
 * Builds a MongoDB Atlas Vector Search aggregation pipeline.
 *
 * @param queryEmbedding - The 512-dimension vector generated from user query
 * @param limit - Max number of relevant documents to return (default: 5)
 * @param numCandidates - Oversampling factor for approximate nearest neighbors (ANN) search
 */
export const buildAggragationPipeline = (
  queryEmbedding: number[],
  limit: number = 5,
  numCandidates: number = 50
): Document[] => [
  {
    $vectorSearch: {
      index: "vector_index", // Name of the Atlas vector search index
      path: "embedding",
      queryVector: queryEmbedding,
      numCandidates,
      limit,
    },
  },
  {
    $project: {
      _id: 0,
      text: 1,
      policyNumber: 1,
      customerName: 1,
      score: { $meta: "vectorSearchScore" },
    },
  },
];

/**
 * Converts a raw user query string into a vector embedding using OpenAI.
 *
 * @param query - Raw user search prompt or natural language query
 * @returns Array of numbers representing the dense vector (512 dimensions)
 */
export const getEmbeddings = async (query: string): Promise<number[]> => {
  const response = await openai.embeddings.create({
    model: "text-embedding-3-small",
    input: query.trim(),
    dimensions: 512,
  });

  return (response as any).data[0].embedding;
};

/**
 * Generates an answer using an LLM grounded strictly in retrieved context chunks.
 *
 * @param query - The user's input question
 * @param context - Retrieved text documents from MongoDB Vector Search
 * @returns Generated answer string
 */
export const getAnswerFromLLM = async (
  query: string,
  context: string
): Promise<string> => {
  const systemPrompt = `You are an AI insurance assistant. Answer the user's inquiry based exclusively on the provided context below. If the answer cannot be determined from the context, state that clearly without guessing.\n\nContext:\n${context}`;

  const completion = await openai.chat.completions.create({
    model: "gpt-4o-mini",
    temperature: 0.2, // Low temperature for grounded factual responses
    messages: [
      { role: "system", content: systemPrompt },
      { role: "user", content: query },
    ],
  });

  return completion.choices[0]?.message?.content ?? "No answer generated.";
};