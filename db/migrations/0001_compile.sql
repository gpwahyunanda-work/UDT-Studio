-- udtcompile-ds-001-v0.2 (migrasi 0001)  |  DRAF  |  PostgreSQL 17 standar (tanpa fitur khas Neon/Vercel)
-- Migrasi 0001 (rencana). Dijalankan oleh peran pemilik skema (udt_owner), bukan peran aplikasi.

-- ===== Tabel kode =====
CREATE TABLE medium_code (
  code     text PRIMARY KEY,
  label    text NOT NULL,
  sort_no  smallint NOT NULL UNIQUE
);
INSERT INTO medium_code(code,label,sort_no) VALUES
  ('Release','Release',1),('1,2','pH 1,2',2),('4,5','pH 4,5',3),('6,8','pH 6,8',4),
  ('Air','Air',5),('1,0','pH 1,0',6),('7,2','pH 7,2',7),('7,5','pH 7,5',8);

CREATE TABLE conclusion_code (
  code   text PRIMARY KEY,
  label  text NOT NULL
);
INSERT INTO conclusion_code(code,label) VALUES
  ('similar','Similar'),('not_similar','Not Similar'),('very_rapid','Similar (sangat cepat, f2 hanya informasi)');

-- ===== Orang =====
CREATE TABLE analyst (
  analyst_id  bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  name        text NOT NULL UNIQUE CHECK (length(btrim(name)) > 0),
  created_at  timestamptz NOT NULL DEFAULT now()
);

-- ===== Compile, medium, batch =====
CREATE TABLE compile (
  compile_id    bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  product_name  text NOT NULL,
  strength      text NOT NULL,
  dosage_form   text NOT NULL,
  api           text,                                   -- zat aktif (satu per compile; diverifikasi pada sheet Empagliflozin 10 mg)
  title         text NOT NULL,                          -- bawaan "Development of [produk] [kekuatan] [bentuk]"
  created_by    bigint NOT NULL REFERENCES analyst,
  created_at    timestamptz NOT NULL DEFAULT now(),
  UNIQUE (product_name, strength, dosage_form)
);

CREATE TABLE medium (
  medium_id     bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  compile_id    bigint NOT NULL REFERENCES compile,
  code          text   NOT NULL REFERENCES medium_code,
  full_name     text   NOT NULL,                        -- apa adanya dari sheet, mis. "HCl 0,1N"
  volume_text   text,                                   -- teks apa adanya, mis. "900 ml" (tidak diurai)
  apparatus     text,
  rpm_text      text,
  method        text,
  method_ref    text,
  UNIQUE (compile_id, code, full_name),
  UNIQUE (medium_id, compile_id)
);

CREATE TABLE batch (
  batch_id     bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  compile_id   bigint NOT NULL REFERENCES compile,
  brand_name   text   NOT NULL,                         -- nama produk tertulis, mis. "Jardiance 10 mg Tablet"
  batch_no     text   NOT NULL,                         -- teks, bukan angka
  role         text   NOT NULL CHECK (role IN ('reference','uji')),
  UNIQUE (compile_id, brand_name, batch_no),
  UNIQUE (batch_id, compile_id)
);

-- ===== Asal data =====
CREATE TABLE studio_push (
  push_id         uuid PRIMARY KEY,                     -- dibuat peramban pada klik pertama
  compile_id      bigint NOT NULL REFERENCES compile,
  analyst_id      bigint NOT NULL REFERENCES analyst,
  payload_sha256  text   NOT NULL,
  received_at     timestamptz NOT NULL DEFAULT now(),
  outcome         text   NOT NULL
);

CREATE TABLE import_run (
  import_id     bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  source_name   text   NOT NULL,                        -- nama berkas sheet
  analyst_id    bigint NOT NULL REFERENCES analyst,
  started_at    timestamptz NOT NULL DEFAULT now(),
  f2_tolerance  numeric NOT NULL DEFAULT 1
);

-- ===== Run dan nilai =====
CREATE TABLE run (
  run_id             bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  compile_id         bigint NOT NULL,                   -- DN-1 (dipaku kunci tamu gabungan)
  batch_id           bigint NOT NULL,
  medium_id          bigint NOT NULL,
  variant            text   NOT NULL DEFAULT '',
  test_date          date,
  manufacturer_site  text,                              -- teks tercetak pada run (BUKAN pada batch; lihat bukti sheet nyata)
  note               text,
  is_valid           boolean NOT NULL DEFAULT true,
  invalid_reason     text,
  content_hash       text   NOT NULL,                   -- DN-3
  source             text   NOT NULL CHECK (source IN ('studio','sheet')),
  push_id            uuid   REFERENCES studio_push DEFERRABLE INITIALLY DEFERRED,   -- ditunda: baris studio_push (berisi hasil) ditulis di akhir transaksi
  import_id          bigint REFERENCES import_run,
  created_by         bigint NOT NULL REFERENCES analyst,
  created_at         timestamptz NOT NULL DEFAULT now(),
  FOREIGN KEY (batch_id,  compile_id) REFERENCES batch  (batch_id,  compile_id),
  FOREIGN KEY (medium_id, compile_id) REFERENCES medium (medium_id, compile_id),
  UNIQUE (compile_id, batch_id, medium_id, variant, content_hash),
  UNIQUE (run_id, medium_id),                           -- untuk kunci tamu comparison (DN-6)
  CHECK (is_valid OR length(btrim(coalesce(invalid_reason,''))) > 0),
  CHECK ((source='studio' AND push_id IS NOT NULL AND import_id IS NULL)
      OR (source='sheet'  AND import_id IS NOT NULL AND push_id IS NULL))
);

CREATE TABLE run_timepoint (
  run_id  bigint   NOT NULL REFERENCES run,
  seq     smallint NOT NULL CHECK (seq BETWEEN 1 AND 99),
  minute  numeric  NOT NULL CHECK (minute > 0),         -- titik 0 tidak disimpan
  PRIMARY KEY (run_id, seq),
  UNIQUE (run_id, minute)
);

CREATE TABLE run_value (
  run_id     bigint   NOT NULL,
  vessel_no  smallint NOT NULL CHECK (vessel_no BETWEEN 1 AND 99),
  seq        smallint NOT NULL,
  pct        numeric  NOT NULL CHECK (pct <> 'NaN'::numeric),   -- tanpa skala: tidak dibulatkan
  PRIMARY KEY (run_id, vessel_no, seq),
  FOREIGN KEY (run_id, seq) REFERENCES run_timepoint (run_id, seq)
);

-- ===== Perbandingan f2 =====
CREATE TABLE comparison (
  comparison_id    bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  medium_id        bigint NOT NULL,                     -- DN-6 (menjamin satu medium)
  test_run_id      bigint NOT NULL,
  ref_run_id       bigint NOT NULL,
  total_sq         numeric,                             -- DN-2
  n_points         smallint NOT NULL CHECK (n_points > 0),
  f2               numeric,                             -- DN-2
  conclusion_code  text REFERENCES conclusion_code,
  conclusion_printed text,                              -- v0.2: teks kesimpulan tercetak di sheet apa adanya (boleh kosong/panjang); conclusion_code NULL untuk data sheet = 'dihitung' modul Langkah 4 saat tampil
  f2_source        text NOT NULL CHECK (f2_source IN ('sheet','studio')),
  UNIQUE (test_run_id, ref_run_id),
  CHECK (test_run_id <> ref_run_id),
  CHECK (f2_source <> 'studio' OR conclusion_code IS NOT NULL),
  FOREIGN KEY (test_run_id, medium_id) REFERENCES run (run_id, medium_id),
  FOREIGN KEY (ref_run_id,  medium_id) REFERENCES run (run_id, medium_id)
);

CREATE TABLE comparison_point (
  comparison_id  bigint   NOT NULL REFERENCES comparison,
  seq            smallint NOT NULL,
  sq_diff        numeric  NOT NULL,                     -- (Rt-Tt)^2 resmi
  PRIMARY KEY (comparison_id, seq)
);

-- ===== Hapus, timpa, pulihkan: hanya menambah baris (append-only) =====
CREATE TABLE run_removal (
  run_id               bigint   NOT NULL REFERENCES run,
  seq                  smallint NOT NULL,
  kind                 text     NOT NULL CHECK (kind IN ('hapus','ditimpa','pulihkan')),
  replaced_by_run_id   bigint   REFERENCES run,
  at_utc               timestamptz NOT NULL DEFAULT now(),
  analyst_id           bigint   NOT NULL REFERENCES analyst,
  reason               text     NOT NULL CHECK (length(btrim(reason)) > 0),
  PRIMARY KEY (run_id, seq),
  CHECK ((kind = 'ditimpa') = (replaced_by_run_id IS NOT NULL))
);

-- ===== Impor =====
CREATE TABLE import_check (
  import_id       bigint  NOT NULL REFERENCES import_run,
  comparison_id   bigint  NOT NULL REFERENCES comparison,
  f2_recomputed   numeric NOT NULL,
  PRIMARY KEY (import_id, comparison_id)
);

CREATE TABLE import_note (
  import_id   bigint   NOT NULL REFERENCES import_run,
  seq         integer  NOT NULL,
  kind        text     NOT NULL CHECK (kind IN ('ignored','hold','stat_mismatch','sheet_diff','n_printed','cell_comment','info')),
  sheet_tab   text,
  cell_range  text,
  message     text     NOT NULL,
  PRIMARY KEY (import_id, seq)
);

CREATE TABLE run_source_block (
  source_block_id  bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  run_id           bigint  NOT NULL REFERENCES run,
  import_id        bigint  NOT NULL REFERENCES import_run,
  tab_name         text    NOT NULL,
  avg_row          integer NOT NULL,
  block_date       date,
  ref_avg_row      integer,                              -- v0.2: baris AVG pembanding yang dirujuk rumus blok ini (NULL untuk blok pembanding)
  UNIQUE (import_id, tab_name, avg_row)
);

-- ===== Jejak dan teknis =====
CREATE TABLE audit_event (
  event_id     bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  at_utc       timestamptz NOT NULL DEFAULT now(),
  analyst_id   bigint NOT NULL REFERENCES analyst,
  action       text   NOT NULL,
  entity_type  text   NOT NULL,
  entity_id    bigint,
  reason       text,
  request_id   text,
  ip_hash      text
);

CREATE TABLE audit_change (
  event_id    bigint NOT NULL REFERENCES audit_event,
  field_name  text   NOT NULL,
  old_value   text,
  new_value   text,
  PRIMARY KEY (event_id, field_name)
);

CREATE TABLE login_attempt (
  attempt_id  bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  at_utc      timestamptz NOT NULL DEFAULT now(),
  ip_hash     text    NOT NULL,
  ok          boolean NOT NULL
);

CREATE TABLE schema_migration (
  version     integer PRIMARY KEY,
  name        text NOT NULL,
  sha256      text NOT NULL,
  applied_at  timestamptz NOT NULL DEFAULT now()
);

-- ===== Tampilan: run yang terlihat (bukan dihapus/ditimpa) =====
CREATE VIEW run_visible AS
SELECT r.*
FROM run r
WHERE COALESCE((SELECT x.kind FROM run_removal x
                WHERE x.run_id = r.run_id
                ORDER BY x.seq DESC LIMIT 1), 'pulihkan') = 'pulihkan';

-- ===== Hak akses (REQ-065); hanya bila peran udt_app sudah dibuat (kata sandi tidak ada di repo) =====
DO $grants$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname='udt_app') THEN
    GRANT SELECT ON ALL TABLES IN SCHEMA public TO udt_app;
    GRANT INSERT ON ALL TABLES IN SCHEMA public TO udt_app;
    GRANT UPDATE (note, is_valid, invalid_reason, variant) ON run TO udt_app;   -- hanya ini yang boleh diubah
    REVOKE INSERT ON medium_code, conclusion_code, schema_migration FROM udt_app;
    GRANT USAGE ON ALL SEQUENCES IN SCHEMA public TO udt_app;
  END IF;
END
$grants$;
