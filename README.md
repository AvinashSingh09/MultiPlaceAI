# MultiPlaces

A minimal React + Tailwind photo studio backed by Express and the OpenAI Image Edits API.

## Run locally

Requires Node.js 22 or newer.

```powershell
npm install
Copy-Item .env.example .env
# Set OPENAI_API_KEY in .env (never use a VITE_ variable for secrets).
# Set CLOUDINARY_CLOUD_NAME and CLOUDINARY_UPLOAD_PRESET. The preset must be unsigned.
npm run dev
```

Open http://localhost:5173. The API runs on port 3001. Camera access works on localhost or HTTPS; allow your browser to use your webcam. Upload supports JPG, PNG and WebP, up to 15 MB.

## Flow

Use the switch at the top to choose one of two routed experiences:

- **MultiPlaces:** select a template, capture or upload a photograph of three people, and map the same people left-to-right across all four panels.
- **Ghibli:** press Start, capture or upload any clear photo, and transform the complete scene into a hand-painted animated-film illustration.

The flows use `/multiplaces/*` and `/ghibli/*` routes, so browser Back and Forward navigation works between their start, capture, and result pages. Generated images can be downloaded and are uploaded to Cloudinary for QR-code sharing.

The server submits the original template first and the group photo second to `/v1/images/edits`, using `gpt-image-2.5-flare` by default, `medium` quality, and 1536×2304 output. The server restores the branded footer from the template. Model access and billing must be enabled on your OpenAI project. Facial likeness and proportions can vary between edits.

## Templates

Add image files to `Template Images` and register them in `server/templates.js`. The supplied prompt currently targets the provided four-panel, three-person layout; update it when supporting other layouts. The gallery is populated from the server catalog.

## Build and verification

```powershell
npm test
npm run build
npm start
```

The production build is served at http://localhost:3001. The server binds to loopback; use a same-origin HTTPS reverse proxy when hosting. Before public hosting, add authentication and account-level generation quotas. The current in-memory IP limiter is intended for local/single-instance use, not public billing protection. Set proxy trust deliberately if deploying behind a proxy.

Photos are held in memory and are not written to disk by this app. Generation sends both source images to OpenAI, then stores the generated postcard in the `multiplaces` folder in Cloudinary so it can be shared publicly by QR code. OpenAI's and Cloudinary's retention policies apply. Delete shared postcards from Cloudinary when they are no longer needed. EXIF data is removed and image orientation normalized on upload. Automatic retries are disabled to avoid duplicate billed edits.

Tests mock OpenAI and verify multipart image ordering, the selected model, input validation, and failure responses. They do not verify real model output or camera hardware.

Official references: https://developers.openai.com/api/docs/models/gpt-image-2.5-flare and https://developers.openai.com/api/reference/resources/images/methods/edit

Reference photos are normalized as lossless WebP with a 3072-pixel edge limit. Camera capture requests 4K where supported, but actual resolution depends on the webcam. Maximum-quality generation may increase latency and API costs. Use a sharply focused, well-lit original group photo with faces large in the frame; extra output pixels cannot recover missing reference detail.

