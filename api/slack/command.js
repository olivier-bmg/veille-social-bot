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

  return page.id;
}

// ---------- OUTILS PINECONE ----------

async function upsertReferenceVector({ id, embedding, metadata }) {
  const index = getPineconeIndex();
  await index.upsert([
    {
      id,
      values: embedding,
      metadata,
    },
  ]);
}

async function searchSimilar({ embedding, topK = 5 }) {
  const index = getPineconeIndex();
  return await index.query({
    topK,
    vector: embedding,
    includeMetadata: true,
  });
}

// ---------- PARSE BODY SLACK ----------

function parseSlackBody(req) {
  return new Promise((resolve, reject) => {
    let body = "";
    req.on("data", (chunk) => {
      body += chunk.toString();
    });
    req.on("end", () => {
      const parsed = querystring.parse(body);
      resolve(parsed);
    });
    req.on("error", reject);
  });
}

// ---------- HANDLER PRINCIPAL ----------

export default async function handler(req, res) {
  if (req.method !== "POST") {
    res.statusCode = 405;
    res.setHeader("Content-Type", "application/json");
    res.end(JSON.stringify({ error: "Method not allowed" }));
    return;
  }

  try {
    const params = await parseSlackBody(req);
    const { command, text, user_name } = params;

    if (command === "/addref") {
      await handleAddRef({ text, user_name, res });
      return;
    }

    if (command === "/ref") {
      await handleSearch({ text, user_name, res });
      return;
    }

    return sendSlack(res, {
      response_type: "ephemeral",
      text: "Commande non reconnue.",
    });
  } catch (err) {
    console.error(err);
    return sendSlack(res, {
      response_type: "ephemeral",
      text: "❌ Erreur côté bot. Vérifie les logs Vercel.",
    });
  }
}

// ---------- LOGIQUE /addref (version rapide) ----------

async function handleAddRef({ text, user_name, res }) {
  const raw = (text || "").trim();
  if (!raw) {
    return sendSlack(res, {
      response_type: "ephemeral",
      text: "Utilisation : `/addref URL [description]`",
    });
    return;
  }

  const [url, ...rest] = raw.split(/\s+/);
  const userNote = rest.join(" ");

  const title =
    (userNote && userNote.slice(0, 80)) || "Référence ajoutée via /addref";
  const description =
    userNote || `Référence ajoutée par ${user_name} depuis Slack`;

  const pageId = await createReferencePage({
    title,
    url,
    description,
    tags: [],
    format: [],
    styleVisuel: [],
    couleursMood: [],
    elementsGraphiques: [],
    structureNarration: [],
    usage: [],
    miseEnScene: [],
    styleTypo: [],
    montageMotion: [],
    idInterne: "",
  });

  const embedding = await embedText(title + "\n" + description);

  await upsertReferenceVector({
    id: pageId,
    embedding,
    metadata: {
      title,
      url,
      description,
      tags: [],
      format: [],
    },
  });

  return sendSlack(res, {
    response_type: "ephemeral",
    text: `✅ Référence ajoutée par *${user_name}*\n*${title}*\n${url}`,
  });
}

// ---------- LOGIQUE /ref (recherche) ----------

async function handleSearch({ text, user_name, res }) {
  const query = (text || "").trim();
  if (!query) {
    return sendSlack(res, {
      response_type: "ephemeral",
      text: "Utilisation : `/ref mots clés`",
    });
  }

  const embedding = await embedText(query);
  const results = await searchSimilar({ embedding, topK: 5 });

  if (!results.matches || results.matches.length === 0) {
    return sendSlack(res, {
      response_type: "ephemeral",
      text: `Aucune référence trouvée pour : _${query}_`,
    });
  }

  const blocks = [
    {
      type: "section",
      text: {
        type: "mrkdwn",
        text: `🔎 Résultats pour : *${query}* (par *${user_name}*)`,
      },
    },
    { type: "divider" },
  ];

  for (const match of results.matches.slice(0, 3)) {
    const m = match.metadata || {};
    const tags =
      Array.isArray(m.tags) && m.tags.length > 0
        ? `*Tags :* ${m.tags.join(", ")}`
        : "";

    blocks.push({
      type: "section",
      text: {
        type: "mrkdwn",
        text: `*${m.title || "Sans titre"}*\n${m.description || ""}\n${
          m.url ? `<${m.url}|Voir>` : ""
        }\n${tags}`,
      },
    });
    blocks.push({ type: "divider" });
  }

  return sendSlack(res, { response_type: "ephemeral", blocks });
}

// ---------- UTIL ----------

function sendSlack(res, payload) {
  res.statusCode = 200;
  res.setHeader("Content-Type", "application/json");
  res.end(JSON.stringify(payload));
}
