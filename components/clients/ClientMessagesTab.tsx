import React from 'react';
import { motion } from 'framer-motion';
import { Icons } from '../ui/Icons';
import { ClientMessage } from '../../hooks/useClients';

const getInitials = (name: string) => {
  const parts = name.trim().split(/\s+/);
  return parts.length > 1 ? `${parts[0][0]}${parts[1][0]}`.toUpperCase() : name.slice(0, 2).toUpperCase();
};

const inputClass = 'w-full px-3 py-2.5 bg-zinc-50 dark:bg-zinc-800/60 border border-zinc-200 dark:border-zinc-700 rounded-xl outline-none focus:border-zinc-400 dark:focus:border-zinc-500 focus:ring-2 focus:ring-zinc-100 dark:focus:ring-zinc-800 text-sm text-zinc-900 dark:text-zinc-100 placeholder:text-zinc-400 transition-all';

interface ClientMessagesTabProps {
  messages: ClientMessage[];
  newMessage: string;
  messagesEndRef: React.RefObject<HTMLDivElement | null>;
  onNewMessageChange: (msg: string) => void;
  onSendMessage: () => void;
}

export const ClientMessagesTab: React.FC<ClientMessagesTabProps> = ({
  messages,
  newMessage,
  messagesEndRef,
  onNewMessageChange,
  onSendMessage,
}) => {
  return (
    <motion.div key="messages" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.15 }} className="flex flex-col h-full">
      <div className="flex-1 mb-4 space-y-2.5 min-h-[200px]">
        {messages.length > 0 ? (
          <>
            {messages.map((message) => {
              const isUser = message.sender_type === 'user';
              return (
                <div key={message.id} className={`flex ${isUser ? 'justify-end' : 'justify-start'}`}>
                  {!isUser && (
                    <div className="w-7 h-7 rounded-full bg-zinc-100 dark:bg-zinc-800 flex items-center justify-center text-[10px] font-bold text-zinc-500 mr-2 shrink-0 mt-1">
                      {getInitials(message.sender_name)}
                    </div>
                  )}
                  <div>
                    {!isUser && (
                      <p className="text-[10px] text-zinc-400 mb-0.5 ml-1">{message.sender_name}</p>
                    )}
                    <div className={`max-w-[320px] px-3.5 py-2.5 rounded-2xl ${
                      isUser
                        ? 'bg-zinc-900 dark:bg-zinc-100 text-white dark:text-zinc-900 rounded-br-md'
                        : 'bg-zinc-100 dark:bg-zinc-800 text-zinc-900 dark:text-zinc-100 rounded-bl-md'
                    }`}>
                      <p className="text-sm leading-relaxed">{message.message}</p>
                      <p className={`text-[10px] mt-1 ${isUser ? 'text-white/40 dark:text-zinc-900/30' : 'text-zinc-400'}`}>
                        {new Date(message.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                      </p>
                    </div>
                  </div>
                </div>
              );
            })}
            <div ref={messagesEndRef} />
          </>
        ) : (
          <div className="text-center py-12">
            <div className="w-10 h-10 rounded-full bg-zinc-100 dark:bg-zinc-800 flex items-center justify-center mx-auto mb-3">
              <Icons.Message size={18} className="text-zinc-400" />
            </div>
            <p className="text-xs font-medium text-zinc-500 dark:text-zinc-400">No messages</p>
            <p className="text-[10px] text-zinc-400 mt-0.5">Messages sync with the client portal</p>
          </div>
        )}
      </div>
      <div className="flex gap-2 mt-auto sticky bottom-0 bg-white dark:bg-zinc-900 pt-2">
        <input
          type="text"
          placeholder="Write a message..."
          value={newMessage}
          onChange={(e) => onNewMessageChange(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && !e.shiftKey && onSendMessage()}
          className={inputClass + ' flex-1'}
        />
        <button
          onClick={onSendMessage}
          disabled={!newMessage.trim()}
          className="px-3.5 py-2.5 bg-zinc-900 dark:bg-zinc-100 text-white dark:text-zinc-900 rounded-xl hover:bg-zinc-800 disabled:opacity-40 transition-all"
        >
          <Icons.Send size={15} />
        </button>
      </div>
    </motion.div>
  );
};
