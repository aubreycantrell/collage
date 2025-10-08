// server.js
import express from "express";
import multer from "multer";
import path from "path";
import { Readable } from "stream";
import OpenAI, { toFile } from "openai";

const app = express();
const upload = multer({ storage: multer.memoryStorage() });

// ====== PASTE YOUR API KEY HERE (or use env var) ======
const openai = new OpenAI({
    apiKey: OPENAI_API_KEY

  });
// ======================================================

// Choose a reasonable size for speed/cost
const SIZE = "1024x1024"; // ("2048x2048" for higher res, slower)

const styles = [
  {
    slug: "new-materials",
    prompt:
      "Overlay layered materials not present in the original—fabric swatches, stitching with thread or yarn, metallic foil, iridescent film, tissue paper, feathers, pompoms, or thread—blended naturally into the composition with crisp highlights so the new materials are obvious. Do not remove existing imagery."
  },
  {
    slug: "contemporary-shapes",
    prompt:
      "Overlay bold geometric OR organic shapes OR pen marks in a clean contemporary style, integrated with existing textures without removing anything. Use high-contrast OR harmonious colors so additions are unmistakable."
  },
  {
    slug: "paper-manipulation",
    prompt:
      "Overlay patterned or high-contrast OR harmonious colors paperhand-cut organic shapes that show paper texture in a classic collage style, gently layered into the work with soft shadows or outlines to differentiate them, OR paper manipulation in the form of folding, weaving, tearing, and cutouts. Preserve original pixels outside additions."
  },
  {
    slug: "thematic-playful",
    prompt:
      "Overlay surprising imagery that echoes existing themes in the form of realistic cut outs from printed visuals — objects/icons/figures that interact with current elements—scaled and integrated believably with subtle drop shadows for clarity. Do not remove existing imagery."
  },
  {
    slug: "thematic-reinforcing",
    prompt:
      "Overlay reinforcing imagery tied to the subject—motifs/symbols related to what is already there—scaled appropriately and integrated seamlessly with color matching so the additions read clearly. Keep all original content."
  },
];

const OVERLAY_ONLY_SUFFIX =
"STRICT REQUIREMENT: Only add new visual elements on top of the existing image. " +
"Do not modify or remove any part of the original image. " +
"Keep the original layout, lighting, materials, and edges unchanged. " +
"No global filters, recoloring, or blurring outside added items. " +
"Ensure new additions blend naturally using consistent shading and lighting. " +
"No text, symbols, logos, or recognizable human features.";



function mimeFor(ext) {
  const e = ext.toLowerCase();
  if (e === ".png") return "image/png";
  if (e === ".jpg" || e === ".jpeg") return "image/jpeg";
  if (e === ".webp") return "image/webp";
  // If we can’t map, let the SDK infer; but PNG/JPG/WEBP are recommended.
  return "application/octet-stream";
}

const bufToTypedFile = async (buf, filename) => {
  const ext = path.extname(filename || ".png") || ".png";
  const mime = mimeFor(ext);
  // Convert Buffer to stream for toFile
  const stream = Readable.from(buf);
  return toFile(stream, filename || `upload${ext}`, { type: mime });
};

// Serve the frontend
app.use(express.static("public"));

// Image edit endpoint
app.post("/edit", upload.single("image"), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: "No image uploaded" });
    }

    const userPrompt = req.body.prompt?.trim();
    const requestedStyles = req.body.styles
      ? JSON.parse(req.body.styles) // optional: pass custom styles from UI
      : styles;

    const imageFile = await bufToTypedFile(req.file.buffer, req.file.originalname);

    

    // Run all styles in parallel (it’s only 5; ok for local)
    const results = await Promise.all(
      requestedStyles.map(async ({ slug, prompt }) => {
        const rsp = await openai.images.edit({
          model: "gpt-image-1", // or "dall-e-2" if you prefer strict masking behavior
          image: imageFile,
          prompt: userPrompt ? `${prompt}\nAdditional instructions: ${userPrompt}` : prompt,
          n: 1,
          size: SIZE,
        });

        const b64 = rsp.data[0].b64_json;
        return { slug, dataUrl: `data:image/png;base64,${b64}` };
      })
    );

    res.json({ results });
  } catch (err) {
    console.error(err);
    res.status(err?.status || 500).json({
      error: err?.message || "Unexpected error",
      status: err?.status || 500,
    });
  }
});

app.post("/edit-custom", upload.single("image"), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: "No image uploaded" });
    const userPrompt = (req.body.prompt || "").trim();
    if (!userPrompt) return res.status(400).json({ error: "Missing prompt" });

    // Always append the guardrail unless caller explicitly opts out
    const allowModify = String(req.body.allowModify || "false").toLowerCase() === "true";
    const finalPrompt = allowModify ? userPrompt : `${userPrompt}\n\n${OVERLAY_ONLY_SUFFIX}`;

    const imageFile = await bufToTypedFile(req.file.buffer, req.file.originalname);
    const rsp = await openai.images.edit({
      model: "gpt-image-1", // or "dall-e-2"
      image: imageFile,
      prompt: finalPrompt,
      n: 1,
      size: SIZE,
    });
    const b64 = rsp.data[0].b64_json;
    res.json({ result: { dataUrl: `data:image/png;base64,${b64}` } });
  } catch (err) {
    console.error(err);
    res.status(err?.status || 500).json({ error: err?.message || "Unexpected error" });
  }
});


const PORT = 3000;
app.listen(PORT, () => {
  console.log(`Local app running at http://localhost:${PORT}`);
});
