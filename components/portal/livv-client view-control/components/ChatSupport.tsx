
import React, { useState, useEffect, useRef } from 'react';
import { motion } from 'framer-motion';
import { X, Send, ShieldCheck, ArrowRight } from 'lucide-react';
import { supabase } from '../../../../lib/supabase';

interface ChatMessage {
  id: string;
  sender_type: 'user' | 'client';
  sender_name: string;
  message: string;
  created_at: string;
}

interface ChatSupportProps {
  onClose: () => void;
  clientId?: string;
  clientName?: string;
}

/* helper: group consecutive messages by date */
function groupByDate(msgs: ChatMessage[]) {
  const groups: { label: string; messages: ChatMessage[] }[] = [];
  let current: { label: string; messages: ChatMessage[] } | null = null;
  const today = new Date().toDateString();
  const yesterday = new Date(Date.now() - 86400000).toDateString();

  for (const m of msgs) {
    const d = new Date(m.created_at).toDateString();
    const label = d === today ? 'Today' : d === yesterday ? 'Yesterday' : new Date(m.created_at).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
    if (!current || current.label !== label) {
      current = { label, messages: [] };
      groups.push(current);
    }
    current.messages.push(m);
  }
  return groups;
}

const ChatSupport: React.FC<ChatSupportProps> = ({ onClose, clientId, clientName }) => {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState('');
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  // Load messages from Supabase
  useEffect(() => {
    if (!clientId) return;

    const loadMessages = async () => {
      const { data, error: fetchErr } = await supabase
        .from('client_messages')
        .select('id, sender_type, sender_name, message, created_at')
        .eq('client_id', clientId)
        .order('created_at', { ascending: true });
      if (fetchErr) {
        if (import.meta.env.DEV) console.warn('[ChatSupport] Error loading messages:', fetchErr.message);
      }
      if (data) setMessages(data as ChatMessage[]);
    };

    loadMessages();

    // Real-time subscription
    const channel = supabase
      .channel(`portal-chat-${clientId}`)
      .on('postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'client_messages', filter: `client_id=eq.${clientId}` },
        (payload) => {
          const newMsg = payload.new as ChatMessage;
          setMessages(prev => {
            if (prev.some(m => m.id === newMsg.id)) return prev;
            return [...prev, newMsg];
          });
        }
      )
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [clientId]);

  // Auto-scroll on new messages
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages]);

  const handleSend = async () => {
    if (!input.trim() || !clientId || sending) return;
    setSending(true);
    setError(null);

    const userId = (await supabase.auth.getUser()).data.user?.id;
    const msgText = input.trim();

    // Optimistic update
    const tempMsg: ChatMessage = {
      id: `temp-${Date.now()}`,
      sender_type: 'client',
      sender_name: clientName || 'Client',
      message: msgText,
      created_at: new Date().toISOString(),
    };
    setMessages(prev => [...prev, tempMsg]);
    setInput('');

    try {
      const payload: Record<string, any> = {
        client_id: clientId,
        sender_type: 'client',
        sender_id: userId,
        sender_name: clientName || 'Client',
        message: msgText,
        message_type: 'text',
      };

      const { data, error: insertErr } = await supabase
        .from('client_messages')
        .insert(payload)
        .select('id, sender_type, sender_name, message, created_at')
        .single();

      if (insertErr) {
        const { data: retryData, error: retryErr } = await supabase
          .from('client_messages')
          .insert({
            client_id: clientId,
            sender_type: 'client',
            sender_name: clientName || 'Client',
            message: msgText,
          })
          .select('id, sender_type, sender_name, message, created_at')
          .single();

        if (retryErr) throw retryErr;

        if (retryData) {
          setMessages(prev => prev.map(m => m.id === tempMsg.id ? (retryData as ChatMessage) : m));
        }
      } else if (data) {
        setMessages(prev => prev.map(m => m.id === tempMsg.id ? (data as ChatMessage) : m));
      }
    } catch (err: any) {
      if (import.meta.env.DEV) console.error('[ChatSupport] Error sending message:', err);
      setError('Failed to send message');
      setMessages(prev => prev.filter(m => m.id !== tempMsg.id));
      setInput(msgText);
    } finally {
      setSending(false);
    }
  };

  const dateGroups = groupByDate(messages);
  const initials = (name: string) => name.split(' ').map(w => w[0]).join('').toUpperCase().slice(0, 2);

  return (
    <>
      {/* Backdrop */}
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        transition={{ duration: 0.2 }}
        onClick={onClose}
        className="fixed inset-0 bg-black/20 backdrop-blur-[2px] z-[59]"
      />

      {/* Side Panel */}
      <motion.div
        initial={{ x: '100%', opacity: 0.5 }}
        animate={{ x: 0, opacity: 1 }}
        exit={{ x: '100%', opacity: 0 }}
        transition={{ type: 'spring', damping: 30, stiffness: 300 }}
        className="fixed top-0 right-0 h-full w-full max-w-[420px] bg-white/95 backdrop-blur-xl z-[60] flex flex-col shadow-[-8px_0_40px_rgba(0,0,0,0.06)]"
      >
        {/* Header */}
        <div className="px-6 py-5 border-b border-zinc-100/80">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="relative">
                <div className="w-9 h-9 rounded-full bg-zinc-900 flex items-center justify-center">
                  <span className="text-[10px] font-bold text-white tracking-wide">L</span>
                </div>
                <div className="absolute -bottom-0.5 -right-0.5 w-3 h-3 bg-emerald-400 rounded-full border-2 border-white" />
              </div>
              <div>
                <p className="text-[13px] font-semibold text-zinc-800 leading-none">Support</p>
                <p className="text-[11px] text-emerald-500 font-medium mt-1">Online</p>
              </div>
            </div>
            <button
              onClick={onClose}
              className="w-8 h-8 rounded-full flex items-center justify-center text-zinc-400 hover:text-zinc-600 hover:bg-zinc-100 transition-all"
            >
              <X size={16} strokeWidth={2} />
            </button>
          </div>
        </div>

        {/* Messages area */}
        <div ref={scrollRef} className="flex-1 overflow-y-auto px-6 py-5">
          {/* Empty state */}
          {messages.length === 0 && (
            <div className="flex flex-col items-center justify-center h-full text-center px-4 -mt-8">
              <div className="w-14 h-14 rounded-2xl bg-zinc-50 border border-zinc-100 flex items-center justify-center mb-4">
                <ShieldCheck size={22} className="text-zinc-300" />
              </div>
              <p className="text-[13px] font-medium text-zinc-700 mb-1">How can we help?</p>
              <p className="text-[11px] text-zinc-400 leading-relaxed max-w-[240px]">
                Send us a message and we'll get back to you as soon as possible.
              </p>
            </div>
          )}

          {/* Message groups by date */}
          {dateGroups.map((group) => (
            <div key={group.label} className="mb-5 last:mb-0">
              {/* Date divider */}
              <div className="flex items-center gap-3 mb-4">
                <div className="flex-1 h-px bg-zinc-100" />
                <span className="text-[10px] font-medium text-zinc-300 uppercase tracking-wider">{group.label}</span>
                <div className="flex-1 h-px bg-zinc-100" />
              </div>

              {/* Messages */}
              <div className="space-y-3">
                {group.messages.map((m, idx) => {
                  const isClient = m.sender_type === 'client';
                  const showAvatar = idx === 0 || group.messages[idx - 1].sender_type !== m.sender_type;

                  return (
                    <div key={m.id} className={`flex items-end gap-2.5 ${isClient ? 'flex-row-reverse' : ''}`}>
                      {/* Avatar */}
                      {!isClient && showAvatar ? (
                        <div className="w-7 h-7 rounded-full bg-zinc-900 flex items-center justify-center flex-shrink-0 mb-4">
                          <span className="text-[8px] font-bold text-white">
                            {initials(m.sender_name)}
                          </span>
                        </div>
                      ) : !isClient ? (
                        <div className="w-7 flex-shrink-0" />
                      ) : null}

                      {/* Bubble */}
                      <div className={`max-w-[75%] ${isClient ? 'items-end' : 'items-start'} flex flex-col`}>
                        {!isClient && showAvatar && (
                          <p className="text-[10px] font-medium text-zinc-400 mb-1 ml-1">{m.sender_name}</p>
                        )}
                        <div className={`px-4 py-2.5 text-[13px] leading-relaxed ${
                          isClient
                            ? 'bg-zinc-900 text-white rounded-2xl rounded-br-md'
                            : 'bg-zinc-50 border border-zinc-100 text-zinc-700 rounded-2xl rounded-bl-md'
                        }`}>
                          {m.message}
                        </div>
                        <p className={`text-[10px] mt-1 mx-1 ${isClient ? 'text-zinc-300' : 'text-zinc-300'}`}>
                          {new Date(m.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                        </p>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          ))}
        </div>

        {/* Input area */}
        <div className="px-5 pb-5 pt-3 border-t border-zinc-100/80">
          {error && (
            <p className="text-[11px] text-red-400 mb-2 px-1">{error}</p>
          )}
          <div className="flex items-center gap-2 bg-zinc-50/80 border border-zinc-200/60 rounded-2xl px-4 py-1 focus-within:border-zinc-300 focus-within:bg-white transition-all">
            <input
              type="text"
              value={input}
              onChange={(e) => { setInput(e.target.value); setError(null); }}
              onKeyDown={(e) => e.key === 'Enter' && !e.shiftKey && handleSend()}
              placeholder="Write a message..."
              className="flex-1 bg-transparent py-2.5 text-[13px] text-zinc-700 placeholder:text-zinc-300 focus:outline-none"
            />
            <button
              onClick={handleSend}
              disabled={sending || !input.trim()}
              className="w-8 h-8 rounded-full bg-zinc-900 text-white flex items-center justify-center hover:bg-zinc-700 transition-all disabled:opacity-20 disabled:hover:bg-zinc-900 flex-shrink-0"
            >
              <ArrowRight size={14} strokeWidth={2.5} />
            </button>
          </div>
          <div className="mt-3 flex items-center justify-center gap-1.5">
            <ShieldCheck size={10} className="text-zinc-200" />
            <span className="text-[9px] text-zinc-300 font-medium tracking-wide">End-to-end encrypted</span>
          </div>
        </div>
      </motion.div>
    </>
  );
};

export default ChatSupport;
