
import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import Groq from "groq-sdk";

import connectDatabase from "./src/config/database.js"

import { LANGUAGES } from "./src/config/languages.js";

import {
  generateSpeech,
  isTtsLanguageSupported
} from "./src/services/audio/elevenlabs.service.js";

import createGuestIdentity from "./src/services/identity/guestIdentity.service.js";
import guestAuth from "./src/middleware/guestAuth.middleware.js";
import translationRoutes from "./src/routes/translation.routes.js";

dotenv.config();

const app = express();
const PORT = process.env.PORT || 8080;

// ==========================================
// 1. GROQ CONFIGURATION
// ==========================================

const groqApiKey = process.env.LEO_GROQ_API_KEY;

if (!groqApiKey) {
  console.error("Missing LEO_GROQ_API_KEY in .env");
  process.exit(1);
}

const groq = new Groq({
  apiKey: groqApiKey,
  timeout: 12000,
  maxRetries: 0,
});

// Primary model first, backup second.
const GROQ_MODELS = [
  "openai/gpt-oss-120b",
  "openai/gpt-oss-20b",
];

// ==========================================
// 2. SUPPORTED LANGUAGES
// ==========================================

const LANGUAGE_NAMES = Object.fromEntries(
  Object.entries(LANGUAGES).map(([code, language]) => [
    code,
    language.name,
  ])
);

// ==========================================
// 3. EXPRESS MIDDLEWARE
// ==========================================

app.use(cors());
app.use(express.json({ limit: "20kb" }));

// ==========================================
// TRANSLATION HISTORY ROUTES
// ==========================================

app.use("/api/translations", translationRoutes);

// ==========================================
// 4. TRANSLATION CACHE (LRU MECHANISM)
// ==========================================

const translationCache = new Map();

const CACHE_TTL_MS = 24 * 60 * 60 * 1000;
const MAX_CACHE_ENTRIES = 500;

function getCacheKey(text, sourceLanguage, targetLanguage) {
  return JSON.stringify([
    text.trim(),
    sourceLanguage,
    targetLanguage,
  ]);
}

function getCachedTranslation(key) {
  const cachedEntry = translationCache.get(key);

  if (!cachedEntry) return null;

  if (Date.now() > cachedEntry.expiresAt) {
    translationCache.delete(key);
    return null;
  }

  // Move recently accessed entry to the end.
  translationCache.delete(key);
  translationCache.set(key, cachedEntry);

  return cachedEntry.data;
}

function saveCachedTranslation(key, data) {
  if (translationCache.has(key)) {
    translationCache.delete(key);
  }

  if (translationCache.size >= MAX_CACHE_ENTRIES) {
    const oldestKey = translationCache.keys().next().value;

    if (oldestKey !== undefined) {
      translationCache.delete(oldestKey);
    }
  }

  translationCache.set(key, {
    data,
    expiresAt: Date.now() + CACHE_TTL_MS,
  });
}

// ==========================================
// 5. BASIC API ROUTES
// ==========================================

app.get("/", (req, res) => {
  res.json({
    success: true,
    message: "LEO API is running.",
    deployment: "groq-translation-v1",
    primaryProvider: "Groq",
  });
});

app.get("/health", (req, res) => {
  res.json({
    success: true,
    message: "LEO backend is Healthy.",
  });
});

// ==========================================
// 6. ERROR HANDLING HELPERS
// ==========================================

function getErrorStatus(error) {
  const status = Number(error.status);

  if (status >= 400 && status <= 599) {
    return status;
  }

  return 0;
}

function shouldTryBackup(error) {
  const status = getErrorStatus(error);

  // Retry with the backup model for temporary
  // provider, network, timeout, or availability errors.
  if (status === 0) return true;

  return [408, 429, 500, 502, 503, 504].includes(status);
}

// ==========================================
// 7. CORE TRANSLATION ENGINE (GROQ ONLY)
// ==========================================

async function generateTranslation(prompt) {
  let lastError;

  for (let index = 0; index < GROQ_MODELS.length; index++) {
    const model = GROQ_MODELS[index];
    const startedAt = Date.now();

    try {
      console.log(`[Groq] Trying model: ${model}`);

      const completion = await groq.chat.completions.create({
        model,
        messages: [
          {
            role: "user",
            content: prompt,
          },
        ],
        temperature: 0.2,
      });

      const translation =
        completion.choices[0]?.message?.content?.trim();

      if (!translation) {
        throw new Error("Groq returned an empty translation.");
      }

      const latencyMs = Date.now() - startedAt;
      const fallbackUsed = index > 0;

      console.log(
        `[Groq] ${model} completed in ${latencyMs}ms`
      );

      return {
        translation,
        model: `groq:${model}`,
        fallbackUsed,
        latencyMs,
      };

    } catch (error) {
      lastError = error;

      const latencyMs = Date.now() - startedAt;

      console.error(
        `[Groq] ${model} failed after ${latencyMs}ms:`,
        error.message
      );

      const hasBackup = index < GROQ_MODELS.length - 1;

      if (!hasBackup || !shouldTryBackup(error)) {
        throw error;
      }

      console.warn("[Groq] Switching to backup model...");
    }
  }

  throw lastError;
}

// ==========================================
// 8. TRANSLATION ENDPOINT
// ==========================================

app.post("/api/translate", async (req, res) => {
  const requestStartedAt = Date.now();

  try {
    const {
      text,
      sourceLanguage = "auto",
      targetLanguage,
    } = req.body;

    // Input validation.
    if (
      typeof text !== "string" ||
      !text.trim() ||
      text.length > 4000 ||
      typeof targetLanguage !== "string" ||
      !LANGUAGES[targetLanguage] ||
      typeof sourceLanguage !== "string" ||
      !LANGUAGES[sourceLanguage]
    ) {
      return res.status(400).json({
        success: false,
        message:
          "Provide valid text, source language, and target language. Max 4,000 characters.",
      });
    }

    const cleanText = text.trim();

    // No AI request needed when languages are identical.
    if (
      sourceLanguage !== "auto" &&
      sourceLanguage === targetLanguage
    ) {
      return res.json({
        success: true,
        translation: cleanText,
        sourceLanguage,
        targetLanguage,
        model: "none",
        fallbackUsed: false,
        cacheStatus: "BYPASS",
        latencyMs: 0,
      });
    }

    // Check translation cache.
    const cacheKey = getCacheKey(
      cleanText,
      sourceLanguage,
      targetLanguage
    );

    const cachedTranslation = getCachedTranslation(cacheKey);

    if (cachedTranslation) {
      const requestTime = Date.now() - requestStartedAt;

      console.log(
        `[Cache] Translation served in ${requestTime}ms`
      );

      return res.json({
        success: true,
        translation: cachedTranslation.translation,
        sourceLanguage,
        targetLanguage,
        model: cachedTranslation.model,
        fallbackUsed: cachedTranslation.fallbackUsed,
        cacheStatus: "HIT",
        latencyMs: requestTime,
      });
    }

    // Build translation prompt.
    const prompt = `You are LEO, a careful multilingual translation assistant.

Translate the user's text into ${LANGUAGE_NAMES[targetLanguage]}.

${sourceLanguage === "auto"
        ? "Detect the source language automatically."
        : `The source language is ${LANGUAGE_NAMES[sourceLanguage]}.`
      }

Requirements:
- Preserve the original meaning.
- Preserve tone and level of formality.
- Preserve names, numbers, and important details.
- Use natural, grammatically correct language.
- Preserve inline formatting and paragraph structure.
- Do not invent information.
- Return ONLY the translation.
- Do not include explanations or introductory notes.

Text to translate:
${cleanText}`;

    // Generate translation using Groq.
    const result = await generateTranslation(prompt);

    // Cache successful translation.
    saveCachedTranslation(cacheKey, result);

    const requestTime = Date.now() - requestStartedAt;

    console.log(
      `[Translation] Completed in ${requestTime}ms using ${result.model}`
    );

    return res.json({
      success: true,
      translation: result.translation,
      sourceLanguage,
      targetLanguage,
      model: result.model,
      fallbackUsed: result.fallbackUsed,
      cacheStatus: "MISS",
      latencyMs: result.latencyMs,
    });

  } catch (error) {
    console.error(
      "[Translation Endpoint Exception]:",
      error.message
    );

    return res.status(502).json({
      success: false,
      message: "LEO could not complete the translation. Please try again.",
    });
  }
});

app.post("/api/audio/speech", async (req, res) => {
  try {
    const { text, languageCode } = req.body;

    if (!text || typeof text !== "string" || !text.trim()) {
      return res.status(400).json({
        success: false,
        message: "Text is required."
      });
    }

    if (text.length > 5000) {
      return res.status(400).json({
        success: false,
        message: "Text cannot exceed 5000 characters."
      });
    }

    if (
      !languageCode ||
      typeof languageCode !== "string"
    ) {
      return res.status(400).json({
        success: false,
        message: "A valid language code is required."
      });
    }

    if (!isTtsLanguageSupported(languageCode)) {
      return res.status(422).json({
        success: false,
        message: `Speech generation is not currently available for ${languageCode}.`,
        languageCode
      });
    }

    const result = await generateSpeech(
      text.trim(),
      languageCode
    );

    res.set({
      "Content-Type": result.contentType,
      "Content-Length": result.audioBuffer.length,
      "Cache-Control": "private, no-store",
      "X-LEO-TTS-Model": result.model,
      "X-LEO-TTS-Language": result.languageCode
    });

    return res.status(200).send(result.audioBuffer);

  } catch (error) {
    console.error("LEO TTS Error:", error.message);

    return res.status(502).json({
      success: false,
      message: "LEO could not generate speech right now."
    });
  }
});

// Create a new anonymous guest identity.
app.post("/api/identity/guest", async (req, res) => {
  try {
    const identity = await createGuestIdentity();

    return res.status(201).json({
      success: true,
      message: "Guest identity created successfully.",
      data: identity
    });

  } catch (error) {
    console.error("Guest identity creation failed:", error.message);

    return res.status(500).json({
      success: false,
      message: "Unable to create guest identity."
    });
  }
});


// Verify the identity of the currently authenticated guest.
app.get("/api/identity/guest/me", guestAuth, async (req, res) => {
  try {
    req.guest.lastActiveAt = new Date();
    await req.guest.save();

    return res.status(200).json({
      success: true,
      message: "Guest identity verified.",
      data: {
        guestId: req.guest.guestId,
        status: req.guest.status,
        lastActiveAt: req.guest.lastActiveAt
      }
    });

  } catch (error) {
    console.error("Guest identity verification failed:", error.message);

    return res.status(500).json({
      success: false,
      message: "Unable to verify guest identity."
    });
  }
});



// ==========================================
// 9. START SERVER
// ==========================================

connectDatabase().then(() => {
  app.listen(PORT, () => {
    console.log(`LEO Groq API running on port ${PORT}`);
  });
});
