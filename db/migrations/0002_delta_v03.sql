-- udtcompile-ds-002-v0.3 | expand-only Delta B3-1..B3-10
-- Roll-forward: kolom legacy batch.brand_name/role tetap dibaca kompatibilitas, tetapi bukan lagi sumber kebenaran peran.
SET LOCAL lock_timeout = '5s';

-- B3-1: nomor batch stabil per compile; teks produk asli adalah bukti per SumberBlok.
ALTER TABLE batch ALTER COLUMN brand_name DROP NOT NULL;
ALTER TABLE batch DROP CONSTRAINT IF EXISTS batch_compile_id_brand_name_batch_no_key;
ALTER TABLE batch ADD CONSTRAINT batch_compile_batch_no_key UNIQUE (compile_id, batch_no);

-- B3-4/B3-6/B3-7: arsip blok memegang teks sumber, peran mentah, bagian, dan hasil penahanan; Run tetap netral.
ALTER TABLE run_source_block
  ADD COLUMN product_printed text,
  ADD COLUMN role_raw text,
  ADD COLUMN section_header_row integer,
  ADD COLUMN comparison_id bigint REFERENCES comparison,
  ADD COLUMN import_outcome text NOT NULL DEFAULT 'diimpor'
    CHECK (import_outcome IN ('diimpor','ditahan')),
  ADD COLUMN hold_reason text;

-- B3-6: bedakan teks kesimpulan yang benar-benar tercetak dari hasil yang akan dihitung Langkah 4.
ALTER TABLE comparison
  ADD COLUMN conclusion_is_printed boolean NOT NULL DEFAULT false;
UPDATE comparison SET conclusion_is_printed = conclusion_printed IS NOT NULL;

-- B3-8: D5 dipertahankan; D10 menjadi bukti pembanding, bukan penimpaan otomatis.
ALTER TABLE medium ADD COLUMN method_reference_product_text text;

ALTER TABLE import_note DROP CONSTRAINT import_note_kind_check;
ALTER TABLE import_note ADD CONSTRAINT import_note_kind_check CHECK (kind IN ('ignored','hold','stat_mismatch','sheet_diff','n_printed','cell_comment','info','api_mismatch'));

-- B3-2: satu Comparison adalah relasi Run; banyak SumberBlok boleh menunjuk relasi yang sama.
CREATE INDEX run_source_block_comparison_idx ON run_source_block(comparison_id);

-- SumberBlok dibuat lalu ditautkan ke Comparison dalam transaksi impor yang sama.
DO $grants$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname='udt_app') THEN
    GRANT UPDATE (comparison_id) ON run_source_block TO udt_app;
  END IF;
END
$grants$;