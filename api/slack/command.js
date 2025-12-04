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
   IA : ANALYSE (OPTION B)
----------------------------- */

async function analyzeWithOpenAI({ note, url }) {
  const safeNote = (note || "").slice(0, 8000);
  const safeUrl = url || "";

  const prompt = `
Tu es un assistant senior en direction artistique social media.
On te donne :
- une URL de contenu (TikTok, Reels, Shorts, etc.)
- une courte description écrite par le créatif

À partir de ces infos, tu dois proposer :
- un Titre concis et pertinent pour la référence
- une Description courte (1 à 3 phrases) qui résume le contenu
- des tags répartis dans des catégories précises

Tu dois choisir uniquement parmi les listes ci-dessous.

FORMAT (clé: "format") :
["vertical", "horizontal", "carré", "carrousel", "story", "reel", "shorts", "16:9", "9:16", "1:1"]

TYPE DE CONTENU (clé: "typeContenu") :
["incarné", "facecam", "interview", "narration", "tutoriel", "storytelling", "démonstration", "comparatif",
 "réaction", "FAQ", "expérience sociale", "making-of", "challenge", "podcast", "ASMR", "review", "témoignage",
 "UGC", "présentation produit", "teaser", "annonce", "humoristique", "informatif", "éducatif"]

MISE EN SCÈNE / CADRAGE (clé: "miseEnScene") :
["fond vert", "fond simple", "fond décor réel", "en mouvement", "multicam", "plan fixe", "gros plan", "plan large",
 "split screen", "duo", "voix off", "face reveal", "POV", "maincam"]

STYLE DA (clé: "styleDA") :
["rétro", "futuriste", "brutaliste", "doodle", "cartoon", "flat design", "3D render", "cyberpunk", "corporate clean",
 "editorial", "pop culture", "tech / UI", "organic", "premium", "grunge", "minimaliste", "photojournalisme",
 "duotone", "monochrome", "vintage", "Y2K", "Pinterest aesthetic", "moodboard"]

STYLE TYPO (clé: "styleTypo") :
["bold typography", "typo condensée", "typo géométrique", "typo serif", "typo manuscrite",
 "titre oversized", "typographie découpée", "typographie superposée", "typographie minimaliste"]

MONTAGE / MOTION (clé: "montageMotion") :
["jumpcut", "cuts rapides", "transition dynamique", "transition créative", "titrage animé", "sous-titres dynamiques",
 "motion design", "animations 2D", "zooms rapides", "effets glitch", "effets VHS", "slow motion", "hyperlapse", "loop",
 "b-roll", "cutaways"]

OBJECTIF (clé: "objectif") :
["branding", "awareness", "conversion", "promo", "teasing", "éducation", "onboarding", "recrutement",
 "tuto produit", "storytelling marque", "social proof", "top 3", "top 5", "news"]

AMBIANCE (clé: "ambiance") :
["chaud", "froid", "pastel", "néon", "saturé", "désaturé", "noir et blanc", "contrasté", "sombre", "lumineux",
 "color grading ciné", "naturel", "vibrant", "flash colors"]

EFFETS (clé: "effets") :
["grain film", "texture papier", "texture bruit", "ombres portées", "reflets", "stickers",
 "formes géométriques", "dégradés", "bandes VHS", "filtres vintage", "halos lumineux",
 "contours blancs", "double exposition", "transparences"]

TAGS GLOBAUX (clé: "tags") :
- tu peux réutiliser certains éléments ci-dessus pour que la recherche soit plus simple.

CONTRAINTES :
- Si tu n'es pas sûr pour une catégorie, renvoie un tableau vide [] pour cette catégorie.
- Utilise tes connaissances sur les formats social media (par ex : TikTok → vertical, souvent facecam, etc.).
- Réponds UNIQUEMENT en JSON valide, au format :

{
  "title": "…",
  "description": "…",
  "tags": ["…", "..."],
  "format": ["…"],
  "typeContenu": ["…"],
  "miseEnScene": ["…"],
  "styleDA": ["…"],
  "styleTypo": ["…"],
  "montageMotion": ["…"],
  "objectif": ["…"],
  "ambiance": ["…"],
  "effets": ["…"]
}

URL du contenu :
${safeUrl || "(aucune URL fournie)"}

Description du créatif :
${safeNote || "(aucune description fournie)"}
`;

  const completion = await openai.chat.completions.create({
    model: "gpt-4o-mini",
    response_format: { type: "json_object" },
    messages: [
      {
        role: "system",
        content: "Tu es un assistant de tagging créatif. Tu renvoies uniquement du JSON valide.",
      },
      { role: "user", content: prompt },
    ],
  });

  const raw = completion.choices[0]?.message?.content || "{}";
  let parsed;
  try {
    parsed = JSON.parse(raw);
  } catch (e) {
    console.error("Erreur de parse JSON OpenAI:", e, raw);
    parsed = {};
  }

  return {
    title: parsed.title || null,
    description: parsed.description || null,
    tags: parsed.tags || [],
    format: parsed.format || [],
    typeContenu: parsed.typeContenu || [],
    miseEnScene: parsed.miseEnScene || [],
    styleDA: parsed.styleDA || [],
    styleTypo: parsed.styleTypo || [],
    montageMotion: parsed.montageMotion || [],
    objectif: parsed.objectif || [],
    ambiance: parsed.ambiance || [],
    effets: parsed.effets || [],
  };
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
      return sendSlack(res, {
        response_type: "ephemeral",
        text: "🔎 La recherche `/ref` sera activée dans une prochaine étape. Pour l'instant, utilise `/addref`.",
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
        /addref (avec IA)
----------------------------- */

async function handleAddRef({ text, user_name, res }) {
  const raw = (text || "").trim();

  if (!raw) {
    return sendSlack(res, {
      response_type: "ephemeral",
      text: "Utilisation : `/addref URL [description]`",
    });
  }

  // 1) On détecte l’URL où qu’elle soit
  const urlMatch = raw.match(/https?:\/\/\S+/);
  const url = urlMatch ? urlMatch[0] : null;

  // 2) Note = tout le texte sans l’URL
  const note = url ? raw.replace(url, "").trim() : raw;

  // 3) Appel à OpenAI pour enrichir la ref
  let ai;
  try {
    ai = await analyzeWithOpenAI({ note, url });
  } catch (e) {
    console.error("Erreur OpenAI (analyzeWithOpenAI):", e);
    ai = {};
  }

  const title =
    ai.title ||
    (note && note.length > 0
      ? note.slice(0, 80)
      : url
      ? `Référence : ${url}`
      : "Référence ajoutée via /addref");

  const description =
    ai.description ||
    ((note && note.length > 0 ? note : "Référence ajoutée sans description.") +
      `\n\nAjouté par ${user_name} depuis Slack.`);

  // 4) Création de la page Notion avec les infos IA
  await createReferencePage({
    title,
    url,
    description,
    tags: ai.tags || [],
    format: ai.format || [],
    typeContenu: ai.typeContenu || [],
    miseEnScene: ai.miseEnScene || [],
    styleDA: ai.styleDA || [],
    styleTypo: ai.styleTypo || [],
    montageMotion: ai.montageMotion || [],
    objectif: ai.objectif || [],
    ambiance: ai.ambiance || [],
    effets: ai.effets || [],
    idInterne: "",
  });

  // 5) Réponse Slack
  return sendSlack(res, {
    response_type: "ephemeral",
    text:
      "✅ Référence ajoutée par *" +
      user_name +
      "*\n*Titre évalué par l’IA* : " +
      title +
      (url ? "\nURL : " + url : ""),
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
