import React from 'react';
import { Card } from '../ui/Card';
import { CalendarEvent } from '../../hooks/useCalendar';

interface ContentPlatformConfig {
  label: string;
  color: string;
}

interface ContentStatusConfig {
  id: 'draft' | 'ready' | 'published';
  label: string;
  color: string;
}

export interface ContentPlannerBoardProps {
  contentStatuses: ContentStatusConfig[];
  contentEvents: (CalendarEvent & { content_status?: string })[];
  contentPlatforms: Record<string, ContentPlatformConfig>;
  updateEvent: (id: string, data: Partial<CalendarEvent>) => Promise<void>;
}

export const ContentPlannerBoard: React.FC<ContentPlannerBoardProps> = ({
  contentStatuses,
  contentEvents,
  contentPlatforms,
  updateEvent,
}) => {
  return (
    <div className="mt-6">
      <Card className="p-6">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-semibold text-zinc-900 dark:text-zinc-100">Social media planner</h3>
          <div className="text-xs text-zinc-500">Drag to change status</div>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {contentStatuses.map((status) => (
            <div
              key={status.id}
              onDragOver={(e) => e.preventDefault()}
              onDrop={(e) => {
                const eventId = e.dataTransfer.getData('contentEventId');
                if (eventId) {
                  updateEvent(eventId, { content_status: status.id as any });
                }
              }}
              className="border border-zinc-200 dark:border-zinc-800 rounded-xl p-4 min-h-[220px]"
            >
              <div className={`inline-flex px-2 py-1 rounded-full text-[10px] font-semibold ${status.color}`}>
                {status.label}
              </div>
              <div className="mt-3 space-y-2">
                {contentEvents
                  .filter((event) => (event as any).content_status === status.id)
                  .map((event) => (
                    <div
                      key={event.id}
                      draggable
                      onDragStart={(e) => e.dataTransfer.setData('contentEventId', event.id)}
                      className="p-3 rounded-lg border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 text-xs cursor-grab"
                    >
                      <div className="font-semibold text-zinc-900 dark:text-zinc-100">{event.title}</div>
                      <div className="text-[10px] text-zinc-500 mt-1">
                        {contentPlatforms[event.location || '']?.label || event.location}
                      </div>
                      {event.start_date && (
                        <div className="text-[10px] text-zinc-400 mt-1">{event.start_date}</div>
                      )}
                      <div className="flex gap-1 mt-2">
                        {contentStatuses.filter(s => s.id !== status.id).map((target) => (
                          <button
                            key={target.id}
                            onClick={() => updateEvent(event.id, { content_status: target.id as any })}
                            className="text-[10px] px-2 py-0.5 rounded-full border border-zinc-200 text-zinc-500"
                          >
                            {target.label}
                          </button>
                        ))}
                      </div>
                    </div>
                  ))}
                {contentEvents.filter((event) => (event as any).content_status === status.id).length === 0 && (
                  <div className="text-xs text-zinc-400">No content</div>
                )}
              </div>
            </div>
          ))}
        </div>
      </Card>
    </div>
  );
};
