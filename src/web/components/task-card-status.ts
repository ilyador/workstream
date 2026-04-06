export function capTaskCardToken(str: string) {
  return str.charAt(0).toUpperCase() + str.slice(1);
}

export const TASK_CARD_STATUS_LABELS: Record<string, string> = {
  queued: 'Queued',
  running: 'Running',
  paused: 'Waiting',
  review: 'Review',
  done: 'Done',
  failed: 'Failed',
};
