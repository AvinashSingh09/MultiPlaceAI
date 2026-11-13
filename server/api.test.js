import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import sharp from "sharp";
process.env.NODE_ENV = "test";
const { app } = await import("./index.js");
delete process.env.COMFYUI_URL;
const originalFetch = globalThis.fetch;
let server, base;
before(async () => {
  server = app.listen(0, "127.0.0.1");
  await new Promise((r) => server.once("listening", r));
  base = `http://127.0.0.1:${server.address().port}`;
});
after(() => {
  server.close();
  globalThis.fetch = originalFetch;
});
const photo = await sharp({
  create: { width: 30, height: 20, channels: 3, background: "white" },
})
  .png()
  .toBuffer();
function form({
  id = "world-tour",
  buffer = photo,
  mode = "multiplaces",
} = {}) {
  const f = new FormData();
  f.append("mode", mode);
  f.append("templateId", id);
  f.append("photo", new Blob([buffer], { type: "image/png" }), "photo.png");
  return f;
}
test("health endpoint returns 200 OK", async () => {
  const r = await originalFetch(base + "/health");
  assert.equal(r.status, 200);
  assert.equal(await r.text(), "OK");
});
test("catalog exposes template without local file paths", async () => {
  const r = await originalFetch(base + "/api/templates");
  const d = await r.json();
  assert.equal(d[0].people, 3);
  assert.equal(d[0].file, undefined);
});
test("MultiPlaces validates inputs and routes face swaps through ComfyUI", async (t) => {
  process.env.COMFYUI_URL = "https://comfy.example";
  process.env.COMFYUI_ACCESS_CLIENT_ID = "test-id";
  process.env.COMFYUI_ACCESS_CLIENT_SECRET = "test-secret";
  process.env.OPENAI_API_KEY = "test-only-key";
  process.env.CLOUDINARY_CLOUD_NAME = "test-cloud";
  process.env.CLOUDINARY_UPLOAD_PRESET = "test-unsigned-preset";
  t.after(() => {
    delete process.env.COMFYUI_URL;
    delete process.env.COMFYUI_ACCESS_CLIENT_ID;
    delete process.env.COMFYUI_ACCESS_CLIENT_SECRET;
    delete process.env.OPENAI_API_KEY;
    delete process.env.CLOUDINARY_CLOUD_NAME;
    delete process.env.CLOUDINARY_UPLOAD_PRESET;
    globalThis.fetch = originalFetch;
  });

  let graph;
  globalThis.fetch = async (url, options) => {
    if (url.startsWith("https://api.cloudinary.com/")) {
      assert.equal(options.headers, undefined);
      return Response.json({ secure_url: "https://res.cloudinary.com/test-cloud/image/upload/postcard.png" });
    }
    const endpoint = new URL(url);
    assert.equal(endpoint.origin, "https://comfy.example");
    assert.equal(options.headers.get("CF-Access-Client-Id"), "test-id");
    assert.equal(options.headers.get("CF-Access-Client-Secret"), "test-secret");
    assert.equal(options.redirect, "error");
    switch (endpoint.pathname) {
      case "/upload/image": {
        const image = options.body.get("image");
        assert.equal(options.body.get("type"), "temp");
        if (image.type === "image/webp") {
          const metadata = await sharp(Buffer.from(await image.arrayBuffer())).metadata();
          assert.deepEqual([metadata.format, metadata.width], ["webp", 30]);
        }
        return Response.json({ name: image.name, type: "temp" });
      }
      case "/prompt":
        graph = JSON.parse(options.body).prompt;
        assert.equal(graph.options.inputs.source_faces_order, "left-right");
        assert.equal(graph.options.inputs.source_faces_index, "0,1,2");
        assert.equal(graph.boost.inputs.restore_with_main_after, true);
        assert.equal(graph.boost.inputs.codeformer_weight, 0.8);
        for (let index = 0; index < 4; index++) {
          const { inputs } = graph["swap" + index];
          assert.equal(inputs.swap_model, "inswapper_128.onnx");
          assert.equal(inputs.facedetection, "YOLOv5l");
          assert.equal(inputs.face_restore_model, "codeformer-v0.1.0.pth");
          assert.equal(inputs.codeformer_weight, 0.8);
          assert.deepEqual(inputs.input_image, ["crop" + index, 0]);
          const restore = graph["restore" + index];
          assert.equal(restore.class_type, "ReActorRestoreFaceAdvanced");
          assert.equal(restore.inputs.model, "codeformer-v0.1.0.pth");
          assert.equal(restore.inputs.codeformer_weight, 0.7);
          assert.equal(restore.inputs.face_selection, "all");
          assert.deepEqual(restore.inputs.image, ["swap" + index, 0]);
          assert.deepEqual(graph["preview" + index].inputs.images, ["restore" + index, 0]);
        }
        return Response.json({ prompt_id: "test-job" });
      case "/history/test-job":
        return Response.json({
          "test-job": {
            status: { status_str: "success" },
            outputs: Object.fromEntries([0, 1, 2, 3].map(index => [
              "preview" + index, { images: [{ filename: index + ".png", type: "temp" }] },
            ])),
          },
        });
      case "/view": {
        const { width, height } = graph["crop" + endpoint.searchParams.get("filename")[0]].inputs;
        return new Response(await sharp({
          create: { width, height, channels: 3, background: "black" },
        }).png().toBuffer());
      }
      default:
        throw Error("Unexpected ComfyUI request");
    }
  };

  const submit = (options) => originalFetch(base + "/api/generate", {
    method: "POST", body: form(options),
  });
  for (const [options, message] of [
    [{ id: "../secret" }, "Choose"],
    [{ buffer: Buffer.from("bad image") }, "could not be read"],
  ]) {
    const response = await submit(options);
    assert.equal(response.status, 400);
    assert.match((await response.json()).error, new RegExp(message));
  }

  const response = await submit();
  assert.equal(response.status, 200);
  assert.match(response.headers.get("server-timing"), /^upload;dur=[\d.]+, prepare;dur=[\d.]+, edit;dur=[\d.]+, share;dur=[\d.]+$/);
  const generated = await response.json();
  assert.match(generated.image, /^data:image\/png;base64,/);
  assert.match(generated.qrCode, /^data:image\/png;base64,/);
  const metadata = await sharp(Buffer.from(generated.image.split(",")[1], "base64")).metadata();
  assert.deepEqual([metadata.width, metadata.height], [1200, 1800]);

  delete process.env.COMFYUI_URL;
  const missingUrl = await submit();
  assert.equal(missingUrl.status, 503);
  assert.match((await missingUrl.json()).error, /COMFYUI_URL/);
});

test("Ghibli mode edits only the captured photo", async () => {
  process.env.OPENAI_API_KEY = "test-only-key";
  process.env.CLOUDINARY_CLOUD_NAME = "test-cloud";
  process.env.CLOUDINARY_UPLOAD_PRESET = "test-unsigned-preset";
  let openAiChecked = false;
  globalThis.fetch = async (url, options) => {
    if (url === "https://api.openai.com/v1/images/edits") {
      const request = options.body;
      assert.deepEqual(
        request.getAll("image[]").map((image) => image.name),
        ["group.webp"],
      );
      assert.equal(request.get("size"), "auto");
      assert.match(request.get("prompt"), /hand-painted Japanese animated-film/);
      openAiChecked = true;
      return new Response(JSON.stringify({ data: [{ b64_json: "result" }] }), {
        status: 200,
      });
    }
    assert.equal(
      url,
      "https://api.cloudinary.com/v1_1/test-cloud/image/upload",
    );
    return new Response(
      JSON.stringify({
        secure_url:
          "https://res.cloudinary.com/test-cloud/image/upload/ghibli.png",
      }),
      { status: 200 },
    );
  };
  const response = await originalFetch(base + "/api/generate", {
    method: "POST",
    body: form({ mode: "ghibli", id: "not-required" }),
  });
  assert.equal(response.status, 200);
  assert.equal((await response.json()).shareUrl.endsWith("/ghibli.png"), true);
  assert.equal(openAiChecked, true);
  delete process.env.OPENAI_API_KEY;
  delete process.env.CLOUDINARY_CLOUD_NAME;
  delete process.env.CLOUDINARY_UPLOAD_PRESET;
  globalThis.fetch = originalFetch;
});
