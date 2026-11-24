-- Mundur untuk 0006 (uji pada salinan; BUKAN dijalankan oleh pelari migrasi). Username HILANG; akun dan jejak audit utuh.
DROP INDEX IF EXISTS app_user_username_uq;
ALTER TABLE app_user DROP COLUMN IF EXISTS username;
DELETE FROM schema_migration WHERE version = 6;
