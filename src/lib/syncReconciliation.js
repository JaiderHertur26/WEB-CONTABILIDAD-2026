export const SYNC_META_VERSION = 3;
export const syncMetaKey = (storageKey) => `${storageKey}.__sync_meta_v3`;

const canonicalize = (value) => {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (value && typeof value === 'object') {
    return Object.keys(value).sort().reduce((out, key) => {
      out[key] = canonicalize(value[key]);
      return out;
    }, {});
  }
  return value;
};

export const canonicalStringify = (value) => JSON.stringify(canonicalize(value));
export const sameData = (a, b) => canonicalStringify(a) === canonicalStringify(b);

export const parseStoredData = (raw) => {
  if (raw === null || raw === undefined) return undefined;
  if (typeof raw !== 'string') return raw;
  try { return JSON.parse(raw); } catch { return undefined; }
};

export const parseTime = (value) => {
  const time = value ? Date.parse(value) : NaN;
  return Number.isFinite(time) ? time : 0;
};
export const isIdArray = (value) =>
  Array.isArray(value) &&
  value.every(item => item && item.id !== undefined && item.id !== null);

export const dedupeById = (rows = []) => {
  if (!isIdArray(rows)) return rows;
  return Array.from(new Map(rows.map(item => [String(item.id), item])).values());
};

export const diffArrayById = (base = [], next = []) => {
  if (!isIdArray(base) || !isIdArray(next)) {
    return { changedIds: [], deletedIds: [], mergeable: false };
  }

  const baseMap = new Map(base.map(item => [String(item.id), item]));
  const nextMap = new Map(next.map(item => [String(item.id), item]));
  const changedIds = [];
  const deletedIds = [];

  nextMap.forEach((item, id) => {
    if (!baseMap.has(id) || !sameData(baseMap.get(id), item)) changedIds.push(id);
  });
  baseMap.forEach((_, id) => {
    if (!nextMap.has(id)) deletedIds.push(id);
  });

  return { changedIds, deletedIds, mergeable: true };
};
export const mergeRemoteWithLocalChanges = ({
  remote = [],
  local = [],
  changedIds = [],
  deletedIds = [],
}) => {
  if (!isIdArray(remote) || !isIdArray(local)) return local;

  const localMap = new Map(local.map(item => [String(item.id), item]));
  const changed = new Set(changedIds.map(String));
  const deleted = new Set(deletedIds.map(String));
  const result = [];

  remote.forEach(item => {
    const id = String(item.id);
    if (deleted.has(id)) return;
    result.push(changed.has(id) && localMap.has(id) ? localMap.get(id) : item);
  });

  const existing = new Set(result.map(item => String(item.id)));
  local.forEach(item => {
    const id = String(item.id);
    if (!existing.has(id) && !deleted.has(id)) {
      result.push(item);
      existing.add(id);
    }
  });

  return dedupeById(result);
};
export const reconcileLegacyCopies = (localData, cloudData) => {
  const hasLocal = localData !== undefined && localData !== null;
  const hasCloud = cloudData !== undefined && cloudData !== null;

  if (!hasLocal) return { data: cloudData, source: 'cloud-only', repairCloud: false, ambiguous: false };
  if (!hasCloud) return { data: localData, source: 'local-only', repairCloud: true, ambiguous: false };
  if (sameData(localData, cloudData)) {
    return { data: localData, source: 'equal', repairCloud: false, ambiguous: false };
  }

  if (isIdArray(localData) && isIdArray(cloudData)) {
    const localMap = new Map(localData.map(item => [String(item.id), item]));
    const cloudMap = new Map(cloudData.map(item => [String(item.id), item]));
    const localOnly = [...localMap.keys()].filter(id => !cloudMap.has(id));
    const cloudOnly = [...cloudMap.keys()].filter(id => !localMap.has(id));
    const conflicts = [...localMap.keys()].filter(id =>
      cloudMap.has(id) && !sameData(localMap.get(id), cloudMap.get(id))
    );

    if (localOnly.length > 0 && cloudOnly.length === 0) {
      return { data: dedupeById(localData), source: 'local-superset', repairCloud: true, ambiguous: conflicts.length > 0 };
    }
    if (cloudOnly.length > 0 && localOnly.length === 0 && conflicts.length === 0) {
      return { data: dedupeById(cloudData), source: 'cloud-superset', repairCloud: false, ambiguous: false };
    }

    const union = new Map(cloudData.map(item => [String(item.id), item]));
    localData.forEach(item => union.set(String(item.id), item));
    return {
      data: Array.from(union.values()),
      source: 'legacy-union',
      repairCloud: false,
      ambiguous: true,
      localOnly,
      cloudOnly,
      conflicts,
    };
  }

  return {
    data: localData,
    source: 'legacy-local-preferred',
    repairCloud: false,
    ambiguous: true,
  };
};

export const defaultSyncMeta = () => ({
  version: SYNC_META_VERSION,
  dirty: false,
  lastCloudUpdatedAt: null,
  localUpdatedAt: null,
  pendingChangedIds: [],
  pendingDeletedIds: [],
  status: 'uninitialized',
});
