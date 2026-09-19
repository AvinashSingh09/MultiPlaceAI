import React, { useEffect, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import {
  ArrowUpRight,
  ArrowRight,
  ArrowLeft,
  Camera,
  Upload,
  Check,
  Users,
  Download,
  RotateCcw,
  X,
  LoaderCircle,
} from "lucide-react";
import "./style.css";

function App() {
  const [templates, setTemplates] = useState([]),
    [selected, setSelected] = useState(null),
    [step, setStep] = useState(0),
    [photo, setPhoto] = useState(null),
    [preview, setPreview] = useState(""),
    [result, setResult] = useState(""),
    [shareUrl, setShareUrl] = useState(""),
    [qrCode, setQrCode] = useState(""),
    [confirmed, setConfirmed] = useState(false),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false),
    [camera, setCamera] = useState(false),
    [ready, setReady] = useState(false),
    [opening, setOpening] = useState(false),
    [configured, setConfigured] = useState(null);
  const video = useRef(null),
    stream = useRef(null),
    cameraToken = useRef(0),
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
  function stopCamera() {
    cameraToken.current++;
    stream.current?.getTracks().forEach((t) => t.stop());
    stream.current = null;
    setCamera(false);
    setReady(false);
    setOpening(false);
  }
  async function startCamera() {
    setError("");
    setOpening(true);
    const token = ++cameraToken.current;
    try {
      if (!navigator.mediaDevices?.getUserMedia)
        throw Error(
          "Camera requires localhost or HTTPS. You can upload a photo instead.",
        );
      const s = await navigator.mediaDevices.getUserMedia({
        video: {
          facingMode: "user",
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
    setConfirmed(false);
    setPhoto(file);
  }
  function capture() {
    if (!ready || !video.current?.videoWidth) return;
    const canvas = document.createElement("canvas");
    canvas.width = video.current.videoWidth;
    canvas.height = video.current.videoHeight;
    const ctx = canvas.getContext("2d");
    ctx.translate(canvas.width, 0);
    ctx.scale(-1, 1);
    ctx.drawImage(video.current, 0, 0);
    canvas.toBlob(
      (blob) => {
        if (blob)
          choosePhoto(
            new File([blob], "group-photo.webp", { type: "image/webp" }),
          );
        else setError("Capture failed. Please try again.");
      },
      "image/webp",
      1,
    );
  }
  async function generate() {
    if (busy || !photo || !confirmed) return;
    setBusy(true);
    setError("");
    const form = new FormData();
    form.append("templateId", selected.id);
    form.append("photo", photo);
    form.append("confirmed", "true");
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
      setStep(2);
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
    setStep(0);
    setPhoto(null);
    setResult("");
    setShareUrl("");
    setQrCode("");
    setConfirmed(false);
    setError("");
  }
  return (
    <div className="min-h-screen flex flex-col">
      <main className="flex-1">
        <nav className="steps" aria-label="Progress">
          {["Choose a template", "Add your people", "Make a memory"].map(
            (name, i) => (
              <React.Fragment key={name}>
                {i > 0 && <span className="step-line" />}
                <span
                  className={`step ${i === step ? "active" : ""} ${i < step ? "done" : ""}`}
                  aria-current={i === step ? "step" : undefined}
                >
                  <span className="step-number">
                    {i < step ? (
                      <Check size={12} />
                    ) : (
                      String(i + 1).padStart(2, "0")
                    )}
                  </span>
                  <span>{name}</span>
                </span>
              </React.Fragment>
            ),
          )}
        </nav>
        {error && (
          <div className="error" role="alert">
            {error}
            <button onClick={() => setError("")} aria-label="Dismiss error">
              <X size={16} />
            </button>
          </div>
        )}
        {step === 0 && (
          <section className="selection-layout">
            <div className="intro">
              <h1>
                Your people.
                <br />A whole new
                <br />
                <span>point of view.</span>
              </h1>
              <p className="intro-copy">
                A familiar face. An unfamiliar place.
                <br />
                Pick a template, get everyone in the frame,
                <br className="desktop-break" /> and take home a memory.
              </p>
              <div className="collection-heading">
                <span>01 — THE TRAVEL COLLECTION</span>
                <span>
                  {templates.length} TEMPLATE{templates.length !== 1 ? "S" : ""}
                </span>
              </div>
              <div className="template-options space-y-3">
                {templates.map((t) => (
                  <button
                    className={`template-option ${selected?.id === t.id ? "selected" : ""}`}
                    key={t.id}
                    aria-pressed={selected?.id === t.id}
                    onClick={() => setSelected(t)}
                  >
                    <span
                      className="template-thumbnail"
                      style={{ backgroundImage: `url('${t.image}')` }}
                    />
                    <span className="text-left flex-1">
                      <strong>{t.name}</strong>
                      <small>
                        {t.scenes} destinations · {t.people} people
                      </small>
                    </span>
                    <span className="selection-check" aria-hidden="true">
                      {selected?.id === t.id && <Check size={14} />}
                    </span>
                  </button>
                ))}
              </div>
              <button
                className="primary mt-6"
                disabled={!selected}
                onClick={() => {
                  setStep(1);
                  setError("");
                }}
              >
                Use this template
                <ArrowRight size={18} />
              </button>
            </div>
            <div className="art-section">
              <div className="art-top">
                <span>THE WORLD LOOKS BETTER TOGETHER</span>
                <ArrowUpRight size={18} />
              </div>
              <div className="poster-wrap">
                {selected && (
                  <img
                    className="poster"
                    src={selected.image}
                    alt="Four-scene travel collage featuring three people in Singapore, Sydney, Seoul and Agra"
                  />
                )}
                <span className="poster-caption">YOUR NEXT POSTCARD</span>
              </div>
              <div className="art-bottom">
                <span>{selected?.name || "Loading template…"}</span>
                <span>{String(templates.findIndex((t) => t.id === selected?.id) + 1).padStart(2, "0")} / {String(templates.length).padStart(2, "0")}</span>
              </div>
            </div>
          </section>
        )}
        {step === 1 && (
          <section className="capture-layout">
            <div className="capture-main">
              <button
                className="text-button"
                disabled={busy}
                onClick={() => {
                  stopCamera();
                  setStep(0);
                }}
              >
                <ArrowLeft size={15} />
                Templates
              </button>
              <p className="eyebrow mt-8">BETTER WITH ALL THREE OF YOU</p>
              <h2>
                {photo
                  ? "Looking good together."
                  : "Get your people in the frame."}
              </h2>
              <p className="muted mt-3 mb-7">
                {photo
                  ? "Check the photo and the left-to-right order before you continue."
                  : "Stand side by side, face the camera, and find a little good light."}
              </p>
              <div className={`camera-frame ${photo ? "has-photo" : ""}`}>
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
                      onLoadedData={() => setReady(true)}
                      className="camera-video"
                    />
                    <div className="face-guides" aria-hidden="true">
                      {[1, 2, 3].map((n) => (
                        <div key={n}>
                          <span />
                          {n}
                        </div>
                      ))}
                    </div>
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
                    <h3>Three faces. One great photo.</h3>
                    <p>
                      Keep every face visible, with a little space between you.
                    </p>
                    <button
                      className="primary"
                      onClick={startCamera}
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
                  <span>Left to right: person 1, 2, 3</span>
                  <button
                    className="primary"
                    onClick={capture}
                    disabled={!ready}
                  >
                    <Camera size={17} />
                    Capture photo
                  </button>
                </div>
              )}
              {photo && (
                <>
                  <div className="capture-controls">
                    <span>Person 1 → Person 2 → Person 3</span>
                    <button
                      className="text-button"
                      disabled={busy}
                      onClick={() => {
                        setPhoto(null);
                        setConfirmed(false);
                        setError("");
                      }}
                    >
                      <RotateCcw size={14} />
                      Retake photo
                    </button>
                  </div>
                  <label className="confirmation">
                    <input
                      type="checkbox"
                      checked={confirmed}
                      disabled={busy}
                      onChange={(e) => setConfirmed(e.target.checked)}
                    />
                    <span>
                      Exactly three people are clearly visible, and everyone
                      agrees to use their photo for this edit.
                    </span>
                  </label>
                  <button
                    className="primary generate"
                    disabled={!confirmed || busy}
                    onClick={generate}
                  >
                    {busy ? (
                      <>
                        <LoaderCircle className="animate-spin" size={18} />
                        Creating your postcard…
                      </>
                    ) : (
                      <>
                        Create our postcard
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
              <p className="privacy-note">
                Your photo is sent to OpenAI only when you create your postcard.
                This app does not save your photos.
              </p>
            </div>
            <aside className="selected-aside">
              <span className="eyebrow">YOUR CHOSEN TEMPLATE</span>
              <img
                src={selected?.image}
                alt="Selected travel collage template"
              />
              <h3>{selected?.name}</h3>
              <p>Three people. Four destinations.</p>
              <div className="mapping-note">
                <Users size={18} />
                <span>
                  The same three faces appear in every scene, in the order shown
                  in your photo.
                </span>
              </div>
            </aside>
          </section>
        )}
        {step === 2 && (
          <section className="result-layout">
            <div className="result-image">
              <img src={result} alt="Your generated travel postcard" />
            </div>
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
                download="multiplaces-postcard.png"
              >
                <Download size={18} />
                Download postcard
              </a>
              <button className="text-button" onClick={reset}>
                <ArrowLeft size={15} />
                Back
              </button>
            </div>
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
  );
}
createRoot(document.getElementById("root")).render(<App />);
