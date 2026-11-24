-- F15: /record (penelusur dan CRUD terkontrol). Hanya EXPAND: hak UPDATE per kolom (kolom deskriptif master). Tanpa hak DELETE (tidak pernah); nilai terukur dan turunan tetap tanpa hak ubah.
SET LOCAL lock_timeout = '5s';
DO $grants$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname='udt_app') THEN
    GRANT UPDATE (product_name, strength, dosage_form, api, api_uncertain, project_code, title) ON compile TO udt_app;
    GRANT UPDATE (full_name, volume_text, apparatus, rpm_text, method, method_ref) ON medium TO udt_app;
    GRANT UPDATE (brand_name) ON batch TO udt_app;
    GRANT UPDATE (manufacturer_site) ON run TO udt_app;
    GRANT UPDATE (alias, alias_key) ON compile_alias TO udt_app;
  END IF;
END
$grants$;
