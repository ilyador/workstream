import { useEffect, useState } from 'react';
import { BUILT_IN_TYPES } from '../lib/constants';
import type { Flow } from '../lib/api';
import { getFlowIdForType, getPreferredFlowId, type CustomTypeOption } from '../components/task-form-shared';
import type { EditTaskData, TaskFormData } from '../components/task-form-types';
import { useTaskImages } from './useTaskImages';

interface UseTaskFormStateArgs {
  flows: Flow[];
  customTypes: CustomTypeOption[];
  defaultWorkstreamId?: string | null;
  editTask?: EditTaskData;
  onSaveCustomType?: (name: string, pipeline: string) => Promise<void>;
  onSubmit: (data: TaskFormData) => Promise<void>;
  onClose: () => void;
}

export function useTaskFormState({
  flows,
  customTypes,
  defaultWorkstreamId,
  editTask,
  onSaveCustomType,
  onSubmit,
  onClose,
}: UseTaskFormStateArgs) {
  const isEdit = !!editTask;
  const editTypeIsCustom = isEdit && !BUILT_IN_TYPES.includes(editTask.type);
  const editTypeIsSavedCustom = editTypeIsCustom && customTypes.some(ct => ct.name === editTask.type);

  const [title, setTitle] = useState(editTask?.title || '');
  const [description, setDescription] = useState(editTask?.description || '');
  const [type, setType] = useState(
    editTypeIsSavedCustom ? editTask.type : (editTypeIsCustom ? 'feature' : (editTask?.type || 'feature')),
  );
  const [customType, setCustomType] = useState(editTypeIsCustom && !editTypeIsSavedCustom ? editTask.type : '');
  const [customPipeline, setCustomPipeline] = useState(() => {
    if (editTypeIsSavedCustom) {
      return customTypes.find(ct => ct.name === editTask.type)?.pipeline || 'feature';
    }
    return 'feature';
  });
  const [isCustomType, setIsCustomType] = useState(editTypeIsCustom && !editTypeIsSavedCustom);
  const [mode, setMode] = useState(editTask?.mode || 'ai');
  const [effort, setEffort] = useState(editTask?.effort || 'max');
  const [workstreamId, setWorkstreamId] = useState(editTask?.workstream_id || defaultWorkstreamId || '');
  const [assignee, setAssignee] = useState(editTask?.assignee || '');
  const [flowId, setFlowId] = useState(isEdit ? (editTask?.flow_id ?? '') : getPreferredFlowId(flows, 'feature'));
  const [multiagent, setMultiagent] = useState(editTask?.multiagent || 'auto');
  const [autoContinue, setAutoContinue] = useState(editTask?.auto_continue ?? true);
  const [priority, setPriority] = useState(editTask?.priority || 'backlog');
  const [chaining, setChaining] = useState(editTask?.chaining || 'none');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const matchingFlowId = getFlowIdForType(flows, type);

  useEffect(() => {
    if (isEdit || assignee || flowId || !matchingFlowId) return;
    setFlowId(matchingFlowId);
  }, [assignee, flowId, isEdit, matchingFlowId]);

  const imagesState = useTaskImages({
    initialImages: editTask?.images,
    onError: setError,
  });

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    if (!title.trim()) return;

    setError('');
    setLoading(true);

    try {
      const resolvedType = isCustomType ? customType.trim().toLowerCase().replace(/\s+/g, '-') : type;
      if (isCustomType && customType.trim() && onSaveCustomType) {
        await onSaveCustomType(resolvedType, customPipeline);
      }
      await onSubmit({
        title: title.trim(),
        description: description.trim(),
        type: resolvedType,
        mode,
        effort: mode === 'human' ? 'low' : effort,
        multiagent: mode === 'human' ? 'auto' : multiagent,
        assignee: assignee || null,
        flow_id: flowId || null,
        auto_continue: autoContinue,
        images: imagesState.images,
        workstream_id: workstreamId || null,
        priority,
        chaining,
      });
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : (isEdit ? 'Failed to save task' : 'Failed to create task'));
    } finally {
      setLoading(false);
    }
  }

  return {
    isEdit,
    title,
    setTitle,
    description,
    setDescription,
    type,
    setType,
    customType,
    setCustomType,
    customPipeline,
    setCustomPipeline,
    isCustomType,
    setIsCustomType,
    assignee,
    setAssignee,
    flowId,
    setFlowId,
    effort,
    setEffort,
    workstreamId,
    setWorkstreamId,
    priority,
    setPriority,
    multiagent,
    setMultiagent,
    autoContinue,
    setAutoContinue,
    chaining,
    setChaining,
    mode,
    setMode,
    loading,
    error,
    handleSubmit,
    imagesState,
    submitDisabled: loading || !title.trim() || (isCustomType && !customType.trim()),
    submitLabel: loading ? (isEdit ? 'Saving...' : 'Creating...') : (isEdit ? 'Save' : 'Create'),
  };
}
