-- === Migration: 003_mega_tech_roles ===
-- Grants de acesso para app_login nas tabelas de auth
-- Roles já criadas na migration 001_initial_setup

GRANT USAGE ON SCHEMA public TO app_login;
GRANT SELECT ON public.users TO app_login;
GRANT INSERT, SELECT, DELETE ON public.sessions TO app_login;
