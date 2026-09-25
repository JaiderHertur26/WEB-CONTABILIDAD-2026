begin;

alter table if exists public._e2e_store_backup enable row level security;

revoke all on table public._e2e_store_backup from public, anon, authenticated;

comment on table public._e2e_store_backup is
  'Copia técnica de pruebas E2E. Sin acceso directo desde clientes; conservada solo como respaldo interno.';

commit;

