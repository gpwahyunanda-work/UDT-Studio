# F4b Sprint 2 NOTES

## Bundle / skill

- UI: React, Tailwind v4 scoped `uc:`, lucide-react, Visx, esbuild; tidak ada CDN.
- Bundle produksi terakhir: JavaScript 114.7 KB gzip, CSS 2.1 KB gzip, total **114.1 KB gzip**.
- Skills yang diterapkan: `impeccable`, `ui-ux-pro-max`, `ui-ux-design`, `hallmark`, `browser-use`, `token-saver`, `ponytail`, `db-migration-safety`, `tdd-test-strategy`, `incremental-implementation`, `git-workflow-and-versioning`, `verification-before-completion`.

## Keputusan B3-2

Dua blok Gionix pH 6,8 r=60/r=83 dengan `test_run_id` dan `ref_run_id` sama disimpan sebagai **satu Comparison** dan dua `run_source_block` yang menunjuk `comparison_id` sama. `comparison` adalah fakta relasi antar-Run; baris sheet adalah provenance. Ini menjaga unique `(test_run_id, ref_run_id)` dan tidak menggandakan hasil f2 yang sama.

## Keterbatasan bukti browser

Chrome agen memblokir `127.0.0.1`; harness file memakai snapshot API yang ditarik dari server lokal sebelum rendering. URL Preview harus diverifikasi INDRA setelah deploy; Sprint 2 tidak push/deploy.
