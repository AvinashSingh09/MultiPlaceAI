import React, { useEffect, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import {
  BrowserRouter,
  Navigate,
  Route,
  Routes,
  useLocation,
  useNavigate,
} from "react-router-dom";
import {
  ArrowRight,
  ArrowLeft,
  Camera,
  Upload,
  Check,
  Users,
  Download,
  Printer,
  RotateCcw,
  SwitchCamera,
  Maximize2,
  Minimize2,
  X,
  LoaderCircle,
} from "lucide-react";
import "./style.css";

function App() {
  const location = useLocation();
  const navigate = useNavigate();
  const isGhibli = location.pathname.startsWith("/ghibli");
  const mode = isGhibli ? "ghibli" : "multiplaces";
  const step = location.pathname.endsWith("/capture")
    ? 1
    : location.pathname.endsWith("/result")
      ? 2
      : 0;
  const [templates, setTemplates] = useState([]),
    [selected, setSelected] = useState(null),
    [photo, setPhoto] = useState(null),
    [preview, setPreview] = useState(""),
    [result, setResult] = useState(""),
    [shareUrl, setShareUrl] = useState(""),
    [qrCode, setQrCode] = useState(""),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false),
    [camera, setCamera] = useState(false),
    [ready, setReady] = useState(false),
    [capturing, setCapturing] = useState(false),
    [opening, setOpening] = useState(false),
    [facingMode, setFacingMode] = useState("user"),
    [fullscreen, setFullscreen] = useState(false),
    [configured, setConfigured] = useState(null);
  const video = useRef(null),
    stream = useRef(null),
    cameraToken = useRef(0),
    automaticCameraPath = useRef(""),
    fileInput = useRef(null);
  useEffect(() => {
    fetch("/api/templates")
      .then((r) => {
        if (!r.ok) throw Error();
        return r.json();
      })
      .then((t) => {
        setTemplates(t);
        setSelected(t[0]);
      })
      .catch(() =>
        setError("Could not load templates. Please refresh to try again."),
      );
    fetch("/api/health")
      .then((r) => r.json())
      .then((d) => setConfigured(d.configured))
      .catch(() => { });
    return () => {
      cameraToken.current++;
      stream.current?.getTracks().forEach((t) => t.stop());
    };
  }, []);
  useEffect(() => {
    if (!photo) {
      setPreview("");
      return;
    }
    const url = URL.createObjectURL(photo);
    setPreview(url);
    return () => URL.revokeObjectURL(url);
  }, [photo]);
  useEffect(() => {
    if (camera && video.current && stream.current)
      video.current.srcObject = stream.current;
  }, [camera]);
  useEffect(() => {
    if (step !== 1) {
      automaticCameraPath.current = "";
      if (stream.current) stopCamera();
      return;
    }
    if (
      !photo &&
      !camera &&
      !opening &&
      automaticCameraPath.current !== location.pathname
    ) {
      automaticCameraPath.current = location.pathname;
      startCamera();
    }
  }, [step, photo, camera, opening, location.pathname]);
  useEffect(() => {
    if (step === 2 && !result) navigate(`/${mode}`, { replace: true });
  }, [step, result, mode, navigate]);
  useEffect(() => {
    if (!busy) return;
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => { document.body.style.overflow = previous; };
  }, [busy]);
  useEffect(() => {
    const updateFullscreen = () =>
      setFullscreen(
        Boolean(document.fullscreenElement || document.webkitFullscreenElement),
      );
    document.addEventListener("fullscreenchange", updateFullscreen);
    document.addEventListener("webkitfullscreenchange", updateFullscreen);
    updateFullscreen();
    return () => {
      document.removeEventListener("fullscreenchange", updateFullscreen);
      document.removeEventListener("webkitfullscreenchange", updateFullscreen);
    };
  }, []);
  async function toggleFullscreen() {
    setError("");
    const isFullscreen =
      document.fullscreenElement || document.webkitFullscreenElement;
    try {
      if (isFullscreen) {
        const exit = document.exitFullscreen || document.webkitExitFullscreen;
        if (!exit) throw Error("Fullscreen is not supported on this device.");
        await exit.call(document);
      } else {
        const root = document.documentElement;
        const enter = root.requestFullscreen || root.webkitRequestFullscreen;
        if (!enter) throw Error("Fullscreen is not supported on this device.");
        await enter.call(root);
      }
    } catch (fullscreenError) {
      setError(
        fullscreenError.message || "Fullscreen could not be opened on this device.",
      );
    }
  }
  function stopCamera() {
    cameraToken.current++;
    stream.current?.getTracks().forEach((t) => t.stop());
    stream.current = null;
    setCamera(false);
    setReady(false);
    setCapturing(false);
    setOpening(false);
  }
  async function startCamera(requestedFacingMode = facingMode) {
    setError("");
    setOpening(true);
    setReady(false);
    stream.current?.getTracks().forEach((t) => t.stop());
    stream.current = null;
    setCamera(false);
    const token = ++cameraToken.current;
    try {
      if (!navigator.mediaDevices?.getUserMedia)
        throw Error(
          "Camera requires localhost or HTTPS. You can upload a photo instead.",
        );
      const s = await navigator.mediaDevices.getUserMedia({
        video: {
          facingMode: { ideal: requestedFacingMode },
          width: { ideal: 3840 },
          height: { ideal: 2160 },
        },
        audio: false,
      });
      if (token !== cameraToken.current) {
        s.getTracks().forEach((t) => t.stop());
        return;
      }
      stream.current = s;
      setFacingMode(requestedFacingMode);
      setCamera(true);
    } catch (e) {
      setError(
        e.name === "NotAllowedError"
          ? "Camera access was denied. Allow it in your browser, or upload a photo."
          : e.message || "Camera unavailable. Upload a photo instead.",
      );
    } finally {
      setOpening(false);
    }
  }
  function switchCamera() {
    if (opening || capturing) return;
    startCamera(facingMode === "user" ? "environment" : "user");
  }
  function choosePhoto(file) {
    if (!file) return;
    setError("");
    if (!["image/jpeg", "image/png", "image/webp"].includes(file.type)) {
      setError("Choose a JPG, PNG or WebP photo.");
      return;
    }
    if (file.size > 15 * 1024 * 1024) {
      setError("Choose a photo smaller than 15 MB.");
      return;
    }
    stopCamera();
    setPhoto(file);
  }
  async function capture() {
    if (capturing) return;
    const source = video.current;
    if (!source || source.readyState < 2 || !source.videoWidth) {
      setError("The camera is still getting ready. Please wait a moment.");
      return;
    }
    setCapturing(true);
    setError("");
    const token = cameraToken.current;
    let timeout;
    try {
      const canvas = document.createElement("canvas");
      // Match the portrait preview crop and the server's 3072-pixel limit.
      const cropWidth = isGhibli
        ? Math.min(source.videoWidth, source.videoHeight * 3 / 4)
        : source.videoWidth;
      const cropHeight = isGhibli ? cropWidth * 4 / 3 : source.videoHeight;
      const scale = Math.min(1, 3072 / Math.max(cropWidth, cropHeight));
      canvas.width = Math.round(cropWidth * scale);
      canvas.height = Math.round(cropHeight * scale);
      const ctx = canvas.getContext("2d");
      if (!ctx) throw Error("Camera canvas is unavailable.");
      if (facingMode === "user") {
        ctx.translate(canvas.width, 0);
        ctx.scale(-1, 1);
      }
      ctx.drawImage(
        source,
        (source.videoWidth - cropWidth) / 2,
        (source.videoHeight - cropHeight) / 2,
        cropWidth, cropHeight, 0, 0, canvas.width, canvas.height,
      );
      const blob = await new Promise((resolve, reject) => {
        timeout = setTimeout(() => reject(Error("Capture timed out.")), 10000);
        canvas.toBlob(resolve, "image/jpeg", 0.95);
      });
      if (!blob) throw Error("Could not encode the camera frame.");
      if (token === cameraToken.current) {
        const extension = blob.type === "image/png" ? "png" : "jpg";
        choosePhoto(new File([blob], `camera-photo.${extension}`, { type: blob.type }));
      }
    } catch {
      if (token === cameraToken.current) {
        setError("Could not capture the photo. Try again or upload a photo.");
      }
    } finally {
      clearTimeout(timeout);
      if (token === cameraToken.current) setCapturing(false);
    }
  }
  async function generate() {
    if (busy || !photo) return;
    setBusy(true);
    setError("");
    const form = new FormData();
    form.append("mode", mode);
    if (!isGhibli) form.append("templateId", selected.id);
    form.append("photo", photo);
    try {
      const r = await fetch("/api/generate", {
        method: "POST",
        body: form,
        signal: AbortSignal.timeout(330000),
      });
      const d = await r.json();
      if (!r.ok)
        throw Error(d.error || "Unable to generate. Please try again.");
      if (!d.image) throw Error("No image was returned. Please try again.");
      setResult(d.image);
      setShareUrl(d.shareUrl || "");
      setQrCode(d.qrCode || "");
      navigate(`/${mode}/result`);
    } catch (e) {
      setError(
        e.name === "TimeoutError"
          ? "The request timed out. Please try again."
          : e.message,
      );
    } finally {
      setBusy(false);
    }
  }
  function reset() {
    stopCamera();
    setPhoto(null);
    setResult("");
    setShareUrl("");
    setQrCode("");
    setError("");
    navigate(`/${mode}`);
  }
  function printPhoto() {
    const frame = document.createElement("iframe");
    frame.className = "photo-print-frame";
    frame.title = "Photo print";
    frame.setAttribute("aria-hidden", "true");
    frame.tabIndex = -1;
    frame.srcdoc = `<!doctype html>
      <html><head><meta charset="utf-8"><style>
        @page { margin: 0; }
        html, body { margin: 0; }
        body { box-sizing: border-box; padding: 8mm; }
        img {
          display: block;
          width: auto;
          height: auto;
          max-width: 100%;
          max-height: 230mm;
          margin: 0 auto;
        }
      </style></head><body><img alt=""></body></html>`;
    frame.onload = async function loadPhoto() {
      const printWindow = frame.contentWindow;
      const image = printWindow.document.querySelector("img");
      image.src = result;
      try {
        await image.decode();
        printWindow.addEventListener("afterprint", () => frame.remove(), { once: true });
        printWindow.focus();
        printWindow.print();
      } catch {
        frame.remove();
        setError("Could not print the photo. Please try again.");
      }
    };
    document.body.append(frame);
  }
  function switchMode(nextMode) {
    stopCamera();
    setPhoto(null);
    setResult("");
    setShareUrl("");
    setQrCode("");
    setError("");
    navigate(`/${nextMode}`);
  }
  return (
    <>
      <div className="min-h-screen flex flex-col" inert={busy ? true : undefined}>
        <header className={`site-header ${fullscreen ? "is-fullscreen" : ""}`}>
          <button className="site-logo" onClick={() => switchMode(mode)}>
            <img
              src="/templates/Veeva_Systems_Logo.svg"
              alt="Veeva Systems"
            />
          </button>
          <nav className="mode-switch" aria-label="Choose experience">
            <button
              className={isGhibli ? "active" : ""}
              aria-pressed={isGhibli}
              onClick={() => switchMode("ghibli")}
            >
              Ghibli
            </button>
            <button
              className={!isGhibli ? "active" : ""}
              aria-pressed={!isGhibli}
              onClick={() => switchMode("multiplaces")}
            >
              MultiPlaces
            </button>
          </nav>
          <button
            className="fullscreen-toggle"
            onClick={toggleFullscreen}
            aria-label={fullscreen ? "Exit fullscreen" : "Enter fullscreen"}
            title={fullscreen ? "Exit fullscreen" : "Enter fullscreen"}
          >
            {fullscreen ? <Minimize2 size={20} /> : <Maximize2 size={20} />}
          </button>
        </header>
        <main className="flex-1">
          <Routes>
            <Route path="/" element={<Navigate to="/multiplaces" replace />} />
            <Route path="/multiplaces" element={null} />
            <Route path="/multiplaces/capture" element={null} />
            <Route path="/multiplaces/result" element={null} />
            <Route path="/ghibli" element={null} />
            <Route path="/ghibli/capture" element={null} />
            <Route path="/ghibli/result" element={null} />
            <Route path="*" element={<Navigate to="/multiplaces" replace />} />
          </Routes>
          {error && (
            <div className="error" role="alert">
              {error}
              <button onClick={() => setError("")} aria-label="Dismiss error">
                <X size={16} />
              </button>
            </div>
          )}
          {!isGhibli && step === 0 && (
            <section className="template-gallery-layout">
              <div className="template-gallery" aria-label="Choose a template">
                {templates.map((t) => {
                  const isSelected = selected?.id === t.id;
                  return (
                    <button
                      className={`template-card ${isSelected ? "selected" : ""}`}
                      key={t.id}
                      aria-label={`Select ${t.name}`}
                      aria-pressed={isSelected}
                      onClick={() => setSelected(t)}
                    >
                      <img src={t.image} alt={t.name} />
                      {isSelected && (
                        <span className="template-card-check" aria-hidden="true">
                          <Check size={18} strokeWidth={2.5} />
                        </span>
                      )}
                    </button>
                  );
                })}
              </div>
              <button
                className="primary template-continue"
                disabled={!selected}
                onClick={() => {
                  navigate("/multiplaces/capture");
                  setError("");
                }}
              >
                Continue
                <ArrowRight size={18} />
              </button>
            </section>
          )}
          {isGhibli && step === 0 && (
            <section className="ghibli-start">
            <div className="ghibli-copy">
              <button
                className="primary ghibli-start-button"
                  onClick={() => navigate("/ghibli/capture")}
                >
                Start
                <ArrowRight size={18} />
              </button>
            </div>
              <figure className="ghibli-showcase">
                <img
                  src="/templates/ghibli-style.png"
                  alt="Example of the warm hand-painted portrait style"
                />
              </figure>
            </section>
          )}
          {step === 1 && (
          <section className="capture-layout solo">
              <div className="capture-main">
                <button
                  className="text-button"
                  disabled={busy}
                  onClick={() => {
                    stopCamera();
                    navigate(isGhibli ? "/ghibli" : "/multiplaces");
                  }}
                >
                  <ArrowLeft size={15} />
                  Back
                </button>
                <div className={`camera-frame ${photo ? "has-photo" : ""} ${isGhibli ? "portrait-frame" : ""}`}>
                  {photo ? (
                    <img
                      src={preview}
                      alt="Your group photo, in the exact order used for editing"
                    />
                  ) : camera ? (
                    <>
                      <video
                        ref={video}
                        autoPlay
                        muted
                        playsInline
                        onCanPlay={() => setReady(true)}
                        className={`camera-video ${facingMode === "environment" ? "rear-camera" : ""}`}
                      />
                      {!isGhibli && <div className="face-guides" aria-hidden="true">
                        {[1, 2, 3].map((n) => (
                          <div key={n}>
                            <span />
                            {n}
                          </div>
                        ))}
                      </div>}
                      <button
                        className="switch-camera"
                        aria-label={facingMode === "user" ? "Use rear camera" : "Use front camera"}
                        title={facingMode === "user" ? "Use rear camera" : "Use front camera"}
                        onClick={switchCamera}
                        disabled={opening || capturing}
                      >
                        <SwitchCamera size={19} />
                      </button>
                      <button
                        className="close-camera"
                        aria-label="Close camera"
                        onClick={stopCamera}
                      >
                        <X size={18} />
                      </button>
                    </>
                  ) : (
                    <div className="camera-placeholder">
                      <div className="people-outline">
                        <Users size={50} strokeWidth={1} />
                      </div>
                      <h3>
                        {isGhibli ? "One photo. A hand-painted world." : "Three faces. One great photo."}
                      </h3>
                      <p>
                        {isGhibli
                          ? "Keep faces clear and the full scene inside the frame."
                          : "Keep every face visible, with a little space between you."}
                      </p>
                      <button
                        className="primary"
                        onClick={() => startCamera()}
                        disabled={opening}
                      >
                        <Camera size={17} />
                        {opening ? "Opening camera…" : "Open camera"}
                      </button>
                      <button
                        className="text-button"
                        onClick={() => fileInput.current.click()}
                      >
                        <Upload size={15} />
                        Or upload a photo
                      </button>
                    </div>
                  )}
                </div>
                <input
                  ref={fileInput}
                  className="hidden"
                  type="file"
                  accept="image/jpeg,image/png,image/webp"
                  onChange={(e) => {
                    choosePhoto(e.target.files?.[0]);
                    e.target.value = "";
                  }}
                />
                {camera && (
                  <div className="capture-controls">
                    <span>{isGhibli ? "Keep the scene inside the frame" : "Left to right: person 1, 2, 3"}</span>
                    <button
                      className="primary"
                      onClick={capture}
                      disabled={!ready || capturing}
                    >
                      <Camera size={17} />
                      {!ready
                        ? "Camera getting ready…"
                        : capturing
                          ? "Capturing…"
                          : "Capture photo"}
                    </button>
                  </div>
                )}
                {photo && (
                  <>
                    <div className="capture-controls">
                      <span>{isGhibli ? "Review your photo" : "Person 1 → Person 2 → Person 3"}</span>
                      <button
                        className="text-button"
                        disabled={busy}
                        onClick={() => {
                          setPhoto(null);
                          setError("");
                        }}
                      >
                        <RotateCcw size={14} />
                        Retake photo
                      </button>
                    </div>
                    <button
                      className="primary generate"
                      disabled={busy}
                      onClick={generate}
                    >
                      {busy ? (
                        <>
                          <LoaderCircle className="animate-spin" size={18} />
                          {isGhibli ? "Painting your illustration…" : "Creating your postcard…"}
                        </>
                      ) : (
                        <>
                          {isGhibli ? "Create Ghibli portrait" : "Create our postcard"}
                          <ArrowRight size={18} />
                        </>
                      )}
                    </button>
                    {busy && (
                      <p className="muted mt-3" role="status">
                        This can take a few minutes. Keep this page open.
                      </p>
                    )}
                  </>
                )}
            </div>
          </section>
          )}
          {step === 2 && (
            <section className="result-layout">
              <div className="result-image">
                <img src={result} alt="Your generated travel postcard" />
              </div>
              <aside className="result-sidebar">
                {qrCode && shareUrl && (
                  <a
                    className="share-qr"
                    href={shareUrl}
                    target="_blank"
                    rel="noreferrer"
                    aria-label="Open shared postcard"
                  >
                    <img src={qrCode} alt="QR code linking to your shared postcard" />
                    <span>Scan to open and share</span>
                  </a>
                )}
                <div className="result-actions">
                  <a
                    className="primary"
                    href={result}
                    download={isGhibli ? "ghibli-portrait.png" : "multiplaces-postcard.png"}
                  >
                    <Download size={18} />
                    Download postcard
                  </a>
                  <button
                    className="text-button"
                    type="button"
                    onClick={printPhoto}
                  >
                    <Printer size={18} />
                    Print
                  </button>
                  <button className="text-button" onClick={reset}>
                    <ArrowLeft size={15} />
                    Back
                  </button>
                </div>
              </aside>
            </section>
          )}
        </main>
        <footer>
          <span>Made for the places you’ll go. And the people you’ll take.</span>
          <span>MULTIPLACES STUDIO · 2026</span>
        </footer>
        {configured === false && step === 1 && (
          <div className="setup-note">
            Preview mode · Add your OpenAI and Cloudinary settings to enable image editing and sharing.
          </div>
        )}
      </div>
      {busy && (
        <div className="generation-screen" role="status" aria-live="polite" aria-atomic="true">
          <div className="generation-art" aria-hidden="true">
            <span className="generation-orbit" />
            <span className="generation-orbit orbit-inner" />
            <div className="generation-photo">
              {preview && <img src={preview} alt="" />}
              <span className="generation-scan" />
            </div>
          </div>
          <p className="generation-title">{isGhibli ? "Painting your story" : "Creating your postcard"}</p>
          <p className="generation-note">A little detail takes a little time.</p>
          <div className="generation-dots" aria-hidden="true"><span /><span /><span /></div>
          <p className="generation-hint">This may take a few minutes. Keep this page open.</p>
        </div>
      )}
    </>
  );
}
createRoot(document.getElementById("root")).render(
  <BrowserRouter>
    <App />
  </BrowserRouter>,
);
