import metadata from "../app.config.json";

export const APP_CONFIG = Object.freeze({
  name: metadata.name,
  version: metadata.version,
  identifier: metadata.identifier,
  description: metadata.description,
});

export const DEFAULT_API_URL = "http://127.0.0.1:8765";
