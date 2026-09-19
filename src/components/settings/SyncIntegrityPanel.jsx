import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { CheckCircle, RefreshCw, AlertTriangle, Cloud, HardDrive, ShieldCheck } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useCompany } from '@/contexts/CompanyContext';
import { storage } from '@/lib/storage';
import { supabase } from '@/lib/supabase';
import { COMPANY_DATA_KEYS } from '@/lib/companyDataKeys';
import {
  syncMetaKey,
  parseStoredData,
  sameData,
} from '@/lib/syncReconciliation';

const countPayload = (value) => {
  if (Array.isArray(value)) return value.length;
  if (value && typeof value === 'object') return Object.keys(value).length > 0 ? 1 : 0;
  return value === null || value === undefined || value === '' ? 0 : 1;
};

const statusConfig = {
  ok: { label: 'OK', className: 'bg-green-100 text-green-800' },
  empty: { label: 'VACÍO', className: 'bg-slate-100 text-slate-600' },
  pending: { label: 'PENDIENTE', className: 'bg-amber-100 text-amber-800' },
  review: { label: 'REVISAR', className: 'bg-amber-100 text-amber-900' },
  difference: { label: 'DIFERENCIA', className: 'bg-red-100 text-red-800' },
  localOnly: { label: 'SOLO LOCAL', className: 'bg-orange-100 text-orange-800' },
  cloudOnly: { label: 'NUBE / SIN CACHÉ', className: 'bg-blue-100 text-blue-800' },
};
const formatDateTime = (value) => {
  if (!value) return '—';
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? '—' : date.toLocaleString('es-CO');
};

const SyncIntegrityPanel = () => {
  const { activeCompany, isGeneralAdmin } = useCompany();
  const [auditRows, setAuditRows] = useState([]);
  const [isAuditing, setIsAuditing] = useState(false);
  const [auditError, setAuditError] = useState('');
  const [lastAuditAt, setLastAuditAt] = useState(null);

  const runAudit = useCallback(async () => {
    if (!activeCompany || isGeneralAdmin) return;

    setIsAuditing(true);
    setAuditError('');

    try {
      const companyId = String(activeCompany.id);
      const keys = COMPANY_DATA_KEYS.map(item => item.key);
      const { data: cloudRows, error } = await supabase
        .from('app_data_sync')
        .select('storage_key, data, updated_at')
        .eq('company_id', companyId)
        .in('storage_key', keys);

      if (error) throw error;
      const cloudMap = new Map((cloudRows || []).map(row => [row.storage_key, row]));
      const rows = [];

      for (const item of COMPANY_DATA_KEYS) {
        const localKey = `${companyId}-${item.key}`;
        const [rawLocal, rawMeta] = await Promise.all([
          storage.getItem(localKey),
          storage.getItem(syncMetaKey(localKey)),
        ]);

        const localData = parseStoredData(rawLocal);
        const meta = parseStoredData(rawMeta) || {};
        const localExists = rawLocal !== null && rawLocal !== undefined;
        const cloud = cloudMap.get(item.key);
        const cloudExists = Boolean(cloud);
        const equal = localExists && cloudExists && sameData(localData, cloud.data);
        let status = 'difference';
        if (!localExists && !cloudExists) status = 'empty';
        else if (meta.dirty) status = 'pending';
        else if (meta.needsReview) status = 'review';
        else if (localExists && !cloudExists) status = 'localOnly';
        else if (!localExists && cloudExists) status = 'cloudOnly';
        else if (equal) status = 'ok';

        rows.push({
          storageKey: item.key,
          label: item.label,
          status,
          localExists,
          cloudExists,
          localCount: countPayload(localData),
          cloudCount: countPayload(cloud?.data),
          cloudUpdatedAt: cloud?.updated_at || null,
          localUpdatedAt: meta?.localUpdatedAt || null,
          syncStatus: meta?.status || null,
        });
      }

      setAuditRows(rows);
      setLastAuditAt(new Date());
    } catch (error) {
      console.error('[Sync Audit] Error:', error);
      setAuditRows([]);
      setAuditError(error?.message || 'No se pudo consultar la integridad de sincronización.');
    } finally {
      setIsAuditing(false);
    }
  }, [activeCompany, isGeneralAdmin]);

  useEffect(() => {
    setAuditRows([]);
    setAuditError('');
    setLastAuditAt(null);
    if (!activeCompany || isGeneralAdmin) return undefined;
    const timer = window.setTimeout(runAudit, 300);
    return () => window.clearTimeout(timer);
  }, [activeCompany?.id, isGeneralAdmin, runAudit]);

  const problemRows = useMemo(
    () => auditRows.filter(row =>
      ['pending', 'review', 'difference', 'localOnly'].includes(row.status)
    ),
    [auditRows]
  );
  const reconciledCount = useMemo(
    () => auditRows.filter(row =>
      ['ok', 'empty', 'cloudOnly'].includes(row.status)
    ).length,
    [auditRows]
  );

  if (!activeCompany || isGeneralAdmin) return null;

  return (
    <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
      <div className="px-6 py-4 border-b bg-slate-50 flex flex-col lg:flex-row lg:items-center justify-between gap-3">
        <div className="flex items-start gap-3">
          <div className="bg-blue-100 p-2 rounded-full mt-0.5">
            <ShieldCheck className="w-5 h-5 text-blue-700" />
          </div>
          <div>
            <h2 className="font-bold text-slate-900">Integridad de Sincronización</h2>
            <p className="text-sm font-semibold text-slate-800 mt-0.5">
              {activeCompany.name}
            </p>
            <p className="text-xs text-slate-500 font-mono">
              NIT: {activeCompany.doc || '—'} · ID: {activeCompany.id}
            </p>
            <p className="text-xs text-slate-500 mt-1">
              Auditoría cruda LocalForage ↔ Supabase. Esta verificación no escribe ni reconcilia datos.
            </p>
          </div>
        </div>

        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={runAudit}
          disabled={isAuditing}
        >
          <RefreshCw className={`w-4 h-4 mr-2 ${isAuditing ? 'animate-spin' : ''}`} />
          Verificar ahora
        </Button>
      </div>
      <div className="p-5 space-y-4">
        {auditError ? (
          <div className="rounded-lg border border-red-200 bg-red-50 p-3 flex items-start gap-3">
            <AlertTriangle className="w-5 h-5 text-red-600 mt-0.5" />
            <div>
              <p className="font-semibold text-sm text-red-900">No se pudo completar la auditoría</p>
              <p className="text-xs text-red-700 mt-1">{auditError}</p>
            </div>
          </div>
        ) : isAuditing && auditRows.length === 0 ? (
          <div className="flex items-center gap-2 text-sm text-slate-600">
            <RefreshCw className="w-4 h-4 animate-spin" />
            Comparando almacenamiento local y nube…
          </div>
        ) : auditRows.length > 0 ? (
          <>
            <div className={`rounded-lg border p-3 flex items-start gap-3 ${
              problemRows.length === 0
                ? 'bg-green-50 border-green-200'
                : 'bg-amber-50 border-amber-200'
            }`}>
              {problemRows.length === 0
                ? <CheckCircle className="w-5 h-5 text-green-600 mt-0.5" />
                : <AlertTriangle className="w-5 h-5 text-amber-600 mt-0.5" />}
              <div>
                <p className="font-semibold text-sm">
                  {problemRows.length === 0
                    ? `Sincronización íntegra: ${reconciledCount}/${COMPANY_DATA_KEYS.length} módulos sin discrepancias críticas`
                    : `${problemRows.length} módulo(s) requieren atención`}
                </p>
                <p className="text-xs text-slate-600 mt-1">
                  “NUBE / SIN CACHÉ” es normal: significa que Supabase tiene el módulo y este navegador aún no lo ha cargado.
                </p>
                {lastAuditAt && (
                  <p className="text-xs text-slate-500 mt-1">
                    Verificado: {lastAuditAt.toLocaleString('es-CO')}
                  </p>
                )}
              </div>
            </div>
            <div className="overflow-x-auto border rounded-lg">
              <table className="w-full text-xs">
                <thead className="bg-slate-50 text-slate-600">
                  <tr>
                    <th className="text-left px-3 py-2">Módulo</th>
                    <th className="text-center px-3 py-2">
                      <HardDrive className="w-3.5 h-3.5 inline mr-1" />Local
                    </th>
                    <th className="text-center px-3 py-2">
                      <Cloud className="w-3.5 h-3.5 inline mr-1" />Nube
                    </th>
                    <th className="text-center px-3 py-2">Estado</th>
                    <th className="text-left px-3 py-2">Última nube</th>
                    <th className="text-left px-3 py-2">Motor local</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {auditRows.map(row => {
                    const config = statusConfig[row.status] || statusConfig.difference;
                    return (
                      <tr key={row.storageKey}>
                        <td className="px-3 py-2 font-medium text-slate-800">{row.label}</td>
                        <td className="px-3 py-2 text-center">
                          {row.localExists ? row.localCount : '—'}
                        </td>
                        <td className="px-3 py-2 text-center">
                          {row.cloudExists ? row.cloudCount : '—'}
                        </td>
                        <td className="px-3 py-2 text-center">
                          <span className={`inline-flex px-2 py-0.5 rounded-full font-semibold ${config.className}`}>
                            {config.label}
                          </span>
                        </td>
                        <td className="px-3 py-2 text-slate-500 whitespace-nowrap">
                          {formatDateTime(row.cloudUpdatedAt)}
                        </td>
                        <td className="px-3 py-2 text-slate-500 whitespace-nowrap">
                          {row.syncStatus || 'sin metadato v3'}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </>
        ) : (
          <div className="text-sm text-slate-500">
            La auditoría todavía no se ha ejecutado.
          </div>
        )}
      </div>
    </div>
  );
};

export default SyncIntegrityPanel;
