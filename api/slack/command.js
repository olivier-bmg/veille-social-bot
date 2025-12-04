// api/slack/command.js

import querystring from "querystring";
import OpenAI from "openai";
import { Client as NotionClient } from "@notionhq/client";
import { Pinecone } from "@pinecone-database/pinecone";

/* -----------------------------
   CONFIGURATION DES CLIENTS
----------------------------- */

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

const notion = new NotionClient({
  auth: process.env.NOTION_API_KEY,
});

const databaseId = process.env.NOTION_DATABASE_ID;

const pinecone = new Pinecone({
  apiKey: process.env.PINECONE_API_KEY,
});

const indexName = process.env.PINECONE_INDEX_NAME || "veille-social";

function getPineconeIndex() {
  return pinecone.Index(indexName);
}

/* -----------------------------
          OPENAI
----------------------------- */

async function embedText(text) {
  const cleaned = (text || "").slice(0, 8000);
  const response = await openai.embeddings.create({
    model: "text-embedding-3-large",
    input: cleaned,
  });

  return response.data[0].embedding;
}

/* -----------------------------
         NOTION HELPERS
----------------------------- */

function toMultiSelect(values) {
  if (!values || !Array.isArray(values)) return [];
  return values.map((name) => ({ name }));
}

async function createReferencePage(props) {
  const
