import { useReducer, useCallback, useRef, useEffect } from "react";
import type {
  ServerMessage,
  ClientMessage,
  AttachmentData,
  ChatEvent,
  ConnectionState,
} from "./chat-protocol";
import {
  chatReducer,
  INITIAL_STATE,
  type ChatSessionState,
  type ChatAction,
} from "./chat-session-store";

interface UseChatConnectionOptions {
  sessionId?: string;
  cwd?: string;
}

interface UseChatConnectionReturn {
  state: ChatSessionState;
  connectionState: ConnectionState;
  connect: () => void;
  disconnect: () => void;
  sendMessage: (text: string, attachments?: AttachmentData[]) => void;
  respondPermission: (requestId: string, decision: "allow" | "deny") => void;
  interrupt: () => void;
}

export function useChatConnection(
  options: UseChatConnectionOptions
): UseChatConnectionReturn {
  const [state, dispatch] = useReducer(chatReducer, INITIAL_STATE);
  const wsRef = useRef<WebSocket | null>(null);
  const reconnectTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const stateRef = useRef(state);
  stateRef.current = state;

  const optionsRef = useRef(options);
  optionsRef.current = options;

  // Pending message to send after WS connects (auto-connect-on-send pattern)
  const pendingFirstMessage = useRef<{ text: string; attachments: AttachmentData[] } | null>(null);

  const getConnectionState = (): ConnectionState => {
    switch (state.phase) {
      case "empty":
      case "disconnected":
        return "idle";
      case "connecting":
        return "connecting";
      case "connected":
      case "idle":
      case "running":
        return "connected";
      case "error":
        return "error";
      default:
        return "idle";
    }
  };

  const sendWsMessage = useCallback((msg: ClientMessage) => {
    const ws = wsRef.current;
    if (ws && ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify(msg));
    }
  }, []);

  const connect = useCallback(() => {
    if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
      return; // Already connected
    }
    if (wsRef.current) {
      wsRef.current.close();
      wsRef.current = null;
    }

    dispatch({ type: "CONNECT_START" });

    const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
    const host = window.location.host;
    const opts = optionsRef.current;

    let url: string;
    if (opts.sessionId) {
      url = `${protocol}//${host}/api/ws/chat/resume/${opts.sessionId}`;
      const params = new URLSearchParams();
      const token = stateRef.current.reconnectToken;
      if (token) params.set("token", token);
      if (opts.cwd) params.set("cwd", opts.cwd);
      const qs = params.toString();
      if (qs) url += `?${qs}`;
    } else if (opts.cwd) {
      url = `${protocol}//${host}/api/ws/chat/new?cwd=${encodeURIComponent(opts.cwd)}`;
    } else {
      dispatch({ type: "ERROR", code: "invalid_config", message: "No sessionId or cwd provided" });
      return;
    }

    const ws = new WebSocket(url);
    wsRef.current = ws;

    ws.onopen = () => {
      // If there's a pending first message (auto-connect-on-send), send it now
      if (pendingFirstMessage.current) {
        const { text, attachments } = pendingFirstMessage.current;
        pendingFirstMessage.current = null;
        const uuid = crypto.randomUUID();
        dispatch({ type: "SEND_MESSAGE", text, uuid });
        ws.send(JSON.stringify({
          type: "user_message",
          text,
          attachments,
        } satisfies ClientMessage));
      }
    };

    ws.onmessage = (event) => {
      try {
        const msg = JSON.parse(event.data as string) as ServerMessage;
        handleServerMessage(msg, dispatch);
      } catch {
        // Ignore unparseable messages
      }
    };

    ws.onclose = () => {
      wsRef.current = null;
      const currentPhase = stateRef.current.phase;
      if (
        currentPhase !== "disconnected" &&
        currentPhase !== "empty" &&
        currentPhase !== "error"
      ) {
        reconnectTimerRef.current = setTimeout(() => {
          if (optionsRef.current.sessionId || stateRef.current.sessionId) {
            connect();
          }
        }, 3000);
      }
    };

    ws.onerror = () => {
      dispatch({ type: "ERROR", code: "ws_error", message: "WebSocket connection failed" });
    };
  }, []);

  const disconnect = useCallback(() => {
    if (reconnectTimerRef.current) {
      clearTimeout(reconnectTimerRef.current);
      reconnectTimerRef.current = null;
    }
    sendWsMessage({ type: "disconnect" });
    dispatch({ type: "DISCONNECT" });
    if (wsRef.current) {
      wsRef.current.close();
      wsRef.current = null;
    }
  }, [sendWsMessage]);

  const sendMessage = useCallback(
    (text: string, attachments?: AttachmentData[]) => {
      const atts = attachments ?? [];

      // Auto-connect if not connected: queue message, then connect
      if (!wsRef.current || wsRef.current.readyState !== WebSocket.OPEN) {
        pendingFirstMessage.current = { text, attachments: atts };
        connect();
        return;
      }

      // Already connected: send immediately
      const uuid = crypto.randomUUID();
      dispatch({ type: "SEND_MESSAGE", text, uuid });
      sendWsMessage({
        type: "user_message",
        text,
        attachments: atts,
      });
    },
    [sendWsMessage, connect]
  );

  const respondPermission = useCallback(
    (requestId: string, decision: "allow" | "deny") => {
      sendWsMessage({
        type: "permission_response",
        request_id: requestId,
        decision,
      });
    },
    [sendWsMessage]
  );

  const interrupt = useCallback(() => {
    sendWsMessage({ type: "interrupt" });
    dispatch({ type: "TURN_INTERRUPTED" });
  }, [sendWsMessage]);

  useEffect(() => {
    return () => {
      if (reconnectTimerRef.current) {
        clearTimeout(reconnectTimerRef.current);
      }
    };
  }, []);

  return {
    state,
    connectionState: getConnectionState(),
    connect,
    disconnect,
    sendMessage,
    respondPermission,
    interrupt,
  };
}

function handleServerMessage(msg: ServerMessage, dispatch: React.Dispatch<ChatAction>) {
  switch (msg.type) {
    case "connected":
      dispatch({
        type: "CONNECTED",
        sessionId: msg.session_id,
        epoch: msg.epoch,
        reconnectToken: msg.reconnect_token,
      });
      break;

    case "event": {
      const { type: _type, ...eventFields } = msg as unknown as Record<string, unknown>;
      dispatch({ type: "SERVER_EVENT", event: eventFields as unknown as ChatEvent });
      break;
    }

    case "error":
      dispatch({ type: "ERROR", code: msg.code, message: msg.message });
      break;

    case "disconnected":
      dispatch({ type: "DISCONNECT" });
      break;

    case "state_change":
      if (msg.state === "spawned") {
        dispatch({ type: "CONNECT_START" });
      }
      break;

    default:
      break;
  }
}
