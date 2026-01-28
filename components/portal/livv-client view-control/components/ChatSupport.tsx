
import React, { useState } from 'react';
import { motion } from 'framer-motion';
import { X, Send, User, ShieldCheck } from 'lucide-react';

const ChatSupport: React.FC<{ onClose: () => void }> = ({ onClose }) => {
  const [messages, setMessages] = useState([
    { role: 'assistant', text: 'Welcome to LIVV Priority Support. How can we assist with your Mission Control environment today?' }
  ]);
  const [input, setInput] = useState('');

  const handleSend = () => {
    if (!input.trim()) return;
    setMessages([...messages, { role: 'user', text: input }]);
    setInput('');
    setTimeout(() => {
      setMessages(prev => [...prev, { role: 'assistant', text: "Analyzing request... Our engineering team has been notified. We will escalate this to your primary architect." }]);
    }, 1000);
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

      <div className="flex-1 overflow-y-auto p-6 space-y-4 custom-scroll bg-brand-cream/10">
        {messages.map((m, i) => (
          <div key={i} className={`flex ${m.role === 'user' ? 'justify-end' : 'justify-start'}`}>
            <div className={`max-w-[80%] p-4 rounded-2xl text-xs font-medium leading-relaxed ${
              m.role === 'user' ? 'bg-brand-accent text-white rounded-tr-none' : 'bg-white border border-brand-dark/5 text-brand-dark rounded-tl-none shadow-sm'
            }`}>
              {m.text}
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
            placeholder="Secure channel message..."
            className="flex-1 bg-brand-grey/30 border border-brand-dark/5 rounded-xl px-4 py-3 text-xs mono focus:outline-none focus:border-brand-accent/30"
          />
          <button 
            onClick={handleSend}
            className="w-12 h-12 bg-brand-dark text-white rounded-xl flex items-center justify-center hover:bg-brand-accent transition-all"
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
