# Module Spec — Knowledge Management

## Status: Approved | Fase: 4

## Tujuan
Menyediakan ruang dokumentasi terstruktur (gaya Notion) untuk Wiki, catatan meeting,
decision log, dan lessons learned, agar pengetahuan tim tidak hilang atau terkubur di
chat/email.

## Sub-Modul & Entity
Semua sub-modul mewarisi pola dasar: `tenant_id`, `team_id` nullable (null = company-wide),
`title`, `content` (markdown/rich block), `author_id`, `tags[]`, `created_at`, `updated_at`.

### Wiki (`wiki_pages`)
- Mendukung nested page (`parent_page_id`), mirip Notion.
- Full-text search wajib (Postgres `tsvector` minimal untuk MVP).
- Versioning: setiap save signifikan menyimpan snapshot (untuk SOP Engine butuh versi
  spesifik, lihat `sop-engine.md`).
- Dapat menyimpan `related_project_id` untuk Knowledge yang dibuat dari konteks Project.
  Project harus berasal dari tenant yang sama dan referensinya ditampilkan pada metadata
  serta detail Knowledge.

### SOP Repository (`sop_repository`)
- Sub-tipe dari Wiki dengan struktur tambahan: `steps` (array terurut), dipakai sebagai
  sumber SOP Engine.

### Meeting Notes (`meeting_notes`)
- Field tambahan: `meeting_date`, `attendees[]` (array user_id), `related_project_id`
  nullable.

### Decision Log (`decision_logs`)
- Field tambahan: `decision_date`, `context`, `decision`, `consequences`,
  `related_project_id` nullable. Terinspirasi format Architecture Decision Record (ADR).

### Lessons Learned (`lessons_learned`)
- Field tambahan: `related_project_id`, `category` (`process`, `technical`, `communication`).
- Bisa jadi input ke Template Marketplace (project baru bisa "lihat lessons learned dari
  project serupa sebelumnya").


- Setiap knowledge item menyimpan knowledge_types[]. Satu atau lebih tipe aktif dapat dipilih; tipe pertama menjadi tipe utama untuk kompatibilitas endpoint dan tampilan lama.
- Setiap knowledge item dapat dibatasi ke satu atau lebih divisi tenant melalui `accessible_division_ids`. Array kosong berarti dapat diakses semua divisi. Admin dapat melihat seluruh knowledge untuk administrasi; pengguna lain hanya dapat melihat knowledge global atau knowledge yang mencantumkan divisi dari team mereka maupun divisi yang mereka pimpin. Division ID selalu divalidasi dan difilter di backend berdasarkan tenant aktif. Filter divisi di Knowledge Management hanya ditampilkan untuk admin atau pengguna dengan akses ke lebih dari satu divisi.
- Konten internal menerima hingga 1.000.000 karakter. Rich editor melakukan sinkronisasi state secara debounce agar input besar tidak memicu rerender aplikasi pada setiap ketikan, sementara penyimpanan selalu membaca Markdown terbaru langsung dari instance editor. Peringatan performa ditampilkan setelah 50.000 kata dan bukan merupakan hard limit.
- Editor Knowledge menggunakan Tiptap sebagai WYSIWYG berbasis ProseMirror dengan Markdown sebagai kontrak penyimpanan kompatibilitas. Code block menggunakan Lowlight dengan daftar bahasa terbatas, deteksi bahasa otomatis berbasis pola yang dibatasi, pemilihan manual, syntax highlighting, tombol copy berikon, dan trailing paragraph agar cursor dapat keluar dari code block secara natural. Bahasa disimpan sebagai info string fenced Markdown (contoh: ` ```typescript `) agar konten tetap portabel. Karena dukungan Markdown Tiptap masih berkembang, round-trip struktur yang didukung wajib diuji dan konten yang belum diedit tidak boleh ditulis ulang hanya karena editor dibuka.
- Toolbar editor menyediakan heading, undo/redo, bold, italic, underline, strikethrough, clear formatting, bullet/numbered/check list, blockquote, horizontal rule, link, table, code block, warna teks, dan gambar eksternal.
- Gambar inline Knowledge menggunakan URL `http`/`https` tervalidasi (maksimum 2.048 karakter), alt text maksimum 255 karakter, lazy loading, dan tidak menerima data URI/base64. Paste gambar clipboard mengunggah JPEG/PNG/WebP maksimum 5 MB ke media privat tenant menggunakan nama UUID, idempotency key, rate limit, validasi MIME/dimensi, dan audit event; editor kemudian memasukkan URL readback yang tetap memerlukan autentikasi tenant.
- Draft Knowledge diperiksa untuk autosave setiap 20 detik apabila judul dan tipe sudah valid. Autosave dikirim ketika jumlah kata Markdown atau metadata draft (termasuk cover) berbeda dari autosave terakhir yang berhasil. Autosave pertama membuat satu draft secara idempotent; interval berikutnya memperbarui draft yang sama dengan tenant isolation, authorization, dan audit trail. Perubahan yang belum mencapai interval dapat disimpan melalui tombol simpan manual.

## API Terkait

```
GET  /api/v1/knowledge/drafts     current user's tenant-scoped drafts, newest first, max 50
```

### Knowledge media
```
POST /api/v1/knowledge/media       multipart field `image`; requires Idempotency-Key
GET  /api/v1/knowledge/media/{id}  authenticated, tenant-scoped binary response
```
```
GET/POST/PATCH  /api/v1/wiki/pages
GET/POST         /api/v1/meeting-notes
GET/POST         /api/v1/decision-logs
GET/POST         /api/v1/lessons-learned
GET              /api/v1/search?q=&type=wiki|meeting|decision|lesson
```

## Acceptance Criteria
1. Wiki page bisa nested minimal 5 level tanpa masalah performa query (gunakan
   `ltree` atau materialized path di Postgres, jangan recursive CTE naif untuk setiap
   render).
2. Pencarian lintas sub-modul (`GET /search`) mengembalikan hasil relevan dari keempat
   tipe konten sekaligus, bukan hanya Wiki.
3. Decision Log dan Lessons Learned bisa di-link ke Project tertentu dan muncul di tab
   "Knowledge" pada halaman detail project tersebut.

- Knowledge items dapat menyimpan hingga 20 external resources sebagai JSON (url, google_docs) tanpa server-side fetching. URL divalidasi dan Google Docs publik dikenali sebagai tipe khusus.

- Knowledge creation uses the rich-text/Markdown editor for primary content and supports external URLs as related resources in the metadata panel.

- The New Knowledge editor supports up to 20 document tabs. Each tab keeps an independent
  Markdown draft while the author switches tabs. When saved or autosaved, a multi-tab draft
  is serialized into portable Markdown using each sanitized tab label as a level-one heading;
  a single-tab draft preserves its content without adding a synthetic heading. This keeps the
  existing API `content` contract backward compatible and prevents inactive-tab content loss.

- Knowledge has an explicit `publication_status` of `draft` or `published`. Autosave and
  **Save draft** create/update `draft`; existing records are migrated as `published`.
  Publishing requires a non-empty title, at least one Knowledge type, and either non-empty
  internal Markdown or at least one external resource. Normal Knowledge lists return only
  `published` records. The first pseudo-category, **Your Draft**, returns at most the 50 most
  recently updated drafts belonging to the authenticated user and never exposes another
  user's drafts, including to tenant administrators.

- New Knowledge supports one optional cover with `cover_source` (`upload` or `url`) and
  `cover_url` (maximum 2,048 characters). Uploaded covers reuse tenant-private Knowledge
  media (verified JPEG/PNG/WebP, maximum 5 MB); external covers accept HTTP(S) only and are
  never fetched by the server. Cover changes participate in autosave, draft resume, and
  publish. While an autosave request is active, the footer displays animated `Saving...`;
  after completion it returns to the normal saved/interval message.

- System Knowledge Type Project Preliminary Notes supplies reusable internal Knowledge items to the New Project preliminary-notes loader. Selecting a Knowledge-backed template copies its Markdown without storing it as a preliminary_note_template FK.
- `GET /api/v1/preliminary-note-templates` accepts bounded `q`, `source`, and `limit` query parameters. The New Project form debounces knowledge-source searches, returns at most 20 published tenant-accessible Project Preliminary Notes, and may link multiple selected Knowledge pages through `knowledge_page_ids`. Selecting a source does not copy or modify its Markdown in the editable preliminary notes.
