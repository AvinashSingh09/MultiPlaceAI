import { createHash, randomUUID } from "node:crypto";
import { setTimeout as delay } from "node:timers/promises";
import sharp from "sharp";

// Shared photo rectangles in the 1200 × 1800 India templates.
const panels = [
  { left: 13, top: 17, width: 577, height: 742 },
  { left: 608, top: 17, width: 576, height: 742 },
  { left: 13, top: 791, width: 578, height: 741 },
  { left: 608, top: 791, width: 579, height: 742 },
];

export async function swapPostcardFaces(baseUrl, templateImage, photo) {
  const signal = AbortSignal.timeout(285000);
  const base = baseUrl.replace(/\/+$/, "");
  const clientId = process.env.COMFYUI_ACCESS_CLIENT_ID;
  const clientSecret = process.env.COMFYUI_ACCESS_CLIENT_SECRET;
  if (Boolean(clientId) !== Boolean(clientSecret)) {
    throw Error("Set both ComfyUI Access credentials");
  }

  async function request(path, options) {
    const headers = new Headers(options?.headers);
    if (clientId && clientSecret) {
      headers.set("CF-Access-Client-Id", clientId);
      headers.set("CF-Access-Client-Secret", clientSecret);
    }
    const response = await fetch(base + path, { ...options, headers, signal, redirect: "error" });
    if (!response.ok) throw Error(`ComfyUI ${path} returned HTTP ${response.status}`);
    return response;
  }

  async function uploadImage(buffer, filename, type) {
    const form = new FormData();
    form.append("image", new Blob([buffer], { type }), filename);
    form.append("type", "temp");
    const image = await (await request("/upload/image", { method: "POST", body: form })).json();
    if (!image.name || image.type !== "temp") throw Error("Invalid ComfyUI upload response");
    return `${image.subfolder ? `${image.subfolder}/` : ""}${image.name} [temp]`;
  }

  const templateHash = createHash("sha256").update(templateImage).digest("hex");
  const [templateFile, photoFile] = await Promise.all([
    uploadImage(templateImage, `multiplaces-template-${templateHash}.png`, "image/png"),
    uploadImage(photo, `multiplaces-reference-${randomUUID()}.webp`, "image/webp"),
  ]);
  const graph = {
    template: { class_type: "LoadImage", inputs: { image: templateFile } },
    reference: { class_type: "LoadImage", inputs: { image: photoFile } },
    options: {
      class_type: "ReActorOptions",
      inputs: {
        input_faces_order: "left-right", input_faces_index: "0,1,2", detect_gender_input: "no",
        source_faces_order: "left-right", source_faces_index: "0,1,2", detect_gender_source: "no",
        console_log_level: 1, restore_swapped_only: true,
      },
    },
    boost: {
      class_type: "ReActorFaceBoost",
      inputs: {
        enabled: true, boost_model: "codeformer-v0.1.0.pth", interpolation: "Bicubic",
        visibility: 1, codeformer_weight: 0.5, restore_with_main_after: true,
      },
    },
  };
  for (const [index, panel] of panels.entries()) {
    graph[`crop${index}`] = {
      class_type: "ImageCrop",
      inputs: { image: ["template", 0], x: panel.left, y: panel.top, width: panel.width, height: panel.height },
    };
    graph[`swap${index}`] = {
      class_type: "ReActorFaceSwapOpt",
      inputs: {
        enabled: true, input_image: [`crop${index}`, 0], source_image: ["reference", 0],
        options: ["options", 0], face_boost: ["boost", 0], swap_model: "inswapper_128.onnx",
        facedetection: "YOLOv5l", face_restore_model: "GFPGANv1.4.pth",
        face_restore_visibility: 1, codeformer_weight: 0.65,
      },
    };
    graph[`restore${index}`] = {
      class_type: "ReActorRestoreFaceAdvanced",
      inputs: {
        image: [`swap${index}`, 0], facedetection: "YOLOv5l", model: "GFPGANv1.4.pth",
        visibility: 1, codeformer_weight: 0.7, face_selection: "all",
        sort_by: "area", reverse_order: false, take_start: 0, take_count: 1,
      },
    };
    graph[`preview${index}`] = { class_type: "PreviewImage", inputs: { images: [`restore${index}`, 0] } };
  }
  const job = await (await request("/prompt", {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ prompt: graph }),
  })).json();
  if (!job.prompt_id) throw Error("ComfyUI did not queue the face swap");
  const jobPath = `/history/${encodeURIComponent(job.prompt_id)}`;
  let result;
  while (!result) {
    const history = await (await request(jobPath)).json();
    result = history[job.prompt_id];
    if (!result) await delay(750, undefined, { signal });
  }
  if (result.status?.status_str !== "success") throw Error("ComfyUI face swap failed");
  const layers = await Promise.all(panels.map(async (panel, index) => {
    const image = result.outputs?.[`preview${index}`]?.images?.[0];
    if (!image?.filename) throw Error(`ComfyUI did not return panel ${index + 1}`);
    const query = new URLSearchParams({
      filename: image.filename, type: image.type, subfolder: image.subfolder || "",
    });
    const response = await request(`/view?${query}`);
    const input = Buffer.from(await response.arrayBuffer());
    const { width, height } = await sharp(input).metadata();
    if (width !== panel.width || height !== panel.height) throw Error("Unexpected ComfyUI panel dimensions");
    return { input, left: panel.left, top: panel.top };
  }));
  return sharp(templateImage).composite(layers).png().toBuffer();
}
