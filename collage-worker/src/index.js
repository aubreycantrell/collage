var __defProp = Object.defineProperty;
var __name = (target, value) => __defProp(target, "name", { value, configurable: true });

// src/index.js
var index_default = {
  async fetch(request, env) {
    const url = new URL(request.url);
    const origin = request.headers.get("Origin") || "";
    let allowOrigin = "*";
    try {
      const host = new URL(origin).hostname || "";
      allowOrigin = /\.github\.io$/.test(host) ? origin : "*";
    } catch (_) {
      allowOrigin = "*";
    }
    if (request.method === "OPTIONS") {
      return new Response(null, { headers: corsHeaders(allowOrigin) });
    }
    try {
      if (url.pathname === "/edit" && request.method === "POST") {
        return await handleEdit(request, env, allowOrigin, false);
      }
      if (url.pathname === "/edit-custom" && request.method === "POST") {
        return await handleEdit(request, env, allowOrigin, true);
      }
      if (url.pathname === "/upload" && request.method === "POST") {
        return await handleUpload(request, env, allowOrigin);
      }
      if (url.pathname === "/session" && request.method === "POST") {
        return await handleSaveSession(request, env, allowOrigin);
      }
      if (url.pathname === "/sessions" && request.method === "GET") {
        return await handleListSessions(request, env, allowOrigin);
      }
      return json({ error: "Not found" }, 404, allowOrigin);
    } catch (err) {
      const msg = err && err.message ? err.message : "Unexpected error";
      return json({ error: msg }, 500, allowOrigin);
    }
  }
};

var SIZE = "1024x1024";
var OVERLAY_ONLY_SUFFIX = "STRICT REQUIREMENT: Overlay new elements on top of the current image only. Do NOT alter, erase, blur, move, recolor, or replace any existing pixels unless explicitly requested. Preserve all original composition, lighting, textures, edges, and geometry. No global filters. No inpainting outside added elements. No background edits. Blend additions believably with soft shadows/occlusion. No text, logos, brands, or faces.";

var PRESET_STYLES = [
  { slug: "new-materials", prompt: "Overlay layered materials not present in the original\u2014fabric swatches, stitching with thread or yarn, metallic foil, iridescent film, tissue paper, feathers, pompoms, or thread\u2014blended naturally. Do not remove existing imagery." },
  { slug: "contemporary-shapes", prompt: "Overlay bold geometric OR organic shapes OR pen marks in a clean contemporary style, integrated with existing textures without removing anything." },
  { slug: "paper-manipulation", prompt: "Overlay hand-cut paper shapes (folding, weaving, tearing, cutouts) with visible paper texture. Preserve original pixels outside additions." },
  { slug: "thematic-playful", prompt: "Overlay surprising imagery that echoes existing themes as realistic printed cutouts interacting with current elements. Do not remove existing imagery." },
  { slug: "thematic-reinforcing", prompt: "Overlay reinforcing motifs/symbols tied to the subject, integrated seamlessly with color matching. Keep all original content." }
];

async function handleEdit(request, env, allowOrigin, isCustom) {
  const form = await request.formData();
  const image = form.get("image");
  if (!(image instanceof File)) {
    return json({ error: "No image uploaded" }, 400, allowOrigin);
  }
  const userPrompt = (form.get("prompt") || "").toString().trim();
  const originalDataUrl = await fileToDataUrl(image);

  if (!isCustom) {
    const outs = await Promise.all(
      PRESET_STYLES.map(async ({ slug, prompt }) => {
        const finalPrompt = userPrompt ? `${prompt}\nAdditional instructions: ${userPrompt}` : prompt;
        const b64 = await callOpenAIEdit(env.OPENAI_API_KEY, image, finalPrompt);
        const blurb = await describeAddition(env.OPENAI_API_KEY, originalDataUrl, b64, slug.replace(/-/g, " "));
        return { slug, dataUrl: `data:image/png;base64,${b64}`, blurb };
      })
    );
    return json({ results: outs }, 200, allowOrigin);
  } else {
    if (!userPrompt) return json({ error: "Missing prompt" }, 400, allowOrigin);
    const allowModify = String(form.get("allowModify") || "false").toLowerCase() === "true";
    const finalPrompt = allowModify ? userPrompt : `${userPrompt}\n\n${OVERLAY_ONLY_SUFFIX}`;
    const b64 = await callOpenAIEdit(env.OPENAI_API_KEY, image, finalPrompt);
    const blurb = await describeAddition(env.OPENAI_API_KEY, originalDataUrl, b64, "custom overlay");
    return json({ result: { dataUrl: `data:image/png;base64,${b64}`, blurb } }, 200, allowOrigin);
  }
}
__name(handleEdit, "handleEdit");

async function callOpenAIEdit(apiKey, imageFile, prompt) {
  const body = new FormData();
  body.set("model", "gpt-image-1");
  body.set("prompt", prompt);
  body.set("size", SIZE);
  body.set("n", "1");
  body.set("image", imageFile, imageFile.name || "upload.png");
  const r = await fetch("https://api.openai.com/v1/images/edits", {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}` },
    body
  });
  if (!r.ok) {
    const err = await r.text();
    throw new Error(`OpenAI error ${r.status}: ${err}`);
  }
  const data = await r.json();
  const b64 = data && data.data && data.data[0] && data.data[0].b64_json;
  if (!b64) throw new Error("No image returned from OpenAI");
  return b64;
}
__name(callOpenAIEdit, "callOpenAIEdit");

async function fileToDataUrl(file) {
  const buf = await file.arrayBuffer();
  const bytes = new Uint8Array(buf);
  let binary = "";
  const chunkSize = 0x8000;
  for (let i = 0; i < bytes.length; i += chunkSize) {
    binary += String.fromCharCode.apply(null, bytes.subarray(i, i + chunkSize));
  }
  const b64 = btoa(binary);
  return `data:${file.type || "image/png"};base64,${b64}`;
}
__name(fileToDataUrl, "fileToDataUrl");

async function describeAddition(apiKey, originalDataUrl, newImageB64, label) {
  const newDataUrl = `data:image/png;base64,${newImageB64}`;
  const body = {
    model: "gpt-4o-mini",
    messages: [
      {
        role: "system",
        content: `You are a precise visual analyst comparing a before/after image pair from a collage-generation tool. Identify only what was newly added in the second image compared to the first.

PLACEMENT ACCURACY (critical):
- Describe placement from the VIEWER's perspective looking at the image, not from any subject's perspective within the image.
- Mentally divide the image into a 3x3 grid: top-left/top-center/top-right, middle-left/center/middle-right, bottom-left/bottom-center/bottom-right.
- Before writing your answer, check each grid cell for added content. If additions appear in 4+ cells, say "scattered across the image" rather than naming only one or two regions.
- Double-check left vs. right by comparing the addition's horizontal position to the exact midpoint of the image width. Do not guess — verify the pixel-x position is actually left-of-center or right-of-center before stating a side.
- If multiple distinct elements were added in different spots, describe each briefly rather than only the most prominent one.

JUSTIFICATION QUALITY (critical):
- Never use generic filler like "enhances the theme," "adds visual interest," "creates contrast," or "complements the aesthetic" on their own.
- Instead, reference the SPECIFIC visual features already present in the original image (a color, shape, texture, subject, or existing motif) and explain how the new addition relates to that specific feature. Call out the specific items / characters / materials added as they are, and explain why they complement the given collage specifically.
- Vary your sentence structure and vocabulary across different requests; do not reuse the same phrasing pattern every time.

Respond ONLY with strict JSON, no markdown: {"summary": string, "placement": string, "justification": string}. Each field should be one concise sentence.`
      },
      {
        role: "user",
        content: [
          { type: "text", text: `Style applied: ${label}. First image is the original, second is the edited result. Carefully verify grid position and left/right before answering. Describe only the new additions.` },
          { type: "image_url", image_url: { url: originalDataUrl } },
          { type: "image_url", image_url: { url: newDataUrl } }
        ]
      }
    ],
    max_tokens: 260,
    response_format: { type: "json_object" }
  };
  try {
    const r = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify(body)
    });
    if (!r.ok) {
      console.error("Blurb request failed:", await r.text());
      return { summary: "", placement: "", justification: "" };
    }
    const data = await r.json();
    const content = data?.choices?.[0]?.message?.content || "{}";
    return JSON.parse(content);
  } catch (e) {
    console.error("Blurb parse/error:", e);
    return { summary: "", placement: "", justification: "" };
  }
}
__name(describeAddition, "describeAddition");

function json(data, status = 200, origin = "*") {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "content-type": "application/json", ...corsHeaders(origin) }
  });
}
__name(json, "json");

async function handleUpload(request, env, allowOrigin) {
  try {
    const form = await request.formData();
    const file = form.get("image");
    if (!(file instanceof File)) {
      return json({ error: "No file provided" }, 400, allowOrigin);
    }
    const key = `uploads/${Date.now()}-${file.name || "image.png"}`;
    await env.collage_sessions.put(key, await file.arrayBuffer(), {
      httpMetadata: { contentType: file.type || "image/png" }
    });
    const link = `${env.R2_PUBLIC_URL}/${key}`;
    return json({ success: true, key, link }, 200, allowOrigin);
  } catch (err) {
    console.error("Upload error:", err);
    return json({ error: err.message || String(err) }, 500, allowOrigin);
  }
}
__name(handleUpload, "handleUpload");

async function handleSaveSession(request, env, allowOrigin) {
  try {
    const body = await request.json();
    const username = (body.username || "").toString().trim();
    const sessionId = (body.sessionId || "").toString().trim();
    if (!username || !sessionId) {
      return json({ error: "Missing username or sessionId" }, 400, allowOrigin);
    }
    const safeUser = sanitizeKeyPart(username);
    const safeSession = sanitizeKeyPart(sessionId);
    const key = `sessions/${safeUser}/${safeSession}.json`;

    const record = {
      username,
      sessionId,
      createdAt: body.createdAt || Date.now(),
      updatedAt: Date.now(),
      originalImageLink: body.originalImageLink || "",
      results: Array.isArray(body.results) ? body.results : [],
      customs: Array.isArray(body.customs) ? body.customs : []
    };

    await env.collage_sessions.put(key, JSON.stringify(record), {
      httpMetadata: { contentType: "application/json" }
    });

    return json({ success: true, key }, 200, allowOrigin);
  } catch (err) {
    console.error("Save session error:", err);
    return json({ error: err.message || String(err) }, 500, allowOrigin);
  }
}
__name(handleSaveSession, "handleSaveSession");

async function handleListSessions(request, env, allowOrigin) {
  try {
    const url = new URL(request.url);
    const username = (url.searchParams.get("username") || "").toString().trim();
    if (!username) {
      return json({ error: "Missing username" }, 400, allowOrigin);
    }
    const safeUser = sanitizeKeyPart(username);
    const prefix = `sessions/${safeUser}/`;

    const listed = await env.collage_sessions.list({ prefix });
    const sessions = await Promise.all(
      listed.objects.map(async (obj) => {
        const file = await env.collage_sessions.get(obj.key);
        if (!file) return null;
        try {
          return JSON.parse(await file.text());
        } catch {
          return null;
        }
      })
    );

    const clean = sessions.filter(Boolean).sort((a, b) => b.createdAt - a.createdAt);
    return json({ sessions: clean }, 200, allowOrigin);
  } catch (err) {
    console.error("List sessions error:", err);
    return json({ error: err.message || String(err) }, 500, allowOrigin);
  }
}
__name(handleListSessions, "handleListSessions");

function sanitizeKeyPart(str) {
  return str.replace(/[^a-zA-Z0-9_\-]/g, "_").toLowerCase();
}
__name(sanitizeKeyPart, "sanitizeKeyPart");

function corsHeaders(origin) {
  return {
    "Access-Control-Allow-Origin": origin,
    "Access-Control-Allow-Methods": "GET,POST,OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type,Authorization"
  };
}
__name(corsHeaders, "corsHeaders");

export { index_default as default };