CREATE TABLE public.northstar_ci_migration_probe (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  source_pull_request integer NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
