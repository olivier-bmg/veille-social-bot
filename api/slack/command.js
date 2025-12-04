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
   IA : ANALYSE DES TAGS
----------------------------- */

async function analyzeNoteForTags(note) {
  if (!note || !note.trim()) {
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

  const prompt = `
Tu es un assistant de direction artistique spécialisé social media.
On te donne une courte description, tu dois classifier dans plusieurs catégories.
Tu dois utiliser UNIQUEMENT les tags autorisés.

FORMAT :
vertical, horizontal, carré, carrousel, story, reel, shorts, 16:9, 9:16, 1:1

TYPE DE CONTENU :
incarné, facecam, interview, narration, tutoriel, storytelling, démonstration, comparatif, réaction, FAQ,
expérience sociale, making-of, challenge, podcast, ASMR, review, témoignage, UGC, présentation produit,
teaser, annonce, humoristique, informatif, éducatif

MISE EN SCÈNE :
fond vert, fond simple, fond décor réel, en mouvement, multicam, plan fixe, gros plan, plan large,
split screen, duo, voix off, face reveal, POV, maincam

STYLE DA :
rétro, futuriste, brutaliste, doodle, cartoon, flat design, 3D render, cyberpunk, corporate clean,
editorial, pop culture, tech / UI, organic, premium, grunge, minimaliste, photojournalisme,
duotone, monochrome, vintage, Y2K, Pinterest aesthetic, moodboard

STYLE TYPO :
bold typography, typo condensée, typo géométrique, typo serif, typo manuscrite,
titre oversized, typographie découpée, typographie superposée, typographie minimaliste

MONTAGE / MOTION :
jumpcut, cuts rapides, transition dynamique, transition créative, titrage animé, sous-titres dynamiques,
motion design, animations 2D, zooms rapides, effets glitch, effets VHS, slow motion, hyperlapse, loop,
b-roll, cutaways

OBJECTIF :
branding, awareness, conversion, promo, teasing, éducation, onboarding, recrutement,
tuto produit, storytelling marque, social proof, top 3, top 5, news

AMBIANCE :
chaud, froid, pastel, néon, saturé, désaturé, noir et blanc, contrasté, sombre, lumineux,
color grading ciné, naturel, vibrant, flash colors

EFFETS :
grain film, texture papier, texture bruit, ombres portées, reflets, stickers,
formes géométriques, dégradés, bandes VHS, filtres vintage, halos lumineux,
contours blancs, double exposition, transparences

Réponds uniquement en JSON valide, pas de texte.

Description : "${note}"
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
    console.error("Erreur analyse IA:", err);
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
        text: "🔎 La recherche sera activée plus tard.",
      });
    }

    return sendSlack(res, {
      response_type: "ephemeral",
      text: "Commande inconnue.",
    });
  } catch (err) {
    console.error("BOT ERROR:", err);
    return sendSlack(res, {
      response_type: "ephemeral",
      text: `❌ Erreur côté bot : ${err?.message || err}`,
    });
  }
}

/* -----------------------------
        /addref (amélioré)
----------------------------- */

async function handleAddRef({ text, user_name, res }) {
  const raw = (text || "").trim();

  if (!raw) {
    return sendSlack(res, {
      response_type: "ephemeral",
      text: "Utilisation : `/addref URL description`",
    });
  }

  // 1) détecter l'URL (n'importe où dans la phrase)
  const urlMatch = raw.match(/https?:\/\/\S+/);
  const url = urlMatch ? urlMatch[0] : null;

  // 2) note = ce qui n'est pas l'URL
  const note = url ? raw.replace(url, "").trim() : raw;

  // 3) Title = note courte ou fallback
  const title =
    (note && note.length > 0 ? note.slice(0, 80) : url ? `Référence : ${url}` : "Référence ajoutée");

  // 4) Description complète
  const description =
    (note && note.length > 0 ? note : "Référence ajoutée sans description.") +
    `\n\nAjouté par ${user_name} depuis Slack.`;

  // 5) Analyse IA
  const auto = await analyzeNoteForTags(note);

  // 6) Création de la page Notion
  await createReferencePage({
    title,
    url,
    description,
    tags: auto.tags,
    format: auto.format,
    typeContenu: auto.typeContenu,
    miseEnScene: auto.miseEnScene,
    styleDA: auto.styleDA,
    styleTypo: auto.styleTypo,
    montageMotion: auto.montageMotion,
    objectif: auto.objectif,
    ambiance: auto.ambiance,
    effets: auto.effets,
    idInterne: "",
  });

  // 7) Slack confirmation
  return sendSlack(res, {
    response_type: "ephemeral",
    text: `✅ Référence ajoutée par *${user_name}*\n*Titre* : ${title}\n${url ? "URL : " + url : ""}`,
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
