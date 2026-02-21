'use client';

import dynamic from 'next/dynamic';
import { useAuth } from '@/context/AuthContext';
import { useSocket } from '../hooks/useSocket';
import { Button } from 'antd';
import { LogoutOutlined } from '@ant-design/icons';

const GameCanvas = dynamic(() => import('../components/GameCanvas'), { ssr: false });

export default function Home() {
  const { user, logout } = useAuth();
  const { isConnected, messages, sendMessage } = useSocket(user?.id || '');

  return (
    <div className="flex min-h-screen flex-col items-center justify-between p-24 bg-gray-900 text-white">
      <div className="z-10 w-full max-w-5xl items-center justify-between font-mono text-sm lg:flex">
        <div className="flex justify-between items-center w-full mb-8">
          <h1 className="text-4xl font-bold">Infinite Narrative Game</h1>
          <div className="flex items-center gap-4">
            <span className="text-gray-300">{user?.nickname}</span>
            <Button
              icon={<LogoutOutlined />}
              onClick={logout}
              size="small"
              type="text"
              style={{ color: '#9ca3af' }}
            >
              退出
            </Button>
          </div>
        </div>

        <div className="flex flex-col gap-4 w-full">
          <div className="flex justify-between items-center">
            <span className="text-green-400">Status: {isConnected ? 'Connected' : 'Disconnected'}</span>
            <span className="text-gray-400">{user?.email}</span>
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
      </div>
    </div>
  );
}
