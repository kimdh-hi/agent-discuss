import { useState, useEffect, useCallback } from 'react';
import { apiFetch } from './lib/api';
import { getToken, getStoredUser, setToken, setStoredUser, clearAuth } from './lib/storage';
import type { User, Workspace, Agent, Room } from './lib/types';
import LoginPage from './components/LoginPage';
import Sidebar from './components/Sidebar';
import AgentChatView from './components/AgentChatView';
import RoomDiscussView from './components/RoomDiscussView';

type View =
  | { type: 'welcome' }
  | { type: 'agent'; agent: Agent }
  | { type: 'room'; room: Room };

export default function App() {
  const [token, setTokenState] = useState<string | null>(getToken);
  const [user, setUser] = useState<User | null>(getStoredUser);
  const [workspaces, setWorkspaces] = useState<Workspace[]>([]);
  const [wsId, setWsId] = useState<string>('');
  const [view, setView] = useState<View>({ type: 'welcome' });

  const loadWorkspaces = useCallback(() => {
    apiFetch<{ items?: Workspace[] } | Workspace[]>('/workspaces')
      .then((d) => {
        // API may return array directly or wrapped {items:[]}
        const list = Array.isArray(d) ? d : ((d as { items?: Workspace[] }).items ?? []);
        setWorkspaces(list);
        if (list.length > 0 && !wsId) setWsId(list[0].id);
      })
      .catch(() => {
        clearAuth();
        setTokenState(null);
        setUser(null);
      });
  }, [wsId]);

  useEffect(() => {
    if (token && user) loadWorkspaces();
  }, [token, user, loadWorkspaces]);

  const handleLogin = (t: string, u: User) => {
    setToken(t);
    setStoredUser(u);
    setTokenState(t);
    setUser(u);
  };

  const handleLogout = () => {
    clearAuth();
    setTokenState(null);
    setUser(null);
    setWorkspaces([]);
    setWsId('');
    setView({ type: 'welcome' });
  };

  if (!token || !user) {
    return <LoginPage onLogin={handleLogin} />;
  }

  return (
    <div className="flex h-screen overflow-hidden bg-zinc-900">
      <Sidebar
        workspaces={workspaces}
        wsId={wsId}
        user={user}
        onWsChange={(id) => {
          setWsId(id);
          setView({ type: 'welcome' });
        }}
        onWorkspaceCreated={(ws) => {
          setWorkspaces((prev) => [...prev, ws]);
          setWsId(ws.id);
          setView({ type: 'welcome' });
        }}
        onSelectAgent={(agent) => setView({ type: 'agent', agent })}
        onAgentUpdated={(agent) =>
          setView((v) =>
            v.type === 'agent' && v.agent.id === agent.id ? { type: 'agent', agent } : v,
          )
        }
        onSelectRoom={(room) => setView({ type: 'room', room })}
        onLogout={handleLogout}
      />
      <main className="flex min-w-0 flex-1 overflow-hidden">
        {view.type === 'welcome' && (
          <div className="flex h-full flex-1 items-center justify-center">
            <p className="text-sm text-zinc-500">사이드바에서 에이전트 또는 룸을 선택하세요</p>
          </div>
        )}
        {view.type === 'agent' && (
          <AgentChatView key={view.agent.id} agent={view.agent} wsId={wsId} />
        )}
        {view.type === 'room' && (
          <RoomDiscussView key={view.room.id} room={view.room} />
        )}
      </main>
    </div>
  );
}
