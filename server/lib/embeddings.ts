import OpenAI from "openai";

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

export async function generateEmbedding(text: string): Promise<number[]> {
  const model = process.env.EMBEDDING_MODEL || "text-embedding-3-small";
  
  const response = await openai.embeddings.create({
    model,
    input: text,
  });

  return response.data[0].embedding;
}

export async function generateEmbeddings(texts: string[]): Promise<number[][]> {
  const model = process.env.EMBEDDING_MODEL || "text-embedding-3-small";
  
  const response = await openai.embeddings.create({
    model,
    input: texts,
  });

  return response.data.map(d => d.embedding);
}
