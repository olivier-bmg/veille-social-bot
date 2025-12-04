// api/slack/command.js

import querystring from "querystring";
import { Client as NotionClient } from "@notionhq/client";

/* -----------------------------
   CONFIGURATION NOTION
----------------------------- */

const notion = new NotionClient({
  auth: process.env.NOTION_API_KEY,
});

const databaseId = process.env.NOTION_DATABASE_ID;

/* -----------------------------
   HELPERS NOTION
----------------------------- */

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
        title: [{ text: { content: title || "Référence sans titre" } }],
      },

      URL: { url: url || null },

      Description: {
        rich_text: [{ text: { content: description || "" } }],
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
        rich_text: idInterne ? [{ text: { content: idInterne } }] : [],
      },

      "Tags IA validés": { checkbox: false },
    },
  });

  return page.id;
}

/* -----------------------------
   PARSE BODY SLACK
----------------------------- */

function parseSlackBody(req) {
  return new Promise((resolve, reject) => {
    let body = "";
    req.on("data", (chunk) => (body += chunk.toString()));
    req.on("end", () => resolve(querystring.parse(body)));
    req.on("error", reject);
  });
}

/* -----------------------------
   HANDLER PRINCIPAL
----------------------------- */

export default async function handler(req, res) {
  if (req.method !== "POST") {
    res.statusCode = 405;
    res.setHeader("Content-Type", "application/json");
    return res.end(JSON.stringify({ error: "Method not allowed" }));
  }

  try {
    const params = await parseSlackBody(req);
    const { command, text, user_name } = params;

    if (command === "/addref") {
      return await handleAddRef({ text, user_name, res });
    }

    if (command === "/ref") {
      // Pour l'instant, on n'a pas encore branché la recherche
      return sendSlack(res, {
        response_type: "ephemeral",
        text:
          "🔎 La recherche `/ref` n'est pas encore activée. " +
          "On commence par bien stabiliser l'ajout `/addref`.",
      });
    }

    return sendSlack(res, {
      response_type: "ephemeral",
      text: "Commande inconnue.",
    });
  } catch (err) {
    console.error("BOT ERROR:", err);
    const msg =
      err?.message ||
      err?.toString() ||
      "Erreur inconnue (aucun message d’erreur fourni).";
    return sendSlack(res, {
      response_type: "ephemeral",
      text: `❌ Erreur côté bot : ${msg}`,
    });
  }
}

/* -----------------------------
        /addref (ajout)
----------------------------- */

async function handleAddRef({ text, user_name, res }) {
  const raw = (text || "").trim();

  if (!raw) {
    return sendSlack(res, {
      response_type: "ephemeral",
      text: "Utilisation : `/addref URL [description]`",
    });
  }

  const [url, ...rest] = raw.split(/\s+/);
  const userNote = rest.join(" ");

  const title =
    (userNote && userNote.slice(0, 80)) || "Référence ajoutée via /addref";
  const description =
    userNote || `Référence ajoutée par ${user_name} depuis Slack`;

  // on ne remplit que le minimum, le reste tu peux le compléter à la main dans Notion
  await createReferencePage({
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

  return sendSlack(res, {
    response_type: "ephemeral",
    text: `✅ Référence ajoutée par *${user_name}*\n*${title}*\n${url}`,
  });
}

/* -----------------------------
            UTIL
----------------------------- */

function sendSlack(res, payload) {
  res.statusCode = 200;
  res.setHeader("Content-Type", "application/json");
  return res.end(JSON.stringify(payload));
}
