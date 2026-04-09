import type { Flow } from '../lib/api';
import {
  type CustomTypeOption,
  type MemberOption,
  type WorkstreamOption,
} from './task-form-shared';
import { TaskTypeAssignmentSection } from './TaskTypeAssignmentSection';
import { TaskPlacementSection } from './TaskPlacementSection';
import { TaskExecutionSection } from './TaskExecutionSection';

interface TaskFormOptionsProps {
  workstreams: WorkstreamOption[];
  members: MemberOption[];
  flows: Flow[];
  customTypes: CustomTypeOption[];
  projectDataEnabled: boolean;
  type: string;
  customType: string;
  isCustomType: boolean;
  assignee: string;
  flowId: string;
  effort: string;
  workstreamId: string;
  priority: string;
  multiagent: string;
  autoContinue: boolean;
  allowProjectData: boolean;
  chaining: string;
  setType: (value: string) => void;
  setCustomType: (value: string) => void;
  setIsCustomType: (value: boolean) => void;
  setAssignee: (value: string) => void;
  setFlowId: (value: string) => void;
  setMode: (value: string) => void;
  setEffort: (value: string) => void;
  setWorkstreamId: (value: string) => void;
  setPriority: (value: string) => void;
  setMultiagent: (value: string) => void;
  setAutoContinue: (value: boolean) => void;
  setAllowProjectData: (value: boolean) => void;
  setChaining: (value: string) => void;
}

export function TaskFormOptions({
  workstreams,
  members,
  flows,
  customTypes,
  projectDataEnabled,
  type,
  customType,
  isCustomType,
  assignee,
  flowId,
  effort,
  workstreamId,
  priority,
  multiagent,
  autoContinue,
  allowProjectData,
  chaining,
  setType,
  setCustomType,
  setIsCustomType,
  setAssignee,
  setFlowId,
  setMode,
  setEffort,
  setWorkstreamId,
  setPriority,
  setMultiagent,
  setAutoContinue,
  setAllowProjectData,
  setChaining,
}: TaskFormOptionsProps) {
  return (
    <>
      <TaskTypeAssignmentSection
        flows={flows}
        members={members}
        customTypes={customTypes}
        type={type}
        customType={customType}
        isCustomType={isCustomType}
        assignee={assignee}
        flowId={flowId}
        effort={effort}
        setType={setType}
        setCustomType={setCustomType}
        setIsCustomType={setIsCustomType}
        setAssignee={setAssignee}
        setFlowId={setFlowId}
        setMode={setMode}
        setEffort={setEffort}
        setAutoContinue={setAutoContinue}
      />

      <TaskPlacementSection
        workstreams={workstreams}
        workstreamId={workstreamId}
        priority={priority}
        setWorkstreamId={setWorkstreamId}
        setPriority={setPriority}
      />

      <TaskExecutionSection
        assignee={assignee}
        multiagent={multiagent}
        autoContinue={autoContinue}
        allowProjectData={allowProjectData}
        chaining={chaining}
        projectDataEnabled={projectDataEnabled}
        setMultiagent={setMultiagent}
        setAutoContinue={setAutoContinue}
        setAllowProjectData={setAllowProjectData}
        setChaining={setChaining}
      />
    </>
  );
}
