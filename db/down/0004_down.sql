-- Mundur untuk 0004 (uji pada salinan; BUKAN dijalankan oleh pelari migrasi). Urutan terbalik; role hanya bisa NOT NULL lagi bila tak ada baris NULL.
DROP INDEX IF EXISTS compile_name_key_uq;
ALTER TABLE batch ALTER COLUMN role SET NOT NULL;   -- gagal bila ada batch tanpa role: isi dulu dari comparison/run_source_block.role_raw
ALTER TABLE compile_alias DROP CONSTRAINT IF EXISTS compile_alias_key_chk;
ALTER TABLE medium DROP CONSTRAINT IF EXISTS medium_compile_code_key;
DELETE FROM schema_migration WHERE version = 4;
