import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import sharp from "sharp";
process.env.NODE_ENV = "test";
const { app } = await import("./index.js");
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
test("generation validates requests and sends both images in order", async () => {
  process.env.OPENAI_API_KEY = "test-only-key";
  process.env.CLOUDINARY_CLOUD_NAME = "test-cloud";
  process.env.CLOUDINARY_UPLOAD_PRESET = "test-unsigned-preset";
  for (const [options, message] of [
    [{ id: "../secret" }, "Choose"],
    [{ buffer: Buffer.from("bad image") }, "could not be read"],
  ]) {
    const r = await originalFetch(base + "/api/generate", {
      method: "POST",
      body: form(options),
    });
    assert.equal(r.status, 400);
    assert.match((await r.json()).error, new RegExp(message));
  }
  let calls = 0;
  globalThis.fetch = async (url, options) => {
    calls++;
    if (url === "https://api.cloudinary.com/v1_1/test-cloud/image/upload") {
      const cloudinaryForm = options.body;
      assert.equal(cloudinaryForm.get("upload_preset"), "test-unsigned-preset");
      assert.equal(cloudinaryForm.get("folder"), "multiplaces");
      assert.equal(cloudinaryForm.get("file").name, "multiplaces-postcard.png");
      return new Response(
        JSON.stringify({
          secure_url:
            "https://res.cloudinary.com/test-cloud/image/upload/postcard.png",
        }),
        { status: 200 },
      );
    }
    assert.equal(url, "https://api.openai.com/v1/images/edits");
    const f = options.body;
    assert.equal(f.get("model"), "gpt-image-2.5-flare");
    assert.deepEqual(
      f.getAll("image[]").map((i) => i.name),
      ["template.png", "group.webp"],
    );
    assert.match(f.get("prompt"), /SAME three identities/);
    assert.match(f.get("prompt"), /Veeva logo exactly as shown/);
    assert.equal(f.get("size"), "1536x2304");
    assert.equal(f.get("quality"), "medium");
    assert.equal(f.get("mask"), null);
    const reference = f.getAll("image[]")[1];
    const metadata = await sharp(Buffer.from(await reference.arrayBuffer())).metadata();
    assert.equal(metadata.format, "webp");
    assert.equal(metadata.width, 30); // Small references must not be artificially enlarged.
    const generatedPng = await sharp({
      create: {
        width: 1200,
        height: 1800,
        channels: 4,
        background: { r: 20, g: 40, b: 60, alpha: 1 },
      },
    }).png().toBuffer();
    return new Response(JSON.stringify({
      data: [{ b64_json: generatedPng.toString("base64") }],
    }), {
      status: 200,
    });
  };
  let r = await originalFetch(base + "/api/generate", {
    method: "POST",
    body: form(),
  });
  assert.equal(r.status, 200);
  const generated = await r.json();
  assert.match(generated.image, /^data:image\/png;base64,/);
  assert.equal(
    generated.shareUrl,
    "https://res.cloudinary.com/test-cloud/image/upload/postcard.png",
  );
  assert.match(generated.qrCode, /^data:image\/png;base64,/);
  assert.equal(calls, 2);
  globalThis.fetch = async () =>
    new Response(JSON.stringify({ error: { code: "rate_limit" } }), {
      status: 429,
    });
  r = await originalFetch(base + "/api/generate", {
    method: "POST",
    body: form(),
  });
  assert.equal(r.status, 429);
  delete process.env.CLOUDINARY_UPLOAD_PRESET;
  globalThis.fetch = async () => {
    throw new Error("OpenAI must not be called without sharing configuration");
  };
  r = await originalFetch(base + "/api/generate", {
    method: "POST",
    body: form(),
  });
  assert.equal(r.status, 503);
  process.env.CLOUDINARY_UPLOAD_PRESET = "test-unsigned-preset";
  delete process.env.OPENAI_API_KEY;
  r = await originalFetch(base + "/api/generate", {
    method: "POST",
    body: form(),
  });
  assert.equal(r.status, 503);
  delete process.env.CLOUDINARY_CLOUD_NAME;
  delete process.env.CLOUDINARY_UPLOAD_PRESET;
  globalThis.fetch = originalFetch;
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
