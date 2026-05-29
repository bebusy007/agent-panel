import { useCallback, useEffect, useReducer, useRef } from 'react';
import type { ChatEvent, ServerMessage, ClientMessage } from './types';
import {
  chatReducer,
  INITIAL_STATE,
  isConnected,
  isRunning,
  type ChatSessionState,
  type SessionPhase,
} from './chat-session-store';

/** Build WebSocket URL from current window location. */
function wsUrl(path: string): string {
  const proto = window.location.protocol === 'https:' ? 'wss' : 'ws';
  return `${proto}://${window.location.host}${path}`;
}

interface UseChatConnection {
  /** Current chat session state (phase, streamingText, thinkingText, etc.) */
  state: ChatSessionState;
  /** Connect to an existing session via resume */
  connect: (sessionId: string, cwd?: string) => void;
  /** Start a new session in the given working directory */
  connectNew: (cwd: string) => void;
  /** Disconnect from the current session */
  disconnect: () => void;
  /** Send a user message. Returns false if WS is not connected. */
  sendMessage: (text: string) => boolean;
  /** Interrupt the current AI response */
  interrupt: () => void;
}

export function useChatConnection(): UseChatConnection {
  const [state, dispatch] = useReducer(chatReducer, INITIAL_STATE);
  const wsRef = useRef<WebSocket | null>(null);
  const phaseRef = useRef<SessionPhase>(state.phase);
  phaseRef.current = state.phase;

  const closeWs = useCallback(() => {
    if (wsRef.current) {
      const ws = wsRef.current;
      wsRef.current = null;
      // Remove listeners to avoid onclose firing after intentional close
      ws.onmessage = null;
      ws.onclose = null;
      ws.onerror = null;
      if (ws.readyState === WebSocket.OPEN || ws.readyState === WebSocket.CONNECTING) {
        ws.close(1000);
      }
    }
  }, []);

  const startWs = useCallback(
    (path: string) => {
      closeWs();
      dispatch({ type: 'CONNECT_START' });

      const ws = new WebSocket(wsUrl(path));
      wsRef.current = ws;

      ws.onopen = () => {
        // Wait for server Connected / SessionInit events
      };

      ws.onmessage = (ev) => {
        let data: ServerMessage;
        try {
          data = JSON.parse(ev.data);
        } catch {
          return;
        }

        switch (data.type) {
          case 'connected':
            dispatch({
              type: 'CONNECTED',
              sessionId: data.session_id,
              epoch: data.epoch,
              reconnectToken: data.reconnect_token,
              seq: data.seq,
            });
            break;
          case 'event':
            dispatch({ type: 'SERVER_EVENT', event: data.event });
            break;
          case 'state_change':
            if (data.state === 'idle') {
              dispatch({ type: 'TURN_INTERRUPTED' });
            }
            break;
          case 'error':
            dispatch({
              type: 'ERROR',
              code: data.code,
              message: data.message,
            });
            break;
          case 'disconnected':
            dispatch({ type: 'DISCONNECT' });
            break;
        }
      };

      ws.onerror = () => {
        // onclose will fire after this
      };

      ws.onclose = () => {
        if (wsRef.current === ws) {
          wsRef.current = null;
          if (phaseRef.current !== 'disconnected') {
            dispatch({ type: 'DISCONNECT' });
          }
        }
      };
    },
    [closeWs],
  );

  const connect = useCallback(
    (sessionId: string, cwd?: string) => {
      let url = `/api/ws/chat/resume/${encodeURIComponent(sessionId)}`;
      if (cwd) url += `?cwd=${encodeURIComponent(cwd)}`;
      startWs(url);
    },
    [startWs],
  );

  const connectNew = useCallback(
    (cwd: string) => {
      startWs(`/api/ws/chat/new?cwd=${encodeURIComponent(cwd)}`);
    },
    [startWs],
  );

  const disconnect = useCallback(() => {
    if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
      const msg: ClientMessage = { type: 'disconnect' };
      wsRef.current.send(JSON.stringify(msg));
    }
    closeWs();
    dispatch({ type: 'DISCONNECT' });
  }, [closeWs]);

  const sendMessage = useCallback((text: string): boolean => {
    if (!wsRef.current || wsRef.current.readyState !== WebSocket.OPEN) return false;
    const uuid = crypto.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(36).slice(2)}`;
    const msg: ClientMessage = { type: 'user_message', text, uuid };
    wsRef.current.send(JSON.stringify(msg));
    dispatch({ type: 'SEND_MESSAGE', text, uuid });
    return true;
  }, []);

  const interrupt = useCallback(() => {
    if (!wsRef.current || wsRef.current.readyState !== WebSocket.OPEN) return;
    const msg: ClientMessage = { type: 'interrupt' };
    wsRef.current.send(JSON.stringify(msg));
  }, []);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      closeWs();
    };
  }, [closeWs]);

  return { state, connect, connectNew, disconnect, sendMessage, interrupt };
}
