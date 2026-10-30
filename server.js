import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import { GoogleGenAI } from "@google/genai";

dotenv.config();

const app = express();
const PORT = process.env.PORT || 8080;

// ==========================================
// 1. GEMINI CONFIGURATION
// ==========================================

const apiKey = process.env.LEO_GEMINI_API_KEY;

if (!apiKey) {
  console.error("Missing LEO_GEMINI_API_KEY in .env");
  process.exit(1);
}

const ai = new GoogleGenAI({
  apiKey,
  httpOptions: {
    timeout: 12000,
    retryOptions: {
      attempts: 1,
    },
  },
});

const MODELS = [
  "gemini-3.8-flash",
  "gemini-3.6-flash",
];

// ==========================================
// 2. SUPPORTED LANGUAGES
// ==========================================

const LANGUAGES = {
  auto: "automatically detected",
  en: "English",
  fr: "French",
  es: "Spanish",
  de: "German",
  pt: "Portuguese",
  ig: "Igbo",
  yo: "Yoruba",
};

// ==========================================
// 3. EXPRESS MIDDLEWARE
// ==========================================

app.use(cors());
app.use(express.json({ limit: "20kb" }));

// ==========================================
// 4. TRANSLATION CACHE
// ==========================================

const translationCache = new Map();

const CACHE_TTL_MS = 24 * 60 * 60 * 1000; // 24 hours
const MAX_CACHE_ENTRIES = 500;

/**
 * Creates a unique cache key.
 *
 * JSON.stringify prevents accidental key collisions.
 * Original text casing is preserved.
 */
function getCacheKey(text, sourceLanguage, targetLanguage) {
  return JSON.stringify([
    text.trim(),
    sourceLanguage,
    targetLanguage,
  ]);
}

/**
 * Retrieves a cached translation.
 *
 * Expired entries are deleted immediately.
 * Recently accessed entries are moved to the end
 * to maintain LRU cache behaviour.
 */
function getCachedTranslation(key) {
  const cachedEntry = translationCache.get(key);

  if (!cachedEntry) {
    return null;
  }

  if (Date.now() > cachedEntry.expiresAt) {
    translationCache.delete(key);
    return null;
  }

  // Refresh position for LRU behaviour.
  translationCache.delete(key);
  translationCache.set(key, cachedEntry);

  return cachedEntry.data;
}

/**
 * Saves a successful translation.
 *
 * Removes the oldest entry when the cache
 * reaches its maximum capacity.
 */
function saveCachedTranslation(key, data) {
  // Refresh an existing entry.
  if (translationCache.has(key)) {
    translationCache.delete(key);
  }

  // Remove oldest entry if cache is full.
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
    deployment: "translation-cache-v1",
    models: MODELS,
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
  if (error.status || error.code) {
    const status = Number(error.status || error.code);

    if (status >= 400 && status <= 599) {
      return status;
    }
  }

  try {
    const details = JSON.parse(error.message);

    return Number(details.error?.code) || 500;
  } catch {
    return 500;
  }
}

function shouldTryBackup(error) {
  const status = getErrorStatus(error);

  return [404, 408, 429, 500, 502, 503, 504].includes(status);
}

// ==========================================
// 7. GEMINI TRANSLATION SERVICE
// ==========================================

async function generateTranslation(prompt) {
  let lastError;

  for (let index = 0; index < MODELS.length; index++) {
    const model = MODELS[index];

    try {
      console.log(`Trying translation model: ${model}`);

      const response = await ai.models.generateContent({
        model,
        contents: prompt,
      });

      const translation = response.text?.trim();

      if (!translation) {
        throw new Error("The model returned an empty translation.");
      }

      return {
        translation,
        model,
        fallbackUsed: index > 0,
      };
    } catch (error) {
      lastError = error;

      console.error(`${model} failed:`, error.message);

      const hasBackup = index < MODELS.length - 1;

      if (!hasBackup || !shouldTryBackup(error)) {
        throw error;
      }

      console.log(
        `Primary model UNAVAILABLE. Trying backup: ${MODELS[index + 1]}`
      );
    }
  }

  throw lastError;
}

// ==========================================
// 8. TRANSLATION ENDPOINT
// ==========================================

app.post("/api/translate", async (req, res) => {
  try {
    const {
      text,
      sourceLanguage = "auto",
      targetLanguage,
    } = req.body;

    // --------------------------------------
    // INPUT VALIDATION
    // --------------------------------------

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
          "Provide valid text, a source language, and a target language. Text must not exceed 4,000 characters.",
      });
    }

    const cleanText = text.trim();

    // --------------------------------------
    // SAME-LANGUAGE BYPASS
    // --------------------------------------

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
      });
    }

    // --------------------------------------
    // CACHE LOOKUP
    // --------------------------------------

    const cacheKey = getCacheKey(
      cleanText,
      sourceLanguage,
      targetLanguage
    );

    const cachedTranslation = getCachedTranslation(cacheKey);

    if (cachedTranslation) {
      console.log("Translation served from cache.");

      return res.json({
        success: true,
        translation: cachedTranslation.translation,
        sourceLanguage,
        targetLanguage,
        model: cachedTranslation.model,
        fallbackUsed: cachedTranslation.fallbackUsed,
        cacheStatus: "HIT",
      });
    }

    console.log("Cache MISS. Requesting Gemini translation.");

    // --------------------------------------
    // GEMINI PROMPT
    // --------------------------------------

    const prompt = `
You are LEO, a careful language translation assistant.

Translate the user's text into ${LANGUAGES[targetLanguage]}.

${
  sourceLanguage === "auto"
    ? "Detect the source language automatically."
    : `The source language is ${LANGUAGES[sourceLanguage]}.`
}

Preserve the original meaning, tone, names, and formatting.

Return only the translation, without explanations or quotation marks.

Text to translate:
${cleanText}
`;

    // --------------------------------------
    // GENERATE TRANSLATION
    // --------------------------------------

    const result = await generateTranslation(prompt);

    // --------------------------------------
    // SAVE SUCCESSFUL TRANSLATION
    // --------------------------------------

    saveCachedTranslation(cacheKey, result);

    // --------------------------------------
    // SEND RESPONSE
    // --------------------------------------

    return res.json({
      success: true,
      translation: result.translation,
      sourceLanguage,
      targetLanguage,
      model: result.model,
      fallbackUsed: result.fallbackUsed,
      cacheStatus: "MISS",
    });

  } catch (error) {
    const status = getErrorStatus(error);

    console.error(
      "Translation service failed:",
      error.message
    );

    if ([429, 500, 502, 503, 504].includes(status)) {
      return res.status(503).json({
        success: false,
        message:
          "LEO's translation service is temporarily unavailable. Please try again shortly.",
      });
    }

    return res.status(502).json({
      success: false,
      message:
        "LEO couldn't complete this translation. Please try again.",
    });
  }
});

// ==========================================
// 9. START SERVER
// ==========================================

app.listen(PORT, "0.0.0.0", () => {
  console.log(`LEO API running on port ${PORT}`);
});