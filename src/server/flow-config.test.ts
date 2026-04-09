import { describe, expect, it } from 'vitest';
import { buildFlowSnapshot } from './flow-config.js';

describe('buildFlowSnapshot', () => {
  it('requires a concrete provider config for flow-locked steps', () => {
    expect(() => buildFlowSnapshot({
      name: 'Locked Flow',
      provider_binding: 'flow_locked',
      flow_steps: [
        {
          position: 1,
          name: 'implement',
          instructions: 'Do the work',
          model: 'claude:sonnet',
          provider_config_id: null,
        },
      ],
    })).toThrow("Flow step 'implement' is missing a provider config");
  });

  it('allows task-selected steps without a provider config', () => {
    const snapshot = buildFlowSnapshot({
      name: 'Task Selected',
      provider_binding: 'task_selected',
      flow_steps: [
        {
          position: 1,
          name: 'implement',
          instructions: 'Do the work',
          model: 'task:selected',
          provider_config_id: null,
        },
      ],
    });

    expect(snapshot.steps[0]?.provider_config_id).toBeNull();
  });
});
