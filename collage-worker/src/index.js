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
  {
    slug: "new-materials",
    prompt: "Overlay layered materials not present in the original\u2014fabric swatches, stitching with thread or yarn, metallic foil, iridescent film, tissue paper, feathers, pompoms, or thread\u2014blended naturally. Do not remove existing imagery."
  },
  {
    slug: "contemporary-shapes",
    prompt: "Overlay bold geometric OR organic shapes OR pen marks in a clean contemporary style, integrated with existing textures without removing anything."
  },
  {
    slug: "paper-manipulation",
    prompt: "Overlay hand-cut paper shapes (folding, weaving, tearing, cutouts) with visible paper texture. Preserve original pixels outside additions."
  },
  {
    slug: "thematic-playful",
    prompt: "Overlay surprising imagery that echoes existing themes as realistic printed cutouts interacting with current elements. Do not remove existing imagery."
  },
  {
    slug: "thematic-reinforcing",
    prompt: "Overlay reinforcing motifs/symbols tied to the subject, integrated seamlessly with color matching. Keep all original content."
  }
];
async function handleEdit(request, env, allowOrigin, isCustom) {
  const form = await request.formData();
  const image = form.get("image");
  if (!(image instanceof File)) {
    return json({ error: "No image uploaded" }, 400, allowOrigin);
  }
  const userPrompt = (form.get("prompt") || "").toString().trim();
  if (!isCustom) {
    const outs = await Promise.all(
      PRESET_STYLES.map(
        ({ slug, prompt }) => callOpenAIEdit(env.OPENAI_API_KEY, image, userPrompt ? `${prompt}
Additional instructions: ${userPrompt}` : prompt).then((b64) => ({ slug, dataUrl: `data:image/png;base64,${b64}` }))
      )
    );
    return json({ results: outs }, 200, allowOrigin);
  } else {
    if (!userPrompt) return json({ error: "Missing prompt" }, 400, allowOrigin);
    const allowModify = String(form.get("allowModify") || "false").toLowerCase() === "true";
    const finalPrompt = allowModify ? userPrompt : `${userPrompt}

${OVERLAY_ONLY_SUFFIX}`;
    const b64 = await callOpenAIEdit(env.OPENAI_API_KEY, image, finalPrompt);
    return json({ result: { dataUrl: `data:image/png;base64,${b64}` } }, 200, allowOrigin);
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
function json(data, status = 200, origin = "*") {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      "content-type": "application/json",
      ...corsHeaders(origin)
    }
  });
}
async function handleUpload(request, env, allowOrigin) {
  try {
    const form = await request.formData();
    const file = form.get("image");

    if (!(file instanceof File)) {
      return json({ error: "No file provided" }, 400, allowOrigin);
    }

    // Generate a unique key for R2
    const key = `uploads/${Date.now()}-${file.name || "image.png"}`;

    // Save directly to R2 bucket
    await env.collage_sessions.put(key, await file.arrayBuffer(), {
      httpMetadata: {
        contentType: file.type || "image/png",
      },
    });

    // Construct a public link (if your bucket has public access)
    const link = `https://pub-${env.R2_ACCOUNT_ID}.r2.dev/${key}`;

    return json({ success: true, key, link }, 200, allowOrigin);
  } catch (err) {
    console.error("Upload error:", err);
    return json({ error: err.message || String(err) }, 500, allowOrigin);
  }
}

__name(json, "json");
function corsHeaders(origin) {
  return {
    "Access-Control-Allow-Origin": origin,
    "Access-Control-Allow-Methods": "GET,POST,OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type,Authorization"
  };
}
__name(corsHeaders, "corsHeaders");
export {
  index_default as default
};
//# sourceMappingURL=index.js.map
