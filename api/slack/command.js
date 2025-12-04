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

  const page = await notion.pages.create({
    parent: { database_id: databaseId },
    properties: {
      Title: {
        title: [{ text: { content: title || "Référence sans titre" } }],
      },

      URL: { url: url || null },

      // ✔️ Ta nouvelle colonne de miniature
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

  return page.id;
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
    const n = count + 1;
    return n.toString().padStart(2, "0");
  } catch (e) {
    console.error("Erreur getNextIndexNumber:", e);
    return "01";
  }
}

/* -----------------------------
   IA : TYPE / FORMAT / THEME
----------------------------- */

async function analyzeWithOpenAI({ note, url, index }) {
  const safeNote = (note || "").slice(0, 1000);
  const safeUrl = url || "";

  const prompt = `
Tu es un assistant expert en classification de contenus social media.

Objectifs :
1) "type" = UGC, Incarné, Facecam, Tutoriel, Podcast, etc.
2) "formatLabel" = Vertical, Horizontal, Carré, Reel, Shorts, etc.
3) "theme" = Lifestyle, Produit, Corporate, Tech, Humour, Beauté, Mode, etc.
4) "description" = résumé en 1–2 phrases max (pas un slogan).

⚙️ Le titre final sera généré ensuite comme :
"<type> <formatLabel> <theme> ${index}"
Ne renvoie pas de numéro dans tes données.

📄 FORMAT DE SORTIE STRICT (JSON) :
{
  "type": "...",
  "formatLabel": "...",
  "theme": "...",
  "description": "..."
}

Note :
${safeNote}

URL :
${safeUrl}
`;

  try {
    const completion = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      response_format: { type: "json_object" },
      messages: [
        {
          role: "system",
          content: "Tu renvoies uniquement du JSON valide.",
        },
        { role: "user", content: prompt },
      ],
    });

    const raw = completion.choices[0]?.message?.content || "{}";

    let parsed = {};
    try {
      parsed = JSON.parse(raw);
    } catch (e) {
      console.error("Erreur parse JSON OpenAI:", e, raw);
    }

    return {
      type: parsed.type || null,
      formatLabel: parsed.formatLabel || null,
      theme: parsed.theme || null,
      description: parsed.description || null,
    };
  } catch (err) {
    console.error("Erreur OpenAI :", err);
    return { type: null, formatLabel: null, theme: null, description: null };
  }
}

/* -----------------------------
   AUTO-TAGS (VOCAB)
----------------------------- */

const VOCAB = {
  format: [
    "vertical",
    "horizontal",
    "carré",
    "carrousel",
    "story",
    "reel",
    "shorts",
    "16:9",
    "9:16",
    "1:1",
  ],
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
    "ASMR",
    "review",
    "témoignage",
    "UGC",
    "présentation produit",
    "teaser",
    "annonce",
    "humoristique",
    "informatif",
    "éducatif",
  ],
  miseEnScene: [
    "fond vert",
    "fond simple",
    "fond décor réel",
    "en mouvement",
    "multicam",
    "plan fixe",
    "gros plan",
    "plan large",
    "split screen",
    "duo",
    "voix off",
    "face reveal",
    "POV",
    "maincam",
  ],
  styleDA: [
    "rétro",
    "futuriste",
    "brutaliste",
    "doodle",
    "cartoon",
    "flat design",
    "3D render",
    "cyberpunk",
    "corporate clean",
    "editorial",
    "pop culture",
    "tech / UI",
    "tech",
    "organic",
    "premium",
    "grunge",
    "minimaliste",
    "photojournalisme",
    "duotone",
    "monochrome",
    "vintage",
    "Y2K",
    "Pinterest aesthetic",
    "moodboard",
  ],
  styleTypo: [
    "bold typography",
    "typo condensée",
    "typo géométrique",
    "typo serif",
    "typo manuscrite",
    "titre oversized",
    "typographie découpée",
    "typographie superposée",
    "typographie minimaliste",
  ],
  montageMotion: [
    "jumpcut",
    "cuts rapides",
    "transition dynamique",
    "transition créative",
    "titrage animé",
    "sous-titres dynamiques",
    "motion design",
    "animations 2D",
    "zooms rapides",
    "effets glitch",
    "effets VHS",
    "slow motion",
    "hyperlapse",
    "loop",
    "b-roll",
    "cutaways",
  ],
  objectif: [
    "branding",
    "awareness",
    "conversion",
    "promo",
    "teasing",
    "éducation",
    "onboarding",
    "recrutement",
    "tuto produit",
    "storytelling marque",
    "social proof",
    "top 3",
    "top 5",
    "news",
  ],
  ambiance: [
    "chaud",
    "froid",
    "pastel",
    "néon",
    "saturé",
    "désaturé",
    "noir et blanc",
    "contrasté",
    "sombre",
    "lumineux",
    "color grading ciné",
    "naturel",
    "vibrant",
    "flash colors",
  ],
  effets: [
    "grain film",
    "texture papier",
    "texture bruit",
    "ombres portées",
    "reflets",
    "stickers",
    "formes géométriques",
    "dégradés",
    "bandes VHS",
    "filtres vintage",
    "halos lumineux",
    "contours blancs",
    "double exposition",
    "transparences",
  ],
};

function analyzeNoteForTagsSimple(note) {
  if (!note) {
    return {
      tags: [],
      format: [],
      typeContenu: [],
      miseEnScene: [],
      styleDA: [],
      styleTypo: [],
      montageMotion: [],
      objectif: [],
      ambiance: [],
      effets: [],
    };
  }

  const text = note.toLowerCase();

  const result = {
    tags: [],
    format: [],
    typeContenu: [],
    miseEnScene: [],
    styleDA: [],
    styleTypo: [],
    montageMotion: [],
    objectif: [],
    ambiance: [],
    effets: [],
  };

  function match(catKey, list) {
    for (const v of list) {
      if (text.includes(v.toLowerCase())) {
        result[catKey].push(v);
        result.tags.push(v);
      }
    }
  }

  match("format", VOCAB.format);
  match("typeContenu", VOCAB.typeContenu);
  match("miseEnScene", VOCAB.miseEnScene);
  match("styleDA", VOCAB.styleDA);
  match("styleTypo", VOCAB.styleTypo);
  match("montageMotion", VOCAB.montageMotion);
  match("objectif", VOCAB.objectif);
  match("ambiance", VOCAB.ambiance);
  match("effets", VOCAB.effets);

  for (const key of Object.keys(result)) {
    if (Array.isArray(result[key])) result[key] = [...new Set(result[key])];
  }

  return result;
}

/* -----------------------------
   MINIATURE VIA NOEMBED
----------------------------- */

async function fetchThumbnailUrl(url) {
  if (!url) return null;
  try {
    const endpoint = `https://noembed.com/embed?url=${encodeURIComponent(url)}`;
    const resp = await fetch(endpoint);
    if (!resp.ok) return null;
    const data = await resp.json();
    return data.thumbnail_url || null;
  } catch (e) {
    console.error("Erreur fetchThumbnailUrl:", e);
    return null;
  }
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
        /addref (Slack)
----------------------------- */

async function handleAddRef({ text, user_name, res }) {
  const raw = (text || "").trim();

  if (!raw) {
    return sendSlack(res, {
      response_type: "ephemeral",
      text: "Utilisation : `/addref URL [description]`",
    });
  }

  // 1) Détection URL
  const urlMatch = raw.match(/https?:\/\/\S+/);
  const url = urlMatch ? urlMatch[0] : null;

  // 2) Texte sans l'URL
  const note = url ? raw.replace(url, "").trim() : raw;

  // 3) Index auto
  const index = await getNextIndexNumber();

  // 4) IA
  const ai = await analyzeWithOpenAI({ note, url, index });

  const type = ai.type || "Référence";
  const formatLabel = ai.formatLabel || "Vertical";
  const theme = ai.theme || "Générique";

  const title = `${type} ${formatLabel} ${theme} ${index}`;

  const description =
    ai.description ||
    ((note && note.length > 0 ? note : "Référence ajoutée sans description.") +
      `\n\nAjouté par ${user_name} depuis Slack.`);

  // 5) Auto-tags
  const auto = analyzeNoteForTagsSimple(note);

  // Style DA = vocab IA + thème IA
  let styleDA = [...(auto.styleDA || [])];
  if (theme && !styleDA.includes(theme)) styleDA.push(theme);

  let tags = [...(auto.tags || [])];
  if (theme && !tags.includes(theme)) tags.push(theme);

  // 6) Miniature
  const thumbnail = await fetchThumbnailUrl(url);

  // 7) Envoi dans Notion
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

  // 8) Réponse Slack
  const tagsPreview =
    tags && tags.length > 0 ? tags.slice(0, 6).join(", ") : "Aucun tag détecté";

  return sendSlack(res, {
    response_type: "ephemeral",
    blocks: [
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
          { type: "mrkdwn", text: `*URL*\n${url || "(aucune)"}` },
          {
            type: "mrkdwn",
            text: `*Type / Format / Thème*\n${type} / ${formatLabel} / ${theme}`,
          },
          { type: "mrkdwn", text: `*Tags détectés*\n${tagsPreview}` },
        ],
      },
    ],
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
