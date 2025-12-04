// lib/notion.js
import { Client } from "@notionhq/client";

const notion = new Client({ auth: process.env.NOTION_API_KEY });
const databaseId = process.env.NOTION_DATABASE_ID;

// Créer une page de référence dans ta base Notion
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
  } = props;

  const page = await notion.pages.create({
    parent: { database_id: databaseId },
    properties: {
      Title: {
        title: [
          {
            text: {
              content: title,
            },
          },
        ],
      },
      URL: {
        url,
      },
      Description: {
        rich_text: [
          {
            text: {
              content: description || "",
            },
          },
        ],
      },
      Tags: {
        multi_select: (tags || []).map((name) => ({ name })),
      },
      Format: {
        multi_select: (format || []).map((name) => ({ name })),
      },
      "Style visuel": {
        multi_select: (styleVisuel || []).map((name) => ({ name })),
      },
      "Couleurs / Mood": {
        multi_select: (couleursMood || []).map((name) => ({ name })),
      },
      "Éléments graphiques": {
        multi_select: (elementsGraphiques || []).map((name) => ({ name })),
      },
      "Structure / narration": {
        multi_select: (structureNarration || []).map((name) => ({ name })),
      },
      Usage: {
        multi_select: (usage || []).map((name) => ({ name })),
      },
      "Date ajout": {
        date: {
          start: new Date().toISOString(),
        },
      },
    },
  });

  return page.id;
}

