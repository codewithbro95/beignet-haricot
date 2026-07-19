export function compactNumber(value: number): string {
  return new Intl.NumberFormat(undefined, { notation: "compact", maximumFractionDigits: 1 }).format(
    value,
  );
}

export function fileLocation(path: string): string {
  const normalized = path.replaceAll("\\", "/");
  const parts = normalized.split("/").filter(Boolean);
  return parts.length > 1 ? parts.slice(0, -1).join("/") : normalized;
}

export function fileTypeLabel(sourceType: string): string {
  const type = sourceType.replace(/^\./, "").toUpperCase();
  return type || "FILE";
}

const IMAGE_EXTENSIONS = new Set(["gif", "jpeg", "jpg", "png", "webp"]);

export function isImagePath(path: string): boolean {
  const extension = path.split(".").pop()?.toLowerCase() ?? "";
  return IMAGE_EXTENSIONS.has(extension);
}

export function stateLabel(state: string): string {
  return state.replaceAll("_", " ").replace(/\b\w/g, (letter) => letter.toUpperCase());
}

export function isActiveIndexState(state: string): boolean {
  return ["pending", "discovering", "running", "pause_requested", "paused", "stop_requested"].includes(
    state,
  );
}
