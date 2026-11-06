const ELEVENLABS_API_URL = "https://api.elevenlabs.io/v1/text-to-speech";

const MODEL_ID = "eleven_v3";

// Languages officially listed for Eleven v3.
// Igbo is deliberately excluded.
const SUPPORTED_LANGUAGES = new Set([
    "en", "fr", "es", "de", "pt",
    "yo", "ar", "zh", "ja", "ko",
    "it", "hi"
]);

const getVoiceId = (languageCode) => {
    const normalizedCode = languageCode.toUpperCase();

    return (
        process.env[`LEO_TTS_VOICE_${normalizedCode}`] ||
        process.env.LEO_TTS_DEFAULT_VOICE_ID
    );
};

export const isTtsLanguageSupported = (languageCode) => {
    return SUPPORTED_LANGUAGES.has(languageCode);
};

export const generateSpeech = async (text, languageCode) => {
    const apiKey = process.env.LEO_ELEVENLABS_API_KEY;

    if (!apiKey) {
        throw new Error("LEO_ELEVENLABS_API_KEY is not configured.");
    }

    if (!isTtsLanguageSupported(languageCode)) {
        throw new Error(
            `ElevenLabs does not currently support ${languageCode} in LEO.`
        );
    }

    const voiceId = getVoiceId(languageCode);

    if (!voiceId) {
        throw new Error(
            `No ElevenLabs voice ID configured for language: ${languageCode}`
        );
    }

    const response = await fetch(
        `${ELEVENLABS_API_URL}/${voiceId}?output_format=mp3_44100_128`,
        {
            method: "POST",
            headers: {
                "xi-api-key": apiKey,
                "Content-Type": "application/json",
                Accept: "audio/mpeg"
            },
            body: JSON.stringify({
                text,
                model_id: MODEL_ID,
                language_code: languageCode,
                voice_settings: {
                    stability: 0.5,
                    similarity_boost: 0.75
                }
            }),
            signal: AbortSignal.timeout(30000)
        }
    );

    if (!response.ok) {
        const errorBody = await response.text();

        throw new Error(
            `ElevenLabs API error (${response.status}): ${errorBody.slice(0, 500)}`
        );
    }

    const audioBuffer = Buffer.from(await response.arrayBuffer());

    if (!audioBuffer.length) {
        throw new Error("ElevenLabs returned empty audio.");
    }

    return {
        audioBuffer,
        contentType: "audio/mpeg",
        model: MODEL_ID,
        languageCode
    };
};