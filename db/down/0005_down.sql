-- Mundur untuk 0005 (uji pada salinan; BUKAN dijalankan oleh pelari migrasi). Urutan terbalik. Akun pengguna HILANG; jejak audit lama tetap (analyst_id utuh).
DROP INDEX IF EXISTS login_attempt_email_idx;
DROP INDEX IF EXISTS login_attempt_ip_idx;
ALTER TABLE login_attempt DROP COLUMN IF EXISTS email_key;
DROP TRIGGER IF EXISTS audit_event_user ON audit_event;
DROP FUNCTION IF EXISTS audit_event_set_user();
ALTER TABLE audit_event DROP COLUMN IF EXISTS user_id;
DROP VIEW IF EXISTS analyst_identity;
DROP TABLE IF EXISTS app_user;
DELETE FROM analyst WHERE name = 'import/sistem' AND NOT EXISTS (SELECT 1 FROM compile WHERE created_by = analyst_id) AND NOT EXISTS (SELECT 1 FROM audit_event e WHERE e.analyst_id = analyst.analyst_id);
DELETE FROM schema_migration WHERE version = 5;
