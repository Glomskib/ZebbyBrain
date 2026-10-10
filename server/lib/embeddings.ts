import OpenAI from "openai";
import { EMBEDDING_MODEL } from "../rag/config";
import { getOpenAI } from "./aiClient";

const openai = getOpenAI();

function ensureClient(): OpenAI {
  if (!openai) {
    throw new Error(
      "OPENAI_API_KEY is not configured — embeddings/RAG are unavailable.",
    );
  }
  return openai;
}

export async function generateEmbedding(text: string): Promise<number[]> {
  const response = await ensureClient().embeddings.create({
    model: EMBEDDING_MODEL,
    input: text,
  });
  return response.data[0].embedding;
}

export async function generateEmbeddings(texts: string[]): Promise<number[][]> {
  const response = await ensureClient().embeddings.create({
    model: EMBEDDING_MODEL,
    input: texts,
  });
  return response.data.map((d) => d.embedding);
}
