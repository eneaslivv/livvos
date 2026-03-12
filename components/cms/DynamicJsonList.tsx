import React, { useCallback } from 'react';
import { Plus, Trash2, GripVertical } from 'lucide-react';
import { DragDropContext, Droppable, Draggable, type DropResult } from '@hello-pangea/dnd';

interface FieldDef {
  key: string;
  label: string;
  type?: 'text' | 'textarea';
}

interface DynamicJsonListProps<T extends Record<string, string>> {
  label: string;
  fields: FieldDef[];
  items: T[];
  onChange: (items: T[]) => void;
  defaultItem: T;
}

export function DynamicJsonList<T extends Record<string, string>>({
  label,
  fields,
  items,
  onChange,
  defaultItem,
}: DynamicJsonListProps<T>) {
  const addItem = useCallback(() => {
    onChange([...items, { ...defaultItem }]);
  }, [items, onChange, defaultItem]);

  const removeItem = useCallback(
    (index: number) => {
      onChange(items.filter((_, i) => i !== index));
    },
    [items, onChange]
  );

  const updateItem = useCallback(
    (index: number, key: string, value: string) => {
      const updated = items.map((item, i) =>
        i === index ? { ...item, [key]: value } : item
      );
      onChange(updated);
    },
    [items, onChange]
  );

  const handleDragEnd = useCallback(
    (result: DropResult) => {
      if (!result.destination) return;
      const from = result.source.index;
      const to = result.destination.index;
      if (from === to) return;
      const updated = [...items];
      const [moved] = updated.splice(from, 1);
      updated.splice(to, 0, moved);
      onChange(updated);
    },
    [items, onChange]
  );

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <label className="text-[10px] font-mono uppercase tracking-widest text-[#78736A]">{label}</label>
        <button
          type="button"
          onClick={addItem}
          className="flex items-center gap-1 text-xs text-[#E8BC59] hover:text-[#d4a94d] transition-colors"
        >
          <Plus size={12} />
          Add
        </button>
      </div>

      {items.length === 0 && (
        <div className="text-xs text-[#09090B]/40 py-3 text-center border border-dashed border-[#E6E2D8] rounded-lg">
          No items yet
        </div>
      )}

      <DragDropContext onDragEnd={handleDragEnd}>
        <Droppable droppableId="json-list">
          {(provided) => (
            <div
              ref={provided.innerRef}
              {...provided.droppableProps}
              className="space-y-2"
            >
              {items.map((item, index) => (
                <Draggable key={`item-${index}`} draggableId={`item-${index}`} index={index}>
                  {(dragProvided, snapshot) => (
                    <div
                      ref={dragProvided.innerRef}
                      {...dragProvided.draggableProps}
                      className={`group flex gap-2 items-start p-2.5 rounded-lg border border-[#E6E2D8] bg-white transition-shadow ${
                        snapshot.isDragging
                          ? 'shadow-lg opacity-90 border-[#E8BC59]/40'
                          : 'hover:shadow-sm'
                      }`}
                    >
                      <div
                        {...dragProvided.dragHandleProps}
                        className="mt-1.5 cursor-grab text-[#09090B]/20 hover:text-[#09090B]/40"
                      >
                        <GripVertical size={14} />
                      </div>

                      <div className="flex-1 grid gap-1.5" style={{ gridTemplateColumns: `repeat(${fields.length}, 1fr)` }}>
                        {fields.map((field) => (
                          <div key={field.key}>
                            {field.type === 'textarea' ? (
                              <textarea
                                value={item[field.key] || ''}
                                onChange={(e) =>
                                  updateItem(index, field.key, e.target.value)
                                }
                                placeholder={field.label}
                                rows={2}
                                className="w-full px-2.5 py-1.5 text-xs rounded-md border border-[#E6E2D8] bg-[#FDFBF7] text-[#09090B] placeholder:text-[#09090B]/30 focus:outline-none focus:border-[#E8BC59] resize-none"
                              />
                            ) : (
                              <input
                                type="text"
                                value={item[field.key] || ''}
                                onChange={(e) =>
                                  updateItem(index, field.key, e.target.value)
                                }
                                placeholder={field.label}
                                className="w-full px-2.5 py-1.5 text-xs rounded-md border border-[#E6E2D8] bg-[#FDFBF7] text-[#09090B] placeholder:text-[#09090B]/30 focus:outline-none focus:border-[#E8BC59]"
                              />
                            )}
                          </div>
                        ))}
                      </div>

                      <button
                        type="button"
                        onClick={() => removeItem(index)}
                        className="mt-1.5 text-[#09090B]/20 hover:text-red-500 transition-colors opacity-0 group-hover:opacity-100"
                      >
                        <Trash2 size={14} />
                      </button>
                    </div>
                  )}
                </Draggable>
              ))}
              {provided.placeholder}
            </div>
          )}
        </Droppable>
      </DragDropContext>
    </div>
  );
}
