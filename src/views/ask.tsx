import { useEffect, useRef, useState } from "preact/hooks";
import {
  ArrowUp,
  Bot,
  BrainCircuit,
  ChevronRight,
  MessageSquarePlus,
  MessageSquareText,
  User,
} from "lucide-preact";
import type { OpenMindApi } from "../lib/api";
import { toClientError } from "../lib/api";
import type { SearchResult } from "../lib/types";
import { EmptyState, ErrorNotice, PageHeader, ResultList } from "../components/common";
import { Markdown } from "../components/markdown";

interface ChatMessage {
  id: number;
  role: "user" | "assistant";
  text: string;
  rawText?: string;
  thinking?: string;
  thinkingPhase?: boolean;
  reasoningRequested?: boolean;
  sources: SearchResult[];
  pending?: boolean;
  error?: string;
}

const THINKING_HEADER = "## Thinking\n";
const ANSWER_HEADER = "## Answer\n";
const ANSWER_SEPARATOR = `\n\n${ANSWER_HEADER}`;

export function splitReasoningResponse(rawText: string, enabled: boolean) {
  if (!enabled) return { answer: rawText, thinking: "", thinkingPhase: false };

  if (THINKING_HEADER.startsWith(rawText) || ANSWER_HEADER.startsWith(rawText)) {
    return { answer: "", thinking: "", thinkingPhase: true };
  }
  if (rawText.startsWith(THINKING_HEADER)) {
    const content = rawText.slice(THINKING_HEADER.length);
    const answerIndex = content.indexOf(ANSWER_SEPARATOR);
    if (answerIndex === -1) {
      return {
        answer: "",
        thinking: withoutPartialSuffix(content, ANSWER_SEPARATOR),
        thinkingPhase: true,
      };
    }
    return {
      answer: content.slice(answerIndex + ANSWER_SEPARATOR.length),
      thinking: content.slice(0, answerIndex),
      thinkingPhase: false,
    };
  }
  if (rawText.startsWith(ANSWER_HEADER)) {
    return {
      answer: rawText.slice(ANSWER_HEADER.length),
      thinking: "",
      thinkingPhase: false,
    };
  }
  return { answer: rawText, thinking: "", thinkingPhase: false };
}

function withoutPartialSuffix(value: string, marker: string): string {
  for (let length = Math.min(value.length, marker.length - 1); length > 0; length -= 1) {
    if (value.endsWith(marker.slice(0, length))) return value.slice(0, -length);
  }
  return value;
}

export function AskView({ api, connected }: { api: OpenMindApi; connected: boolean }) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [question, setQuestion] = useState("");
  const [asking, setAsking] = useState(false);
  const [reasoningEnabled, setReasoningEnabled] = useState(false);
  const [conversationError, setConversationError] = useState("");
  const nextId = useRef(1);
  const sessionId = useRef<string | null>(null);

  useEffect(() => {
    sessionId.current = null;
    setMessages([]);
    setConversationError("");
    return () => {
      const activeSession = sessionId.current;
      sessionId.current = null;
      if (activeSession) void api.endChatSession(activeSession).catch(() => undefined);
    };
  }, [api]);

  const updateAssistant = (id: number, update: Partial<ChatMessage>) => {
    setMessages((current) =>
      current.map((message) => (message.id === id ? { ...message, ...update } : message)),
    );
  };

  const submit = async (event: Event) => {
    event.preventDefault();
    const value = question.trim();
    if (!value || asking || !connected) return;
    const reasoning = reasoningEnabled;

    const userId = nextId.current++;
    const assistantId = nextId.current++;
    setMessages((current) => [
      ...current,
      { id: userId, role: "user", text: value, sources: [] },
      {
        id: assistantId,
        role: "assistant",
        text: "",
        rawText: "",
        thinking: "",
        thinkingPhase: reasoning,
        reasoningRequested: reasoning,
        sources: [],
        pending: true,
      },
    ]);
    setQuestion("");
    setAsking(true);
    setConversationError("");

    try {
      await api.streamAsk(
        value,
        (streamEvent) => {
          if (streamEvent.event === "meta" && streamEvent.data.session_id) {
            sessionId.current = streamEvent.data.session_id;
          }
          if (streamEvent.event === "delta" && streamEvent.data.text) {
            setMessages((current) =>
              current.map((message) =>
                message.id === assistantId
                  ? appendAssistantDelta(message, streamEvent.data.text!)
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
            if (streamEvent.data.session_id) sessionId.current = streamEvent.data.session_id;
            updateAssistant(assistantId, { pending: false });
          }
        },
        {
          sessionId: sessionId.current,
          reasoning,
        },
      );
    } catch (error) {
      const clientError = toClientError(error);
      if (clientError.status === 404) sessionId.current = null;
      updateAssistant(assistantId, { error: clientError.message, pending: false });
    } finally {
      setAsking(false);
    }
  };

  const startNewChat = async () => {
    if (asking) return;
    const activeSession = sessionId.current;
    sessionId.current = null;
    setMessages([]);
    setQuestion("");
    setConversationError("");
    if (!activeSession) return;
    try {
      await api.endChatSession(activeSession);
    } catch (error) {
      const clientError = toClientError(error);
      if (clientError.status !== 404) setConversationError(clientError.message);
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
      <PageHeader
        title="Ask"
        description="Your local memory"
        action={messages.length > 0 ? (
          <button class="secondary-button" type="button" onClick={startNewChat} disabled={asking}>
            <MessageSquarePlus size={15} /> New chat
          </button>
        ) : null}
      />

      <div class="conversation" aria-live="polite">
        {conversationError ? <ErrorNotice message={conversationError} /> : null}
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
                {message.role === "assistant" && message.reasoningRequested &&
                (message.thinkingPhase || message.thinking) ? (
                  <details class="thinking-disclosure">
                    <summary>
                      <BrainCircuit size={14} />
                      <span
                        class={message.pending && message.thinkingPhase ? "thinking-active" : ""}
                      >
                        Thinking
                      </span>
                      <ChevronRight class="thinking-chevron" size={14} />
                    </summary>
                    <div class="thinking-content">
                      {message.thinking || "Waiting for reasoning..."}
                    </div>
                  </details>
                ) : null}
                {message.text ? (
                  message.role === "assistant" ? (
                    <Markdown>{message.text}</Markdown>
                  ) : (
                    <div class="message-text">{message.text}</div>
                  )
                ) : null}
                {message.pending && !message.text && !message.reasoningRequested ? (
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
        <div class="composer-footer">
          <button
            class={`reasoning-toggle${reasoningEnabled ? " active" : ""}`}
            type="button"
            role="switch"
            aria-checked={reasoningEnabled}
            onClick={() => setReasoningEnabled((enabled) => !enabled)}
            disabled={asking}
          >
            <BrainCircuit size={14} /> Reasoning
          </button>
          <button
            class="send-button"
            type="submit"
            title="Send question"
            aria-label="Send question"
            disabled={!connected || asking || !question.trim()}
          >
            <ArrowUp size={17} />
          </button>
        </div>
      </form>
    </div>
  );
}

function appendAssistantDelta(message: ChatMessage, delta: string): ChatMessage {
  const rawText = `${message.rawText ?? ""}${delta}`;
  const parsed = splitReasoningResponse(rawText, message.reasoningRequested === true);
  return {
    ...message,
    rawText,
    text: parsed.answer,
    thinking: parsed.thinking,
    thinkingPhase: parsed.thinkingPhase,
  };
}
