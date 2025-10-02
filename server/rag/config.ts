export const EMBEDDING_MODEL = process.env.EMBEDDING_MODEL ?? "text-embedding-3-small";
export const EMBEDDING_DIM = EMBEDDING_MODEL.includes("large") ? 3072 : 1536;
