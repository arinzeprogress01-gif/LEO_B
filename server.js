import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import { GoogleGenAI } from "@google/genai";

dotenv.config();

const app = express();
const PORT = process.env.PORT || 8080;

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

app.use(cors());
app.use(express.json({ limit: "20kb" }));

app.get("/", (req, res) => {
  res.json({
    success: true,
    message: "LEO API is running.",
    deployment: "gemini-model-check-v2",
    models: MODELS,
  });
});

app.get("/health", (req, res) => {
  res.json({
    success: true,
    message: "LEO backend is Healthy.",
  });
});

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

      console.error(
        `${model} failed:`,
        error.message
      );

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

app.post("/api/translate", async (req, res) => {
  try {
    const {
      text,
      sourceLanguage = "auto",
      targetLanguage,
    } = req.body;

    if (
      typeof text !== "string" ||
      !text.trim() ||
      text.length > 4000 ||
      typeof targetLanguage !== "string" ||
      !LANGUAGES[targetLanguage] ||
      (typeof sourceLanguage !== "string" ||
        !LANGUAGES[sourceLanguage])
    ) {
      return res.status(400).json({
        success: false,
        message:
          "Provide valid text, a source language, and a target language. Text must not exceed 4,000 characters.",
      });
    }

    if (
      sourceLanguage !== "auto" &&
      sourceLanguage === targetLanguage
    ) {
      return res.json({
        success: true,
        translation: text.trim(),
        sourceLanguage,
        targetLanguage,
        model: "none",
        fallbackUsed: false,
      });
    }

    const prompt = `
You are LEO, a careful language translation assistant.

Translate the user's text into ${LANGUAGES[targetLanguage]}.
${sourceLanguage === "auto"
    ? "Detect the source language automatically."
    : `The source language is ${LANGUAGES[sourceLanguage]}.`}

Preserve the original meaning, tone, names, and formatting.
Return only the translation, without explanations or quotation marks.

Text to translate:
${text.trim()}
`;

    const result = await generateTranslation(prompt);

    return res.json({
      success: true,
      translation: result.translation,
      sourceLanguage,
      targetLanguage,
      model: result.model,
      fallbackUsed: result.fallbackUsed,
    });
  } catch (error) {
    const status = getErrorStatus(error);

    console.error("Translation service failed:", error.message);

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

app.listen(PORT, "0.0.0.0", () => {
  console.log(`LEO API running on port ${PORT}`);
});