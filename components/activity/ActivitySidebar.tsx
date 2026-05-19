import React from 'react';
import { Icons } from '../ui/Icons';

/**
 * Activity sidebar — community + team pulse panels.
 * Renders the right column from the LIVV OS activity bundle:
 *   1. Team announcement (gold gradient)
 *   2. Online presence (with status dots)
 *   3. Active discussion threads (with unread counts)
 *   4. Clients online
 *   5. Pinned messages
 *
 * Driven by the same hooks the rest of Activity uses — we pass the
 * computed data in via props from the parent so the sidebar stays
 * a pure presentational component.
 */

interface PresenceMember {
  id: string;
  name: string;
  avatar?: string | null;
  status: 'online' | 'away' | 'off';
  doing?: string;
  when?: string;
  color?: string;
}

interface Thread {
  id: string;
  title: string;
  avs: { name: string; color: string }[];
  replies: number;
  unread?: number;
  when: string;
}

interface ClientOnline {
  id: string;
  name: string;
  initials: string;
  bg: string;
  fg: string;
  doing: string;
  status: 'in' | 'signed' | 'away';
}

interface PinnedMessage {
  id: string;
  title: string;
  text: string;
  when: string;
  icon: 'sparkle' | 'play' | 'star';
}

interface ActivitySidebarProps {
  presence?: PresenceMember[];
  threads?: Thread[];
  clients?: ClientOnline[];
  pinned?: PinnedMessage[];
  announcement?: {
    title: string;
    desc: string;
    foot?: string;
    ctaLabel?: string;
    onCta?: () => void;
  } | null;
  onPersonClick?: (id: string) => void;
}

function getInitials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return '·';
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

export const ActivitySidebar: React.FC<ActivitySidebarProps> = ({
  presence = [],
  threads = [],
  clients = [],
  pinned = [],
  announcement,
  onPersonClick,
}) => {
  const onlineCount = presence.filter(p => p.status === 'online').length;
  const totalUnread = threads.reduce((s, t) => s + (t.unread || 0), 0);

  return (
    <aside className="actd-side">
      {/* Announcement (gold gradient card) */}
      {announcement && (
        <div className="actd-announce">
          <div className="actd-announce-eyebrow">
            <span className="pulse" />
            Team announcement
          </div>
          <div className="actd-announce-title">{announcement.title}</div>
          <div className="actd-announce-desc">{announcement.desc}</div>
          <div className="actd-announce-foot">
            {announcement.foot && <span>{announcement.foot}</span>}
            {announcement.ctaLabel && (
              <button className="actd-announce-cta" onClick={announcement.onCta}>
                {announcement.ctaLabel}
              </button>
            )}
          </div>
        </div>
      )}

      {/* Online presence */}
      {presence.length > 0 && (
        <div className="actd-side-card">
          <div className="actd-side-head">
            <div className="actd-side-title">
              <span className="actd-side-title-ic">
                <Icons.Users size={12} />
              </span>
              Online now
            </div>
            <span className="actd-side-meta">{onlineCount}/{presence.length}</span>
          </div>
          <div className="actd-side-body">
            {presence.map(m => (
              <div
                key={m.id}
                className="actd-presence-row"
                onClick={() => onPersonClick?.(m.id)}
              >
                <span className="actd-presence-av" style={{ background: m.color || '#71717a' }}>
                  {m.avatar
                    ? <img src={m.avatar} alt="" className="w-full h-full rounded-full object-cover" />
                    : getInitials(m.name)}
                  <span className={`actd-presence-status ${m.status}`} />
                </span>
                <div className="actd-presence-meta">
                  <span className="actd-presence-name">{m.name}</span>
                  {m.doing && <span className="actd-presence-doing">{m.doing}</span>}
                </div>
                <span className="actd-presence-time">{m.when || ''}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Discussion threads */}
      {threads.length > 0 && (
        <div className="actd-side-card">
          <div className="actd-side-head">
            <div className="actd-side-title">
              <span className="actd-side-title-ic">
                <Icons.Message size={12} />
              </span>
              Discussions
            </div>
            <span className="actd-side-meta">
              {totalUnread > 0 ? `${totalUnread} unread` : `${threads.length} active`}
            </span>
          </div>
          <div className="actd-side-body">
            {threads.map(t => (
              <div key={t.id} className="actd-thread">
                <div className="actd-thread-title">{t.title}</div>
                <div className="actd-thread-meta">
                  <span className="actd-thread-avs">
                    {t.avs.slice(0, 3).map((a, i) => (
                      <span key={i} className="av" style={{ background: a.color }}>
                        {getInitials(a.name)}
                      </span>
                    ))}
                  </span>
                  <span>{t.replies} replies</span>
                  <span>·</span>
                  <span>{t.when}</span>
                  {t.unread && t.unread > 0 ? <span className="unread">{t.unread}</span> : null}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Clients online */}
      {clients.length > 0 && (
        <div className="actd-side-card">
          <div className="actd-side-head">
            <div className="actd-side-title">
              <span className="actd-side-title-ic">
                <Icons.Briefcase size={12} />
              </span>
              Clients
            </div>
            <span className="actd-side-meta">
              {clients.filter(c => c.status === 'in').length} online
            </span>
          </div>
          <div className="actd-side-body" style={{ padding: '8px 0 10px' }}>
            {clients.map(c => (
              <div key={c.id} className="actd-client-card">
                <span
                  className="actd-client-av"
                  style={{ background: c.bg, color: c.fg }}
                >
                  {c.initials}
                </span>
                <div className="actd-client-body">
                  <div className="actd-client-name">{c.name}</div>
                  <div className="actd-client-doing">{c.doing}</div>
                </div>
                <span className={`actd-client-status ${c.status}`}>{c.status}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Pinned messages */}
      {pinned.length > 0 && (
        <div className="actd-side-card">
          <div className="actd-side-head">
            <div className="actd-side-title">
              <span className="actd-side-title-ic">
                <Icons.Star size={12} />
              </span>
              Pinned
            </div>
            <span className="actd-side-meta">{pinned.length}</span>
          </div>
          <div className="actd-side-body">
            {pinned.map(p => {
              const PinIcon = p.icon === 'play' ? Icons.Activity : p.icon === 'star' ? Icons.Star : Icons.Sparkles;
              return (
                <div key={p.id} className="actd-pinned">
                  <span className="actd-pinned-ic">
                    <PinIcon size={13} />
                  </span>
                  <div className="actd-pinned-body">
                    <div className="actd-pinned-title">{p.title}</div>
                    <div className="actd-pinned-text">{p.text}</div>
                    <div className="actd-pinned-meta">{p.when}</div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </aside>
  );
};
