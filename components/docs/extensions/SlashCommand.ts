import { Extension } from '@tiptap/core';
import { Plugin, PluginKey } from '@tiptap/pm/state';

export interface SlashState {
  active: boolean;
  query: string;
  range: { from: number; to: number } | null;
  coords: { left: number; top: number; bottom: number } | null;
}

export interface SlashCommandOptions {
  onStateChange: (state: SlashState) => void;
  onKeyDown: (event: KeyboardEvent) => boolean;
}

const slashKey = new PluginKey('slashCommand');

const INACTIVE: SlashState = { active: false, query: '', range: null, coords: null };

export const SlashCommand = Extension.create<SlashCommandOptions>({
  name: 'slashCommand',

  addOptions() {
    return {
      onStateChange: () => {},
      onKeyDown: () => false,
    };
  },

  addProseMirrorPlugins() {
    const onStateChange = this.options.onStateChange;
    const onKeyDown = () => this.options.onKeyDown;

    return [
      new Plugin({
        key: slashKey,

        props: {
          handleKeyDown: (_view, event) => {
            return onKeyDown()(event);
          },
        },

        view: () => {
          let lastActive = false;
          return {
            update: (view) => {
              const { state } = view;
              const { selection } = state;
              if (!selection.empty) {
                if (lastActive) {
                  lastActive = false;
                  onStateChange(INACTIVE);
                }
                return;
              }
              const $from = selection.$from;
              const textBefore = $from.parent.textBetween(0, $from.parentOffset, '\n', '\0');

              const slashIdx = textBefore.lastIndexOf('/');
              if (slashIdx === -1) {
                if (lastActive) {
                  lastActive = false;
                  onStateChange(INACTIVE);
                }
                return;
              }
              const charBefore = slashIdx > 0 ? textBefore[slashIdx - 1] : '';
              if (slashIdx > 0 && !/\s/.test(charBefore)) {
                if (lastActive) {
                  lastActive = false;
                  onStateChange(INACTIVE);
                }
                return;
              }
              const query = textBefore.slice(slashIdx + 1);
              if (/\s/.test(query)) {
                if (lastActive) {
                  lastActive = false;
                  onStateChange(INACTIVE);
                }
                return;
              }

              const from = $from.pos - (textBefore.length - slashIdx);
              const to = $from.pos;
              let coords;
              try {
                coords = view.coordsAtPos(from);
              } catch {
                return;
              }
              lastActive = true;
              onStateChange({
                active: true,
                query,
                range: { from, to },
                coords: { left: coords.left, top: coords.top, bottom: coords.bottom },
              });
            },
            destroy: () => {
              if (lastActive) onStateChange(INACTIVE);
            },
          };
        },
      }),
    ];
  },
});
