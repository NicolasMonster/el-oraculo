import { useState, useCallback } from "react";

const GEMINI_API_KEY = "AIzaSyD24yAnbb6JLO2VCIy4KrUvQB24unrZ2TE";
const GEMINI_FLASH_MODEL = "gemini-1.5-flash-001";
const GEMINI_IMAGE_MODEL = "imagen-3.0-generate-001";

const SYSTEM_PROMPT = `Eres el narrador de un juego de aventuras interactivo e impredecible. Respondés SOLO con JSON válido. Sin markdown, sin texto extra.
La estructura NO es fija:
- A veces 2 opciones (decisión binaria)
- A veces 3 o 4 opciones  
- A veces tipo "automatica" sin opciones, para tensión pura
La historia termina cuando narrativamente tenga sentido.
image_prompt SIEMPRE en inglés, cinematográfico.

Escena con opciones: {"scene":"...","image_prompt":"...","tipo":"opciones","choices":[{"id":"A","text":"...","icon":"🔥"}],"is_ending":false,"chapter":1,"mood":"tension"}
Escena automática: {"scene":"...","image_prompt":"...","tipo":"automatica","boton_continuar":"Seguir...","is_ending":false,"chapter":2,"mood":"horror"}
Final: {"scene":"...","image_prompt":"...","tipo":"final","is_ending":true,"ending_type":"victoria","chapter":7,"mood":"epic"}
mood: calm|tension|horror|action|mystery|epic|melancholy|dread`;

const PROMPT_ALEATORIO = `Creá una historia de aventuras completamente aleatoria. Elegí vos el género, mundo, conflicto y tono. Sorprendeme. Primera escena ya. SOLO JSON válido.`;

const MOODS = {
  calm: { accent: "#6ab0c8", dim: "rgba(106,176,200,0.25)", bg: "#04080d" },
  tension: { accent: "#c9a84c", dim: "rgba(180,130,40,0.25)", bg: "#04040a" },
  horror: { accent: "#c0392b", dim: "rgba(192,57,43,0.25)", bg: "#060203" },
  action: { accent: "#e67e22", dim: "rgba(230,126,34,0.25)", bg: "#050301" },
  mystery: { accent: "#8e44ad", dim: "rgba(142,68,173,0.25)", bg: "#030408" },
  epic: { accent: "#d4a843", dim: "rgba(212,168,67,0.25)", bg: "#030201" },
  melancholy: { accent: "#7f8c8d", dim: "rgba(127,140,141,0.25)", bg: "#030405" },
  dread: { accent: "#922b21", dim: "rgba(146,43,33,0.25)", bg: "#040100" },
};
const getMood = m => MOODS[m] || MOODS.tension;

async function callGeminiFlash(messages) {
  const url = `https://generativelanguage.googleapis.com/v1/models/${GEMINI_FLASH_MODEL}:generateContent?key=${GEMINI_API_KEY}`;

  // Convert message history to Gemini format
  const contents = messages.map(m => ({
    role: m.role === "assistant" ? "model" : "user",
    parts: [{ text: m.content }]
  }));

  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      contents: [
        { role: "user", parts: [{ text: SYSTEM_PROMPT + "\n\n" + contents[0].parts[0].text }] },
        ...contents.slice(1)
      ],
      generationConfig: {
        temperature: 1.0,
        maxOutputTokens: 1200,
      }
    })
  });

  if (!res.ok) {
    const e = await res.json().catch(() => ({}));
    throw new Error(e?.error?.message || `Gemini Flash ${res.status}`);
  }

  const data = await res.json();
  const text = data?.candidates?.[0]?.content?.parts?.[0]?.text || "";
  const clean = text.replace(/```json[\s\S]*?```|```/g, "").trim();
  return JSON.parse(clean);
}

async function callGeminiImage(prompt) {
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_IMAGE_MODEL}:predict?key=${GEMINI_API_KEY}`;
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      instances: [{ prompt: prompt + ", ultra detailed, cinematic, 8k" }],
      parameters: { sampleCount: 1, aspectRatio: "16:9" }
    })
  });
  if (!res.ok) {
    const e = await res.json().catch(() => ({}));
    throw new Error(e?.error?.message || `Gemini Imagen ${res.status}`);
  }
  const data = await res.json();
  const b64 = data?.predictions?.[0]?.bytesBase64Encoded;
  if (!b64) throw new Error("No image");
  return `data:image/png;base64,${b64}`;
}

const KF = `
  @keyframes spin{to{transform:rotate(360deg)}}
  @keyframes fadeUp{from{opacity:0;transform:translateY(16px)}to{opacity:1;transform:translateY(0)}}
  @keyframes pulse{0%,100%{opacity:.4}50%{opacity:1}}
  @keyframes flicker{0%,100%{opacity:1}50%{opacity:.85}}
`;

export default function App() {
  const [screen, setScreen] = useState("intro");
  const [customPrompt, setCustomPrompt] = useState("");
  const [scene, setScene] = useState(null);
  const [imageUrl, setImageUrl] = useState(null);
  const [imageLoading, setImageLoading] = useState(false);
  const [imageError, setImageError] = useState(false);
  const [history, setHistory] = useState([]);
  const [processing, setProcessing] = useState(false);
  const [fadeIn, setFadeIn] = useState(false);
  const [mood, setMood] = useState("tension");

  const C = getMood(mood);

  const loadImage = useCallback(async (prompt) => {
    setImageLoading(true); setImageError(false); setImageUrl(null);
    try { setImageUrl(await callGeminiImage(prompt)); }
    catch { setImageError(true); }
    finally { setImageLoading(false); }
  }, []);

  const applyScene = (s, h) => {
    setScene(s); setHistory(h); setMood(s.mood || "tension");
    setFadeIn(false); setTimeout(() => setFadeIn(true), 60);
    loadImage(s.image_prompt);
  };

  const startRandom = async () => {
    setScreen("loading");
    try {
      const first = await callGeminiFlash([{ role: "user", content: PROMPT_ALEATORIO }]);
      applyScene(first, [
        { role: "user", content: PROMPT_ALEATORIO },
        { role: "assistant", content: JSON.stringify(first) }
      ]);
      setScreen("playing");
    } catch (e) {
      console.error(e);
      setScreen("intro");
    }
  };

  const startCustom = async () => {
    if (!customPrompt.trim()) return;
    setScreen("loading");
    const p = `El jugador quiere: "${customPrompt}". Primera escena ya. SOLO JSON válido.`;
    try {
      const first = await callGeminiFlash([{ role: "user", content: p }]);
      applyScene(first, [
        { role: "user", content: p },
        { role: "assistant", content: JSON.stringify(first) }
      ]);
      setScreen("playing");
    } catch (e) {
      console.error(e);
      setScreen("intro");
    }
  };

  const handleChoice = async (txt) => {
    if (processing) return;
    setProcessing(true); setFadeIn(false);
    setTimeout(async () => {
      setScreen("loading");
      const um = { role: "user", content: `Eligió: "${txt}". Continuá. SOLO JSON.` };
      try {
        const next = await callGeminiFlash([...history, um]);
        applyScene(next, [...history, um, { role: "assistant", content: JSON.stringify(next) }]);
        setScreen("playing");
      } catch (e) {
        console.error(e);
        setScreen("playing");
        setFadeIn(true);
      } finally {
        setProcessing(false);
      }
    }, 300);
  };

  const reset = () => {
    setScreen("intro"); setScene(null); setImageUrl(null);
    setHistory([]); setMood("tension"); setFadeIn(false); setCustomPrompt("");
  };

  // ── INTRO ──────────────────────────────────────────────────────────────────
  if (screen === "intro") return (
    <div style={{ minHeight: "100vh", background: "#04040a", display: "flex", alignItems: "center", justifyContent: "center", padding: 24, fontFamily: "Georgia,serif" }}>
      <style>{KF}</style>
      <div style={{ maxWidth: 460, width: "100%", textAlign: "center" }}>
        <p style={{ color: "#c9a84c", fontSize: 10, letterSpacing: 7, margin: "0 0 12px" }}>ADVENTURE AI</p>
        <h1 style={{ fontSize: "clamp(52px,13vw,80px)", fontWeight: 900, color: "#ede0c4", margin: "0 0 6px", lineHeight: .9, textShadow: "0 0 60px rgba(180,130,40,0.2)" }}>EL ORÁCULO</h1>
        <p style={{ color: "#3a3020", fontSize: 11, letterSpacing: 4, margin: "14px 0 36px" }}>CADA HISTORIA ES ÚNICA · CADA DECISIÓN IMPORTA</p>
        <div style={{ display: "flex", flexDirection: "column", gap: 12, marginBottom: 28 }}>
          <button onClick={startRandom} style={{ background: "rgba(180,130,40,0.07)", border: "1px solid rgba(180,130,40,0.3)", borderRadius: 10, padding: "20px", cursor: "pointer", display: "flex", alignItems: "center", gap: 16, textAlign: "left" }}>
            <span style={{ fontSize: 30 }}>🎲</span>
            <div>
              <p style={{ color: "#ede0c4", fontSize: 16, margin: "0 0 3px", fontWeight: 700 }}>Historia Aleatoria</p>
              <p style={{ color: "#4a3818", fontSize: 13, margin: 0, fontStyle: "italic" }}>La IA elige el mundo, género y destino.</p>
            </div>
          </button>
          <button onClick={() => setScreen("customize")} style={{ background: "rgba(100,160,200,0.05)", border: "1px solid rgba(100,160,200,0.2)", borderRadius: 10, padding: "20px", cursor: "pointer", display: "flex", alignItems: "center", gap: 16, textAlign: "left" }}>
            <span style={{ fontSize: 30 }}>✍️</span>
            <div>
              <p style={{ color: "#ede0c4", fontSize: 16, margin: "0 0 3px", fontWeight: 700 }}>Crear mi Historia</p>
              <p style={{ color: "#183040", fontSize: 13, margin: 0, fontStyle: "italic" }}>Describís el mundo y tono. La IA lo construye.</p>
            </div>
          </button>
        </div>
        <div style={{ display: "flex", justifyContent: "center", gap: 10 }}>
          {["Gemini Flash 2.0", "Gemini Imagen 3"].map(n => (
            <span key={n} style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.06)", borderRadius: 20, padding: "3px 11px", fontSize: 10, color: "#383020", letterSpacing: 1 }}>{n}</span>
          ))}
        </div>
      </div>
    </div>
  );

  // ── CUSTOMIZE ──────────────────────────────────────────────────────────────
  if (screen === "customize") return (
    <div style={{ minHeight: "100vh", background: "#04040a", display: "flex", alignItems: "center", justifyContent: "center", padding: 24, fontFamily: "Georgia,serif" }}>
      <style>{KF}</style>
      <div style={{ maxWidth: 500, width: "100%" }}>
        <button onClick={() => setScreen("intro")} style={{ background: "none", border: "none", color: "#3a3020", fontSize: 11, cursor: "pointer", letterSpacing: 2, marginBottom: 28, padding: 0 }}>← VOLVER</button>
        <p style={{ color: "#6ab0c8", fontSize: 10, letterSpacing: 6, margin: "0 0 8px" }}>TU HISTORIA</p>
        <h2 style={{ fontSize: "clamp(24px,5vw,36px)", fontWeight: 700, color: "#ede0c4", margin: "0 0 8px" }}>¿De qué querés que trate?</h2>
        <p style={{ color: "#2e2418", fontSize: 14, marginBottom: 20, lineHeight: 1.8, fontStyle: "italic" }}>Género, ambientación, tono — todo sirve.</p>
        <textarea
          value={customPrompt}
          onChange={e => setCustomPrompt(e.target.value)}
          placeholder={"• Terror en una isla, algo antiguo vive ahí\n• Survival espacial, claustrofóbico\n• Fantasy épico, soy un traidor\n• Noir en Buenos Aires 1940"}
          rows={5}
          style={{ width: "100%", boxSizing: "border-box", background: "rgba(255,255,255,0.02)", border: "1px solid rgba(100,160,200,0.2)", borderRadius: 10, padding: "14px", color: "#d4c4a0", fontSize: 15, resize: "none", fontFamily: "Georgia,serif", lineHeight: 1.7, outline: "none", marginBottom: 16 }}
        />
        <button
          onClick={startCustom}
          disabled={!customPrompt.trim()}
          style={{ width: "100%", background: customPrompt.trim() ? "#6ab0c8" : "#111820", border: "none", borderRadius: 8, padding: "15px", color: customPrompt.trim() ? "#04080d" : "#1a2530", fontSize: 11, fontWeight: 700, letterSpacing: 4, cursor: customPrompt.trim() ? "pointer" : "default", transition: "all 0.2s" }}
        >
          COMENZAR AVENTURA →
        </button>
      </div>
    </div>
  );

  // ── LOADING ────────────────────────────────────────────────────────────────
  if (screen === "loading") return (
    <div style={{ minHeight: "100vh", background: C.bg, display: "flex", alignItems: "center", justifyContent: "center", transition: "background 1s" }}>
      <style>{KF}</style>
      <div style={{ textAlign: "center" }}>
        <div style={{ width: 40, height: 40, border: `3px solid rgba(255,255,255,0.05)`, borderTop: `3px solid ${C.accent}`, borderRadius: "50%", animation: "spin 0.85s linear infinite", margin: "0 auto" }} />
        <p style={{ color: "#d4c4a0", fontSize: 13, marginTop: 22, letterSpacing: 4, animation: "pulse 1.8s ease infinite" }}>TEJIENDO EL DESTINO...</p>
        <p style={{ color: "#2a2010", fontSize: 10, marginTop: 8, letterSpacing: 2 }}>Gemini escribe · Gemini visualiza</p>
      </div>
    </div>
  );

  // ── PLAYING ────────────────────────────────────────────────────────────────
  if (screen === "playing" && scene) {
    const isEnding = scene.is_ending || scene.tipo === "final";
    const isAuto = scene.tipo === "automatica";
    const EL = { victoria: "✦ VICTORIA ✦", muerte: "✦ FIN ✦", misterio: "✦ MISTERIO ✦", escape: "✦ ESCAPE ✦", locura: "✦ LOCURA ✦" };

    return (
      <div style={{ minHeight: "100vh", background: C.bg, fontFamily: "Georgia,serif", display: "flex", flexDirection: "column", opacity: fadeIn ? 1 : 0, transition: "opacity 0.75s ease,background 1.2s ease" }}>
        <style>{KF}</style>

        {/* IMAGE */}
        <div style={{ position: "relative", width: "100%", height: "clamp(200px,40vh,400px)", background: "#060608", flexShrink: 0, overflow: "hidden" }}>
          {imageLoading && (
            <div style={{ position: "absolute", inset: 0, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 10 }}>
              <div style={{ width: 26, height: 26, border: `2px solid rgba(255,255,255,0.04)`, borderTop: `2px solid ${C.accent}`, borderRadius: "50%", animation: "spin 0.85s linear infinite" }} />
              <p style={{ color: "#2a2010", fontSize: 9, letterSpacing: 3, animation: "pulse 1.4s ease infinite" }}>GEMINI GENERANDO</p>
            </div>
          )}
          {imageUrl && (
            <img src={imageUrl} alt="" style={{ width: "100%", height: "100%", objectFit: "cover", display: "block", opacity: imageLoading ? 0 : 1, transition: "opacity 0.9s ease" }} />
          )}
          {imageError && !imageLoading && (
            <div style={{ position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center" }}>
              <p style={{ color: "#2a2010", fontSize: 12 }}>⚠ sin imagen</p>
            </div>
          )}
          <div style={{ position: "absolute", inset: 0, background: `linear-gradient(to top,${C.bg} 18%,rgba(0,0,0,0.1) 65%,transparent)`, pointerEvents: "none" }} />
          <div style={{ position: "absolute", bottom: 0, left: 0, right: 0, height: 2, background: `linear-gradient(to right,transparent,${C.accent},transparent)`, opacity: .4 }} />
          <div style={{ position: "absolute", top: 12, left: 12, display: "flex", gap: 8 }}>
            <span style={{ background: "rgba(0,0,0,.65)", border: `1px solid ${C.dim}`, borderRadius: 4, padding: "2px 9px", color: C.accent, fontSize: 9, letterSpacing: 4 }}>CAP.{scene.chapter}</span>
            {scene.mood && <span style={{ background: "rgba(0,0,0,.65)", border: "1px solid rgba(255,255,255,.06)", borderRadius: 4, padding: "2px 9px", color: "#2a2010", fontSize: 9, letterSpacing: 3 }}>{scene.mood.toUpperCase()}</span>}
          </div>
          <button onClick={reset} style={{ position: "absolute", top: 12, right: 12, background: "rgba(0,0,0,.65)", border: "1px solid rgba(255,255,255,.07)", borderRadius: 4, padding: "2px 9px", color: "#2a2010", fontSize: 9, cursor: "pointer", letterSpacing: 3 }}>↩ REINICIAR</button>
        </div>

        {/* CONTENT */}
        <div style={{ flex: 1, padding: "12px 20px 44px", maxWidth: 680, margin: "0 auto", width: "100%", boxSizing: "border-box", animation: "fadeUp 0.5s ease both" }}>
          {isEnding && <p style={{ color: C.accent, fontSize: 10, letterSpacing: 5, marginBottom: 10 }}>{EL[scene.ending_type] || "✦ FIN ✦"}</p>}
          <p style={{ color: "#d4c4a0", fontSize: "clamp(15px,2.3vw,18px)", lineHeight: 2, marginBottom: 24, fontStyle: "italic" }}>{scene.scene}</p>

          {!isEnding && !isAuto && scene.choices?.length > 0 && (
            <>
              <p style={{ color: "#2a2010", fontSize: 9, letterSpacing: 5, marginBottom: 10 }}>¿QUÉ HACÉS?</p>
              <div style={{ display: "flex", flexDirection: "column", gap: 9 }}>
                {scene.choices.map(ch => (
                  <button key={ch.id} onClick={() => handleChoice(ch.text)} disabled={processing}
                    style={{ background: "rgba(255,255,255,.025)", border: `1px solid ${C.dim}`, borderRadius: 8, padding: "13px 14px", display: "flex", alignItems: "center", gap: 12, cursor: "pointer", color: "#d4c4a0", textAlign: "left", transition: "all .18s" }}>
                    <span style={{ fontSize: 20, flexShrink: 0 }}>{ch.icon}</span>
                    <span style={{ flex: 1, fontSize: 15, lineHeight: 1.5 }}>{ch.text}</span>
                    <span style={{ color: "#2a2010", fontSize: 13 }}>→</span>
                  </button>
                ))}
              </div>
            </>
          )}

          {!isEnding && isAuto && (
            <button onClick={() => handleChoice("[continuar]")} disabled={processing}
              style={{ background: "rgba(255,255,255,.04)", border: `1px solid ${C.dim}`, borderRadius: 8, padding: "12px 22px", cursor: "pointer", color: C.accent, fontSize: 11, letterSpacing: 4, transition: "all .2s" }}>
              {scene.boton_continuar || "Continuar..."} →
            </button>
          )}

          {isEnding && (
            <button onClick={reset}
              style={{ background: C.accent, border: "none", borderRadius: 8, padding: "14px 28px", color: "#04040a", fontSize: 11, fontWeight: 700, letterSpacing: 4, cursor: "pointer" }}>
              NUEVA AVENTURA →
            </button>
          )}
        </div>
      </div>
    );
  }

  return null;
}
