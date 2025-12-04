// api/slack/command.js

import querystring from "querystring";
import OpenAI from "openai";
import { Client as NotionClient } from "@notionhq/client";
import { Pinecone } from "@pinecone-database/pinecone";

// ---------- CONFIG CLIENTS ----------

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

// ---------- OUTILS OPENAI ----------

async function embedText(text) {
  const cleaned = (text || "").slice(0, 8000);
  const response = await openai.embeddings.create({
    model: "text-embedding-3-large",
    input: cleaned,
  });
  return response.data[0].embedding;
}

// ---------- OUTILS NOTION ----------

function toMultiSelect(values) {
  if (!values || !Array.isArray(values)) return [];
  return values.map((name) => ({ name }));
}

async function createReferencePage(props) {
  const {
    title,
    url,
    description,
    tags,
    format,
    styleVisuel,
    couleursMood,
    elementsGraphiques,
    structureNarration,
    usage,
    miseEnScene,
    styleTypo,
    montageMotion,
    idInterne,
  } = props;

  const page = await notion.pages.create({
    parent: { database_id: databaseId },
    properties: {
      Title: {
        title: [
          {
            text: {
              content: title || "Référence sans titre",
            },
          },
        ],
      },
      URL: { url: url || null },
      Tumbnail: { url: null },
      Description: {
        rich_text: [
          {
            text: {
              content: description || "",
            },
          },
        ],
      },
      Tags: { multi_select: toMultiSelect(tags) },
      Format: { multi_select: toMultiSelect(format) },
      "Type de contenu": { multi_select: toMultiSelect(structureNarration) },
      "Mise en scène / cadrage": { multi_select: toMultiSelect(miseEnScene) },
      "Style DA": { multi_select: toMultiSelect(styleVisuel) },
      "Style typo": { multi_select: toMultiSelect(styleTypo) },
      "Montage / motion": { multi_select: toMultiSelect(montageMotion) },
      Objectif: { multi_select: toMultiSelect(usage) },
      Ambiance: { multi_select: toMultiSelect(couleursMood) },
      Effets: { multi_select: toMultiSelect(elementsGraphiques) },
      "ID interne": {
        rich_text: idInterne
          ? [
              {
                text: {
                  content: idInterne,
                },
              },
            ]
          : [],
      },
      "Tags IA validés": {
        checkbox: false,
      },
    },
  });

  return pag
