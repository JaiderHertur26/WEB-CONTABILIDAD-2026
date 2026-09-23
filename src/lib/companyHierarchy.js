const normalizeId = value => String(value ?? '').trim();

export const getCompanyScope = (companies, rootId) => {
  const root = normalizeId(rootId);
  if (!root) return [];

  const list = Array.isArray(companies) ? companies.filter(Boolean) : [];
  const allowed = new Set([root]);
  let changed = true;

  while (changed) {
    changed = false;
    for (const company of list) {
      const id = normalizeId(company.id);
      const parentId = normalizeId(company.parentId ?? company.parent_id);
      if (id && parentId && allowed.has(parentId) && !allowed.has(id)) {
        allowed.add(id);
        changed = true;
      }
    }
  }

  return list.filter(company => allowed.has(normalizeId(company.id)));
};

export const getCompanyScopeIds = (companies, rootId) =>
  new Set(getCompanyScope(companies, rootId).map(company => normalizeId(company.id)));
