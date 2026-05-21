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
  autoConnect?: boolean;
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
    if (wsRef.current) {
      wsRef.current.close();
    }

    dispatch({ type: "CONNECT_START" });

    const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
    const host = window.location.host;

    let url: string;
    if (options.sessionId) {
      url = `${protocol}//${host}/api/ws/chat/resume/${options.sessionId}`;
      if (state.reconnectToken) {
        url += `?token=${encodeURIComponent(state.reconnectToken)}`;
      }
    } else if (options.cwd) {
      url = `${protocol}//${host}/api/ws/chat/new?cwd=${encodeURIComponent(options.cwd)}`;
    } else {
      dispatch({ type: "ERROR", code: "invalid_config", message: "No sessionId or cwd provided" });
      return;
    }

    const ws = new WebSocket(url);
    wsRef.current = ws;

    ws.onmessage = (event) => {
      try {
        const msg: ServerMessage = JSON.parse(event.data);
        handleServerMessage(msg, dispatch);
      } catch {
        // Ignore unparseable messages
      }
    };

    ws.onclose = () => {
      wsRef.current = null;
      // Auto-reconnect after 3s if not explicitly disconnected
      if (state.phase !== "disconnected" && state.phase !== "empty") {
        reconnectTimerRef.current = setTimeout(() => {
          if (options.sessionId) {
            connect();
          }
        }, 3000);
      }
    };

    ws.onerror = () => {
      dispatch({ type: "ERROR", code: "ws_error", message: "WebSocket connection error" });
    };
  }, [options.sessionId, options.cwd, state.reconnectToken, state.phase]);

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
      const uuid = crypto.randomUUID();
      dispatch({ type: "SEND_MESSAGE", text, uuid });
      sendWsMessage({
        type: "user_message",
        text,
        attachments: attachments ?? [],
      });
    },
    [sendWsMessage]
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

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (reconnectTimerRef.current) {
        clearTimeout(reconnectTimerRef.current);
      }
      // Note: we do NOT close the WebSocket on unmount (page navigation keeps connection)
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
    case "state_change":
      if (msg.state === "idle") {
        // TurnComplete already handled via event, but idle from state_change
        // can also indicate turn end without explicit result event
      }
      break;

    case "connected":
      dispatch({
        type: "CONNECTED",
        sessionId: msg.session_id,
        epoch: msg.epoch,
        reconnectToken: msg.reconnect_token,
      });
      break;

    case "event": {
      // ServerEvent wraps a ChatEvent — extract the event fields
      const { type: _type, ...eventFields } = msg;
      dispatch({ type: "SERVER_EVENT", event: eventFields as unknown as ChatEvent });
      break;
    }

    case "error":
      dispatch({ type: "ERROR", code: msg.code, message: msg.message });
      break;

    case "disconnected":
      dispatch({ type: "DISCONNECT" });
      break;
  }
}
