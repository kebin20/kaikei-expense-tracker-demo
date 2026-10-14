const PREFIX = 'kaikei-recovery-v2:';
const KEYS = ['kaikei-pending-edit-draft-v1', 'kaikei-pending-write-v1'];
export interface RecoveryRecord {
  key: string;
  id: string;
  at: number;
  value: string;
}

// Individual operations have individual durable records. Clearing a confirmed
// operation must not erase another tab's pending confirmation.
export function durableRecoveryStorage(
  storage: Storage,
  legacy?: Storage,
): Storage {
  const selected = new Map<string, string>();
  const records = (key: string): RecoveryRecord[] => {
    const result: RecoveryRecord[] = [];
    for (let index = 0; index < storage.length; index++) {
      const name = storage.key(index);
      if (!name?.startsWith(PREFIX + key + ':')) continue;
      const value = JSON.parse(
        storage.getItem(name) || 'null',
      ) as RecoveryRecord | null;
      if (
        !value ||
        value.key !== key ||
        typeof value.value !== 'string' ||
        typeof value.id !== 'string'
      )
        throw new Error(
          'A recovery record is damaged. Do not clear device storage.',
        );
      result.push(value);
    }
    return result.sort((a, b) => a.at - b.at || a.id.localeCompare(b.id));
  };
  const save = (key: string, value: string, id?: string) => {
    const parsed = JSON.parse(value);
    const operationId =
      id ||
      parsed.input?.clientMutationId ||
      parsed.operationId ||
      crypto.randomUUID();
    if (key === KEYS[1] && !parsed.operationId) {
      parsed.operationId = operationId;
      value = JSON.stringify(parsed);
    }
    const name = PREFIX + key + ':' + operationId;
    const encoded = JSON.stringify({
      key,
      id: operationId,
      at: Date.now(),
      value,
    });
    storage.setItem(name, encoded);
    if (storage.getItem(name) !== encoded)
      throw new Error('Durable recovery was not confirmed.');
    selected.set(key, operationId);
  };
  const get = (key: string) => {
    if (!KEYS.includes(key)) return storage.getItem(key);
    const pending = records(key);
    const current =
      pending.find((item) => item.id === selected.get(key)) || pending[0];
    if (current) {
      selected.set(key, current.id);
      return current.value;
    }
    // Migrate refresh-safe drafts only after verifying their durable copy.
    const previous = legacy?.getItem(key);
    if (previous) {
      save(key, previous);
      legacy?.removeItem(key);
      return get(key);
    }
    return null;
  };
  return {
    get length() {
      return storage.length;
    },
    key: (index) => storage.key(index),
    getItem: get,
    setItem: (key, value) => {
      if (!KEYS.includes(key)) {
        storage.setItem(key, value);
        return;
      }
      records(key); // Damaged retained input must not be silently bypassed.
      save(key, value);
    },
    removeItem: (key) => {
      if (!KEYS.includes(key)) {
        storage.removeItem(key);
        return;
      }
      // Repeated cleanup must not select and erase another pending operation.
      const id = selected.get(key);
      if (id) storage.removeItem(PREFIX + key + ':' + id);
      selected.delete(key);
      legacy?.removeItem(key);
    },
    clear: () => {
      throw new Error('Recovery records cannot be cleared in bulk.');
    },
  };
}

export function recoveryRecords(storage: Storage): RecoveryRecord[] {
  const result: RecoveryRecord[] = [];
  for (let index = 0; index < storage.length; index++) {
    const key = storage.key(index);
    if (key?.startsWith(PREFIX))
      result.push(JSON.parse(storage.getItem(key) || 'null'));
  }
  return result.filter(Boolean);
}
