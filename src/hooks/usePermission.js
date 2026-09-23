import { useCompany } from '@/contexts/CompanyContext';

export function usePermission() {
  const { accessLevel, isGeneralAdmin, isConsolidated } = useCompany();

  // Acceso Parcial: puede registrar nuevos datos, pero no modificar,
  // eliminar, importar ni cambiar configuración.
  // Vista Consolidada: siempre es de solo lectura para evitar escribir
  // sobre un conjunto compuesto por varias entidades.
  const isFullAccess = isGeneralAdmin || accessLevel === 'full';
  const consolidatedReadOnly = !isGeneralAdmin && !!isConsolidated;

  return {
    canEdit: isFullAccess && !consolidatedReadOnly,
    canDelete: isFullAccess && !consolidatedReadOnly,
    canAdd: !consolidatedReadOnly,
    canImport: isFullAccess && !consolidatedReadOnly,
    canModify: isFullAccess && !consolidatedReadOnly,
    isReadOnly: !isFullAccess || consolidatedReadOnly,
    isConsolidatedReadOnly: consolidatedReadOnly,
    accessLevel: isGeneralAdmin ? 'admin' : accessLevel
  };
}