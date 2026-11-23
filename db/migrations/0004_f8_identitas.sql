-- udtcompile-ds-004-v0.4 | F8: rekomendasi F8b R1, R2, R3, R5 (keputusan sementara INDRA D1, D3, D4; pengesahan manusia di Agent Log).
-- Satu berkas, maju dan mundur (db/down/0004_down.sql). Tahap expand/aman: tidak ada DROP kolom. Bila data lama melanggar, migrasi BERHENTI dengan pesan jelas (tanpa mengubah data).
SET LOCAL lock_timeout = '5s';

DO $pre$
BEGIN
  IF EXISTS (SELECT 1 FROM medium GROUP BY compile_id, code HAVING count(*) > 1) THEN
    RAISE EXCEPTION '0004 berhenti: ada compile dengan dua medium berkode sama; selesaikan secara manual (keputusan D1) sebelum migrasi';
  END IF;
  IF EXISTS (SELECT 1 FROM compile GROUP BY name_key HAVING count(*) > 1) THEN
    RAISE EXCEPTION '0004 berhenti: ada dua produk dengan name_key sama (D3); selesaikan secara manual sebelum migrasi';
  END IF;
END
$pre$;

-- R1 (D1=a): identitas satu medium = (compile_id, code); full_name hanya atribut.
ALTER TABLE medium ADD CONSTRAINT medium_compile_code_key UNIQUE (compile_id, code);

-- R2: alias_key adalah turunan alias; dijaga CHECK (NOT VALID lalu VALIDATE agar kunci singkat).
ALTER TABLE compile_alias ADD CONSTRAINT compile_alias_key_chk
  CHECK (alias_key = lower(regexp_replace(regexp_replace(alias, '^development of\s+', '', 'i'), '\s+', '', 'g'))) NOT VALID;
ALTER TABLE compile_alias VALIDATE CONSTRAINT compile_alias_key_chk;

-- R3 (D4): batch.role basi; kolom tetap (DROP ditunda), tidak lagi ditulis. Peran dihitung dari comparison.
ALTER TABLE batch ALTER COLUMN role DROP NOT NULL;

-- R5 (D3): produk unik per name_key (tak peka kapital/spasi). UNIQUE (product_name, strength, dosage_form) lama tetap.
CREATE UNIQUE INDEX compile_name_key_uq ON compile (name_key);
