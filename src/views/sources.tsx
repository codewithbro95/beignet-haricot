import { useCallback, useEffect, useState } from "preact/hooks";
import { open } from "@tauri-apps/plugin-dialog";
import { Folder, FolderPlus, RefreshCw, Trash2 } from "lucide-preact";
import type { OpenMindApi } from "../lib/api";
import { toClientError } from "../lib/api";
import type { Source } from "../lib/types";
import { EmptyState, ErrorNotice, LoadingRow, PageHeader } from "../components/common";

export function SourcesView({
  api,
  connected,
  onChanged,
}: {
  api: OpenMindApi;
  connected: boolean;
  onChanged: () => void;
}) {
  const [sources, setSources] = useState<Source[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    if (!connected) return;
    setLoading(true);
    setError("");
    try {
      setSources((await api.sources()).sources);
    } catch (requestError) {
      setError(toClientError(requestError).message);
    } finally {
      setLoading(false);
    }
  }, [api, connected]);

  useEffect(() => {
    void load();
  }, [load]);

  const add = async () => {
    const selected = await open({
      directory: true,
      multiple: true,
      title: "Choose folders for OpenMind",
    });
    const paths = Array.isArray(selected) ? selected : selected ? [selected] : [];
    if (paths.length === 0) return;

    setError("");
    try {
      for (const path of paths) await api.addSource(path);
      await load();
      onChanged();
    } catch (requestError) {
      setError(toClientError(requestError).message);
      await load();
    }
  };

  const remove = async (source: Source) => {
    if (!window.confirm(`Remove ${source.path} from OpenMind sources?`)) return;
    setError("");
    try {
      await api.removeSource(source.id);
      await load();
      onChanged();
    } catch (requestError) {
      setError(toClientError(requestError).message);
    }
  };

  return (
    <div class="page">
      <PageHeader
        title="Sources"
        description="Folders OpenMind can access"
        action={
          <>
            <button class="icon-button" type="button" title="Refresh sources" onClick={load}>
              <RefreshCw size={16} />
            </button>
            <button class="primary-button" type="button" onClick={add} disabled={!connected}>
              <FolderPlus size={16} /> Add folder
            </button>
          </>
        }
      />
      {error ? <ErrorNotice message={error} /> : null}
      {loading ? <LoadingRow label="Loading sources" /> : null}
      {!loading && sources.length === 0 ? (
        <EmptyState icon={<Folder size={22} />} title="No source folders" detail="Add a folder to begin." />
      ) : (
        <div class="source-list">
          {sources.map((source) => (
            <article class="source-row" key={source.id}>
              <div class="source-icon">
                <Folder size={18} />
              </div>
              <div class="source-copy">
                <strong>{source.path.split(/[\\/]/).filter(Boolean).at(-1) || source.path}</strong>
                <span>{source.path}</span>
              </div>
              <span class={`status-pill ${source.enabled ? "success" : ""}`}>
                {source.enabled ? "Enabled" : "Disabled"}
              </span>
              <button
                class="icon-button danger"
                type="button"
                title="Remove source"
                aria-label={`Remove ${source.path}`}
                onClick={() => remove(source)}
              >
                <Trash2 size={16} />
              </button>
            </article>
          ))}
        </div>
      )}
    </div>
  );
}
