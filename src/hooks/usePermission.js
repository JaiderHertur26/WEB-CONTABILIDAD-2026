import { useCompany } from '@/contexts/CompanyContext';

export function usePermission() {
  const { accessLevel, isGeneralAdmin } = useCompany();
  
  // PARTIAL ACCESS POLICY:
  // - Can Add: YES (Create new records, add payments, etc.)
  // - Can Edit: NO (Modify existing records)
  // - Can Delete: NO (Remove records)
  // - Can Import: NO (Bulk upload)
  
  const isFullAccess = isGeneralAdmin || accessLevel === 'full';
  
  return {
    canEdit: isFullAccess,
    canDelete: isFullAccess,
    canAdd: true,             // Updated: Partial users CAN add data now
    canImport: isFullAccess,  // Restricted
    canModify: isFullAccess,  // Restricted (Settings, etc.)
    isReadOnly: !isFullAccess, // Used for UI badges
    accessLevel: isGeneralAdmin ? 'admin' : accessLevel
  };
}