// lib/openai.js
import OpenAI from "openai";

const client = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

// 1) Créer un embedding pour un texte
export async function embedText(text) {
  const cleaned = (text || "").slice(0, 8000); // sécurité pour la longueur
  const response = await client.embeddings.create({
    model: "text-embedding-3-large",
    input: cleaned,
  });

  return response.data[0].embedding;
}

// 2) Analyser une référence (URL + note éventuelle) et produire des métadonnées
export async function analyzeReference({ url, userNote }) {
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

  const completion = await client.chat.completions.create({
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

