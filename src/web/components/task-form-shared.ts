import type { CustomTaskType, Flow, MemberRecord, WorkstreamRecord } from '../lib/api';

export type WorkstreamOption = Pick<WorkstreamRecord, 'id' | 'name'>;
export type MemberOption = Pick<MemberRecord, 'id' | 'name' | 'initials'>;
export type CustomTypeOption = Pick<CustomTaskType, 'id' | 'name'>;

export function getFlowIdForType(flows: Flow[], taskType: string): string {
  return flows.find(flow => (flow.default_types || []).includes(taskType))?.id || '';
}

export function getPreferredFlowId(flows: Flow[], taskType: string): string {
  return getFlowIdForType(flows, taskType) || flows[0]?.id || '';
}
