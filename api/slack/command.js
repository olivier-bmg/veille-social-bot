// api/slack/command.js
import querystring from "querystring";
import { analyzeReference, embedText } from "../../lib/openai.js";
import { createReferencePage } from "../../lib/notion.js";
import { upsertReferenceVector, searchSimilar } from "../../lib/pinecone.js";

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
      res.statusCode = 200;
      res.setHeader("Content-Type", "application/json");
      res.end(
        JSON.stringify({
          response_type: "ephemeral",
          text: "Commande Slack non reconnue.",
        })
      );
      return;
    }

    if (command === "/addref") {
      await handleAddRef({ text, user_name, res });
    } else if (command === "/ref") {
      await handleSearch({ text, user_name, res });
    } else {
      res.statusCode = 200;
      res.setHeader("Content-Type", "application/json");
      res.end(
        JSON.stringify({
          response_type: "ephemeral",
          text: "Commande non gérée pour l’instant.",
        })
      );
    }
  } catch (err) {
    console.error(err);
    res.statusCode = 200;
    res.setHeader("Content-Type", "application/json");
    res.end(
      JSON.stringify({
        response_type: "ephemeral",
        text: "❌ Erreur côté bot. Vérifie les logs Vercel.",
      })
    );
  }
}

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

async function handleSearch({ text, user_name, res }) {
  const query = (text || "").trim();
  if (!query) {
    sendSlack(res, {
      response_type: "ephemeral",
      text: "Utilisation : `/ref ta recherche` (ex: `contenu vertical incarné fond vert`)",
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

function sendSlack(res, payload) {
  res.statusCode = 200;
  res.setHeader("Content-Type", "application/json");
  res.end(JSON.stringify(payload));
}

