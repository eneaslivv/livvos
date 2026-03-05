
import React, { useState, useEffect, useRef } from 'react';
import { motion } from 'framer-motion';
import { X, Send, User, ShieldCheck } from 'lucide-react';
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
        console.warn('[ChatSupport] Error loading messages:', fetchErr.message);
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
      sender_name: clientName || 'Cliente',
      message: msgText,
      created_at: new Date().toISOString(),
    };
    setMessages(prev => [...prev, tempMsg]);
    setInput('');

    try {
      // Try full insert first
      const payload: Record<string, any> = {
        client_id: clientId,
        sender_type: 'client',
        sender_id: userId,
        sender_name: clientName || 'Cliente',
        message: msgText,
        message_type: 'text',
      };

      const { data, error: insertErr } = await supabase
        .from('client_messages')
        .insert(payload)
        .select('id, sender_type, sender_name, message, created_at')
        .single();

      if (insertErr) {
        // Retry without optional columns that might not exist
        const { data: retryData, error: retryErr } = await supabase
          .from('client_messages')
          .insert({
            client_id: clientId,
            sender_type: 'client',
            sender_name: clientName || 'Cliente',
            message: msgText,
          })
          .select('id, sender_type, sender_name, message, created_at')
          .single();

        if (retryErr) throw retryErr;

        // Replace temp with real
        if (retryData) {
          setMessages(prev => prev.map(m => m.id === tempMsg.id ? (retryData as ChatMessage) : m));
        }
      } else if (data) {
        // Replace temp with real
        setMessages(prev => prev.map(m => m.id === tempMsg.id ? (data as ChatMessage) : m));
      }
    } catch (err: any) {
      console.error('[ChatSupport] Error sending message:', err);
      setError('No se pudo enviar el mensaje');
      // Remove optimistic message on failure
      setMessages(prev => prev.filter(m => m.id !== tempMsg.id));
      setInput(msgText); // Restore input
    } finally {
      setSending(false);
    }
  };

  return (
    <motion.div
      initial={{ y: 50, opacity: 0, scale: 0.95 }}
      animate={{ y: 0, opacity: 1, scale: 1 }}
      exit={{ y: 50, opacity: 0, scale: 0.95 }}
      className="fixed bottom-8 right-8 w-[400px] h-[500px] bg-white border border-zinc-200 rounded-2xl shadow-2xl z-[60] flex flex-col overflow-hidden"
    >
      {/* Header */}
      <div className="p-5 bg-zinc-900 text-white flex justify-between items-center">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 bg-indigo-500 rounded-lg flex items-center justify-center">
            <User size={16} />
          </div>
          <div>
            <p className="text-[11px] font-bold leading-none mb-1">Soporte</p>
            <div className="flex items-center gap-1">
              <div className="w-1.5 h-1.5 bg-[#2C0405] rounded-full animate-pulse" />
              <span className="text-[9px] uppercase opacity-50">En línea</span>
            </div>
          </div>
        </div>
        <button onClick={onClose} className="hover:text-indigo-300 transition-colors">
          <X size={20} />
        </button>
      </div>

      {/* Messages */}
      <div ref={scrollRef} className="flex-1 overflow-y-auto p-5 space-y-3 bg-zinc-50">
        {messages.length === 0 && (
          <div className="flex justify-start">
            <div className="max-w-[80%] p-3.5 rounded-2xl text-xs font-medium leading-relaxed bg-white border border-zinc-100 text-zinc-700 rounded-tl-none shadow-sm">
              Bienvenido al soporte. ¿En qué podemos ayudarte?
            </div>
          </div>
        )}
        {messages.map((m) => (
          <div key={m.id} className={`flex ${m.sender_type === 'client' ? 'justify-end' : 'justify-start'}`}>
            <div className={`max-w-[80%] p-3.5 rounded-2xl text-xs font-medium leading-relaxed ${
              m.sender_type === 'client'
                ? 'bg-indigo-500 text-white rounded-tr-none'
                : 'bg-white border border-zinc-100 text-zinc-700 rounded-tl-none shadow-sm'
            }`}>
              {m.sender_type === 'user' && (
                <p className="text-[9px] font-bold uppercase tracking-wider opacity-60 mb-1">{m.sender_name}</p>
              )}
              {m.message}
              <p className={`text-[8px] mt-1.5 ${m.sender_type === 'client' ? 'opacity-50' : 'text-zinc-400'}`}>
                {new Date(m.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
              </p>
            </div>
          </div>
        ))}
      </div>

      {/* Input */}
      <div className="p-4 bg-white border-t border-zinc-100">
        {error && (
          <p className="text-[10px] text-red-500 mb-2 px-1">{error}</p>
        )}
        <div className="flex gap-2">
          <input
            type="text"
            value={input}
            onChange={(e) => { setInput(e.target.value); setError(null); }}
            onKeyDown={(e) => e.key === 'Enter' && !e.shiftKey && handleSend()}
            placeholder="Escribe un mensaje..."
            className="flex-1 bg-zinc-50 border border-zinc-200 rounded-xl px-4 py-3 text-xs focus:outline-none focus:border-indigo-300 transition-colors"
          />
          <button
            onClick={handleSend}
            disabled={sending || !input.trim()}
            className="w-11 h-11 bg-zinc-900 text-white rounded-xl flex items-center justify-center hover:bg-indigo-500 transition-all disabled:opacity-40"
          >
            <Send size={16} />
          </button>
        </div>
        <div className="mt-3 flex items-center justify-center gap-1.5 opacity-25">
          <ShieldCheck size={10} />
          <span className="text-[8px] uppercase tracking-widest font-bold">Canal seguro</span>
        </div>
      </div>
    </motion.div>
  );
};

export default ChatSupport;
