// api/notion/enrich.js

import OpenAI from "openai";
import { Client as NotionClient } from "@notionhq/client";

/**
 * CONFIG
 */
const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

const notion = new NotionClient({
  auth: process.env.NOTION_API_KEY,
});

const databaseId = process.env.NOTION_DATABASE_ID;

// Combien de pages analyser par appel (évite les timeouts Vercel)
const BATCH_SIZE = 5;

/**
 * Helpers
 */

function getPlainTextFromRichText(richArray) {
  if (!Array.isArray(richArray)) return "";
  return richArray.map((r) => r.plain_text || "").join(" ").trim();
}

function toMultiSelect(values) {
  if (!values || !Array.isArray(values)) return [];
  return values
    .filter((v) => typeof v === "string" && v.trim().length > 0)
    .map((name) => ({ name: name.trim() }));
}

/**
 * Appelé par Vercel : /api/notion/enrich
 */
export default async function handler(req, res) {
  // Tu peux autoriser GET + POST selon ton besoin
  if (req.method !== "GET" && req.method !== "POST") {
    res.status(405).json({ error: "Method not allowed" });
    return;
  }

  try {
    // 1) On récupère les pages avec smart analyze = true
    const toProcess = await notion.databases.query({
      database_id: databaseId,
      page_size: BATCH_SIZE,
      filter: {
        property: "smart analyze",
        checkbox: {
          equals: true,
        },
      },
    });

    if (!toProcess.results || toProcess.results.length === 0) {
      res.status(200).json({ message: "Aucune page à enrichir ✅" });
      return;
    }

    const enrichedIds = [];

    // 2) On traite chaque page
    for (const page of toProcess.results) {
      const pageId = page.id;

      try {
        await enrichSinglePage(page);
        enrichedIds.push(pageId);
      } catch (err) {
        console.error("Erreur enrichissement page", pageId, err);
        // On continue avec les autres
      }
    }

    res.status(200).json({
      message: `Enrichissement terminé`,
      enrichedCount: enrichedIds.length,
      pageIds: enrichedIds,
    });
  } catch (err) {
    console.error("Erreur handler /api/notion/enrich:", err);
    res.status(500).json({ error: err.message });
  }
}

/**
 * Enrichit UNE page Notion avec tous les tags
 */
async function enrichSinglePage(page) {
  const props = page.properties || {};

  // On récupère le titre et la description
  const titleProp = props["Title"];
  const descProp = props["Description"]; // ← Attention : "Description" avec D majuscule

  const title =
    getPlainTextFromRichText(titleProp?.title || []) || "Sans titre";
  const description = getPlainTextFromRichText(
    descProp?.rich_text || descProp?.title || []
  );

  // URL : selon ton Notion ça peut être "url" ou "URL"
  const urlProp = props["url"] || props["URL"];
  const url = urlProp?.url || "";

  // Texte de base pour l'IA : titre + description
  const baseText = [title, description].filter(Boolean).join(" — ");

  // 1) Appel OpenAI pour générer les tags
  const analysis = await analyzeContentWithOpenAI({
    title,
    description,
    url,
    baseText,
  });

  // 2) Construction des propriétés pour Notion
  const updateProps = {
    // Format (multi-select)
    Format: {
      multi_select: toMultiSelect(analysis.format),
    },
    "Type de contenu": {
      multi_select: toMultiSelect(analysis.type_de_contenu),
    },
    Thème: {
      multi_select: toMultiSelect(analysis.theme),
    },
    "Style visuel": {
      multi_select: toMultiSelect(analysis.style_visuel),
    },
    "mise en scène": {
      multi_select: toMultiSelect(analysis.mise_en_scene),
    },
    "Effets montage": {
      multi_select: toMultiSelect(analysis.effets_montage),
    },
    Ambiance: {
      multi_select: toMultiSelect(analysis.ambiance),
    },
    Objectif: {
      multi_select: toMultiSelect(analysis.objectif),
    },
    // On considère que la page est traitée
    "smart analyze": {
      checkbox: false,
    },
  };

  // 3) Mise à jour Notion
  await notion.pages.update({
    page_id: page.id,
    properties: updateProps,
  });
}

/**
 * Appelle OpenAI pour analyser le contenu et renvoyer des tags.
 * On travaille uniquement à partir de la description + titre (option A).
 */
async function analyzeContentWithOpenAI({ title, description, url, baseText }) {
  const safeTitle = title || "";
  const safeDesc = description || "";
  const safeUrl = url || "";

  const prompt = `
Tu es un expert en social media, direction artistique et analyse de contenus (TikTok, Reels, Shorts, posts vidéo).

L'utilisateur dispose d'une base Notion avec ces colonnes :

- Format
- Type de contenu
- Thème
- Style visuel
- mise en scène
- Effets montage
- Ambiance
- Objectif

Tu dois remplir ces colonnes avec des TAGS COURTS (1 à 3 mots), en français si possible, et compatibles avec ce vocabulaire (tu peux en inventer de nouveaux s'ils restent logiques).

IMPORTANT :
- Tu travailles à partir du titre et de la description.
- Si aucune info, laisse un tableau vide pour cette catégorie.
- Ne mets pas de doublons.
- Fais simple, pertinent, orienté usage créatif.

1) Format (tableau de strings)
Parmi par exemple :
["9:16", "16:9", "1:1", "4:5", "shorts", "reel", "story", "carrousel", "carré", "horizontal", "vertical"]
Tu peux en mettre plusieurs si nécessaire (ex : "9:16" + "vertical").

2) Type de contenu (tableau de strings)
Exemples de valeurs possibles :
["routine", "présentation produit", "react", "avant-après", "acting", "micro-trottoir", "POV", "annonce", "teaser", "ugc", "témoignage", "review", "podcast", "challenge", "making off", "expérience sociale", "faq", "réaction", "comparatif", "démonstration", "storytelling", "narration", "interview", "tuto"]
Tu peux en inventer de proches (ex: "unboxing", "mini vlog") si pertinent.

3) Thème (tableau de strings)
Exemples :
["art", "actu", "voyage", "animaux", "décoration", "maison", "bien-être", "musique", "culture", "gaming", "food", "tech", "corporate", "lifestyle", "mode", "humour", "beauté / cosmétique"]

4) Style visuel (tableau de strings)
Exemples :
["moodboard", "Pinterest aesthetic", "Y2K", "vintage", "monochrome", "duotone", "photojournalisme", "minimalisme", "grunge", "premium", "organic", "tech", "brain rot", "pop culture", "editorial", "corporate clean", "cyberpunk", "3D render", "flat design", "cartoon", "doodle", "brutaliste", "futuriste", "rétro"]

5) mise en scène (tableau de strings)
Exemples :
["campagne", "ville", "bureau", "intérieur", "extérieur", "selfie", "produit posé", "POV", "face reveal", "voix off", "duo", "split screen", "plan large", "gros plan", "plan fixe", "multicam", "en mouvement", "fond décor réel", "fond simple", "fond vert"]

6) Effets montage (tableau de strings)
Exemples :
["sticker", "loop", "hyperlapse", "slow motion", "effets vhs", "effets glitch", "zooms rapides", "animation 2D", "motion design", "sous-titres dynamiques", "jumpcut", "cuts rapides", "transition dynamique", "transition créative", "titrage animé"]

7) Ambiance (tableau de strings)
Exemples :
["flash", "vibrant", "naturel", "color grading", "lumineux", "sombre", "contrasté", "noir et blanc", "désaturé", "saturé", "néon", "pastel", "froid", "chaud"]

8) Objectif (tableau de strings)
Exemples :
["social proof", "recrutement followers", "conversion", "awareness"]

Retourne STRICTEMENT ce JSON :

{
  "format": ["..."],
  "type_de_contenu": ["..."],
  "theme": ["..."],
  "style_visuel": ["..."],
  "mise_en_scene": ["..."],
  "effets_montage": ["..."],
  "ambiance": ["..."],
  "objectif": ["..."]
}

Titre du contenu :
${safeTitle}

Description :
${safeDesc}

URL :
${safeUrl}

Texte global à analyser :
${baseText}
`;

  try {
    const completion = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      response_format: { type: "json_object" },
      messages: [
        {
          role: "system",
          content: "Tu renvoies uniquement du JSON valide, sans texte autour.",
        },
        {
          role: "user",
          content: prompt,
        },
      ],
    });

    const content = completion.choices[0]?.message?.content || "{}";
    const parsed = JSON.parse(content);

    // On sécurise les champs attendus
    return {
      format: parsed.format || [],
      type_de_contenu: parsed.type_de_contenu || [],
      theme: parsed.theme || [],
      style_visuel: parsed.style_visuel || [],
      mise_en_scene: parsed.mise_en_scene || [],
      effets_montage: parsed.effets_montage || [],
      ambiance: parsed.ambiance || [],
      objectif: parsed.objectif || [],
    };
  } catch (err) {
    console.error("Erreur OpenAI analyzeContentWithOpenAI:", err);
    // Fallback : tout vide, la page restera à traiter manuellement si besoin
    return {
      format: [],
      type_de_contenu: [],
      theme: [],
      style_visuel: [],
      mise_en_scene: [],
      effets_montage: [],
      ambiance: [],
      objectif: [],
    };
  }
}

