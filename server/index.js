import dotenv from "dotenv";
import express from "express";
import multer from "multer";
import rateLimit from "express-rate-limit";
import sharp from "sharp";
import QRCode from "qrcode";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { templates, editPrompt } from "./templates.js";

const root = fileURLToPath(new URL("../", import.meta.url));
dotenv.config({ path: path.join(root, ".env"), quiet: true });
export const app = express();
app.disable("x-powered-by");
app.set("trust proxy", 1);
app.use("/api", (_req, res, next) => {
  res.set("Cache-Control", "no-store");
  next();
});
app.get("/health", (_req, res) => res.status(200).send("OK"));
app.get("/api/templates", (_req, res) =>
  res.json(
    templates.map(({ file, ...t }) => ({ ...t, image: `/templates/${file}` })),
  ),
);
app.get("/api/health", (_req, res) =>
  res.json({
    configured: !!(
      process.env.OPENAI_API_KEY &&
      process.env.CLOUDINARY_CLOUD_NAME &&
      process.env.CLOUDINARY_UPLOAD_PRESET
    ),
    openaiConfigured: !!process.env.OPENAI_API_KEY,
    cloudinaryConfigured: !!(
      process.env.CLOUDINARY_CLOUD_NAME &&
      process.env.CLOUDINARY_UPLOAD_PRESET
    ),
  }),
);
app.use("/templates", express.static(path.join(root, "Template Images")));
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 15 * 1024 * 1024, files: 1, fields: 3 },
  fileFilter: (_req, file, cb) =>
    cb(null, ["image/jpeg", "image/png", "image/webp"].includes(file.mimetype)),
});
app.post(
  "/api/generate",
  rateLimit({
    windowMs: 60 * 60 * 1000,
    limit: 10,
    standardHeaders: "draft-8",
    legacyHeaders: false,
    message: { error: "Generation limit reached. Please try again later." },
  }),
  upload.single("photo"),
  async (req, res) => {
    const template = templates.find((t) => t.id === req.body.templateId);
    if (!template)
      return res.status(400).json({ error: "Choose an available template." });
    if (!req.file)
      return res
        .status(400)
        .json({
          error: "Upload a JPG, PNG or WebP group photo (up to 15 MB).",
        });
    if (req.body.confirmed !== "true")
      return res
        .status(400)
        .json({
          error:
            "Confirm that exactly three people are visible and everyone agrees to this edit.",
        });
    if (!process.env.OPENAI_API_KEY)
      return res
        .status(503)
        .json({
          error:
            "Image editing is not configured yet. Add OPENAI_API_KEY to the server .env file.",
        });
    if (
      !process.env.CLOUDINARY_CLOUD_NAME ||
      !process.env.CLOUDINARY_UPLOAD_PRESET
    )
      return res.status(503).json({
        error:
          "Image sharing is not configured yet. Add CLOUDINARY_CLOUD_NAME and CLOUDINARY_UPLOAD_PRESET to the server .env file.",
      });
    let photo;
    try {
      photo = await sharp(req.file.buffer, { limitInputPixels: 40000000 })
        .rotate()
        .resize({
          width: 3072,
          height: 3072,
          fit: "inside",
          withoutEnlargement: true,
        })
        .webp({ lossless: true })
        .toBuffer();
    } catch {
      return res
        .status(400)
        .json({
          error:
            "This photo could not be read. Please use a valid JPG, PNG or WebP image.",
        });
    }
    try {
      const form = new FormData();
      form.append(
        "model",
        process.env.OPENAI_IMAGE_MODEL || "gpt-image-2.5-flare",
      );
      form.append(
        "image[]",
        new Blob(
          [await readFile(path.join(root, "Template Images", template.file))],
          { type: "image/png" },
        ),
        "template.png",
      );
      form.append(
        "image[]",
        new Blob([photo], { type: "image/webp" }),
        "group.webp",
      );
      form.append("prompt", editPrompt(template));
      form.append("size", "1536x2304");
      form.append("quality", "max");
      form.append("output_format", "png");
      form.append("n", "1");
      const response = await fetch("https://api.openai.com/v1/images/edits", {
        method: "POST",
        headers: { Authorization: `Bearer ${process.env.OPENAI_API_KEY}` },
        body: form,
        signal: AbortSignal.timeout(300000),
      });
      const data = await response.json();
      if (!response.ok) {
        console.error("Image edit failed:", response.status, data.error?.code);
        return res
          .status(response.status === 429 ? 429 : 502)
          .json({
            error:
              response.status === 429
                ? "The image service is busy. Please try again shortly."
                : response.status === 401
                  ? "The server API key is invalid. Please check its configuration."
                  : "The image service could not complete this edit. Please try another photo or try again later.",
          });
      }
      if (!data.data?.[0]?.b64_json) throw new Error("Missing image output");
      const imageBuffer = Buffer.from(data.data[0].b64_json, "base64");
      const cloudinaryForm = new FormData();
      cloudinaryForm.append(
        "file",
        new Blob([imageBuffer], { type: "image/png" }),
        "multiplaces-postcard.png",
      );
      cloudinaryForm.append(
        "upload_preset",
        process.env.CLOUDINARY_UPLOAD_PRESET,
      );
      cloudinaryForm.append("folder", "multiplaces");
      const cloudinaryResponse = await fetch(
        `https://api.cloudinary.com/v1_1/${encodeURIComponent(process.env.CLOUDINARY_CLOUD_NAME)}/image/upload`,
        {
          method: "POST",
          body: cloudinaryForm,
          signal: AbortSignal.timeout(120000),
        },
      );
      const cloudinaryData = await cloudinaryResponse.json();
      if (!cloudinaryResponse.ok || !cloudinaryData.secure_url) {
        console.error(
          "Cloudinary upload failed:",
          cloudinaryResponse.status,
          cloudinaryData.error?.message,
        );
        return res.status(502).json({
          error:
            "Your postcard was created, but sharing could not be prepared. Check the Cloudinary cloud name and unsigned upload preset, then try again.",
        });
      }
      const shareUrl = cloudinaryData.secure_url;
      const qrCode = await QRCode.toDataURL(shareUrl, {
        errorCorrectionLevel: "M",
        margin: 2,
        width: 320,
        color: { dark: "#293226", light: "#ffffff" },
      });
      res.json({
        image: `data:image/png;base64,${data.data[0].b64_json}`,
        shareUrl,
        qrCode,
      });
    } catch (error) {
      console.error("Image edit error:", error.name);
      res
        .status(502)
        .json({
          error:
            error.name === "TimeoutError"
              ? "The edit took too long. Please try again."
              : "Could not reach the image service. Please try again.",
        });
    }
  },
);
app.use("/api", (_req, res) =>
  res.status(404).json({ error: "Endpoint not found." }),
);
app.use(express.static(path.join(root, "dist")));
app.get("/{*path}", (_req, res) =>
  res.sendFile(path.join(root, "dist/index.html")),
);
app.use((error, _req, res, _next) =>
  res
    .status(400)
    .json({
      error:
        error.code === "LIMIT_FILE_SIZE"
          ? "The photo is too large. Choose one under 15 MB."
          : "Unable to process this upload.",
    }),
);
if (process.env.NODE_ENV !== "test") {
  const port = Number(process.env.PORT) || 3001;
  const host = process.env.HOST || "0.0.0.0";
  app.listen(port, host, () =>
    console.log(`MultiPlaces server: http://${host === "0.0.0.0" ? "localhost" : host}:${port}`),
  );
}
