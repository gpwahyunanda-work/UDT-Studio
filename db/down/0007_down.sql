-- Mundur untuk 0007 (uji pada salinan; BUKAN dijalankan oleh pelari migrasi). Mencabut hak ubah kolom yang ditambahkan F15; data utuh.
DO $r$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname='udt_app') THEN
    REVOKE UPDATE (product_name, strength, dosage_form, api, api_uncertain, project_code, title) ON compile FROM udt_app;
    REVOKE UPDATE (full_name, volume_text, apparatus, rpm_text, method, method_ref) ON medium FROM udt_app;
    REVOKE UPDATE (brand_name) ON batch FROM udt_app;
    REVOKE UPDATE (manufacturer_site) ON run FROM udt_app;
    REVOKE UPDATE (alias, alias_key) ON compile_alias FROM udt_app;
  END IF;
END
$r$;
DELETE FROM schema_migration WHERE version = 7;
