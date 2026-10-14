export function syncStatus(input: {
  saving: boolean;
  pendingConfirmation: boolean;
  refreshing: boolean;
  online: boolean;
  queued: number;
  refreshError: string;
}) {
  if (input.saving) return { key: 'saving', label: 'Saving…' };
  if (input.pendingConfirmation)
    return { key: 'attention', label: 'Check save' };
  if (input.queued) return { key: 'queued', label: `${input.queued} queued` };
  if (!input.online) return { key: 'offline', label: 'Offline' };
  if (input.refreshing) return { key: 'refreshing', label: 'Checking…' };
  if (input.refreshError) return { key: 'attention', label: 'Check sync' };
  return { key: 'saved', label: 'Saved' };
}
