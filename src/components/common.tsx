import { AlertCircle, ExternalLink, File, Image as ImageIcon, LoaderCircle, RefreshCw } from "lucide-preact";
import type { ComponentChildren } from "preact";
import { useEffect, useState } from "preact/hooks";
import { fileLocation, fileTypeLabel, isImagePath } from "../lib/format";
import type { SearchResult } from "../lib/types";

export function PageHeader({
  title,
  description,
  action,
}: {
  title: string;
  description?: string;
  action?: ComponentChildren;
}) {
  return (
    <header class="page-header">
      <div>
        <h1>{title}</h1>
        {description ? <p>{description}</p> : null}
      </div>
      {action ? <div class="page-actions">{action}</div> : null}
    </header>
  );
}

export function ErrorNotice({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return (
    <div class="notice error-notice" role="alert">
      <AlertCircle size={17} />
      <span>{message}</span>
      {onRetry ? (
        <button class="text-button" type="button" onClick={onRetry}>
          <RefreshCw size={14} /> Retry
        </button>
      ) : null}
    </div>
  );
}

export function LoadingRow({ label = "Loading" }: { label?: string }) {
  return (
    <div class="loading-row" aria-live="polite">
      <LoaderCircle class="spin" size={17} />
      <span>{label}</span>
    </div>
  );
}

export function EmptyState({ icon, title, detail }: {
  icon: ComponentChildren;
  title: string;
  detail: string;
}) {
  return (
    <div class="empty-state">
      <div class="empty-icon">{icon}</div>
      <strong>{title}</strong>
      <p>{detail}</p>
    </div>
  );
}

export function ResultList({
  results,
  onOpen,
  loadImagePreview,
}: {
  results: SearchResult[];
  onOpen: (result: SearchResult) => void;
  loadImagePreview?: (fileId: string) => Promise<string>;
}) {
  return (
    <div class="result-list">
      {results.map((result) => (
        <article class="result-row" key={result.id}>
          <ResultVisual result={result} loadImagePreview={loadImagePreview} />
          <div class="result-content">
            <div class="result-heading">
              <strong>{result.title || result.file_name}</strong>
              <span class="file-type">{fileTypeLabel(result.source_type)}</span>
            </div>
            <p>{result.snippet}</p>
            <div class="result-meta">
              <span>{fileLocation(result.path)}</span>
              <span>{Math.round(result.score * 100)}% match</span>
            </div>
          </div>
          <button
            class="icon-button"
            type="button"
            title="Open original file"
            aria-label={`Open ${result.file_name}`}
            onClick={() => onOpen(result)}
          >
            <ExternalLink size={16} />
          </button>
        </article>
      ))}
    </div>
  );
}

function ResultVisual({
  result,
  loadImagePreview,
}: {
  result: SearchResult;
  loadImagePreview?: (fileId: string) => Promise<string>;
}) {
  const isImage = isImagePath(result.path);
  const [preview, setPreview] = useState("");

  useEffect(() => {
    if (!isImage || !loadImagePreview) return;
    let active = true;
    void loadImagePreview(result.file_id)
      .then((dataUrl) => {
        if (active) setPreview(dataUrl);
      })
      .catch(() => {
        if (active) setPreview("");
      });
    return () => {
      active = false;
    };
  }, [isImage, loadImagePreview, result.file_id]);

  if (preview) {
    return <img class="result-thumbnail" src={preview} alt="" aria-hidden="true" />;
  }

  return (
    <div class={`file-icon${isImage ? " image-placeholder" : ""}`} aria-hidden="true">
      {isImage ? <ImageIcon size={19} /> : <File size={18} />}
    </div>
  );
}
