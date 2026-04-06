import { useEffect, useState } from 'react';
import type { Flow } from '../lib/api';
import { MdField } from './MdField';
import { useModal } from '../hooks/modal-context';
import { getErrorMessage } from '../lib/flow-editor';
import s from './FlowEditor.module.css';

interface FlowAgentsMdSectionProps {
  flow: Flow;
  onSave: (flowId: string, updates: { agents_md?: string }) => Promise<void>;
}

export function FlowAgentsMdSection({ flow, onSave }: FlowAgentsMdSectionProps) {
  const modal = useModal();
  const [open, setOpen] = useState(false);
  const [value, setValue] = useState(flow.agents_md ?? '');
  const [saving, setSaving] = useState(false);

  const flowAgentsMd = flow.agents_md ?? '';

  useEffect(() => {
    setValue(flowAgentsMd);
  }, [flowAgentsMd]);

  const dirty = value !== flowAgentsMd;

  return (
    <div className={s.agentsMdSection}>
      <div className={s.sectionHeader}>
        <button className={s.sectionToggle} onClick={() => setOpen(current => !current)} type="button">
          <span className={`${s.sectionArrow} ${open ? s.sectionArrowOpen : ''}`}>&#9654;</span>
          agents.md
          {flowAgentsMd && !open && <span className={s.sectionHint}>(has content)</span>}
        </button>
        {dirty && (
          <button
            className={`btn btnPrimary btnSm ${s.sectionSaveButton}`}
            onClick={async () => {
              setSaving(true);
              try {
                await onSave(flow.id, { agents_md: value });
              } catch (err) {
                await modal.alert('Error', getErrorMessage(err, 'Failed to save agents.md'));
              } finally {
                setSaving(false);
              }
            }}
            disabled={saving}
          >
            {saving ? 'Saving...' : 'Save'}
          </button>
        )}
      </div>
      {open && (
        <div className={s.agentsMdBody}>
          <MdField
            value={value}
            onChange={setValue}
            placeholder="Shared instructions for all steps in this flow (markdown)..."
          />
        </div>
      )}
    </div>
  );
}
