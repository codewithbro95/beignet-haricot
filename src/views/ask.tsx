import { useRef, useState } from "preact/hooks";
import { ArrowUp, Bot, MessageSquareText, User } from "lucide-preact";
import type { OpenMindApi } from "../lib/api";
import { toClientError } from "../lib/api";
import type { SearchResult } from "../lib/types";
import { EmptyState, ErrorNotice, PageHeader, ResultList } from "../components/common";

interface ChatMessage {
  id: number;
  role: "user" | "assistant";
  text: string;
  sources: SearchResult[];
  pending?: boolean;
  error?: string;
}

export function AskView({ api, connected }: { api: OpenMindApi; connected: boolean }) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [question, setQuestion] = useState("");
  const [asking, setAsking] = useState(false);
  const nextId = useRef(1);

  const updateAssistant = (id: number, update: Partial<ChatMessage>) => {
    setMessages((current) =>
      current.map((message) => (message.id === id ? { ...message, ...update } : message)),
    );
  };

  const submit = async (event: Event) => {
    event.preventDefault();
    const value = question.trim();
    if (!value || asking || !connected) return;

    const userId = nextId.current++;
    const assistantId = nextId.current++;
    setMessages((current) => [
      ...current,
      { id: userId, role: "user", text: value, sources: [] },
      { id: assistantId, role: "assistant", text: "", sources: [], pending: true },
    ]);
    setQuestion("");
    setAsking(true);

    try {
      await api.streamAsk(value, (streamEvent) => {
        if (streamEvent.event === "delta" && streamEvent.data.text) {
          setMessages((current) =>
            current.map((message) =>
              message.id === assistantId
                ? { ...message, text: message.text + streamEvent.data.text }
                : message,
            ),
          );
        }
        if (streamEvent.event === "sources") {
          updateAssistant(assistantId, { sources: streamEvent.data.sources ?? [] });
        }
        if (streamEvent.event === "error") {
          updateAssistant(assistantId, {
            error: streamEvent.data.message ?? "OpenMind could not complete the answer.",
            pending: false,
          });
        }
        if (streamEvent.event === "done") {
          updateAssistant(assistantId, { pending: false });
        }
      });
    } catch (error) {
      updateAssistant(assistantId, { error: toClientError(error).message, pending: false });
    } finally {
      setAsking(false);
    }
  };

  const openResult = async (result: SearchResult) => {
    try {
      await api.openFile(result.file_id);
    } catch (error) {
      const lastAssistant = [...messages].reverse().find((message) => message.role === "assistant");
      updateAssistant(
        lastAssistant?.id ?? -1,
        { error: toClientError(error).message },
      );
    }
  };

  return (
    <div class="ask-layout">
      <PageHeader title="Ask" description="Your local memory" />

      <div class="conversation" aria-live="polite">
        {messages.length === 0 ? (
          <EmptyState
            icon={<MessageSquareText size={22} />}
            title="Ask your files"
            detail="Try a project name, receipt detail, note, or document you remember."
          />
        ) : (
          messages.map((message) => (
            <article class={`message ${message.role}`} key={message.id}>
              <div class="message-avatar" aria-hidden="true">
                {message.role === "user" ? <User size={16} /> : <Bot size={16} />}
              </div>
              <div class="message-body">
                <strong>{message.role === "user" ? "You" : "OpenMind"}</strong>
                {message.text ? <div class="message-text">{message.text}</div> : null}
                {message.pending && !message.text ? (
                  <div class="thinking-dots" aria-label="OpenMind is answering">
                    <span />
                    <span />
                    <span />
                  </div>
                ) : null}
                {message.error ? <ErrorNotice message={message.error} /> : null}
                {message.sources.length > 0 ? (
                  <details class="sources-disclosure">
                    <summary>{message.sources.length} sources</summary>
                    <ResultList results={message.sources} onOpen={openResult} />
                  </details>
                ) : null}
              </div>
            </article>
          ))
        )}
      </div>

      <form class="composer" onSubmit={submit}>
        <textarea
          value={question}
          onInput={(event) => setQuestion(event.currentTarget.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter" && !event.shiftKey) {
              event.preventDefault();
              event.currentTarget.form?.requestSubmit();
            }
          }}
          placeholder={connected ? "Ask OpenMind..." : "OpenMind is offline"}
          aria-label="Question"
          rows={1}
          maxLength={4000}
          disabled={!connected || asking}
        />
        <button
          class="send-button"
          type="submit"
          title="Send question"
          aria-label="Send question"
          disabled={!connected || asking || !question.trim()}
        >
          <ArrowUp size={17} />
        </button>
      </form>
    </div>
  );
}
