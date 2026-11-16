import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import sharp from "sharp";
import { readFile } from "node:fs/promises";
process.env.NODE_ENV = "test";
const { app } = await import("./index.js");
delete process.env.OPENAI_API_KEY;
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
  assert.deepEqual(d.map((template) => template.people).sort(), [1, 1, 2, 2, 3, 3]);
  assert.ok(d.every((template) => template.file === undefined));
});
test("MultiPlaces validates inputs and edits the selected postcard with OpenAI", async (t) => {
  process.env.OPENAI_API_KEY = "test-only-key";
  process.env.OPENAI_IMAGE_MODEL = "gpt-image-2.5-flare";
  process.env.CLOUDINARY_CLOUD_NAME = "test-cloud";
  process.env.CLOUDINARY_UPLOAD_PRESET = "test-unsigned-preset";
  t.after(() => {
    delete process.env.OPENAI_API_KEY;
    delete process.env.OPENAI_IMAGE_MODEL;
    delete process.env.CLOUDINARY_CLOUD_NAME;
    delete process.env.CLOUDINARY_UPLOAD_PRESET;
    globalThis.fetch = originalFetch;
  });

  const edit = await sharp({
    create: { width: 1024, height: 1536, channels: 3, background: "black" },
  }).png().toBuffer();
  let expectedTemplate;
  let expectedPeople;
  let editCalls = 0;
  globalThis.fetch = async (url, options) => {
    if (url === "https://api.cloudinary.com/v1_1/test-cloud/image/upload") {
      assert.equal(options.headers, undefined);
      assert.equal(options.body.get("file").type, "image/png");
      return Response.json({
        secure_url: "https://res.cloudinary.com/test-cloud/image/upload/postcard.png",
      });
    }
    assert.equal(url, "https://api.openai.com/v1/images/edits");
    assert.equal(options.method, "POST");
    assert.equal(options.headers.Authorization, "Bearer test-only-key");
    const request = options.body;
    const images = request.getAll("image[]");
    assert.deepEqual(images.map((image) => image.type), ["image/png", "image/webp"]);
    assert.deepEqual(Buffer.from(await images[0].arrayBuffer()), expectedTemplate);
    const reference = await sharp(Buffer.from(await images[1].arrayBuffer())).metadata();
    assert.deepEqual([reference.format, reference.width, reference.height], ["webp", 30, 20]);
    assert.equal(request.get("model"), "gpt-image-2.5-flare");
    assert.equal(request.get("size"), "1024x1536");
    assert.equal(request.get("quality"), "high");
    assert.match(request.get("prompt"), new RegExp(`exactly ${expectedPeople} faces? in each`));
    assert.match(request.get("prompt"), /left to right/);
    editCalls++;
    return Response.json({ data: [{ b64_json: edit.toString("base64") }] });
  };

  const health = await originalFetch(base + "/api/health");
  assert.equal((await health.json()).configured, true);

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

  assert.equal(editCalls, 0);
  for (const [id, file, people] of [
    ["india-solo-men", "India-Solo-Men.png", 1],
    ["india-solo-women", "India-Solo-Women.png", 1],
    ["india-duo-men", "India-Duo-Men.png", 2],
    ["india-duo-women", "India-Duo-Women.png", 2],
    ["world-tour", "India-1.png", 3],
    ["world-tour-2", "India-2.png", 3],
  ]) {
    expectedTemplate = await readFile(new URL(`../Template Images/${file}`, import.meta.url));
    expectedPeople = people;
    const response = await submit({ id });
    assert.equal(response.status, 200);
    assert.match(response.headers.get("server-timing"), /^upload;dur=[\d.]+, prepare;dur=[\d.]+, edit;dur=[\d.]+, share;dur=[\d.]+$/);
    const generated = await response.json();
    assert.match(generated.image, /^data:image\/png;base64,/);
    assert.match(generated.qrCode, /^data:image\/png;base64,/);
    assert.equal(generated.shareUrl, "https://res.cloudinary.com/test-cloud/image/upload/postcard.png");
    const postcard = Buffer.from(generated.image.split(",")[1], "base64");
    const { width, height } = await sharp(postcard).metadata();
    assert.deepEqual([width, height], [1200, 1800]);

    // The mock replaces the whole canvas. Keep only the four panel edits.
    const pixels = (image, region) => sharp(image).extract(region).removeAlpha().raw().toBuffer();
    for (const [left, top] of [[50, 50], [650, 50], [50, 850], [650, 850]]) {
      assert.deepEqual(await pixels(postcard, { left, top, width: 1, height: 1 }), Buffer.alloc(3));
    }
    const footer = { left: 0, top: 1533, width: 1200, height: 267 };
    assert.deepEqual(await pixels(postcard, footer), await pixels(expectedTemplate, footer));
  }
  assert.equal(editCalls, 6);

  delete process.env.OPENAI_API_KEY;
  const missingKey = await submit();
  assert.equal(missingKey.status, 503);
  assert.match((await missingKey.json()).error, /OPENAI_API_KEY/);
  const unconfigured = await originalFetch(base + "/api/health");
  assert.equal((await unconfigured.json()).configured, false);
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
      return new Response(JSON.stringify({ data: [{ b64_json: photo.toString("base64") }] }), {
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
