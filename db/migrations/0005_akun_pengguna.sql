-- F10: akun per pengguna (autentikasi) + peran (autorisasi). Hanya EXPAND: tabel/kolom/view baru, tidak ada data lama yang diubah atau dihapus.
-- Kunci jejak tetap analyst_id (semua FK lama utuh); app_user menautkan akun -> baris analyst bernama display_name.

CREATE TABLE app_user (
  user_id              bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  email                text    NOT NULL CHECK (email = lower(btrim(email)) AND length(email) BETWEEN 3 AND 254),
  display_name         text    NOT NULL CHECK (display_name = btrim(display_name) AND length(display_name) BETWEEN 1 AND 80),
  role                 text    NOT NULL CHECK (role IN ('admin','penulis','pembaca')),
  password_hash        text    NOT NULL,                    -- scrypt$N$r$p$salt$hash (parameter tersimpan per baris); '!' = tidak bisa masuk
  must_change_password boolean NOT NULL DEFAULT true,
  is_active            boolean NOT NULL DEFAULT true,
  token_version        integer NOT NULL DEFAULT 0,          -- dinaikkan = semua sesi pengguna ini mati
  last_login_at        timestamptz,
  created_at           timestamptz NOT NULL DEFAULT now(),
  analyst_id           bigint  NOT NULL UNIQUE REFERENCES analyst,
  is_system            boolean NOT NULL DEFAULT false,
  CHECK (NOT is_system OR (NOT is_active AND password_hash = '!'))
);
CREATE UNIQUE INDEX app_user_email_uq ON app_user (lower(email));
CREATE UNIQUE INDEX app_user_display_uq ON app_user (lower(display_name));
CREATE UNIQUE INDEX app_user_one_system_uq ON app_user (is_system) WHERE is_system;

-- Akun 'import/sistem': pemilik semua jejak lama (analyst bernama bebas). Tidak aktif, tidak bisa masuk.
INSERT INTO analyst(name) VALUES ('import/sistem') ON CONFLICT (name) DO NOTHING;
INSERT INTO app_user(email, display_name, role, password_hash, must_change_password, is_active, is_system, analyst_id)
SELECT 'import-sistem@udt.invalid', 'import/sistem', 'pembaca', '!', false, false, true, analyst_id FROM analyst WHERE name = 'import/sistem';

-- Pemetaan jejak -> pengguna: analyst yang punya akun = akun itu; selebihnya (data lama bernama bebas) = akun import/sistem.
CREATE VIEW analyst_identity AS
SELECT a.analyst_id, a.name AS analyst_name,
       COALESCE(u.user_id, s.user_id) AS user_id,
       (u.user_id IS NULL) AS legacy
FROM analyst a
LEFT JOIN app_user u ON u.analyst_id = a.analyst_id AND NOT u.is_system
CROSS JOIN (SELECT user_id FROM app_user WHERE is_system) s;

-- Jejak audit mencatat user_id (nama lewat analyst). Diisi otomatis dari analyst_id; NULL = data lama.
ALTER TABLE audit_event ADD COLUMN user_id bigint REFERENCES app_user;
CREATE FUNCTION audit_event_set_user() RETURNS trigger LANGUAGE plpgsql AS $f$
BEGIN
  IF NEW.user_id IS NULL THEN
    SELECT user_id INTO NEW.user_id FROM app_user WHERE analyst_id = NEW.analyst_id AND NOT is_system;
  END IF;
  RETURN NEW;
END $f$;
CREATE TRIGGER audit_event_user BEFORE INSERT ON audit_event FOR EACH ROW EXECUTE FUNCTION audit_event_set_user();

-- Pembatasan laju per (email, IP), per email, per IP: kunci email = HMAC (bukan email mentah).
ALTER TABLE login_attempt ADD COLUMN email_key text;
CREATE INDEX login_attempt_ip_idx ON login_attempt (ip_hash, at_utc);
CREATE INDEX login_attempt_email_idx ON login_attempt (email_key, at_utc);

DO $grants$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname='udt_app') THEN
    GRANT SELECT, INSERT ON app_user TO udt_app;
    GRANT UPDATE (password_hash, must_change_password, is_active, token_version, last_login_at, role) ON app_user TO udt_app;   -- hanya ini
    GRANT SELECT ON analyst_identity TO udt_app;
    GRANT USAGE ON ALL SEQUENCES IN SCHEMA public TO udt_app;
  END IF;
END
$grants$;
