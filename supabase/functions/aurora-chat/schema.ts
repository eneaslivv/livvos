// @ts-nocheck
// JSON Schema for OpenAI structured outputs — guarantees the model returns
// a valid AgentResponse without manual parsing.
// Mirrors `types/aurora.ts :: AgentResponse` exactly. Strict mode is enabled
// so unknown keys fail fast.

export const AGENT_RESPONSE_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['text', 'canvas'],
  properties: {
    text: { type: 'string', description: 'The natural-language reply shown above the canvas.' },
    canvas: {
      anyOf: [
        { type: 'null' },
        {
          type: 'object',
          additionalProperties: false,
          required: ['type'],
          properties: {
            type: { type: 'string', enum: ['display', 'workflow', 'interactive', 'route'] },
            blocks: {
              type: 'array',
              items: {
                type: 'object',
                additionalProperties: true,
                required: ['kind'],
                properties: {
                  kind: {
                    type: 'string',
                    enum: ['stat_cards', 'lead_list', 'project_grid', 'bar_chart', 'donut_chart', 'attribution_table', 'markdown_block'],
                  },
                  items: { type: 'array', items: { type: 'object', additionalProperties: true } },
                  rows:  { type: 'array', items: { type: 'object', additionalProperties: true } },
                  data:  { type: 'array', items: { type: 'object', additionalProperties: true } },
                  title: { type: 'string' },
                  body:  { type: 'string' },
                },
              },
            },
            stepper: {
              type: 'array',
              items: {
                type: 'object',
                additionalProperties: false,
                required: ['name', 'status'],
                properties: {
                  name: { type: 'string' },
                  status: { type: 'string', enum: ['pending', 'done', 'failed'] },
                },
              },
            },
            target_agent: { type: 'string', description: 'Only set when type=route. The slug to hand off to.' },
            reason:       { type: 'string', description: 'Only set when type=route. One sentence why.' },
          },
        },
      ],
    },
  },
} as const;
