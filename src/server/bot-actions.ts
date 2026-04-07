import type { BotAction } from './bot-action-types.js';
import { addComment, createTask, updateTask } from './bot-task-actions.js';

export type { BotAction } from './bot-action-types.js';
export { parseActions } from './bot-action-parser.js';

export async function executeAction(action: BotAction, projectId: string): Promise<string> {
  switch (action.name) {
    case 'create_task':
      return createTask(action, projectId);
    case 'update_task':
      return updateTask(action, projectId);
    case 'add_comment':
      return addComment(action, projectId);
    default:
      return `Unknown action: ${action.name}`;
  }
}
