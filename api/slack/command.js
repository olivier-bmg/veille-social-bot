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

async function analyzeReference({ url, userNote }) {
  const prompt = `
Tu es un assistant de curation social media pour une agence.
On te donne :
- une URL (contenu social, vidéo ou visuel)
- éventuellement une note écrite par l'utilisateur

Tu dois renvoyer un objet JSON avec les champs EXACTS suivants :
{
  "title": "...",
  "description": "...",
  "tags": ["tag1","tag2",...],
  "format": ["vertical" ou "horizontal" ou "carré" ou "carrousel" ou "story" ou "reel" ou "shorts"],
  "styleVisuel": ["..."],
  "couleursMood": ["..."],
  "elementsGraphiques": ["..."],
  "structureNarration": ["..."],
  "usage": ["..."]
}

CONTRAINTES :
- Les "tags" doivent être choisis UNIQUEMENT parmi cette liste (si pertinent) :

incarné, facecam, interview, narration, tutoriel, storytelling, démonstration, comparatif, réaction, FAQ, expérience sociale, making-of, challenge, podcast, ASMR, review, témoignage, UGC, présentation produit, teaser, annonce, humoristique, informatif, éducatif, fond vert, fond simple, fond décor réel, en mouvement, multicam, plan fixe, gros plan, plan large, split screen, duo, voix off, face reveal, POV, maincam, jumpcut, cuts rapides, transition dynamique, transition créative, titrage animé, sous-titres dynamiques, motion design, animations 2D, zooms rapides, effets glitch, effets VHS, slow motion, hyperlapse, loop, b-roll, cutaways, bold typography, typo condensée, typo géométrique, typo serif, typo manuscrite, titre oversized, typographie découpée, typographie superposée, typographie minimaliste, composition centrée, composition diagonale, composition asymétrique, composition en grille, composition minimaliste, composition maximaliste, overlay texte sur image, full photo, full typographique, cutout style, collage, rétro, futuriste, brutaliste, doodle, cartoon, flat design, 3D render, cyberpunk, corporate clean, editorial, pop culture, tech / UI, organic, premium, grunge, minimaliste, photojournalisme, duotone, monochrome, vintage, Y2K, Pinterest aesthetic, moodboard, chaud, froid, pastel, néon, saturé, désaturé, noir et blanc, contrasté, sombre, lumineux, color grading ciné, naturel, vibrant, flash colors, grain film, texture papier, texture bruit, ombres portées, reflets, stickers, formes géométriques, dégradés, bandes VHS, filtres vintage, halos lumineux, contours blancs, double exposition, transparences, branding, awareness, conversion, promo, teasing, éducation, onboarding, recrutement, tuto produit, storytelling marque, social proof, top 3, top 5, news, hook fort, CTA final, CTA mid, avant/après, transformation, reveal, découpage en étapes, rythme rapide, rythme lent, haute résolution, low-fi, UGC-style, live action, screen recording, photo shoot, selfie mode, caméra externe, téléphone, stabilisé, non stabilisé

Si tu ne sais pas, tu laisses le tableau vide ([]).

URL : ${url}
Note utilisateur : ${userNote || "(aucune)"}
  `;

  const completion = await openai.chat.completions.create({
    model: "gpt-4o-mini",
    response_format: { type: "json_object" },
    messages: [
      { role: "system", content: "Tu renvoies toujours un JSON valide et rien d'autre." },
      { role: "user", content: prompt },
    ],
  });

  const content = completion.choices[0].message.content;
  const parsed = JSON.parse(content);

  return {
    title: parsed.title || "Référence sans titre",
    description: parsed.description || "",
    tags: parsed.tags || [],
    format: parsed.format || [],
    styleVisuel: parsed.styleVisuel || [],
    couleursMood: parsed.couleursMood || [],
    elementsGraphiques: parsed.elementsGraphiques || [],
    structureNarration: parsed.structureNarration || [],
    usage: parsed.usage || [],
  };
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
  const res = await index.query({
    topK,
    vector: embedding,
    includeMetadata: true,
  });
  return res;
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

    if (!command) {
      return sendSlack(res, {
        response_type: "ephemeral",
        text: "Commande Slack non reconnue.",
      });
    }

    if (command === "/addref") {
      await handleAddRef({ text, user_name, res });
    } else if (command === "/ref") {
      await handleSearch({ text, user_name, res });
    } else {
      sendSlack(res, {
        response_type: "ephemeral",
        text: "Commande non gérée pour l’instant.",
      });
    }
  } catch (err) {
    console.error(err);
    sendSlack(res, {
      response_type: "ephemeral",
      text: "❌ Erreur côté bot. Vérifie les logs Vercel.",
    });
  }
}

// ---------- LOGIQUE /addref ----------

async function handleAddRef({ text, user_name, res }) {
  const raw = (text || "").trim();
  if (!raw) {
    sendSlack(res, {
      response_type: "ephemeral",
      text: "Utilisation : `/addref URL [description facultative]`",
    });
    return;
  }

  const [url, ...rest] = raw.split(/\s+/);
  const userNote = rest.join(" ");

  const analysis = await analyzeReference({ url, userNote });

  const pageId = await createReferencePage({
    ...analysis,
    url,
  });

  const textForEmbedding = [
    analysis.title,
    analysis.description,
    (analysis.tags || []).join(", "),
  ]
    .filter(Boolean)
    .join("\n");

  const embedding = await embedText(textForEmbedding);

  await upsertReferenceVector({
    id: pageId,
    embedding,
    metadata: {
      title: analysis.title,
      url,
      description: analysis.description,
      tags: analysis.tags,
      format: analysis.format,
    },
  });

  sendSlack(res, {
    response_type: "ephemeral",
    text: `✅ Référence ajoutée par *${user_name}*\n*${analysis.title}*\n${url}\nTags : ${(analysis.tags || []).join(", ")}`,
  });
}

// ---------- LOGIQUE /ref ----------

async function handleSearch({ text, user_name, res }) {
  const query = (text || "").trim();
  if (!query) {
    sendSlack(res, {
      response_type: "ephemeral",
      text: "Utilisation : \`/ref ta recherche\` (ex: \`contenu vertical incarné fond vert\`)",
    });
    return;
  }

  const embedding = await embedText(query);
  const results = await searchSimilar({ embedding, topK: 5 });

  if (!results.matches || results.matches.length === 0) {
    sendSlack(res, {
      response_type: "ephemeral",
      text: `Aucune référence trouvée pour : _${query}_`,
    });
    return;
  }

  const top3 = results.matches.slice(0, 3);

  const blocks = [];

  blocks.push({
    type: "section",
    text: {
      type: "mrkdwn",
      text: `🔎 Résultats pour : *${query}* (demandé par *${user_name}*)`,
    },
  });

  blocks.push({ type: "divider" });

  for (const match of top3) {
    const m = match.metadata || {};
    const title = m.title || "Sans titre";
    const url = m.url || "";
    const description = m.description || "";
    const tags = Array.isArray(m.tags) ? m.tags.join(", ") : "";

    blocks.push({
      type: "section",
      text: {
        type: "mrkdwn",
        text: `*${title}*\n${description}\n${url ? `<${url}|Voir le contenu>` : ""}\n${tags ? `*Tags* : ${tags}` : ""}`,
      },
    });

    blocks.push({ type: "divider" });
  }

  sendSlack(res, {
    response_type: "ephemeral",
    blocks,
  });
}

// ---------- UTIL ----------

function sendSlack(res, payload) {
  res.statusCode = 200;
  res.setHeader("Content-Type", "application/json");
  res.end(JSON.stringify(payload));
}
