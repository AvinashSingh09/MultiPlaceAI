# MultiPlaces

A React and Tailwind photo studio backed by Express and ComfyUI ReActor.

## Run locally

Requires Node.js 22 or newer.

```powershell
npm install
Copy-Item .env.example .env
# Set COMFYUI_URL=http://127.0.0.1:8000 for local face swapping.
# Set CLOUDINARY_CLOUD_NAME and CLOUDINARY_UPLOAD_PRESET. The preset must be unsigned.
npm run dev
```

Open http://localhost:5173. The API runs on port 3001. Camera access works on localhost or HTTPS; allow your browser to use your webcam. Upload supports JPG, PNG and WebP, up to 15 MB.

## Flow

Select a template and capture or upload a photograph of three people. MultiPlaces maps the same people left-to-right across all four panels. The flow uses `/multiplaces/*` routes for the gallery, capture, and result pages. You can download or print the result and share it via a Cloudinary QR code.

Run ComfyUI with ReActor, `hyperswap_1a_256.onnx`, and `codeformer-v0.1.0.pth` installed. The app matches three detected faces from left to right in each panel and restores the original postcard layout. Cloudinary handles QR sharing.

For Render, point the Cloudflare Tunnel at `http://127.0.0.1:8000` on the computer running ComfyUI. Set `COMFYUI_URL` in Render to the tunnel's HTTPS hostname. Protect the hostname with a Cloudflare Access Service Auth policy and set `COMFYUI_ACCESS_CLIENT_ID` and `COMFYUI_ACCESS_CLIENT_SECRET` as server environment variables. The backend sends these credentials with ComfyUI requests.

The hidden Ghibli route uses OpenAI and requires `OPENAI_API_KEY`.

## Templates

Add image files to `Template Images` and register them in `server/templates.js`. The supplied prompt currently targets the provided four-panel, three-person layout; update it when supporting other layouts. The gallery is populated from the server catalog.

## Build and verification

```powershell
npm test
npm run build
npm start
```

The production build is served at http://localhost:3001. The server binds to loopback; use a same-origin HTTPS reverse proxy when hosting. Before public hosting, add authentication and account-level generation quotas. The current in-memory IP limiter is intended for local/single-instance use, not public billing protection. Set proxy trust deliberately if deploying behind a proxy.

The web server holds incoming photos in memory, normalizes orientation, and strips EXIF before sending them to the configured image service. With ComfyUI, the temporary input and output files are stored on the ComfyUI host. With OpenAI, its retention policies apply. The generated postcard is stored in Cloudinary's `multiplaces` folder for public QR sharing. Automatic retries are disabled.

Tests mock ComfyUI, OpenAI, and Cloudinary to verify workflow settings, tunnel authentication headers, and input validation.

Official references: https://developers.openai.com/api/docs/models/gpt-image-2.5-flare and https://developers.openai.com/api/reference/resources/images/methods/edit

Reference photos are normalized as lossless WebP with a 3072-pixel edge limit. Camera capture requests 4K where supported, but actual resolution depends on the webcam. Maximum-quality generation may increase latency and API costs. Use a sharply focused, well-lit original group photo with faces large in the frame; extra output pixels cannot recover missing reference detail.

