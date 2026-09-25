import { useState, useEffect, useCallback, useRef } from 'react';
import { useCompany } from '@/contexts/CompanyContext';
import { storage } from '@/lib/storage';
import { syncRead, syncWrite } from '@/lib/secureApi';
import { useAuth } from '@/contexts/LocalAuthContext';
import { getAccountingPeriodLockReason } from '@/lib/accountingPeriod';
import { getCompanyScope } from '@/lib/companyHierarchy';
import { useDestructiveAction } from '@/contexts/DestructiveActionContext';

const SYNC_META_VERSION = 3;
const syncMetaKey = (storageKey) => `${storageKey}.__sync_meta_v3`;

const normalizeForCompare = (value) => {
  if (Array.isArray(value)) return value.map(normalizeForCompare);
  if (value && typeof value === 'object') {
    return Object.keys(value).sort().reduce((result, key) => {
      result[key] = normalizeForCompare(value[key]);
      return result;
    }, {});
  }
  return value;
};

const stableStringify = (value) => JSON.stringify(normalizeForCompare(value));
const isSameData = (a, b) => stableStringify(a) === stableStringify(b);

const parseStoredValue = (value) => {
  if (value == null) return undefined;
  if (typeof value !== 'string') return value;
  try { return JSON.parse(value); } catch { return undefined; }
};

const timestamp = (value) => {
  const parsed = value ? Date.parse(value) : NaN;
  return Number.isFinite(parsed) ? parsed : 0;
};

const hasStableIds = (value) =>
  Array.isArray(value) &&
  value.every(item => item && item.id !== undefined && item.id !== null);

const dedupeById = (value = []) => {
  if (!hasStableIds(value)) return value;
  return Array.from(new Map(value.map(item => [String(item.id), item])).values());
};

const hasLockedTransactionMutation = (previous = [], next = []) => {
  if (!Array.isArray(previous) || !Array.isArray(next)) return false;
  const nextMap = new Map(next.filter(item => item?.id != null).map(item => [String(item.id), item]));
  return previous.some(item => {
    if (!item?.isLocked || item?.id == null) return false;
    const current = nextMap.get(String(item.id));
    return !current || !isSameData(item, current);
  });
};

const getClosedPeriodTransactionMutationReason = (
  previous = [],
  next = [],
  { fiscalYears = [], monthlyClosings = [] } = {}
) => {
  if (!Array.isArray(previous) || !Array.isArray(next)) return null;

  const previousMap = new Map(
    previous.filter(item => item?.id != null).map(item => [String(item.id), item])
  );
  const nextMap = new Map(
    next.filter(item => item?.id != null).map(item => [String(item.id), item])
  );

  for (const [id, current] of nextMap.entries()) {
    const prior = previousMap.get(id);
    if (prior && isSameData(prior, current)) continue;

    const sourceReason = prior
      ? getAccountingPeriodLockReason(prior.date, { fiscalYears, monthlyClosings })
      : null;
    const targetReason = getAccountingPeriodLockReason(
      current?.date,
      { fiscalYears, monthlyClosings }
    );
    if (sourceReason || targetReason) return sourceReason || targetReason;
  }

  for (const [id, prior] of previousMap.entries()) {
    if (nextMap.has(id)) continue;
    const deleteReason = getAccountingPeriodLockReason(
      prior?.date,
      { fiscalYears, monthlyClosings }
    );
    if (deleteReason) return deleteReason;
  }

  return null;
};

const diffById = (previous = [], next = []) => {
  if (!hasStableIds(previous) || !hasStableIds(next)) {
    return { changedIds: [], deletedIds: [], mergeable: false };
  }

  const previousMap = new Map(previous.map(item => [String(item.id), item]));
  const nextMap = new Map(next.map(item => [String(item.id), item]));
  const changedIds = [];
  const deletedIds = [];

  nextMap.forEach((item, id) => {
    if (!previousMap.has(id) || !isSameData(previousMap.get(id), item)) changedIds.push(id);
  });
  previousMap.forEach((item, id) => {
    if (!nextMap.has(id)) deletedIds.push(id);
  });

  return { changedIds, deletedIds, mergeable: true };
};

const mergeRemoteWithLocalChanges = ({
  remote = [],
  local = [],
  changedIds = [],
  deletedIds = [],
}) => {
  if (!hasStableIds(remote) || !hasStableIds(local)) return local;

  const localMap = new Map(local.map(item => [String(item.id), item]));
  const changed = new Set(changedIds.map(String));
  const deleted = new Set(deletedIds.map(String));
  const merged = [];

  remote.forEach(item => {
    const id = String(item.id);
    if (deleted.has(id)) return;
    merged.push(changed.has(id) && localMap.has(id) ? localMap.get(id) : item);
  });

  const present = new Set(merged.map(item => String(item.id)));
  local.forEach(item => {
    const id = String(item.id);
    if (!present.has(id) && !deleted.has(id)) {
      merged.push(item);
      present.add(id);
    }
  });

  return dedupeById(merged);
};

const resolveLegacyData = (local, cloud) => {
  const hasLocal = local != null;
  const hasCloud = cloud != null;

  if (!hasLocal) return { data: cloud, source: 'cloud-only', repairCloud: false, ambiguous: false };
  if (!hasCloud) return { data: local, source: 'local-only', repairCloud: true, ambiguous: false };
  if (isSameData(local, cloud)) {
    return { data: local, source: 'equal', repairCloud: false, ambiguous: false };
  }

  if (hasStableIds(local) && hasStableIds(cloud)) {
    const localMap = new Map(local.map(item => [String(item.id), item]));
    const cloudMap = new Map(cloud.map(item => [String(item.id), item]));
    const localOnly = [...localMap.keys()].filter(id => !cloudMap.has(id));
    const cloudOnly = [...cloudMap.keys()].filter(id => !localMap.has(id));
    const conflicts = [...localMap.keys()].filter(
      id => cloudMap.has(id) && !isSameData(localMap.get(id), cloudMap.get(id))
    );

    if (localOnly.length > 0 && cloudOnly.length === 0) {
      return {
        data: dedupeById(local),
        source: 'local-superset',
        repairCloud: true,
        ambiguous: conflicts.length > 0,
      };
    }
    if (cloudOnly.length > 0 && localOnly.length === 0 && conflicts.length === 0) {
      return {
        data: dedupeById(cloud),
        source: 'cloud-superset',
        repairCloud: false,
        ambiguous: true,
      };
    }

    const unionMap = new Map(cloud.map(item => [String(item.id), item]));
    local.forEach(item => unionMap.set(String(item.id), item));
    return {
      data: Array.from(unionMap.values()),
      source: 'legacy-union',
      repairCloud: false,
      ambiguous: true,
      localOnly,
      cloudOnly,
      conflicts,
    };
  }

  return {
    data: local,
    source: 'legacy-local-preferred',
    repairCloud: false,
    ambiguous: true,
  };
};

const defaultSyncMeta = () => ({
  version: SYNC_META_VERSION,
  dirty: false,
  lastCloudUpdatedAt: null,
  localUpdatedAt: null,
  pendingChangedIds: [],
  pendingDeletedIds: [],
  status: 'uninitialized',
});

const getCompanyId = (company) => String(company?.id ?? '');

const tagConsolidatedData = (value, company, activeCompany) =>
  Array.isArray(value)
    ? value.map(item => ({
        ...item,
        _companyId: company.id,
        _companyName: company.name,
        _isConsolidated: company.id !== activeCompany.id,
      }))
    : [];

export function useCompanyData(key) {
  const { activeCompany, companies, isConsolidated } = useCompany();
  const { sessionToken } = useAuth();
  const { requestDestructiveAuthorization, releaseDestructiveAuthorization } = useDestructiveAction();
  const [data, setData] = useState([]);
  const [isLoaded, setIsLoaded] = useState(false);
  const mounted = useRef(true);
  const dataRef = useRef([]);
  const saveQueueRef = useRef(Promise.resolve());

  useEffect(() => {
    mounted.current = true;
    return () => { mounted.current = false; };
  }, []);

  useEffect(() => {
    dataRef.current = data;
  }, [data]);

  const readSyncMeta = useCallback(async (storageKey) => {
    const raw = await storage.getItem(syncMetaKey(storageKey));
    const parsed = parseStoredValue(raw);
    return parsed?.version === SYNC_META_VERSION
      ? { ...defaultSyncMeta(), ...parsed }
      : null;
  }, []);

  const writeSyncMeta = useCallback(async (storageKey, meta) => {
    await storage.setItem(
      syncMetaKey(storageKey),
      JSON.stringify({ ...defaultSyncMeta(), ...meta, version: SYNC_META_VERSION })
    );
  }, []);

  const uploadCloud = useCallback(async (companyId, value, authorizationToken = null) => {
    const effectiveToken = authorizationToken || sessionToken;
    if (!effectiveToken) throw new Error('Sesión segura no disponible');
    const now = new Date().toISOString();
    const uploadedAt = await syncWrite(effectiveToken, companyId, key, value);
    return uploadedAt || now;
  }, [key, sessionToken]);

  const loadSingleCompany = useCallback(async (company) => {
    const companyId = getCompanyId(company);
    const storageKey = `${companyId}-${key}`;
    const rawLocal = await storage.getItem(storageKey);
    let localData = parseStoredValue(rawLocal);
    let meta = await readSyncMeta(storageKey);
    const hadV3Meta = !!meta;
    meta = meta || defaultSyncMeta();

    let cloudRow = null;
    try {
      if (!sessionToken) throw new Error('Sesión segura no disponible');
      const rows = await syncRead(sessionToken, companyId, key);
      cloudRow = Array.isArray(rows) ? (rows[0] || null) : null;
    } catch {
      const fallback = localData ?? [];
      meta.status = 'offline-local';
      await writeSyncMeta(storageKey, meta);
      return fallback;
    }

    const cloudData = cloudRow?.data;
    const cloudUpdatedAt = cloudRow?.updated_at || null;

    if (!cloudRow) {
      const baseData = localData ?? [];
      if (localData !== undefined) {
        try {
          const uploadedAt = await uploadCloud(companyId, baseData);
          meta = {
            ...meta,
            dirty: false,
            needsReview: false,
            lastCloudUpdatedAt: uploadedAt,
            status: 'cloud-created-from-local',
            pendingChangedIds: [],
            pendingDeletedIds: [],
          };
        } catch {
          meta = { ...meta, dirty: true, status: 'pending-cloud-create' };
        }
      } else {
        meta = { ...meta, lastCloudUpdatedAt: null, status: 'empty' };
      }

      await storage.setItem(storageKey, JSON.stringify(baseData));
      await writeSyncMeta(storageKey, meta);
      return baseData;
    }

    if (meta.dirty && localData !== undefined) {
      const changedIds = meta.pendingChangedIds || [];
      const deletedIds = meta.pendingDeletedIds || [];
      const recoveredData =
        hasStableIds(cloudData) &&
        hasStableIds(localData) &&
        (changedIds.length > 0 || deletedIds.length > 0)
          ? mergeRemoteWithLocalChanges({
              remote: cloudData,
              local: localData,
              changedIds,
              deletedIds,
            })
          : localData;

      try {
        const uploadedAt = await uploadCloud(companyId, recoveredData);
        meta = {
          ...meta,
          dirty: false,
          needsReview: false,
          lastCloudUpdatedAt: uploadedAt,
          localUpdatedAt: new Date().toISOString(),
          pendingChangedIds: [],
          pendingDeletedIds: [],
          status: 'pending-local-recovered',
        };
        localData = recoveredData;
        await storage.setItem(storageKey, JSON.stringify(localData));
        await writeSyncMeta(storageKey, meta);
        return localData;
      } catch {
        meta.status = 'pending-local';
        await writeSyncMeta(storageKey, meta);
        return localData;
      }
    }

    if (!hadV3Meta) {
      const resolution = resolveLegacyData(localData, cloudData);
      const selectedData = resolution.data ?? [];
      const differs =
        !isSameData(localData, cloudData) &&
        localData !== undefined &&
        cloudData !== undefined;

      meta = {
        ...meta,
        dirty: false,
        needsReview: differs || !!resolution.ambiguous,
        lastCloudUpdatedAt: cloudUpdatedAt,
        localUpdatedAt: new Date().toISOString(),
        status: differs ? `legacy-${resolution.source}-review` : resolution.source,
      };

      await storage.setItem(storageKey, JSON.stringify(selectedData));
      await writeSyncMeta(storageKey, meta);
      return selectedData;
    }

    if (localData === undefined) {
      localData = cloudData ?? [];
      meta = {
        ...meta,
        dirty: false,
        needsReview: false,
        lastCloudUpdatedAt: cloudUpdatedAt,
        localUpdatedAt: new Date().toISOString(),
        status: 'cloud-restored-local',
      };
      await storage.setItem(storageKey, JSON.stringify(localData));
      await writeSyncMeta(storageKey, meta);
      return localData;
    }

    if (isSameData(localData, cloudData)) {
      meta = {
        ...meta,
        dirty: false,
        lastCloudUpdatedAt: cloudUpdatedAt,
        status: 'in-sync',
      };
      await writeSyncMeta(storageKey, meta);
      return localData;
    }

    const remoteAdvanced = timestamp(cloudUpdatedAt) > timestamp(meta.lastCloudUpdatedAt);
    if (meta.needsReview) {
      localData = resolveLegacyData(localData, cloudData).data ?? localData;
      meta = {
        ...meta,
        lastCloudUpdatedAt: cloudUpdatedAt,
        localUpdatedAt: new Date().toISOString(),
        needsReview: true,
        status: remoteAdvanced ? 'review-remote-advanced' : 'review-required',
      };
      await storage.setItem(storageKey, JSON.stringify(localData));
      await writeSyncMeta(storageKey, meta);
      return localData;
    }

    if (remoteAdvanced) {
      localData = cloudData ?? [];
      meta = {
        ...meta,
        dirty: false,
        needsReview: false,
        lastCloudUpdatedAt: cloudUpdatedAt,
        localUpdatedAt: new Date().toISOString(),
        status: 'cloud-newer',
      };
      await storage.setItem(storageKey, JSON.stringify(localData));
      await writeSyncMeta(storageKey, meta);
      return localData;
    }

    const resolution = resolveLegacyData(localData, cloudData);
    localData = resolution.data ?? localData;

    if (resolution.repairCloud || resolution.ambiguous) {
      meta = {
        ...meta,
        dirty: false,
        needsReview: true,
        lastCloudUpdatedAt: cloudUpdatedAt,
        localUpdatedAt: new Date().toISOString(),
        status: 'local-drift-review',
      };
    } else {
      meta = {
        ...meta,
        needsReview: false,
        lastCloudUpdatedAt: cloudUpdatedAt,
        status: resolution.source,
      };
    }

    await storage.setItem(storageKey, JSON.stringify(localData));
    await writeSyncMeta(storageKey, meta);
    return localData;
  }, [key, readSyncMeta, writeSyncMeta, uploadCloud, sessionToken]);

  const loadData = useCallback(async () => {
    if (!activeCompany) {
      if (mounted.current) {
        setData([]);
        dataRef.current = [];
        setIsLoaded(true);
      }
      return;
    }

    if (mounted.current) setIsLoaded(false);

    try {
      let loadedData;

      if (isConsolidated && Array.isArray(companies) && companies.length > 0) {
        const relevant = getCompanyScope(companies, activeCompany.id);
        const uniqueCompanies = Array.from(
          new Map(relevant.map(company => [String(company.id), company])).values()
        );
        const combined = [];

        for (const company of uniqueCompanies) {
          const companyData = await loadSingleCompany(company);
          combined.push(...tagConsolidatedData(companyData, company, activeCompany));
        }

        loadedData = Array.from(
          new Map(
            combined.map(item => [
              `${item._companyId}:${item.id ?? JSON.stringify(item)}`,
              item,
            ])
          ).values()
        );
      } else {
        loadedData = await loadSingleCompany(activeCompany);
        if (Array.isArray(loadedData) && hasStableIds(loadedData)) {
          loadedData = dedupeById(loadedData);
        }
      }

      if (mounted.current) {
        const nextData = loadedData ?? (Array.isArray(dataRef.current) ? [] : {});
        setData(nextData);
        dataRef.current = nextData;
        setIsLoaded(true);
      }
    } catch (error) {
      console.error('[Sync] Error protegido en loadData:', error);
      if (mounted.current) setIsLoaded(true);
    }
  }, [activeCompany, companies, isConsolidated, loadSingleCompany]);

  useEffect(() => {
    let active = true;

    const safeLoad = async () => {
      try {
        if (active) await loadData();
      } catch (error) {
        console.error('[Sync] Error atrapado en safeLoad:', error);
      }
    };

    safeLoad();

    const handleStorageUpdate = event => {
      const storageKey = `${activeCompany?.id}-${key}`;
      if (
        event.detail?.key === storageKey ||
        event.detail?.key === 'all-data-update'
      ) {
        safeLoad();
      }
    };

    const handleOnline = () => safeLoad();

    window.addEventListener('storage-updated', handleStorageUpdate);
    window.addEventListener('online', handleOnline);

    return () => {
      active = false;
      window.removeEventListener('storage-updated', handleStorageUpdate);
      window.removeEventListener('online', handleOnline);
    };
  }, [loadData, activeCompany, companies, key, isConsolidated]);

  const persistData = useCallback(async (newData, previousData, options = {}) => {
    if (!activeCompany || isConsolidated) {
      if (isConsolidated) {
        console.warn('[Sync] Escritura bloqueada en vista consolidada.');
      }
      return;
    }

    const companyId = String(activeCompany.id);
    const storageKey = `${companyId}-${key}`;
    const now = new Date().toISOString();
    const diff = diffById(
      Array.isArray(previousData) ? previousData : [],
      Array.isArray(newData) ? newData : []
    );

    const authorizationToken = options?.destructiveAuthorization?.sessionToken || null;
    const isDestructiveWrite = Boolean(authorizationToken) && diff.mergeable && diff.deletedIds.length > 0;

    let meta = await readSyncMeta(storageKey) || defaultSyncMeta();

    if (isDestructiveWrite) {
      if (!sessionToken && !authorizationToken) throw new Error('Sesión segura no disponible');

      let cloudRow = null;
      const rows = await syncRead(authorizationToken, companyId, key);
      cloudRow = Array.isArray(rows) ? (rows[0] || null) : null;

      let finalData = newData;
      if (
        cloudRow &&
        meta.lastCloudUpdatedAt &&
        timestamp(cloudRow.updated_at) > timestamp(meta.lastCloudUpdatedAt) &&
        diff.mergeable &&
        hasStableIds(cloudRow.data) &&
        hasStableIds(newData)
      ) {
        finalData = mergeRemoteWithLocalChanges({
          remote: cloudRow.data,
          local: newData,
          changedIds: diff.changedIds,
          deletedIds: diff.deletedIds,
        });
      }

      const uploadedAt = await uploadCloud(companyId, finalData, authorizationToken);
      meta = {
        ...meta,
        dirty: false,
        needsReview: false,
        lastCloudUpdatedAt: uploadedAt,
        localUpdatedAt: new Date().toISOString(),
        pendingChangedIds: [],
        pendingDeletedIds: [],
        status: 'in-sync',
      };

      await storage.setItem(storageKey, JSON.stringify(finalData));
      await writeSyncMeta(storageKey, meta);

      if (mounted.current) {
        setData(finalData);
        dataRef.current = finalData;
      }

      window.dispatchEvent(new CustomEvent('storage-updated', {
        detail: { key: storageKey, source: 'sync-v3' },
      }));
      window.dispatchEvent(new CustomEvent('sync-status-changed', {
        detail: { companyId, key, status: 'in-sync', updatedAt: uploadedAt },
      }));
      return finalData;
    }
    meta = {
      ...meta,
      dirty: true,
      localUpdatedAt: now,
      pendingChangedIds: diff.mergeable ? diff.changedIds : [],
      pendingDeletedIds: diff.mergeable ? diff.deletedIds : [],
      status: 'saving-local',
    };

    await storage.setItem(storageKey, JSON.stringify(newData));
    await writeSyncMeta(storageKey, meta);

    let cloudRow = null;
    try {
      if (!sessionToken) throw new Error('Sesión segura no disponible');
      const rows = await syncRead(sessionToken, companyId, key);
      cloudRow = Array.isArray(rows) ? (rows[0] || null) : null;
    } catch {
      meta.status = 'pending-offline';
      await writeSyncMeta(storageKey, meta);
      return;
    }

    let finalData = newData;
    if (
      cloudRow &&
      meta.lastCloudUpdatedAt &&
      timestamp(cloudRow.updated_at) > timestamp(meta.lastCloudUpdatedAt) &&
      diff.mergeable &&
      hasStableIds(cloudRow.data) &&
      hasStableIds(newData)
    ) {
      finalData = mergeRemoteWithLocalChanges({
        remote: cloudRow.data,
        local: newData,
        changedIds: diff.changedIds,
        deletedIds: diff.deletedIds,
      });
    }

    try {
      const uploadedAt = await uploadCloud(companyId, finalData);
      meta = {
        ...meta,
        dirty: false,
        needsReview: false,
        lastCloudUpdatedAt: uploadedAt,
        localUpdatedAt: new Date().toISOString(),
        pendingChangedIds: [],
        pendingDeletedIds: [],
        status: 'in-sync',
      };

      await storage.setItem(storageKey, JSON.stringify(finalData));
      await writeSyncMeta(storageKey, meta);

      if (mounted.current) {
        setData(finalData);
        dataRef.current = finalData;
      }

      window.dispatchEvent(
        new CustomEvent('storage-updated', {
          detail: { key: storageKey, source: 'sync-v3' },
        })
      );
      window.dispatchEvent(
        new CustomEvent('sync-status-changed', {
          detail: {
            companyId,
            key,
            status: 'in-sync',
            updatedAt: uploadedAt,
          },
        })
      );
    } catch (error) {
      meta.status = 'pending-upload';
      await writeSyncMeta(storageKey, meta);
      console.error('[Sync] Pendiente de subir a Supabase:', error);
    }
  }, [
    activeCompany,
    isConsolidated,
    key,
    readSyncMeta,
    writeSyncMeta,
    uploadCloud,
    sessionToken,
  ]);

  const saveData = useCallback(async (newData, options = {}) => {
    if (!activeCompany) return false;

    const previousData = dataRef.current;
    const deletionDiff = diffById(
      Array.isArray(previousData) ? previousData : [],
      Array.isArray(newData) ? newData : []
    );
    const requiresDestructiveAuthorization = deletionDiff.mergeable && deletionDiff.deletedIds.length > 0;

    let destructiveAuthorization = options?.destructiveAuthorization || null;
    let ownsDestructiveAuthorization = false;

    if (requiresDestructiveAuthorization && !destructiveAuthorization?.sessionToken) {
      destructiveAuthorization = await requestDestructiveAuthorization({
        title: key === 'transactions' ? 'Autorizar eliminación de transacción' : 'Autorizar eliminación',
        subject: key === 'transactions'
          ? `Se eliminará información contable (${deletionDiff.deletedIds.length} registro${deletionDiff.deletedIds.length === 1 ? '' : 's'}).`
          : `Se eliminará ${deletionDiff.deletedIds.length} registro${deletionDiff.deletedIds.length === 1 ? '' : 's'} de ${key}.`,
        description: 'Esta operación requiere la contraseña de Acceso Total. Si la validación falla o no hay conexión segura, no se eliminará nada.',
      });
      if (!destructiveAuthorization?.sessionToken) return false;
      ownsDestructiveAuthorization = true;
    }

    if (key === 'transactions') {
      if (hasLockedTransactionMutation(previousData, newData)) {
        const error = new Error('Un movimiento oficializado es inalterable y no puede modificarse ni eliminarse.');
        console.error('[Accounting Lock]', error.message);
        throw error;
      }

      const companyId = String(activeCompany.id);
      const readPeriodData = async periodKey => {
        const rawLocal = await storage.getItem(`${companyId}-${periodKey}`);
        const localValue = parseStoredValue(rawLocal);
        const localList = Array.isArray(localValue) ? localValue : [];

        // Para un candado contable no basta con una copia local potencialmente
        // desactualizada. Si hay sesión, se contrasta también con Supabase.
        // Se conserva la unión de ambos estados: ante discrepancias, prima la
        // opción más restrictiva y nunca se abre un período por accidente.
        if (!sessionToken) return localList;
        try {
          const rows = await syncRead(sessionToken, companyId, periodKey);
          const cloudList = Array.isArray(rows?.[0]?.data) ? rows[0].data : [];
          return [...localList, ...cloudList];
        } catch {
          return localList;
        }
      };

      const [fiscalYears, monthlyClosings] = await Promise.all([
        readPeriodData('fiscal_years'),
        readPeriodData('monthly_closings'),
      ]);
      const periodReason = getClosedPeriodTransactionMutationReason(
        previousData,
        newData,
        { fiscalYears, monthlyClosings }
      );
      if (periodReason) {
        const error = new Error(periodReason);
        console.error('[Accounting Period Lock]', error.message);
        throw error;
      }
    }

    if (!requiresDestructiveAuthorization && !isConsolidated && mounted.current) {
      setData(newData);
      dataRef.current = newData;
    }

    saveQueueRef.current = saveQueueRef.current
      .catch(() => {})
      .then(() => persistData(newData, previousData, {
        destructiveAuthorization,
      }));

    try {
      await saveQueueRef.current;
      return true;
    } finally {
      if (ownsDestructiveAuthorization) {
        await releaseDestructiveAuthorization(destructiveAuthorization);
      }
    }
  }, [
    activeCompany,
    isConsolidated,
    key,
    persistData,
    sessionToken,
    requestDestructiveAuthorization,
    releaseDestructiveAuthorization,
  ]);

  return [data, saveData, isLoaded];
}
