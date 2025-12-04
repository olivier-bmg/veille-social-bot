// lib/notion.js
import { Client } from "@notionhq/client";

const notion = new Client({ auth: process.env.NOTION_API_KEY });
const databaseId = process.env.NOTION_DATABASE_ID;

function toMultiSelect(values) {
  if (!values || !Array.isArray(values)) return [];
  return values.map((name) => ({ name }));
}

/**
 * props attendus :
 * {
 *   title,
 *   url,
 *   description,
 *   tags,
 *   format,
 *   styleVisuel,        // ira dans "Style DA"
 *   couleursMood,       // ira dans "Ambiance"
 *   elementsGraphiques, // ira dans "Effets"
 *   structureNarration, // ira dans "Type de contenu"
 *   usage,              // ira dans "Objectif"
 *   miseEnScene,        // si on ajoute plus tard
 *   styleTypo,          // si on ajoute plus tard
 *   montageMotion       // si on ajoute plus tard
 * }
 */
export async function createReferencePage(props) {
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
      // Title (title)
      Title: {
        title: [
          {
            text: {
              content: title || "Référence sans titre",
            },
          },
        ],
      },

      // URL (url)
      URL: {
        url: url || null,
      },

      // Tumbnail (url) - on ne la remplit pas pour l'instant,
      // mais tu pourras ajouter une logique plus tard si tu as une miniature.
      Tumbnail: {
        url: null,
      },

      // Description (text)
      Description: {
        rich_text: [
          {
            text: {
              content: description || "",
            },
          },
        ],
      },

      // Tags (multi-select)
      Tags: {
        multi_select: toMultiSelect(tags),
      },

      // Format (multi-select)
      Format: {
        multi_select: toMultiSelect(format),
      },

      // Type de contenu (multi-select)
      "Type de contenu": {
        // on part de structureNarration si fournie
        multi_select: toMultiSelect(structureNarration),
      },

      // Mise en scène / cadrage (multi-select)
      "Mise en scène / cadrage": {
        multi_select: toMultiSelect(miseEnScene),
      },

      // Style DA (multi-select)
      "Style DA": {
        multi_select: toMultiSelect(styleVisuel),
      },

      // Style typo (multi-select)
      "Style typo": {
        multi_select: toMultiSelect(styleTypo),
      },

      // Montage / motion (multi-select)
      "


