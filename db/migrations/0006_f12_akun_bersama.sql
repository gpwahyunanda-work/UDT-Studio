-- F12: tiga akun bersama (Formdev, Andev, Admin). Hanya EXPAND: kolom baru, tidak ada data lama diubah atau dihapus.

-- Username untuk masuk (selain email). Tanpa '@' agar tidak pernah bentrok dengan email; unik tanpa beda huruf besar-kecil.
ALTER TABLE app_user ADD COLUMN username text CHECK (username IS NULL OR (username = btrim(username) AND username !~ '[@\s]' AND length(username) BETWEEN 3 AND 64));
CREATE UNIQUE INDEX app_user_username_uq ON app_user (lower(username)) WHERE username IS NOT NULL;

DO $grants$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname='udt_app') THEN
    GRANT UPDATE (email, username) ON app_user TO udt_app;   -- seed-env memperbarui email/username akun bersama; display_name dan analyst_id tetap tak bisa diubah
  END IF;
END
$grants$;
