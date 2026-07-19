import { useCallback, useEffect, useState } from "preact/hooks";
import { CirclePause, CirclePlay, RefreshCw, Square, Zap } from "lucide-preact";
import type { OpenMindApi } from "../lib/api";
import { toClientError } from "../lib/api";
import { isActiveIndexState, stateLabel } from "../lib/format";
import type { IndexJob } from "../lib/types";
import { ErrorNotice, LoadingRow, PageHeader } from "../components/common";

export function ActivityView({
  api,
  connected,
  onChanged,
}: {
  api: OpenMindApi;
  connected: boolean;
  onChanged: () => void;
}) {
  const [job, setJob] = useState<IndexJob | null>(null);
  const [loading, setLoading] = useState(false);
  const [acting, setActing] = useState(false);
  const [error, setError] = useState("");

  const load = useCallback(async (showLoading = false) => {
    if (!connected) return;
    if (showLoading) setLoading(true);
    try {
      setJob(await api.indexStatus());
      setError("");
    } catch (requestError) {
      setError(toClientError(requestError).message);
    } finally {
      setLoading(false);
    }
  }, [api, connected]);

  useEffect(() => {
    void load(true);
  }, [load]);

  useEffect(() => {
    if (!connected || !job || !isActiveIndexState(job.state)) return;
    const interval = window.setInterval(() => void load(), 1_000);
    return () => window.clearInterval(interval);
  }, [connected, job?.state, load]);

  const act = async (action: "start" | "pause" | "resume" | "stop") => {
    setActing(true);
    setError("");
    try {
      setJob(await api.indexAction(action));
      onChanged();
    } catch (requestError) {
      setError(toClientError(requestError).message);
    } finally {
      setActing(false);
    }
  };

  const state = job?.state ?? "idle";
  const canPause = ["pending", "discovering", "running"].includes(state);
  const canResume = ["pause_requested", "paused"].includes(state);
  const canStop = isActiveIndexState(state) && state !== "stop_requested";

  return (
    <div class="page">
      <PageHeader
        title="Activity"
        description="Indexing progress"
        action={
          <button class="icon-button" type="button" title="Refresh activity" onClick={() => load(true)}>
            <RefreshCw size={16} />
          </button>
        }
      />
      {error ? <ErrorNotice message={error} /> : null}
      {loading ? <LoadingRow label="Loading activity" /> : null}

      {!loading ? (
        <div class="activity-panel">
          <div class="activity-heading">
            <div>
              <span class={`status-pill ${state === "completed" ? "success" : ""}`}>
                {stateLabel(state)}
              </span>
              <h2>{job?.job_id ? "Indexing job" : "No indexing job"}</h2>
            </div>
            <div class="activity-actions">
              {!canPause && !canResume && !canStop ? (
                <button class="primary-button" type="button" onClick={() => act("start")} disabled={!connected || acting}>
                  <Zap size={16} /> Start indexing
                </button>
              ) : null}
              {canPause ? (
                <button class="secondary-button" type="button" onClick={() => act("pause")} disabled={acting}>
                  <CirclePause size={16} /> Pause
                </button>
              ) : null}
              {canResume ? (
                <button class="secondary-button" type="button" onClick={() => act("resume")} disabled={acting}>
                  <CirclePlay size={16} /> Resume
                </button>
              ) : null}
              {canStop ? (
                <button class="secondary-button danger-text" type="button" onClick={() => act("stop")} disabled={acting}>
                  <Square size={15} /> Stop
                </button>
              ) : null}
            </div>
          </div>

          <div class="progress-track" aria-label={`${job?.progress ?? 0}% complete`}>
            <div class="progress-value" style={{ width: `${Math.min(job?.progress ?? 0, 100)}%` }} />
          </div>
          <div class="progress-labels">
            <strong>{(job?.progress ?? 0).toFixed(1)}%</strong>
            <span>{job?.processed_files ?? 0} of {job?.total_files ?? 0} files</span>
          </div>

          <dl class="metrics-grid">
            <Metric label="Indexed" value={job?.indexed_files ?? 0} />
            <Metric label="Already indexed" value={job?.already_indexed_files ?? 0} />
            <Metric label="Skipped" value={job?.skipped_files ?? 0} />
            <Metric label="Failed" value={job?.failed_files ?? 0} tone="danger" />
            <Metric label="Chunks" value={job?.chunks_created ?? 0} />
          </dl>

          {job?.current_file ? (
            <div class="current-file">
              <span>Current file</span>
              <code>{job.current_file}</code>
            </div>
          ) : null}
          {job?.error ? <ErrorNotice message={job.error} /> : null}
        </div>
      ) : null}
    </div>
  );
}

function Metric({ label, value, tone }: { label: string; value: number; tone?: "danger" }) {
  return (
    <div class={tone === "danger" ? "danger-value" : ""}>
      <dt>{label}</dt>
      <dd>{value.toLocaleString()}</dd>
    </div>
  );
}
