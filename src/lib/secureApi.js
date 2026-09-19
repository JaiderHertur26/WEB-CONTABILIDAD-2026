import { supabase } from '@/lib/supabase';

const rpc = async (name, args = {}) => {
  const { data, error } = await supabase.rpc(name, args);
  if (error) throw error;
  return data;
};

export const listLoginCompanies = () => rpc('list_login_companies');

export const secureCompanyLogin = (username, password) =>
  rpc('secure_login', { p_username: username, p_password: password });

export const secureAdminLogin = (username, password) =>
  rpc('secure_admin_login', { p_username: username, p_password: password });

export const sessionCompanies = sessionToken =>
  rpc('session_companies', { p_session_token: sessionToken });

export const sessionLogout = sessionToken =>
  sessionToken ? rpc('session_logout', { p_session_token: sessionToken }) : Promise.resolve(true);
export const syncRead = (sessionToken, companyId, storageKey) =>
  rpc('sync_read', {
    p_session_token: sessionToken,
    p_company_id: String(companyId),
    p_storage_key: storageKey,
  });

export const syncReadMany = (sessionToken, companyId, storageKeys) =>
  rpc('sync_read_many', {
    p_session_token: sessionToken,
    p_company_id: String(companyId),
    p_storage_keys: storageKeys,
  });

export const syncWrite = (sessionToken, companyId, storageKey, data) =>
  rpc('sync_write', {
    p_session_token: sessionToken,
    p_company_id: String(companyId),
    p_storage_key: storageKey,
    p_data: data,
  });
export const updateCompanySecure = (sessionToken, companyId, patch) =>
  rpc('session_update_company', {
    p_session_token: sessionToken,
    p_company_id: String(companyId),
    p_patch: patch,
  });

export const createCompanySecure = (sessionToken, company) =>
  rpc('session_create_company', {
    p_session_token: sessionToken,
    p_company_id: String(company.id),
    p_parent_id: company.parentId ? String(company.parentId) : null,
    p_name: company.name,
    p_doc_nit: company.doc || null,
  });

export const deleteCompanySecure = (sessionToken, companyId) =>
  rpc('session_delete_company', {
    p_session_token: sessionToken,
    p_company_id: String(companyId),
  });
export const issueRegistrationToken = (sessionToken, companyId) =>
  rpc('issue_registration_token', {
    p_session_token: sessionToken,
    p_company_id: String(companyId),
  });

export const registerCompanyStructure = (doc, registrationToken, companies) =>
  rpc('register_company_structure', {
    p_doc_nit: doc,
    p_registration_token: registrationToken,
    p_companies: companies,
  });

export const changeAdminPassword = (sessionToken, newPassword) =>
  rpc('admin_change_password', {
    p_session_token: sessionToken,
    p_new_password: newPassword,
  });
