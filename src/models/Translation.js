
import mongoose from "mongoose";
import LeoData from "./LeoData.js";

const translationSchema = new mongoose.Schema({
    sourceText: {
        type: String,
        required: true,
        trim: true,
        maxlength: 4000
    },

    translatedText: {
        type: String,
        required: true,
        trim: true,
        maxlength: 8000
    },

    sourceLanguage: {
        type: String,
        required: true,
        trim: true
    },

    targetLanguage: {
        type: String,
        required: true,
        trim: true
    },

    detectedSourceLanguage: {
        type: String,
        default: null
    },

    provider: {
        type: String,
        default: "groq"
    }
});

// Every translation belongs to the guest or account
// identified by the inherited ownerId field.
const Translation =
    LeoData.discriminators?.Translation ||
    LeoData.discriminator(
        "Translation",
        translationSchema,
        "translation"
    );

export default Translation;
