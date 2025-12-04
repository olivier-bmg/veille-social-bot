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

      // Tags globaux libres (tu peux les utiliser ou les ignorer)
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
   ANALYSE IA DES TAGS (OPTION A)
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
Tu es un assistant de direction artistique et de social media.
On te donne une courte description d'un contenu social (par exemple "contenu vertical incarné fond vert humour tuto").
À partir de cette description, tu dois remplir des listes de tags, en choisissant UNIQUEMENT parmi les listes suivantes.

FORMAT (Format) :
- vertical, horizontal, carré, carrousel, story, reel, shorts, 16:9, 9:16, 1:1

TYPE DE CONTENU (Type de contenu) :
- incarné, facecam, interview, narration, tutoriel, storytelling, démonstration, comparatif, réaction, FAQ,
  expérience sociale, making-of, challenge, podcast, ASMR, review, témoignage, UGC, présentation produit,
  teaser, annonce, humoristique, informatif, éducatif

MISE EN SCÈNE / CADRAGE (Mise en scène / cadrage) :
- fond vert, fond simple, fond décor réel, en mouvement, multicam, plan fixe, gros plan, plan large,
  split screen, duo, voix off, face reveal, POV, maincam

STYLE DA (Style DA) :
- rétro, futuriste, brutaliste, doodle, cartoon, flat design, 3D render, cyberpunk, corporate clean,
  editorial, pop culture, tech / UI, organic, premium, grunge, minimaliste, photojournalisme,
  duotone, monochrome, vintage, Y2K, Pinterest aesthetic, moodboard

STYLE TYPO (Style typo) :
- bold typography, typo condensée, typo géométrique, typo serif, typo manuscrite,
  titre oversized, typographie découpée, typographie superposée, typographie minimaliste

MONTAGE / MOTION (Montage / motion) :
- jumpcut, cuts rapides, transition dynamique, transition créative, titrage animé, sous-titres dynamiques,
  motion design, animations 2D, zooms rapides, effets glitch, effets VHS, slow motion, hyperlapse, loop,
  b-roll, cutaways

OBJECTIF (Objectif) :
- branding, awareness, conversion, promo, teasing, éducation, onboarding, recrutement,
  tuto produit, storytelling marque, social proof, top 3, top 5, news

AMBIANCE (Ambiance) :
- chaud, froid, pastel, néon, saturé, désaturé, noir et blanc, contrasté, sombre, lumineux,
  color grading ciné, naturel, vibrant, flash colors

EFFETS (Effets) :
- grain film, texture papier, texture bruit, ombres portées, reflets, stickers,
  formes géométriques, dégradés, bandes VHS, filtres vintage, halos lumineux,
  contours blancs, double exposition, transparences

TAGS (Tags) :
- tu peux y remettre certains éléments des listes ci-dessus, ou des mots-clés utiles, en restant simple.

IMPORTANT :
- Réponds UNIQUEMENT en JSON.
- Si tu ne sais pas, renvoie [] pour la catégorie concernée.
- Ne renvoie AUCUN texte d'explication, juste le JSON.

Description :
"${note}"
`;

  try {
    const completion = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      response_format: { type: "json_object" },
      messages: [
        {
          role: "system",
          content:
            "Tu es un assistant qui ne renvoie que du JSON valide et rien d'autre.",
        },
        { role: "user", content: prompt },
      ],
    });

    const content = completion.choices[0].message.content;
    const parsed = JSON.parse(content);

    return {
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
  } catch (err) {
    console.error("Erreur analyse IA tags:", err);
    // En cas de problème avec OpenAI, on ne bloque pas l'ajout
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
      // On activera plus tard la recherche
      return sendSlack(res, {
        response_type: "ephemeral",
        text:
          "🔎 La recherche `/ref` sera activée dans une prochaine étape. Pour l'instant, utilise `/addref` pour remplir la base.",
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

  // 🔥 Analyse IA des tags & filtres à partir de la note
  const auto = await analyzeNoteForTags(userNote);

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
