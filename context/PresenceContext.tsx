import React, { createContext, useContext, useEffect, useMemo, useRef, useState } from 'react';
import type { RealtimeChannel } from '@supabase/supabase-js';
import { supabase } from '../lib/supabase';
import { useAuth } from '../hooks/useAuth';
import { useTenant } from './TenantContext';
import { useTeam } from './TeamContext';

export interface PresencePeer {
  id: string;
  name: string;
  avatar_url: string | null;
  color: string;
  page: string;
  cursor: { x: number; y: number; page: string } | null;
}

interface PresenceContextType {
  peers: PresencePeer[];
}

const PresenceContext = createContext<PresenceContextType | undefined>(undefined);

const colorFromId = (id: string): string => {
  let h = 0;
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) | 0;
  const hue = Math.abs(h) % 360;
  return `hsl(${hue}, 72%, 52%)`;
};

interface Meta {
  user_id: string;
  name: string;
  avatar_url: string | null;
  color: string;
  page: string;
  joined_at: number;
}

interface ProviderProps {
  children: React.ReactNode;
  currentPage: string;
}

export const PresenceProvider: React.FC<ProviderProps> = ({ children, currentPage }) => {
  const { user } = useAuth();
  const { currentTenant } = useTenant();
  const { members } = useTeam();

  const [peerMap, setPeerMap] = useState<Map<string, PresencePeer>>(new Map());
  const channelRef = useRef<RealtimeChannel | null>(null);
  const currentPageRef = useRef(currentPage);
  currentPageRef.current = currentPage;

  const myMember = members.find((m) => m.id === user?.id);
  const myName = myMember?.name || user?.email?.split('@')[0] || 'User';
  const myAvatar = myMember?.avatar_url ?? null;
  const myColor = user ? colorFromId(user.id) : '#999';

  useEffect(() => {
    if (!user || !currentTenant) return;

    const channel = supabase.channel(`presence:${currentTenant.id}`, {
      config: { presence: { key: user.id } },
    });

    channel
      .on('presence', { event: 'sync' }, () => {
        const state = channel.presenceState<Meta>();
        setPeerMap((prev) => {
          const next = new Map<string, PresencePeer>();
          Object.values(state)
            .flat()
            .forEach((m) => {
              if (m.user_id === user.id) return;
              const existing = prev.get(m.user_id);
              next.set(m.user_id, {
                id: m.user_id,
                name: m.name,
                avatar_url: m.avatar_url,
                color: m.color,
                page: m.page,
                cursor: existing && existing.cursor && existing.cursor.page === m.page ? existing.cursor : null,
              });
            });
          return next;
        });
      })
      .on('broadcast', { event: 'cursor' }, ({ payload }) => {
        if (!payload || payload.user_id === user.id) return;
        setPeerMap((prev) => {
          const existing = prev.get(payload.user_id);
          if (!existing) return prev;
          const updated = new Map(prev);
          updated.set(payload.user_id, {
            ...existing,
            cursor: { x: payload.x, y: payload.y, page: payload.page },
          });
          return updated;
        });
      })
      .on('broadcast', { event: 'cursor-leave' }, ({ payload }) => {
        if (!payload || payload.user_id === user.id) return;
        setPeerMap((prev) => {
          const existing = prev.get(payload.user_id);
          if (!existing || !existing.cursor) return prev;
          const updated = new Map(prev);
          updated.set(payload.user_id, { ...existing, cursor: null });
          return updated;
        });
      })
      .subscribe(async (status) => {
        if (status === 'SUBSCRIBED') {
          await channel.track({
            user_id: user.id,
            name: myName,
            avatar_url: myAvatar,
            color: myColor,
            page: currentPageRef.current,
            joined_at: Date.now(),
          } satisfies Meta);
        }
      });

    channelRef.current = channel;

    return () => {
      channel.untrack();
      supabase.removeChannel(channel);
      channelRef.current = null;
      setPeerMap(new Map());
    };
  }, [user?.id, currentTenant?.id, myName, myAvatar, myColor]);

  useEffect(() => {
    const ch = channelRef.current;
    if (!ch || !user) return;
    ch.track({
      user_id: user.id,
      name: myName,
      avatar_url: myAvatar,
      color: myColor,
      page: currentPage,
      joined_at: Date.now(),
    } satisfies Meta);
  }, [currentPage, user?.id, myName, myAvatar, myColor]);

  useEffect(() => {
    if (!user) return;

    let pending: { x: number; y: number } | null = null;
    let rafId: number | null = null;
    let lastSent = 0;

    const flush = () => {
      rafId = null;
      const ch = channelRef.current;
      if (!ch || !pending) return;
      const now = performance.now();
      if (now - lastSent < 40) {
        rafId = requestAnimationFrame(flush);
        return;
      }
      ch.send({
        type: 'broadcast',
        event: 'cursor',
        payload: {
          user_id: user.id,
          x: pending.x,
          y: pending.y,
          page: currentPageRef.current,
        },
      });
      lastSent = now;
      pending = null;
    };

    const onMove = (e: MouseEvent) => {
      pending = { x: e.clientX, y: e.clientY };
      if (rafId == null) rafId = requestAnimationFrame(flush);
    };

    const notifyLeave = () => {
      const ch = channelRef.current;
      if (!ch) return;
      ch.send({
        type: 'broadcast',
        event: 'cursor-leave',
        payload: { user_id: user.id },
      });
    };

    const onWindowLeave = () => notifyLeave();
    const onVisibility = () => {
      if (document.hidden) notifyLeave();
    };

    window.addEventListener('mousemove', onMove, { passive: true });
    window.addEventListener('mouseleave', onWindowLeave);
    window.addEventListener('blur', onWindowLeave);
    document.addEventListener('visibilitychange', onVisibility);

    return () => {
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseleave', onWindowLeave);
      window.removeEventListener('blur', onWindowLeave);
      document.removeEventListener('visibilitychange', onVisibility);
      if (rafId != null) cancelAnimationFrame(rafId);
    };
  }, [user?.id]);

  const value = useMemo<PresenceContextType>(
    () => ({ peers: Array.from(peerMap.values()) }),
    [peerMap]
  );

  return <PresenceContext.Provider value={value}>{children}</PresenceContext.Provider>;
};

export const usePresence = (): PresenceContextType => {
  const ctx = useContext(PresenceContext);
  if (!ctx) return { peers: [] };
  return ctx;
};
