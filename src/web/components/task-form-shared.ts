import type { CustomTaskType, Flow, MemberRecord, WorkstreamRecord } from '../lib/api';

export type WorkstreamOption = Pick<WorkstreamRecord, 'id' | 'name'>;
export type MemberOption = Pick<MemberRecord, 'id' | 'name' | 'initials'>;
export type CustomTypeOption = Pick<CustomTaskType, 'id' | 'name' | 'pipeline'>;

export const PIPELINE_OPTIONS = [
  { value: 'feature', label: 'feature (plan -> implement -> verify -> review)' },
  { value: 'bug-fix', label: 'bug-fix (plan -> analyze -> fix -> verify -> review)' },
  { value: 'refactor', label: 'refactor (plan -> analyze -> refactor -> verify -> review)' },
  { value: 'test', label: 'test (plan -> write-tests -> verify -> review)' },
];

export function getFlowIdForType(flows: Flow[], taskType: string): string {
  return flows.find(flow => (flow.default_types || []).includes(taskType))?.id || '';
}

export function getPreferredFlowId(flows: Flow[], taskType: string): string {
  return getFlowIdForType(flows, taskType) || flows[0]?.id || '';
}
