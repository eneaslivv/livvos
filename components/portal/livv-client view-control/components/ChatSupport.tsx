
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
  const scrollRef = useRef<HTMLDivElement>(null);

  // Load messages from Supabase
  useEffect(() => {
    if (!clientId) return;

    const loadMessages = async () => {
      const { data } = await supabase
        .from('client_messages')
        .select('id, sender_type, sender_name, message, created_at')
        .eq('client_id', clientId)
        .order('created_at', { ascending: true });
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
    try {
      const { error } = await supabase
        .from('client_messages')
        .insert({
          client_id: clientId,
          sender_type: 'client',
          sender_id: (await supabase.auth.getUser()).data.user?.id,
          sender_name: clientName || 'Client',
          message: input.trim(),
          message_type: 'text'
        });
      if (!error) setInput('');
    } catch (err) {
      console.error('Error sending message:', err);
    } finally {
      setSending(false);
    }
  };

  return (
    <motion.div
      initial={{ y: 50, opacity: 0, scale: 0.95 }}
      animate={{ y: 0, opacity: 1, scale: 1 }}
      exit={{ y: 50, opacity: 0, scale: 0.95 }}
      className="fixed bottom-8 right-8 w-[400px] h-[500px] bg-white border border-brand-dark/10 rounded-[2rem] shadow-2xl z-[60] flex flex-col overflow-hidden"
    >
      <div className="p-6 bg-brand-dark text-brand-light flex justify-between items-center">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 bg-brand-accent rounded-lg flex items-center justify-center">
            <User size={16} />
          </div>
          <div>
            <p className="text-[10px] font-black uppercase tracking-widest leading-none mb-1">Priority Support</p>
            <div className="flex items-center gap-1">
              <div className="w-1.5 h-1.5 bg-green-400 rounded-full animate-pulse" />
              <span className="text-[8px] mono uppercase opacity-50">Architects Online</span>
            </div>
          </div>
        </div>
        <button onClick={onClose} className="hover:text-brand-accent transition-colors">
          <X size={20} />
        </button>
      </div>

      <div ref={scrollRef} className="flex-1 overflow-y-auto p-6 space-y-4 custom-scroll bg-brand-cream/10">
        {messages.length === 0 && (
          <div className="flex justify-start">
            <div className="max-w-[80%] p-4 rounded-2xl text-xs font-medium leading-relaxed bg-white border border-brand-dark/5 text-brand-dark rounded-tl-none shadow-sm">
              Welcome to Priority Support. How can we assist you today?
            </div>
          </div>
        )}
        {messages.map((m) => (
          <div key={m.id} className={`flex ${m.sender_type === 'client' ? 'justify-end' : 'justify-start'}`}>
            <div className={`max-w-[80%] p-4 rounded-2xl text-xs font-medium leading-relaxed ${
              m.sender_type === 'client' ? 'bg-brand-accent text-white rounded-tr-none' : 'bg-white border border-brand-dark/5 text-brand-dark rounded-tl-none shadow-sm'
            }`}>
              {m.sender_type === 'user' && (
                <p className="text-[9px] font-black uppercase tracking-wider opacity-60 mb-1">{m.sender_name}</p>
              )}
              {m.message}
              <p className="text-[8px] opacity-50 mt-2">
                {new Date(m.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
              </p>
            </div>
          </div>
        ))}
      </div>

      <div className="p-6 bg-white border-t border-brand-dark/5">
        <div className="flex gap-2">
          <input
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyPress={(e) => e.key === 'Enter' && handleSend()}
            placeholder="Escribe un mensaje..."
            className="flex-1 bg-brand-grey/30 border border-brand-dark/5 rounded-xl px-4 py-3 text-xs mono focus:outline-none focus:border-brand-accent/30"
          />
          <button
            onClick={handleSend}
            disabled={sending || !input.trim()}
            className="w-12 h-12 bg-brand-dark text-white rounded-xl flex items-center justify-center hover:bg-brand-accent transition-all disabled:opacity-50"
          >
            <Send size={18} />
          </button>
        </div>
        <div className="mt-4 flex items-center justify-center gap-2 opacity-30">
          <ShieldCheck size={12} />
          <span className="text-[8px] mono uppercase tracking-widest font-black">Encrypted Priority Lane</span>
        </div>
      </div>
    </motion.div>
  );
};

export default ChatSupport;
