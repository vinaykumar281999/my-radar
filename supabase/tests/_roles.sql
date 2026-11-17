-- Cluster-wide stand-ins for Supabase's API roles (run once per throwaway cluster).
create role anon nologin;
create role authenticated nologin;
create role service_role nologin bypassrls;
