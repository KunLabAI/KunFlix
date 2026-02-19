import { useEffect, useRef, useState } from 'react';

export const useSocket = (playerId: number) => {
  const socketRef = useRef<WebSocket | null>(null);
  const [messages, setMessages] = useState<string[]>([]);
  const [isConnected, setIsConnected] = useState(false);

  useEffect(() => {
    if (!playerId) return;

    const ws = new WebSocket(`ws://localhost:8000/ws/${playerId}`);

    ws.onopen = () => {
      console.log('Connected to WebSocket');
      setIsConnected(true);
    };

    ws.onmessage = (event) => {
      console.log('Message received:', event.data);
      setMessages((prev) => [...prev, event.data]);
    };

    ws.onclose = () => {
      console.log('Disconnected from WebSocket');
      setIsConnected(false);
    };

    socketRef.current = ws;

    return () => {
      ws.close();
    };
  }, [playerId]);

  const sendMessage = (message: string) => {
    if (socketRef.current && socketRef.current.readyState === WebSocket.OPEN) {
      socketRef.current.send(message);
    }
  };

  return { isConnected, messages, sendMessage };
};
