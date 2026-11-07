
import express from "express";
import Translation from "../models/Translation.js";
import guestAuth from "../middleware/guestAuth.middleware.js";

const router = express.Router();

// Save a translation to the authenticated guest's history.
router.post("/", guestAuth, async (req, res) => {
    try {
        const {
            sourceText,
            translatedText,
            sourceLanguage,
            targetLanguage,
            detectedSourceLanguage
        } = req.body;

        if (
            typeof sourceText !== "string" ||
            typeof translatedText !== "string" ||
            !sourceText.trim() ||
            !translatedText.trim()
        ) {
            return res.status(400).json({
                success: false,
                message: "Source text and translated text are required."
            });
        }

        if (sourceText.length > 4000 || translatedText.length > 8000) {
            return res.status(400).json({
                success: false,
                message: "Translation text exceeds the allowed length."
            });
        }

        if (
            typeof sourceLanguage !== "string" ||
            typeof targetLanguage !== "string" ||
            !sourceLanguage.trim() ||
            !targetLanguage.trim()
        ) {
            return res.status(400).json({
                success: false,
                message: "Source and target languages are required."
            });
        }

        const translation = await Translation.create({
            ownerId: req.guestId,
            sourceText: sourceText.trim(),
            translatedText: translatedText.trim(),
            sourceLanguage: sourceLanguage.trim(),
            targetLanguage: targetLanguage.trim(),
            detectedSourceLanguage:
                typeof detectedSourceLanguage === "string"
                    ? detectedSourceLanguage.trim()
                    : null,
            provider: "groq"
        });

        return res.status(201).json({
            success: true,
            message: "Translation saved to history.",
            data: translation
        });
    } catch (error) {
        console.error("Save translation history error:", error.message);

        return res.status(500).json({
            success: false,
            message: "Unable to save translation history."
        });
    }
});


// Retrieve the authenticated guest's translation history.
router.get("/", guestAuth, async (req, res) => {
    try {
        const requestedLimit = Number.parseInt(req.query.limit, 10);
        const limit = Number.isNaN(requestedLimit)
            ? 50
            : Math.min(Math.max(requestedLimit, 1), 100);

        const translations = await Translation.find({
            ownerId: req.guestId
        })
            .sort({ createdAt: -1 })
            .limit(limit)
            .select(
                "sourceText translatedText sourceLanguage targetLanguage detectedSourceLanguage provider createdAt"
            )
            .lean();

        return res.status(200).json({
            success: true,
            count: translations.length,
            data: translations
        });
    } catch (error) {
        console.error("Retrieve translation history error:", error.message);

        return res.status(500).json({
            success: false,
            message: "Unable to retrieve translation history."
        });
    }
});

export default router;
