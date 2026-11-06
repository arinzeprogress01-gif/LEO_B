export const LANGUAGES = {
    auto: {
        name: "Auto Detect",
        code: "auto",
        locale: null,
        rtl: false,
    },
    en: {
        name: "English",
        code: "en",
        locale: "en-US",
        rtl: false,
    },
    fr: {
        name: "French",
        code: "fr",
        locale: "fr-FR",
        rtl: false,
    },
    es: {
        name: "Spanish",
        code: "es",
        locale: "es-ES",
        rtl: false,
    },
    de: {
        name: "German",
        code: "de",
        locale: "de-DE",
        rtl: false,
    },
    pt: {
        name: "Portuguese",
        code: "pt",
        locale: "pt-PT",
        rtl: false,
    },
    ig: {
        name: "Igbo",
        code: "ig",
        locale: "ig-NG",
        rtl: false,
    },
    yo: {
        name: "Yoruba",
        code: "yo",
        locale: "yo-NG",
        rtl: false,
    },
    ar: {
        name: "Arabic",
        code: "ar",
        locale: "ar-SA",
        rtl: true,
    },
    zh: {
        name: "Chinese (Simplified)",
        code: "zh",
        locale: "zh-CN",
        rtl: false,
    },
    ja: {
        name: "Japanese",
        code: "ja",
        locale: "ja-JP",
        rtl: false,
    },
    ko: {
        name: "Korean",
        code: "ko",
        locale: "ko-KR",
        rtl: false,
    },
    it: {
        name: "Italian",
        code: "it",
        locale: "it-IT",
        rtl: false,
    },
    hi: {
        name: "Hindi",
        code: "hi",
        locale: "hi-IN",
        rtl: false,
    },
};

export const getLanguageName = (code) => {
    return LANGUAGES[code]?.name || null;
};

export const isSupportedLanguage = (code) => {
    return Boolean(LANGUAGES[code]);
};

export const getAllLanguages = () => {
    return Object.values(LANGUAGES);
};