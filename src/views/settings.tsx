import { useEffect, useState } from "preact/hooks";
import { Check, RefreshCw, Server } from "lucide-preact";
import { APP_CONFIG } from "../config";
import type {
  ClientSettings,
  ProviderStatusResponse,
  StatusResponse,
} from "../lib/types";
import { PageHeader } from "../components/common";

export function SettingsView({
  settings,
  status,
  provider,
  checking,
  onSave,
  onRefresh,
}: {
  settings: ClientSettings;
  status: StatusResponse | null;
  provider: ProviderStatusResponse | null;
  checking: boolean;
  onSave: (settings: ClientSettings) => void;
  onRefresh: () => void;
}) {
  const [apiUrl, setApiUrl] = useState(settings.apiUrl);
  const [saved, setSaved] = useState(false);

  useEffect(() => setApiUrl(settings.apiUrl), [settings.apiUrl]);

  const save = (event: Event) => {
    event.preventDefault();
    onSave({ apiUrl: apiUrl.trim() });
    setSaved(true);
    window.setTimeout(() => setSaved(false), 1_500);
  };

  return (
    <div class="page settings-page">
      <PageHeader title="Settings" description={`${APP_CONFIG.name} v${APP_CONFIG.version}`} />

      <section class="settings-section">
        <div class="settings-section-title">
          <Server size={18} />
          <div>
            <h2>OpenMind connection</h2>
            <p>Local loopback address</p>
          </div>
        </div>
        <form class="settings-form" onSubmit={save}>
          <label for="api-url">API address</label>
          <div class="field-row">
            <input
              id="api-url"
              type="url"
              value={apiUrl}
              onInput={(event) => setApiUrl(event.currentTarget.value)}
              spellcheck={false}
              required
            />
            <button class="primary-button" type="submit">
              {saved ? <Check size={16} /> : null}
              {saved ? "Saved" : "Save"}
            </button>
          </div>
          <span class="field-hint">Only http://127.0.0.1 addresses are accepted.</span>
        </form>
      </section>

      <section class="settings-section status-section">
        <div class="settings-section-title">
          <div class={`large-connection-dot ${status ? "online" : ""}`} />
          <div>
            <h2>{status ? "Connected" : "Not connected"}</h2>
            <p>{provider?.message ?? "OpenMind is not reachable."}</p>
          </div>
          <button class="icon-button push-right" type="button" title="Check connection" onClick={onRefresh} disabled={checking}>
            <RefreshCw class={checking ? "spin" : ""} size={16} />
          </button>
        </div>
        {status ? (
          <dl class="settings-values">
            <div><dt>OpenMind</dt><dd>v{status.version}</dd></div>
            <div><dt>Provider</dt><dd>{status.provider}</dd></div>
            <div><dt>Chat model</dt><dd>{status.chat_model ?? "Search only"}</dd></div>
            <div><dt>Embedding model</dt><dd>{status.embedding_model ?? "Not selected"}</dd></div>
            <div><dt>Image model</dt><dd>{status.image_model ?? "Disabled"}</dd></div>
          </dl>
        ) : null}
      </section>
    </div>
  );
}
