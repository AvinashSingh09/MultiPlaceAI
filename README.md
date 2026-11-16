# MultiPlaces

A React and Tailwind photo studio backed by Express and the OpenAI Image API.

## Run locally

Requires Node.js 22 or newer.

```powershell
npm install
Copy-Item .env.example .env
# Set OPENAI_API_KEY for image editing.
# Set CLOUDINARY_CLOUD_NAME and CLOUDINARY_UPLOAD_PRESET. The preset must be unsigned.
npm run dev
```

Open http://localhost:5173. The API runs on port 3001. Camera access works on localhost or HTTPS; allow your browser to use your webcam. Upload supports JPG, PNG and WebP, up to 15 MB.

## Flow

Choose 1, 2, or 3 people and select the men’s or women’s template for that group size. Capture or upload a photo with that number of clear faces. MultiPlaces sends the template and reference photo to OpenAI in one edit request. The prompt asks for the same left-to-right face mapping across all four panels and asks the model to preserve the scenes, clothing, and poses. The server places the edited panels inside the original postcard frame. You can download or print the result and share it via a Cloudinary QR code.

On Render, set `OPENAI_API_KEY`, `CLOUDINARY_CLOUD_NAME`, and `CLOUDINARY_UPLOAD_PRESET` as server environment variables. `OPENAI_IMAGE_MODEL` defaults to `gpt-image-2.5-flare`. Both MultiPlaces and the hidden Ghibli route use the same key and model.

## Templates

Add PNG files to `Template Images` and register them with their person count in `server/templates.js`. Use the existing 1200 × 1800 four-panel geometry so the server can reassemble each panel within the original frame.

## Build and verification

```powershell
npm test
npm run build
npm start
```

The production build is served at http://localhost:3001. The server binds to loopback; use a same-origin HTTPS reverse proxy when hosting. Before public hosting, add authentication and account-level generation quotas. The current in-memory IP limiter is intended for local/single-instance use, not public billing protection. Set proxy trust deliberately if deploying behind a proxy.

The web server holds incoming photos in memory, normalizes orientation, and strips EXIF before sending them to OpenAI. OpenAI’s retention policies apply. The generated postcard is stored in Cloudinary's `multiplaces` folder for public QR sharing. Automatic retries are disabled.

Tests mock OpenAI and Cloudinary to verify input validation, image order, template selection, frame preservation, and QR sharing.

Official references: https://developers.openai.com/api/docs/models/gpt-image-2.5-flare and https://developers.openai.com/api/reference/resources/images/methods/edit

Reference photos are normalized as lossless WebP with a 3072-pixel edge limit. Camera capture requests 4K where supported, but actual resolution depends on the webcam. Maximum-quality generation may increase latency and API costs. Use a sharply focused, well-lit original group photo with faces large in the frame; extra output pixels cannot recover missing reference detail.

