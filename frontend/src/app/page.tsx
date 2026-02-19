'use client';

import dynamic from 'next/dynamic';
import { useState, useEffect } from 'react';
import { useSocket } from '../hooks/useSocket';

const GameCanvas = dynamic(() => import('../components/GameCanvas'), { ssr: false });

export default function Home() {
  const [playerId, setPlayerId] = useState<number | null>(null);
  const [username, setUsername] = useState('');
  const { isConnected, messages, sendMessage } = useSocket(playerId || 0);

  const handleStart = async () => {
    if (!username) return;
    
    // Create player
    const res = await fetch('http://localhost:8000/players/', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username }),
    });
    
    if (res.ok) {
      const data = await res.json();
      setPlayerId(data.id);
      
      // Start story
      await fetch(`http://localhost:8000/story/init/${data.id}`, {
        method: 'POST',
      });
    } else {
      alert('Failed to create player');
    }
  };

  return (
    <div className="flex min-h-screen flex-col items-center justify-between p-24 bg-gray-900 text-white">
      <div className="z-10 w-full max-w-5xl items-center justify-between font-mono text-sm lg:flex">
        <h1 className="text-4xl font-bold mb-8">Infinite Narrative Game</h1>
        
        {!playerId ? (
          <div className="flex flex-col gap-4">
            <input
              type="text"
              placeholder="Enter Username"
              className="p-2 rounded text-black"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
            />
            <button 
              onClick={handleStart}
              className="bg-blue-500 hover:bg-blue-700 text-white font-bold py-2 px-4 rounded"
            >
              Start Adventure
            </button>
          </div>
        ) : (
          <div className="flex flex-col gap-4 w-full">
            <div className="flex justify-between items-center">
              <span className="text-green-400">Status: {isConnected ? 'Connected' : 'Disconnected'}</span>
              <span>Player ID: {playerId}</span>
            </div>
            
            <div className="flex gap-4 w-full">
              <div className="w-2/3">
                <GameCanvas width={800} height={600} />
              </div>
              
              <div className="w-1/3 bg-gray-800 p-4 rounded-lg h-[600px] overflow-y-auto">
                <h2 className="text-xl mb-4 border-b border-gray-600 pb-2">Story Log</h2>
                {messages.map((msg, i) => (
                  <div key={i} className="mb-2 p-2 bg-gray-700 rounded">
                    {msg}
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
