-- udtcompile-ds-003-v0.2 | expand-only. Arah INDRA 23 Nov: Studio menulis, Compiler membaca; produk dicocokkan per kode project/SKU, bila tidak ada per nama ternormalisasi.
SET LOCAL lock_timeout = '5s';
ALTER TABLE compile
  ADD COLUMN project_code text CHECK (project_code IS NULL OR length(btrim(project_code)) BETWEEN 1 AND 60),
  ADD COLUMN name_key text GENERATED ALWAYS AS (lower(regexp_replace(product_name || ' ' || strength || ' ' || dosage_form, '\s+', '', 'g'))) STORED,
  ADD COLUMN api_uncertain boolean NOT NULL DEFAULT false;   -- B3-8: zat aktif dari D5 bertentangan dengan D10; tampil sebagai "belum pasti"
CREATE UNIQUE INDEX compile_project_code_uq ON compile (lower(project_code)) WHERE project_code IS NOT NULL;
CREATE INDEX compile_name_key_idx ON compile (name_key);

-- Alias nama (mis. judul sheet lama). Penambahan alias hanya oleh analis; tidak ada penggabungan otomatis.
CREATE TABLE compile_alias (
  alias_id    bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  compile_id  bigint NOT NULL REFERENCES compile,
  alias       text   NOT NULL CHECK (length(btrim(alias)) > 0),
  alias_key   text   NOT NULL,
  source      text   NOT NULL CHECK (source IN ('sheet','analis')),
  created_by  bigint NOT NULL REFERENCES analyst,
  created_at  timestamptz NOT NULL DEFAULT now(),
  UNIQUE (compile_id, alias_key)
);
CREATE INDEX compile_alias_key_idx ON compile_alias (alias_key);

DO $grants$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname='udt_app') THEN
    GRANT SELECT, INSERT ON compile_alias TO udt_app;
    GRANT USAGE ON ALL SEQUENCES IN SCHEMA public TO udt_app;
  END IF;
END
$grants$;
