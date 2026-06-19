/**
 * Project Architect — public surface.
 *
 * The model decides what a project contains and how it decomposes. The code
 * decides when (dates) and persists. See the individual modules for detail.
 */

export * from './types';
export { validateProposedStructure } from './schema';
export { planStageDates } from './datePlanner';
export type { PlanOptions, PlanResult, PlannedStage } from './datePlanner';
export { proposeStructure } from './propose';
export type { ProposeInput, ProposeOutput } from './propose';
export {
  persistArchitectProject,
  persistAndLogEdits,
  diffStructureToEdits,
  logProjectEdit,
} from './persist';
export type { PersistResult } from './persist';
