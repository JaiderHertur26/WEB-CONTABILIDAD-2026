import { useState, useEffect, useCallback, useRef } from 'react';
import { useCompany } from '@/contexts/CompanyContext';
import { storage } from '@/lib/storage';
import { supabase } from '@/lib/supabase';
import {
  SYNC_META_VERSION,
  syncMetaKey,
  parseStoredData,
  parseTime,
  sameData,
  isIdArray,
  dedupeById,
  diffArrayById,
  mergeRemoteWithLocalChanges,
  reconcileLegacyCopies,
  defaultSyncMeta,
} from '@/lib/syncReconciliation';

const asCompanyId = (company) => String(company?.id ?? '');

const tagRowsForCompany = (rows, company, activeCompany) => {
  if (!Array.isArray(rows)) return [];
  return rows.map(item => ({
    ...item,
    _companyId: company.id,
    _companyName: company.name,
    _isConsolidated: company.id !== activeCompany.id,
  }));
};
export function useCompanyData(key) {
  const { activeCompany, companies, isConsolidated } = useCompany();
  const [data, setData] = useState([]);
  const [isLoaded, setIsLoaded] = useState(false);
  const mounted = useRef(true);
  const latestDataRef = useRef([]);
  const saveQueueRef = useRef(Promise.resolve());

  useEffect(() => {
    mounted.current = true;
    return () => { mounted.current = false; };
  }, []);

  useEffect(() => {
    latestDataRef.current = data;
  }, [data]);

  const readMeta = useCallback(async (storageKey) => {
    const raw = await storage.getItem(syncMetaKey(storageKey));
    const parsed = parseStoredData(raw);
    if (parsed?.version === SYNC_META_VERSION) {
      return { ...defaultSyncMeta(), ...parsed };
    }
    return null;
  }, []);

  const writeMeta = useCallback(async (storageKey, meta) => {
    await storage.setItem(syncMetaKey(storageKey), JSON.stringify({
      ...defaultSyncMeta(),
      ...meta,
      version: SYNC_META_VERSION,
    }));
  }, []);
  const writeCloud = useCallback(async (companyId, payload) => {
    const requestedAt = new Date().toISOString();
    const { data: row, error } = await supabase
      .from('app_data_sync')
      .upsert({
        company_id: String(companyId),
        storage_key: key,
        data: payload,
        updated_at: requestedAt,
      })
      .select('updated_at')
      .maybeSingle();

    if (error) throw error;
    return row?.updated_at || requestedAt;
  }, [key]);

  const reconcileCompany = useCallback(async (company) => {
    const companyId = asCompanyId(company);
    const storageKey = `${companyId}-${key}`;
    const localRaw = await storage.getItem(storageKey);
    let localData = parseStoredData(localRaw);
    let meta = await readMeta(storageKey);
    const hadSyncMeta = Boolean(meta);
    meta = meta || defaultSyncMeta();

    let cloudRow = null;
    try {
      const { data: fetched, error } = await supabase
        .from('app_data_sync')
        .select('data, updated_at')
        .eq('company_id', companyId)
        .eq('storage_key', key)
        .maybeSingle();
      if (error) throw error;
      cloudRow = fetched;
    } catch (error) {
      const fallback = localData ?? [];
      meta.status = 'offline-local';
      await writeMeta(storageKey, meta);
      return fallback;
    }
    const cloudData = cloudRow?.data;
    const cloudUpdatedAt = cloudRow?.updated_at || null;

    if (!cloudRow) {
      const fallback = localData ?? [];
      if (localData !== undefined) {
        try {
          const repairedAt = await writeCloud(companyId, fallback);
          meta = {
            ...meta,
            dirty: false,
            needsReview: false,
            lastCloudUpdatedAt: repairedAt,
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
      await storage.setItem(storageKey, JSON.stringify(fallback));
      await writeMeta(storageKey, meta);
      return fallback;
    }

    if (meta.dirty && localData !== undefined) {
      const changedIds = meta.pendingChangedIds || [];
      const deletedIds = meta.pendingDeletedIds || [];
      const resolved = (
        isIdArray(cloudData) &&
        isIdArray(localData) &&
        (changedIds.length > 0 || deletedIds.length > 0)
      )
        ? mergeRemoteWithLocalChanges({
            remote: cloudData,
            local: localData,
            changedIds,
            deletedIds,
          })
        : localData;
      try {
        const syncedAt = await writeCloud(companyId, resolved);
        meta = {
          ...meta,
          dirty: false,
          needsReview: false,
          lastCloudUpdatedAt: syncedAt,
          localUpdatedAt: new Date().toISOString(),
          pendingChangedIds: [],
          pendingDeletedIds: [],
          status: 'pending-local-recovered',
        };
        localData = resolved;
        await storage.setItem(storageKey, JSON.stringify(localData));
        await writeMeta(storageKey, meta);
        return localData;
      } catch {
        meta.status = 'pending-local';
        await writeMeta(storageKey, meta);
        return localData;
      }
    }

    if (!hadSyncMeta) {
      const legacy = reconcileLegacyCopies(localData, cloudData);
      const resolved = legacy.data ?? [];
      const historicalDifference =
        !sameData(localData, cloudData) &&
        localData !== undefined &&
        cloudData !== undefined;

      meta = {
        ...meta,
        dirty: false,
        needsReview: historicalDifference || Boolean(legacy.ambiguous),
        lastCloudUpdatedAt: cloudUpdatedAt,
        localUpdatedAt: new Date().toISOString(),
        status: historicalDifference
          ? `legacy-${legacy.source}-review`
          : legacy.source,
      };

      await storage.setItem(storageKey, JSON.stringify(resolved));
      await writeMeta(storageKey, meta);
      return resolved;
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
      await writeMeta(storageKey, meta);
      return localData;
    }

    if (sameData(localData, cloudData)) {
      meta = {
        ...meta,
        dirty: false,
        lastCloudUpdatedAt: cloudUpdatedAt,
        status: 'in-sync',
      };
      await writeMeta(storageKey, meta);
      return localData;
    }

    const cloudAdvanced =
      parseTime(cloudUpdatedAt) > parseTime(meta.lastCloudUpdatedAt);

    if (meta.needsReview) {
      const legacy = reconcileLegacyCopies(localData, cloudData);
      localData = legacy.data ?? localData;
      meta = {
        ...meta,
        lastCloudUpdatedAt: cloudUpdatedAt,
        localUpdatedAt: new Date().toISOString(),
        needsReview: true,
        status: cloudAdvanced ? 'review-remote-advanced' : 'review-required',
      };
      await storage.setItem(storageKey, JSON.stringify(localData));
      await writeMeta(storageKey, meta);
      return localData;
    }

    if (cloudAdvanced) {
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
      await writeMeta(storageKey, meta);
      return localData;
    }

    const legacy = reconcileLegacyCopies(localData, cloudData);
    localData = legacy.data ?? localData;

    if (legacy.repairCloud || legacy.ambiguous) {
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
        status: legacy.source,
      };
    }
    await storage.setItem(storageKey, JSON.stringify(localData));
    await writeMeta(storageKey, meta);
    return localData;
  }, [key, readMeta, writeMeta, writeCloud]);

  const loadData = useCallback(async () => {
    if (!activeCompany) {
      if (mounted.current) {
        setData([]);
        latestDataRef.current = [];
        setIsLoaded(true);
      }
      return;
    }

    if (mounted.current) setIsLoaded(false);

    try {
      let loadedData;

      if (isConsolidated && Array.isArray(companies) && companies.length > 0) {
        const relevant = companies.filter(c =>
          c && (c.id === activeCompany.id || c.parentId === activeCompany.id)
        );
        const uniqueCompanies = Array.from(
          new Map(relevant.map(c => [String(c.id), c])).values()
        );

        const parts = [];
        for (const company of uniqueCompanies) {
          const companyData = await reconcileCompany(company);
          parts.push(...tagRowsForCompany(companyData, company, activeCompany));
        }

        loadedData = Array.from(
          new Map(parts.map(item => [
            `${item._companyId}:${item.id ?? JSON.stringify(item)}`,
            item,
          ])).values()
        );
      } else {
        loadedData = await reconcileCompany(activeCompany);
        if (Array.isArray(loadedData) && isIdArray(loadedData)) {
          loadedData = dedupeById(loadedData);
        }
      }
      if (mounted.current) {
        const safeValue = loadedData ?? (Array.isArray(data) ? [] : {});
        setData(safeValue);
        latestDataRef.current = safeValue;
        setIsLoaded(true);
      }
    } catch (error) {
      console.error('[Sync] Error protegido en loadData:', error);
      if (mounted.current) setIsLoaded(true);
    }
  }, [activeCompany, companies, isConsolidated, key, reconcileCompany]);

  useEffect(() => {
    let isActive = true;
    const channels = [];

    const safeLoad = async () => {
      try {
        if (isActive) await loadData();
      } catch (error) {
        console.error('[Sync] Error atrapado en safeLoad:', error);
      }
    };

    safeLoad();

    try {
      if (activeCompany && typeof supabase.channel === 'function') {
        const relevant = isConsolidated && Array.isArray(companies)
          ? companies.filter(c =>
              c && (c.id === activeCompany.id || c.parentId === activeCompany.id)
            )
          : [activeCompany];

        const uniqueIds = [...new Set(relevant.map(c => String(c.id)))];
        uniqueIds.forEach(companyId => {
          const channel = supabase
            .channel(`sync-v3-${companyId}-${key}`)
            .on(
              'postgres_changes',
              {
                event: '*',
                schema: 'public',
                table: 'app_data_sync',
                filter: `company_id=eq.${companyId}`,
              },
              (payload) => {
                if (
                  isActive &&
                  (payload.new?.storage_key === key || payload.old?.storage_key === key)
                ) {
                  safeLoad();
                }
              }
            )
            .subscribe();
          channels.push(channel);
        });
      }
    } catch {
      console.warn('[Sync] Tiempo real no disponible; continúa sincronización normal.');
    }

    const handleStorageUpdate = (event) => {
      const activeKey = `${activeCompany?.id}-${key}`;
      if (
        event.detail?.key === activeKey ||
        event.detail?.key === 'all-data-update'
      ) safeLoad();
    };

    const handleOnline = () => safeLoad();
    window.addEventListener('storage-updated', handleStorageUpdate);
    window.addEventListener('online', handleOnline);

    return () => {
      isActive = false;
      window.removeEventListener('storage-updated', handleStorageUpdate);
      window.removeEventListener('online', handleOnline);
      channels.forEach(channel => {
        try { supabase.removeChannel(channel); } catch {}
      });
    };
  }, [loadData, activeCompany, companies, key, isConsolidated]);
  const persistData = useCallback(async (newData, baseData) => {
    if (!activeCompany || isConsolidated) {
      if (isConsolidated) {
        console.warn('[Sync] Escritura bloqueada en vista consolidada.');
      }
      return;
    }

    const companyId = String(activeCompany.id);
    const storageKey = `${companyId}-${key}`;
    const now = new Date().toISOString();
    const diff = diffArrayById(
      Array.isArray(baseData) ? baseData : [],
      Array.isArray(newData) ? newData : []
    );

    let meta = (await readMeta(storageKey)) || defaultSyncMeta();
    meta = {
      ...meta,
      dirty: true,
      localUpdatedAt: now,
      pendingChangedIds: diff.mergeable ? diff.changedIds : [],
      pendingDeletedIds: diff.mergeable ? diff.deletedIds : [],
      status: 'saving-local',
    };

    await storage.setItem(storageKey, JSON.stringify(newData));
    await writeMeta(storageKey, meta);

    let cloudRow = null;
    try {
      const { data: fetched, error } = await supabase
        .from('app_data_sync')
        .select('data, updated_at')
        .eq('company_id', companyId)
        .eq('storage_key', key)
        .maybeSingle();
      if (error) throw error;
      cloudRow = fetched;
    } catch {
      meta.status = 'pending-offline';
      await writeMeta(storageKey, meta);
      return;
    }
    let finalData = newData;
    const remoteAdvanced =
      cloudRow &&
      meta.lastCloudUpdatedAt &&
      parseTime(cloudRow.updated_at) > parseTime(meta.lastCloudUpdatedAt);

    if (
      remoteAdvanced &&
      diff.mergeable &&
      isIdArray(cloudRow.data) &&
      isIdArray(newData)
    ) {
      finalData = mergeRemoteWithLocalChanges({
        remote: cloudRow.data,
        local: newData,
        changedIds: diff.changedIds,
        deletedIds: diff.deletedIds,
      });
    }

    try {
      const syncedAt = await writeCloud(companyId, finalData);
      meta = {
        ...meta,
        dirty: false,
        needsReview: false,
        lastCloudUpdatedAt: syncedAt,
        localUpdatedAt: new Date().toISOString(),
        pendingChangedIds: [],
        pendingDeletedIds: [],
        status: 'in-sync',
      };

      await storage.setItem(storageKey, JSON.stringify(finalData));
      await writeMeta(storageKey, meta);

      if (mounted.current) {
        setData(finalData);
        latestDataRef.current = finalData;
      }

      window.dispatchEvent(new CustomEvent('storage-updated', {
        detail: { key: storageKey, source: 'sync-v3' },
      }));
      window.dispatchEvent(new CustomEvent('sync-status-changed', {
        detail: { companyId, key, status: 'in-sync', updatedAt: syncedAt },
      }));
    } catch (error) {
      meta.status = 'pending-upload';
      await writeMeta(storageKey, meta);
      console.error('[Sync] Pendiente de subir a Supabase:', error);
    }
  }, [activeCompany, isConsolidated, key, readMeta, writeMeta, writeCloud]);
  const saveData = useCallback((newData) => {
    if (!activeCompany) return Promise.resolve();

    const baseData = latestDataRef.current;
    if (!isConsolidated && mounted.current) {
      setData(newData);
      latestDataRef.current = newData;
    }

    saveQueueRef.current = saveQueueRef.current
      .catch(() => undefined)
      .then(() => persistData(newData, baseData));

    return saveQueueRef.current;
  }, [activeCompany, isConsolidated, persistData]);

  return [data, saveData, isLoaded];
}
