// src/lib/athlete-data/index.ts — barril público do Athlete Data Hub.
export * from './types';
export * from './measurement-resolver';
export * from './athlete-events';
// Reexporta o motor canônico já existente (fonte única de estado corporal) e o
// data-health, para que consumidores importem tudo de '@/lib/athlete-data'.
export {
  getCanonicalBodyState, resolveCanonicalMeasurement,
  type CanonicalBodyState, type BodyFact, type CanonicalBodyInput, type Provenance,
} from '../edn/canonical-body-state';
export { computeDataHealth, type DataHealthResult, type DataHealthInput } from '../edn/data-health-engine';
