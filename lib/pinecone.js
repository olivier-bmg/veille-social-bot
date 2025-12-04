// lib/pinecone.js
import { Pinecone } from "@pinecone-database/pinecone";

const pinecone = new Pinecone({
  apiKey: process.env.PINECONE_API_KEY,
});

const indexName = process.env.PINECONE_INDEX_NAME || "veille-social";

function getIndex() {
  return pinecone.Index(indexName);
}

export async function upsertReferenceVector({ id, embedding, metadata }) {
  const index = getIndex();

  await index.upsert([
    {
      id,
      values: embedding,
      metadata,
    },
  ]);
}

export async function searchSimilar({ embedding, topK = 5 }) {
  const index = getIndex();

  const res = await index.query({
    topK,
    vector: embedding,
    includeMetadata: true,
  });

  return res;
}
