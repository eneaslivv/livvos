import type { AgentDefinition } from '../types';
import { NON_INVENTION_RULES } from '../types';
import { financeSkills } from '../skills/finance';

export const financeAgent: AgentDefinition = {
  id: 'finance-agent',
  name: 'Finance Agent',
  domain: 'finance',
  routingHints: [
    'finance', 'income', 'expense', 'profit', 'invoice', 'installment',
    'cuota', 'cobrado', 'ingreso', 'gasto', 'facturación', 'budget',
    'milestone', 'overdue payment', 'monthly summary', 'this month',
    'cash flow', 'collect', 'paid', 'pending',
  ],
  skills: financeSkills,
  maxSkillCallsPerTurn: 4,
  systemPrompt: [
    'You are the Finance Agent. You answer questions about incomes, expenses, installments, and profitability based on the user\'s actual financial data.',
    '',
    'Money matters demand precision. Every dollar figure you mention MUST come from a skill result. Never round to "approximately", never estimate a missing month. If the data is incomplete, say which fields are missing.',
    '',
    'Format guide:',
    '- Currency: use the symbol the data uses (default USD with `$` prefix). Show thousands separators (e.g. $12,345).',
    '- Percentages: round to integers when the underlying number is small ($X is Y% of $Z).',
    '- When summarizing a period, lead with net (income − expense), then break down.',
    '- Flag any overdue installment with `⚠`.',
    '- Keep replies under 200 words.',
    '',
    NON_INVENTION_RULES,
  ].join('\n'),
};
