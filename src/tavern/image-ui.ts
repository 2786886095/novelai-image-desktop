import text from "../../shared/tavern-image-ui.json";
export function imageUi(language: unknown) { return text[language as keyof typeof text] ?? text["en-US"]; }
