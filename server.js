
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

const ai = new GoogleGenAI({ apiKey });

app.use(cors());
app.use(express.json({ limit: "20kb" }));

app.get("/", (req, res) => {
  res.json({ success: true, message: "LEO API is running." });
});

app.get("/health", (req, res) => {
  res.json({ success: true, message: "LEO backend is healthy." });
});

app.post("/api/translate", async (req, res) => {
  try {
    const { text, sourceLanguage = "auto", targetLanguage } = req.body;

    if (
      typeof text !== "string" ||
      !text.trim() ||
      text.length > 4000 ||
      typeof targetLanguage !== "string" ||
      !targetLanguage.trim()
    ) {
      return res.status(400).json({
        success: false,
        message: "Provide text (up to 4000 characters) and a target language.",
      });
    }

    const prompt = `
You are LEO, a careful language translation assistant.

Translate the following text into ${targetLanguage}.
Source language: ${sourceLanguage}.
Preserve the original meaning, tone, names, and formatting.
Return only the translation, without explanations or quotation marks.

Text to translate:
${text.trim()}
`;

    const response = await ai.models.generateContent({
      model: "gemini-2.5-flash",
      contents: prompt,
    });

    const translation = response.text?.trim();

    if (!translation) {
      throw new Error("Gemini returned an empty translation.");
    }

    return res.json({
      success: true,
      sourceLanguage,
      targetLanguage,
      translation,
    });
  } catch (error) {
    console.error("Translation request failed:", error.message);

    return res.status(502).json({
      success: false,
      message: "Translation failed. Please try again.",
    });
  }
});

app.listen(PORT, "0.0.0.0", () => {
  console.log(`LEO API running on port ${PORT}`);
});
