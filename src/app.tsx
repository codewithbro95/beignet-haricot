import { useCallback, useEffect, useMemo, useState } from "preact/hooks";
import { Sidebar } from "./components/sidebar";
import { ErrorNotice } from "./components/common";
import { createApi, loadSettings, saveSettings, toClientError } from "./lib/api";
import type { ClientSettings, ProviderStatusResponse, StatusResponse, ViewId } from "./lib/types";
import { ActivityView } from "./views/activity";
import { AskView } from "./views/ask";
import { SearchView } from "./views/search";
import { SettingsView } from "./views/settings";
import { SourcesView } from "./views/sources";

export function App() {
  const [view, setView] = useState<ViewId>("search");
  const [settings, setSettings] = useState<ClientSettings>(loadSettings);
  const [status, setStatus] = useState<StatusResponse | null>(null);
  const [provider, setProvider] = useState<ProviderStatusResponse | null>(null);
  const [connectionError, setConnectionError] = useState("");
  const [checking, setChecking] = useState(true);
  const api = useMemo(() => createApi(settings), [settings]);

  const refreshConnection = useCallback(async () => {
    setChecking(true);
    try {
      await api.health();
      const [nextStatus, nextProvider] = await Promise.all([api.status(), api.providerStatus()]);
      setStatus(nextStatus);
      setProvider(nextProvider);
      setConnectionError("");
    } catch (error) {
      setStatus(null);
      setProvider(null);
      setConnectionError(toClientError(error).message);
    } finally {
      setChecking(false);
    }
  }, [api]);

  useEffect(() => {
    void refreshConnection();
    const interval = window.setInterval(refreshConnection, 15_000);
    return () => window.clearInterval(interval);
  }, [refreshConnection]);

  const updateSettings = (next: ClientSettings) => {
    saveSettings(next);
    setSettings(next);
  };

  const connected = status !== null;

  return (
    <div class="app-shell">
      <Sidebar current={view} connected={connected} status={status} onNavigate={setView} />
      <main class={`main-content${!connected && !checking ? " has-offline-banner" : ""}`}>
        {!connected && !checking ? (
          <div class="offline-banner">
            <ErrorNotice message={connectionError} onRetry={refreshConnection} />
          </div>
        ) : null}

        <section class="view" hidden={view !== "ask"}>
          <AskView api={api} connected={connected} />
        </section>
        <section class="view" hidden={view !== "search"}>
          <SearchView api={api} connected={connected} />
        </section>
        <section class="view" hidden={view !== "sources"}>
          <SourcesView api={api} connected={connected} onChanged={refreshConnection} />
        </section>
        <section class="view" hidden={view !== "activity"}>
          <ActivityView api={api} connected={connected} onChanged={refreshConnection} />
        </section>
        <section class="view" hidden={view !== "settings"}>
          <SettingsView
            settings={settings}
            status={status}
            provider={provider}
            checking={checking}
            onSave={updateSettings}
            onRefresh={refreshConnection}
          />
        </section>
      </main>
    </div>
  );
}
