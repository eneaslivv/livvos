import React, { createContext, useContext, useEffect, useState, useCallback, useRef, useMemo } from 'react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../hooks/useAuth';
import { useTenant } from './TenantContext';
import { errorLogger } from '../lib/errorLogger';
import { sendEmail } from '../lib/sendEmail';
import type { SendEmailParams } from '../lib/sendEmail';

// Enhanced notification types
export interface Notification {
  id: string;
  user_id: string;
  tenant_id: string;
  type: 'lead' | 'task' | 'project' | 'invite' | 'system' | 'activity' | 'security' | 'billing' | 'deadline' | 'mention';
  title: string;
  message: string | null;
  link: string | null;
  metadata: Record<string, any>;
  priority: 'low' | 'medium' | 'high' | 'urgent';
  read: boolean;
  read_at?: string;
  created_at: string;
  expires_at?: string;
  action_required: boolean;
  action_url?: string;
  action_text?: string;
  category: string;
  batch_id?: string;
}

export interface NotificationTemplate {
  id: string;
  tenant_id: string;
  name: string;
  type: Notification['type'];
  title_template: string;
  message_template: string;
  priority: Notification['priority'];
  action_required: boolean;
  enabled: boolean;
  channels: ('in_app' | 'email' | 'sms' | 'push')[];
  created_at: string;
  updated_at: string;
}

export interface NotificationPreference {
  user_id: string;
  type: Notification['type'];
  in_app_enabled: boolean;
  email_enabled: boolean;
  sms_enabled: boolean;
  push_enabled: boolean;
  quiet_hours_start?: string;
  quiet_hours_end?: string;
  min_priority: Notification['priority'];
}

export interface NotificationBatch {
  id: string;
  tenant_id: string;
  name: string;
  description: string;
  created_at: string;
  notification_count: number;
  read_count: number;
}

export interface NotificationAnalytics {
  date: string;
  total_sent: number;
  total_read: number;
  read_rate: number;
  by_type: Record<string, number>;
  by_priority: Record<string, number>;
  average_read_time_minutes: number;
}

interface NotificationsContextType {
  // State
  notifications: Notification[];
  unreadCount: number;
  isLoading: boolean;
  error: string | null;
  templates: NotificationTemplate[];
  preferences: NotificationPreference[];
  batches: NotificationBatch[];
  analytics: NotificationAnalytics[];
  
  // Basic operations
  markAsRead: (id: string) => Promise<void>;
  markAllAsRead: () => Promise<void>;
  markAsUnread: (id: string) => Promise<void>;
  deleteNotification: (id: string) => Promise<void>;
  clearAll: () => Promise<void>;
  refresh: () => Promise<void>;
  
  // Advanced operations
  createNotification: (notification: Omit<Notification, 'id' | 'created_at' | 'user_id' | 'tenant_id'> & { user_id?: string }) => Promise<Notification>;
  createBatchNotification: (notificationData: Omit<Notification, 'id' | 'created_at' | 'user_id' | 'tenant_id'> & { userIds: string[] }) => Promise<NotificationBatch>;
  updateNotification: (id: string, updates: Partial<Notification>) => Promise<void>;
  
  // Template management
  getTemplates: () => Promise<NotificationTemplate[]>;
  createTemplate: (template: Omit<NotificationTemplate, 'id' | 'created_at' | 'updated_at'>) => Promise<NotificationTemplate>;
  updateTemplate: (id: string, updates: Partial<NotificationTemplate>) => Promise<void>;
  deleteTemplate: (id: string) => Promise<void>;
  sendFromTemplate: (templateId: string, userId: string, metadata: Record<string, any>) => Promise<Notification>;
  
  // Preferences
  getPreferences: () => Promise<NotificationPreference[]>;
  updatePreferences: (preferences: Partial<NotificationPreference>[]) => Promise<void>;
  updateUserPreference: (type: Notification['type'], updates: Partial<NotificationPreference>) => Promise<void>;
  
  // Batching
  getBatches: () => Promise<NotificationBatch[]>;
  getBatchNotifications: (batchId: string) => Promise<Notification[]>;
  markBatchAsRead: (batchId: string) => Promise<void>;
  deleteBatch: (batchId: string) => Promise<void>;
  
  // Filtering and searching
  getNotificationsByType: (type: Notification['type']) => Notification[];
  getNotificationsByPriority: (priority: Notification['priority']) => Notification[];
  searchNotifications: (query: string) => Notification[];
  filterNotifications: (filters: {
    type?: Notification['type'];
    priority?: Notification['priority'];
    read?: boolean;
    category?: string;
    startDate?: string;
    endDate?: string;
  }) => Notification[];
  
  // Analytics
  getAnalytics: (startDate?: string, endDate?: string) => Promise<NotificationAnalytics[]>;
  getReadRate: (type?: Notification['type']) => Promise<number>;
  getAverageReadTime: (type?: Notification['type']) => Promise<number>;
  
  // Bulk operations
  bulkMarkAsRead: (ids: string[]) => Promise<void>;
  bulkDelete: (ids: string[]) => Promise<void>;
  archiveNotifications: (olderThanDays: number) => Promise<void>;
  
  // System operations
  sendSystemNotification: (title: string, message: string, priority?: Notification['priority']) => Promise<void>;
  notifyAdmins: (message: string, metadata?: Record<string, any>) => Promise<void>;
  generateDigest: (userId: string, period: 'daily' | 'weekly') => Promise<void>;
  
  // Real-time
  subscribeToNotifications: (userId?: string) => () => void;
  unsubscribeFromNotifications: () => void;
}

const NotificationsContext = createContext<NotificationsContextType | undefined>(undefined);

export const useNotifications = () => {
  const context = useContext(NotificationsContext);
  if (context === undefined) {
    throw new Error('useNotifications must be used within a NotificationsProvider');
  }
  return context;
};

interface NotificationsProviderProps {
  children: React.ReactNode;
}

export const NotificationsProvider: React.FC<NotificationsProviderProps> = ({ children }) => {
  const { user } = useAuth();
  const { currentTenant } = useTenant();
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [templates, setTemplates] = useState<NotificationTemplate[]>([]);
  const [preferences, setPreferences] = useState<NotificationPreference[]>([]);
  const [batches, setBatches] = useState<NotificationBatch[]>([]);
  const [analytics, setAnalytics] = useState<NotificationAnalytics[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [subscription, setSubscription] = useState<any>(null);
  const hasLoadedNotificationsRef = useRef(false);

  // Template mapping for email notifications
  const notificationTypeToTemplate: Record<string, SendEmailParams['template']> = {
    task: 'task_assigned',
    deadline: 'deadline_reminder',
    project: 'project_update',
    system: 'system_alert',
    security: 'system_alert',
    billing: 'system_alert',
    invite: 'system_alert',
    lead: 'system_alert',
    activity: 'project_update',
    mention: 'task_assigned',
  };

  // Fire-and-forget email sender for notifications
  const maybeSendEmailForNotification = useCallback(async (
    notification: { type: string; title: string; message?: string | null; priority?: string; link?: string | null; action_url?: string },
    targetUserId: string,
    targetEmail?: string
  ) => {
    try {
      // Check email preferences via RPC
      const { data: shouldSend } = await supabase.rpc('should_send_email', {
        p_user_id: targetUserId,
        p_type: notification.type,
        p_priority: notification.priority || 'medium',
      });

      if (!shouldSend) return;

      // Look up email if not provided
      let email = targetEmail;
      if (!email) {
        const { data: userData } = await supabase
          .from('auth_user_view')
          .select('email')
          .eq('id', targetUserId)
          .single();

        if (!userData?.email) {
          // Fallback: try profiles table
          const { data: profile } = await supabase
            .from('profiles')
            .select('email')
            .eq('id', targetUserId)
            .single();
          email = profile?.email;
        } else {
          email = userData.email;
        }
      }

      if (!email) return;

      const template = notificationTypeToTemplate[notification.type] || 'system_alert';
      const ctaUrl = notification.action_url || notification.link;
      const baseUrl = typeof window !== 'undefined' ? window.location.origin : '';

      await sendEmail({
        template,
        to: email,
        subject: notification.title,
        brandName: currentTenant?.name || 'LIVV OS',
        data: {
          title: notification.title,
          message: notification.message || '',
          ctaUrl: ctaUrl ? (ctaUrl.startsWith('http') ? ctaUrl : `${baseUrl}${ctaUrl}`) : undefined,
          ctaText: 'View Details',
        },
      });
    } catch (err) {
      if (import.meta.env.DEV) console.warn('Email notification failed (non-blocking):', err);
    }
  }, [currentTenant]);

  // Fetch notifications
  const fetchNotifications = useCallback(async () => {
    if (!user) {
      setNotifications([]);
      setIsLoading(false);
      return;
    }

    try {
      // Only show loading on first fetch, not background re-fetches
      if (!hasLoadedNotificationsRef.current) {
        setIsLoading(true);
      }
      setError(null);

      let query = supabase
        .from('notifications')
        .select('*')
        .eq('user_id', user.id)
        .order('created_at', { ascending: false })
        .limit(50);

      // Filter by tenant if available (RLS already protects cross-user access)
      if (currentTenant?.id) {
        query = query.eq('tenant_id', currentTenant.id);
      }

      const { data, error } = await query;

      if (error && error.code !== 'PGRST116') {
        if (import.meta.env.DEV) console.warn('Notifications table may not exist:', error.message);
        setNotifications([]);
      } else {
        setNotifications(data || []);
      }
      hasLoadedNotificationsRef.current = true;
    } catch (err) {
      errorLogger.error('Error fetching notifications:', err);
      setError(err instanceof Error ? err.message : 'Failed to fetch notifications');
    } finally {
      setIsLoading(false);
    }
  }, [user, currentTenant]);

  // Check for tasks due today and create deadline notifications (once per session)
  const hasCheckedDailyRef = useRef(false);
  const checkDailyTasks = useCallback(async () => {
    if (!user || hasCheckedDailyRef.current) return;
    hasCheckedDailyRef.current = true;

    try {
      const today = new Date().toISOString().split('T')[0];

      // Fetch tasks due today (or overdue) assigned to or owned by current user
      const { data: dueTasks } = await supabase
        .from('tasks')
        .select('id, title, start_date')
        .or(`assigned_to.eq.${user.id},owner_id.eq.${user.id}`)
        .lte('start_date', today)
        .eq('completed', false)
        .limit(20);

      if (!dueTasks?.length) return;

      // Check which tasks already have a deadline notification today
      const { data: existing } = await supabase
        .from('notifications')
        .select('metadata')
        .eq('user_id', user.id)
        .eq('type', 'deadline')
        .gte('created_at', `${today}T00:00:00`);

      const notifiedTaskIds = new Set(
        (existing || []).map((n: any) => n.metadata?.task_id).filter(Boolean)
      );

      const newTasks = dueTasks.filter(t => !notifiedTaskIds.has(t.id));
      if (newTasks.length === 0) return;

      const rows = newTasks.map(t => {
        const isOverdue = t.start_date < today;
        return {
          user_id: user.id,
          tenant_id: currentTenant?.id || null,
          type: 'deadline',
          title: isOverdue ? `Overdue: ${t.title}` : `Due today: ${t.title}`,
          message: isOverdue ? 'This task is past its due date' : 'This task is scheduled for today',
          link: '/calendar',
          metadata: { task_id: t.id },
          priority: 'high',
          read: false,
        };
      });

      await supabase.from('notifications').insert(rows);

      // Send a single digest email for all due/overdue tasks (fire-and-forget)
      try {
        const { data: shouldSend } = await supabase.rpc('should_send_email', {
          p_user_id: user.id,
          p_type: 'deadline',
          p_priority: 'high',
        });

        if (shouldSend) {
          const { data: profile } = await supabase
            .from('profiles')
            .select('email, name')
            .eq('id', user.id)
            .single();

          if (profile?.email) {
            const overdue = newTasks.filter(t => t.start_date < today);
            const dueToday = newTasks.filter(t => t.start_date === today);
            const lines: string[] = [];

            if (overdue.length > 0) {
              lines.push(`You have ${overdue.length} overdue task${overdue.length > 1 ? 's' : ''}:`);
              overdue.slice(0, 5).forEach(t => lines.push(`- ${t.title}`));
            }
            if (dueToday.length > 0) {
              if (lines.length > 0) lines.push('');
              lines.push(`${dueToday.length} task${dueToday.length > 1 ? 's' : ''} due today:`);
              dueToday.slice(0, 5).forEach(t => lines.push(`- ${t.title}`));
            }

            const brandName = currentTenant?.name || 'LIVV OS';
            await sendEmail({
              template: overdue.length > 0 ? 'task_overdue' : 'deadline_reminder',
              to: profile.email,
              subject: overdue.length > 0
                ? `${overdue.length} overdue task${overdue.length > 1 ? 's' : ''} need attention`
                : `${dueToday.length} task${dueToday.length > 1 ? 's' : ''} due today`,
              brandName,
              data: {
                recipientName: profile.name || undefined,
                title: overdue.length > 0 ? 'Overdue Tasks' : 'Tasks Due Today',
                message: lines.join('\n'),
                ctaUrl: `${window.location.origin}/calendar`,
                ctaText: 'View Calendar',
              },
            });
          }
        }
      } catch (emailErr) {
        if (import.meta.env.DEV) console.warn('Deadline email failed (non-blocking):', emailErr);
      }
    } catch (err) {
      if (import.meta.env.DEV) console.warn('Error checking daily tasks:', err);
    }
  }, [user, currentTenant]);

  // Load initial data + check daily tasks
  useEffect(() => {
    fetchNotifications().then(() => checkDailyTasks());
  }, [fetchNotifications, checkDailyTasks]);

  // Real-time subscription
  useEffect(() => {
    if (!user || !currentTenant) return;

    const channel = supabase
      .channel(`notifications-${user.id}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'notifications',
          filter: `user_id=eq.${user.id}`,
        },
        (payload) => {
          if (import.meta.env.DEV) console.log('Notification change:', payload.eventType);
          
          if (payload.eventType === 'INSERT') {
            setNotifications((prev) => [payload.new as Notification, ...prev]);
          } else if (payload.eventType === 'UPDATE') {
            setNotifications((prev) =>
              prev.map((n) => (n.id === payload.new.id ? (payload.new as Notification) : n))
            );
          } else if (payload.eventType === 'DELETE') {
            setNotifications((prev) => prev.filter((n) => n.id !== payload.old.id));
          }
        }
      )
      .subscribe();

    setSubscription(channel);

    return () => {
      if (channel) {
        supabase.removeChannel(channel);
      }
    };
  }, [user, currentTenant]);

  // Calculate unread count
  const unreadCount = notifications.filter((n) => !n.read).length;

  // Basic operations
  const markAsRead = useCallback(async (id: string) => {
    if (!user) return;

    try {
      const readAt = new Date().toISOString();
      
      await supabase
        .from('notifications')
        .update({ 
          read: true, 
          read_at: readAt 
        })
        .eq('id', id);
      
      setNotifications((prev) =>
        prev.map((n) => (n.id === id ? { ...n, read: true, read_at: readAt } : n))
      );
    } catch (err) {
      errorLogger.error('Error marking notification as read:', err);
    }
  }, [user]);

  const markAllAsRead = useCallback(async () => {
    if (!user) return;

    try {
      const readAt = new Date().toISOString();
      
      await supabase
        .from('notifications')
        .update({ 
          read: true, 
          read_at: readAt 
        })
        .eq('user_id', user.id)
        .eq('read', false);
      
      setNotifications((prev) => 
        prev.map((n) => ({ ...n, read: true, read_at: readAt }))
      );
    } catch (err) {
      errorLogger.error('Error marking all as read:', err);
    }
  }, [user]);

  const markAsUnread = useCallback(async (id: string) => {
    if (!user) return;

    try {
      await supabase
        .from('notifications')
        .update({ 
          read: false, 
          read_at: null 
        })
        .eq('id', id);
      
      setNotifications((prev) =>
        prev.map((n) => (n.id === id ? { ...n, read: false, read_at: undefined } : n))
      );
    } catch (err) {
      errorLogger.error('Error marking notification as unread:', err);
    }
  }, [user]);

  const deleteNotification = useCallback(async (id: string) => {
    try {
      await supabase.from('notifications').delete().eq('id', id);
      setNotifications((prev) => prev.filter((n) => n.id !== id));
    } catch (err) {
      errorLogger.error('Error deleting notification:', err);
    }
  }, []);

  const clearAll = useCallback(async () => {
    if (!user) return;

    try {
      await supabase.from('notifications').delete().eq('user_id', user.id);
      setNotifications([]);
    } catch (err) {
      errorLogger.error('Error clearing notifications:', err);
    }
  }, [user]);

  // Advanced operations
  const createNotification = useCallback(async (notificationData: Omit<Notification, 'id' | 'created_at' | 'user_id' | 'tenant_id'> & { user_id?: string }): Promise<Notification> => {
    try {
      const targetUserId = notificationData.user_id || user?.id;
      if (!targetUserId) {
        throw new Error('User ID required');
      }

      const notification: Omit<Notification, 'id' | 'created_at'> = {
        ...notificationData,
        user_id: targetUserId,
        tenant_id: currentTenant?.id || '',
      };

      const { data, error } = await supabase
        .from('notifications')
        .insert(notification)
        .select()
        .single();

      if (error) throw error;

      // Fire-and-forget email
      maybeSendEmailForNotification(data, data.user_id).catch(() => {});

      return data;
    } catch (err) {
      errorLogger.error('Error creating notification:', err);
      throw new Error(err instanceof Error ? err.message : 'Failed to create notification');
    }
  }, [currentTenant, user?.id, maybeSendEmailForNotification]);

  const createBatchNotification = useCallback(async (notificationData: Omit<Notification, 'id' | 'created_at' | 'user_id' | 'tenant_id'> & { userIds: string[] }): Promise<NotificationBatch> => {
    if (!currentTenant) {
      throw new Error('No active tenant');
    }

    try {
      const batchId = `batch_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
      
      // Create notifications for all users
      const notifications = notificationData.userIds.map(userId => ({
        ...notificationData,
        user_id: userId,
        tenant_id: currentTenant.id,
        batch_id: batchId,
        // Remove userIds from the notification data
        userIds: undefined,
      }));

      const { error } = await supabase
        .from('notifications')
        .insert(notifications);

      if (error) throw error;

      // Create batch record
      const { data: batch, error: batchError } = await supabase
        .from('notification_batches')
        .insert({
          id: batchId,
          tenant_id: currentTenant.id,
          name: `Batch ${new Date().toLocaleString()}`,
          description: `Sent to ${notificationData.userIds.length} users`,
          notification_count: notificationData.userIds.length,
          read_count: 0,
        })
        .select()
        .single();

      if (batchError) throw batchError;

      // Fire-and-forget emails for each user
      notificationData.userIds.forEach(userId => {
        maybeSendEmailForNotification(notificationData, userId).catch(() => {});
      });

      return batch;
    } catch (err) {
      errorLogger.error('Error creating batch notification:', err);
      throw new Error(err instanceof Error ? err.message : 'Failed to create batch notification');
    }
  }, [currentTenant]);

  const updateNotification = useCallback(async (id: string, updates: Partial<Notification>) => {
    try {
      const { error } = await supabase
        .from('notifications')
        .update(updates)
        .eq('id', id);

      if (error) throw error;

      setNotifications((prev) =>
        prev.map((n) => (n.id === id ? { ...n, ...updates } : n))
      );
    } catch (err) {
      errorLogger.error('Error updating notification:', err);
      throw new Error(err instanceof Error ? err.message : 'Failed to update notification');
    }
  }, []);

  // Template management
  const getTemplates = useCallback(async (): Promise<NotificationTemplate[]> => {
    if (!currentTenant) return [];

    try {
      const { data, error } = await supabase
        .from('notification_templates')
        .select('*')
        .eq('tenant_id', currentTenant.id)
        .order('name');

      if (error && error.code !== 'PGRST116') {
        throw error;
      }

      return data || [];
    } catch (err) {
      errorLogger.error('Error fetching templates:', err);
      return [];
    }
  }, [currentTenant]);

  // Filtering and searching
  const getNotificationsByType = useCallback((type: Notification['type']) => {
    return notifications.filter(n => n.type === type);
  }, [notifications]);

  const getNotificationsByPriority = useCallback((priority: Notification['priority']) => {
    return notifications.filter(n => n.priority === priority);
  }, [notifications]);

  const searchNotifications = useCallback((query: string) => {
    const lowerQuery = query.toLowerCase();
    return notifications.filter(n => 
      n.title.toLowerCase().includes(lowerQuery) ||
      (n.message && n.message.toLowerCase().includes(lowerQuery))
    );
  }, [notifications]);

  const filterNotifications = useCallback((filters: {
    type?: Notification['type'];
    priority?: Notification['priority'];
    read?: boolean;
    category?: string;
    startDate?: string;
    endDate?: string;
  }) => {
    return notifications.filter(n => {
      if (filters.type && n.type !== filters.type) return false;
      if (filters.priority && n.priority !== filters.priority) return false;
      if (filters.read !== undefined && n.read !== filters.read) return false;
      if (filters.category && n.category !== filters.category) return false;
      if (filters.startDate && new Date(n.created_at) < new Date(filters.startDate)) return false;
      if (filters.endDate && new Date(n.created_at) > new Date(filters.endDate)) return false;
      return true;
    });
  }, [notifications]);

  // Bulk operations
  const bulkMarkAsRead = useCallback(async (ids: string[]) => {
    if (!user) return;

    try {
      const readAt = new Date().toISOString();
      
      await supabase
        .from('notifications')
        .update({ 
          read: true, 
          read_at: readAt 
        })
        .eq('user_id', user.id)
        .in('id', ids);
      
      setNotifications((prev) => 
        prev.map((n) => 
          ids.includes(n.id) ? { ...n, read: true, read_at: readAt } : n
        )
      );
    } catch (err) {
      errorLogger.error('Error bulk marking as read:', err);
    }
  }, [user]);

  const bulkDelete = useCallback(async (ids: string[]) => {
    try {
      await supabase
        .from('notifications')
        .delete()
        .in('id', ids);
      
      setNotifications((prev) => prev.filter((n) => !ids.includes(n.id)));
    } catch (err) {
      errorLogger.error('Error bulk deleting:', err);
    }
  }, []);

  const archiveNotifications = useCallback(async (olderThanDays: number) => {
    if (!user) return;

    try {
      const cutoffDate = new Date();
      cutoffDate.setDate(cutoffDate.getDate() - olderThanDays);

      await supabase
        .from('notifications')
        .update({ archived: true })
        .eq('user_id', user.id)
        .lt('created_at', cutoffDate.toISOString());

      setNotifications((prev) => 
        prev.filter(n => new Date(n.created_at) >= cutoffDate)
      );
    } catch (err) {
      errorLogger.error('Error archiving notifications:', err);
    }
  }, [user]);

  // System operations
  const sendSystemNotification = useCallback(async (title: string, message: string, priority: Notification['priority'] = 'medium') => {
    if (!currentTenant) return;

    // Get all users in tenant
    const { data: users } = await supabase
      .from('profiles')
      .select('id')
      .eq('tenant_id', currentTenant.id);

    if (!users) return;

    const notifications = users.map(userProfile => ({
      user_id: userProfile.id,
      type: 'system' as const,
      title,
      message,
      priority,
      metadata: { system_generated: true },
      action_required: false,
      category: 'system',
    }));

    await supabase
      .from('notifications')
      .insert(notifications);

    // Fire-and-forget emails
    users.forEach(userProfile => {
      maybeSendEmailForNotification({ type: 'system', title, message, priority }, userProfile.id).catch(() => {});
    });
  }, [currentTenant, maybeSendEmailForNotification]);

  const notifyAdmins = useCallback(async (message: string, metadata: Record<string, any> = {}) => {
    if (!currentTenant) return;

    // Get admin users
    const { data: adminUsers } = await supabase
      .from('user_roles')
      .select('user_id')
      .in('role_id', (await supabase.from('roles').select('id').in('name', ['owner', 'admin'])).data?.map(r => r.id) || []);

    if (!adminUsers) return;

    const notifications = adminUsers.map(userRole => ({
      user_id: userRole.user_id,
      type: 'security' as const,
      title: 'Admin Notification',
      message,
      priority: 'high' as const,
      metadata: { ...metadata, admin_only: true },
      action_required: false,
      category: 'admin',
    }));

    await supabase
      .from('notifications')
      .insert(notifications);

    // Fire-and-forget emails to admins
    adminUsers.forEach(userRole => {
      maybeSendEmailForNotification(
        { type: 'security', title: 'Admin Notification', message, priority: 'high' },
        userRole.user_id
      ).catch(() => {});
    });
  }, [currentTenant, maybeSendEmailForNotification]);

  // Real-time subscription management
  const subscribeToNotifications = useCallback((userId?: string) => {
    const targetUserId = userId || user?.id;
    if (!targetUserId || !currentTenant) return () => {};

    const channel = supabase
      .channel(`notifications-${targetUserId}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'notifications',
          filter: `user_id=eq.${targetUserId}`,
        },
        (payload) => {
          // Handle real-time updates
          if (payload.eventType === 'INSERT') {
            setNotifications((prev) => [payload.new as Notification, ...prev]);
          } else if (payload.eventType === 'UPDATE') {
            setNotifications((prev) =>
              prev.map((n) => (n.id === payload.new.id ? (payload.new as Notification) : n))
            );
          } else if (payload.eventType === 'DELETE') {
            setNotifications((prev) => prev.filter((n) => n.id !== payload.old.id));
          }
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [user?.id, currentTenant]);

  const unsubscribeFromNotifications = useCallback(() => {
    if (subscription) {
      supabase.removeChannel(subscription);
      setSubscription(null);
    }
  }, [subscription]);

  const value: NotificationsContextType = {
    // State
    notifications,
    unreadCount,
    isLoading,
    error,
    templates,
    preferences,
    batches,
    analytics,
    
    // Basic operations
    markAsRead,
    markAllAsRead,
    markAsUnread,
    deleteNotification,
    clearAll,
    refresh: fetchNotifications,
    
    // Advanced operations
    createNotification,
    createBatchNotification,
    updateNotification,
    
    // Template management
    getTemplates,
    createTemplate: async () => { throw new Error('Not implemented'); },
    updateTemplate: async () => { throw new Error('Not implemented'); },
    deleteTemplate: async () => { throw new Error('Not implemented'); },
    sendFromTemplate: async () => { throw new Error('Not implemented'); },
    
    // Preferences
    getPreferences: async () => {
      if (!user) return [];
      const { data } = await supabase
        .from('email_preferences')
        .select('*')
        .eq('user_id', user.id);
      return (data || []) as any;
    },
    updatePreferences: async () => { throw new Error('Not implemented'); },
    updateUserPreference: async (type: Notification['type'], updates: Partial<NotificationPreference>) => {
      if (!user || !currentTenant) return;
      await supabase
        .from('email_preferences')
        .upsert({
          user_id: user.id,
          tenant_id: currentTenant.id,
          notification_type: type,
          email_enabled: updates.email_enabled ?? true,
          min_priority: updates.min_priority || 'high',
          updated_at: new Date().toISOString(),
        }, { onConflict: 'user_id,notification_type' });
    },
    
    // Batching
    getBatches: async () => [],
    getBatchNotifications: async () => [],
    markBatchAsRead: async () => { throw new Error('Not implemented'); },
    deleteBatch: async () => { throw new Error('Not implemented'); },
    
    // Filtering and searching
    getNotificationsByType,
    getNotificationsByPriority,
    searchNotifications,
    filterNotifications,
    
    // Analytics
    getAnalytics: async () => [],
    getReadRate: async () => 0,
    getAverageReadTime: async () => 0,
    
    // Bulk operations
    bulkMarkAsRead,
    bulkDelete,
    archiveNotifications,
    
    // System operations
    sendSystemNotification,
    notifyAdmins,
    generateDigest: async () => { throw new Error('Not implemented'); },
    
    // Real-time
    subscribeToNotifications,
    unsubscribeFromNotifications,
  };

  return (
    <NotificationsContext.Provider value={value}>
      {children}
    </NotificationsContext.Provider>
  );
};