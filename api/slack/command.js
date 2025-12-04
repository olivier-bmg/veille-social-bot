// api/slack/command.js

import querystring from "querystring";
import OpenAI from "openai";
import { Client as NotionClient } from "@notionhq/client";

/* -----------------------------
   CONFIGURATION CLIENTS
----------------------------- */

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

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
    typeContenu,
    miseEnScene,
    styleDA,
    styleTypo,
    montageMotion,
    objectif,
    ambiance,
    effets,
    idInterne,
    thumbnail,
  } = props;

  return await notion.pages.create({
    parent: { database_id: databaseId },
    properties: {
      Title: {
        title: [{ text: { content: title || "Référence sans titre" } }],
      },

      URL: { url: url || null },

      // 🟢 Miniature envoyée dans la colonne Cover (URL)
      Cover: { url: thumbnail || null },

      Description: {
        rich_text: [{ text: { content: description || "" } }],
      },

      Tags: { multi_select: toMultiSelect(tags) },
      Format: { multi_select: toMultiSelect(format) },
      "Type de contenu": { multi_select: toMultiSelect(typeContenu) },
      "Mise en scène / cadrage": { multi_select: toMultiSelect(miseEnScene) },
      "Style DA": { multi_select: toMultiSelect(styleDA) },
      "Style typo": { multi_select: toMultiSelect(styleTypo) },
      "Montage / motion": { multi_select: toMultiSelect(montageMotion) },
      Objectif: { multi_select: toMultiSelect(objectif) },
      Ambiance: { multi_select: toMultiSelect(ambiance) },
      Effets: { multi_select: toMultiSelect(effets) },

      "ID interne": {
        rich_text: idInterne ? [{ text: { content: idInterne } }] : [],
      },

      "Tags IA validés": { checkbox: false },
    },
  });
}

/* -----------------------------
   INDEX AUTO (01, 02, 03…)
----------------------------- */

async function getNextIndexNumber() {
  try {
    const resp = await notion.databases.query({
      database_id: databaseId,
      page_size: 200,
    });
    const count = resp.results?.length || 0;
    return (count + 1).toString().padStart(2, "0");
  } catch (e) {
    console.error("Erreur getNextIndexNumber:", e);
    return "01";
  }
}

/* -----------------------------
   IA : TYPE / FORMAT / THEME
----------------------------- */

async function analyzeWithOpenAI({ note, url, index }) {
  const prompt = `
Tu es un expert en classification de contenus social media.

Tu dois produire :
1) "type" = UGC, Incarné, Facecam, Tutoriel, Podcast, Motion, etc.
2) "formatLabel" = Vertical, Horizontal, Carré, Reel, Shorts.
3) "theme" = Lifestyle, Produit, Beauté, Mode, Tech, Corporate, Humour, etc.
4) "description" = résumé court (1–2 phrases max).

⚠️ Ne génère pas de numéro, le titre final sera :
"<type> <formatLabel> <theme> ${index}"

RENVOIE UNIQUEMENT CE JSON STRICT :
{
  "type": "...",
  "formatLabel": "...",
  "theme": "...",
  "description": "..."
}

Texte utilisateur :
${note || "(vide)"}

URL :
${url || "(aucune)"}
`;

  try {
    const completion = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      response_format: { type: "json_object" },
      messages: [
        { role: "system", content: "Tu renvoies uniquement du JSON valide." },
        { role: "user", content: prompt },
      ],
    });

    return JSON.parse(completion.choices[0].message.content);
  } catch (err) {
    console.error("Erreur OpenAI :", err);
    return {
      type: "Référence",
      formatLabel: "Vertical",
      theme: "Générique",
      description: note || "",
    };
  }
}

/* -----------------------------
   VOCAB AUTO-TAGS
----------------------------- */

const VOCAB = {
  format: ["vertical", "horizontal", "carré", "story", "reel", "shorts"],
  typeContenu: [
    "incarné",
    "facecam",
    "interview",
    "narration",
    "tutoriel",
    "tuto",
    "storytelling",
    "démonstration",
    "comparatif",
    "réaction",
    "FAQ",
    "expérience sociale",
    "making-of",
    "challenge",
    "podcast",
    "review",
    "témoignage",
    "UGC",
    "présentation produit",
  ],
  miseEnScene: [
    "fond vert",
    "fond simple",
    "fond décor réel",
    "en mouvement",
    "plan fixe",
    "gros plan",
    "plan large",
    "duo",
    "voix off",
    "POV",
  ],
  styleDA: [
    "rétro",
    "futuriste",
    "brutaliste",
    "cartoon",
    "flat design",
    "cyberpunk",
    "premium",
    "vintage",
    "Y2K",
    "editorial",
    "corporate clean",
  ],
  styleTypo: [
    "bold typography",
    "typo serif",
    "typo manuscrite",
    "titres oversized",
  ],
  montageMotion: [
    "jumpcut",
    "titrage animé",
    "glitch",
    "b-roll",
    "slow motion",
    "hyperlapse",
  ],
  objectif: ["branding", "conversion", "promo", "éducation"],
  ambiance: ["pastel", "néon", "sombre", "lumineux"],
  effets: ["grain film", "texture papier", "stickers", "dégradés"],
};

function analyzeNoteForTagsSimple(note) {
  if (!note) return Object.fromEntries(Object.keys(VOCAB).map(k => [k, []]));

  const lower = note.toLowerCase();
  const result = Object.fromEntries(Object.keys(VOCAB).map(k => [k, []]));
  result.tags = [];

  for (const key in VOCAB) {
    for (const value of VOCAB[key]) {
      if (lower.includes(value.toLowerCase())) {
        result[key].push(value);
        result.tags.push(value);
      }
    }
  }

  return result;
}

/* -----------------------------
   MINIATURE (TikTok + YouTube + NoEmbed)
----------------------------- */

async function fetchThumbnailUrl(url) {
  if (!url) return null;

  try {
    const lower = url.toLowerCase();

    // 1) TikTok → oEmbed officiel
    if (lower.includes("tiktok.com")) {
      try {
        const endpoint = `https://www.tiktok.com/oembed?url=${encodeURIComponent(
          url
        )}`;
        const resp = await fetch(endpoint);
        if (resp.ok) {
          const data = await resp.json();
          if (data.thumbnail_url) return data.thumbnail_url;
        }
      } catch (e) {
        console.error("Erreur TikTok oEmbed:", e);
      }
    }

    // 2) YouTube
    const ytMatch = lower.match(
      /(?:youtube\.com\/watch\?v=|youtu\.be\/)([a-z0-9_-]+)/i
    );
    if (ytMatch) {
      return `https://img.youtube.com/vi/${ytMatch[1]}/hqdefault.jpg`;
    }

    // 3) NoEmbed fallback
    const endpoint = `https://noembed.com/embed?url=${encodeURIComponent(url)}`;
    const resp = await fetch(endpoint);
    if (resp.ok) {
      const data = await resp.json();
      if (data.thumbnail_url) return data.thumbnail_url;
    }

    // 4) Fallback image directe
    if (/\.(jpg|jpeg|png|gif|webp)$/i.test(lower)) return url;

    return null;
  } catch (err) {
    console.error("Erreur fetchThumbnailUrl:", err);
    return null;
  }
}

/* -----------------------------
   PARSE BODY SLACK
----------------------------- */

function parseSlackBody(req) {
  return new Promise((resolve, reject) => {
    let body = "";
    req.on("data", chunk => (body += chunk.toString()));
    req.on("end", () => resolve(querystring.parse(body)));
    req.on("error", reject);
  });
}

/* -----------------------------
   HANDLER HTTP PRINCIPAL
----------------------------- */

export default async function handler(req, res) {
  if (req.method !== "POST") {
    res.status(405).json({ error: "Method not allowed" });
    return;
  }

  try {
    const params = await parseSlackBody(req);
    const { command, text, user_name } = params;

    if (command === "/addref") {
      return await handleAddRef({ text, user_name, res });
    }

    return sendSlack(res, {
      response_type: "ephemeral",
      text: "Commande inconnue.",
    });
  } catch (err) {
    console.error("BOT ERROR:", err);
    return sendSlack(res, {
      response_type: "ephemeral",
      text: `❌ Erreur côté bot : ${err.message}`,
    });
  }
}

/* -----------------------------
   /addref — LOGIQUE PRINCIPALE
----------------------------- */

async function handleAddRef({ text, user_name, res }) {
  const raw = (text || "").trim();

  // Si vide
  if (!raw) {
    return sendSlack(res, {
      response_type: "ephemeral",
      text: "Utilisation : `/addref URL [description]`",
    });
  }

  // URL détectée
  const url = (raw.match(/https?:\/\/\S+/) || [null])[0];

  // Note = texte sans URL
  const note = url ? raw.replace(url, "").trim() : raw;

  // Numéro auto
  const index = await getNextIndexNumber();

  // IA classification
  const ai = await analyzeWithOpenAI({ note, url, index });
  const type = ai.type || "Référence";
  const formatLabel = ai.formatLabel || "Vertical";
  const theme = ai.theme || "Générique";

  const title = `${type} ${formatLabel} ${theme} ${index}`;

  const description =
    ai.description ||
    `${note || "Aucune description."}\n\nAjouté par ${user_name}.`;

  // Auto-tags basés sur ton vocabulaire
  const auto = analyzeNoteForTagsSimple(note);

  let styleDA = [...(auto.styleDA || [])];
  if (!styleDA.includes(theme)) styleDA.push(theme);

  let tags = [...(auto.tags || [])];
  if (!tags.includes(theme)) tags.push(theme);

  // Miniature automatique
  const thumbnail = await fetchThumbnailUrl(url);

  // Envoi dans Notion
  await createReferencePage({
    title,
    url,
    description,
    tags,
    format: auto.format,
    typeContenu: auto.typeContenu,
    miseEnScene: auto.miseEnScene,
    styleDA,
    styleTypo: auto.styleTypo,
    montageMotion: auto.montageMotion,
    objectif: auto.objectif,
    ambiance: auto.ambiance,
    effets: auto.effets,
    idInterne: "",
    thumbnail,
  });

  // Réponse enrichie dans Slack
  const tagsPreview =
    tags.length > 0 ? tags.slice(0, 6).join(", ") : "Aucun tag détecté";

  const blocks = [
    {
      type: "section",
      text: {
        type: "mrkdwn",
        text: `✅ *Référence ajoutée* par *${user_name}*`,
      },
    },
    {
      type: "section",
      fields: [
        { type: "mrkdwn", text: `*Titre*\n${title}` },
        { type: "mrkdwn", text: `*URL*\n${url || "_(non fournie)_"}` },
        {
          type: "mrkdwn",
          text: `*Type / Format / Thème*\n${type} / ${formatLabel} / ${theme}`,
        },
        {
          type: "mrkdwn",
          text: `*Tags détectés*\n${tagsPreview}`,
        },
      ],
    },
  ];

  return sendSlack(res, {
    response_type: "ephemeral",
    text: "Référence ajoutée.",
    blocks,
  });
}

/* -----------------------------
   UTIL SLACK
----------------------------- */

function sendSlack(res, payload) {
  res.statusCode = 200;
  res.setHeader("Content-Type", "application/json");
  return res.end(JSON.stringify(payload));
}
