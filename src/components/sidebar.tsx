import {
  Activity,
  Database,
  MessageSquareText,
  Search,
  Settings,
} from "lucide-preact";
import { APP_CONFIG } from "../config";
import { compactNumber } from "../lib/format";
import type { StatusResponse, ViewId } from "../lib/types";
import appIcon from "../assets/app-icon.png";

const navigation: Array<{
  id: ViewId;
  label: string;
  icon: typeof MessageSquareText;
}> = [
  { id: "search", label: "Search", icon: Search },
  { id: "ask", label: "Ask", icon: MessageSquareText },
  { id: "sources", label: "Sources", icon: Database },
  { id: "activity", label: "Activity", icon: Activity },
  { id: "settings", label: "Settings", icon: Settings },
];

interface SidebarProps {
  current: ViewId;
  connected: boolean;
  status: StatusResponse | null;
  onNavigate: (view: ViewId) => void;
}

export function Sidebar({ current, connected, status, onNavigate }: SidebarProps) {
  return (
    <aside class="sidebar">
      <div class="brand">
        <img class="brand-mark" src={appIcon} alt="" aria-hidden="true" />
        <div class="brand-copy">
          <strong>{APP_CONFIG.name}</strong>
          <span>OpenMind client</span>
        </div>
      </div>

      <nav class="navigation" aria-label="Main navigation">
        {navigation.map(({ id, label, icon: Icon }) => (
          <button
            class={`nav-item ${current === id ? "active" : ""}`}
            type="button"
            onClick={() => onNavigate(id)}
            aria-current={current === id ? "page" : undefined}
          >
            <Icon size={17} strokeWidth={1.8} />
            <span>{label}</span>
          </button>
        ))}
      </nav>

      <div class="sidebar-footer">
        <div class="memory-summary">
          <span class={`connection-dot ${connected ? "online" : ""}`} aria-hidden="true" />
          <span>OpenMind {connected ? "connected" : "offline"}</span>
        </div>
        {connected && status ? (
          <div class="memory-counts">
            <span>{compactNumber(status.indexed_files)} files</span>
            <span>{compactNumber(status.indexed_chunks)} chunks</span>
          </div>
        ) : null}
        {/* <span class="app-version">v{APP_CONFIG.version}</span> */}
      </div>
    </aside>
  );
}
