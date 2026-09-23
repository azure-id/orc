# Code Graph (`orc graph`) — penjelasan singkat

Target ORC v1.8.0. Ditulis dengan kalimat pendek dan kata sederhana.

> **Status: BELUM ADA YANG DIBANGUN.** Ini rencana. Detail lengkap (bahasa
> Inggris) ada di `02-PLAN.md`. Riset dan sumber di `01-research.md`.
> Hitungan token di `03-simulasi-token.md`.

---

## 1. Masalahnya apa

Setiap kali lane ORC jalan, agent harus **mencari** dulu:

- fungsi X ada di file mana?
- X memanggil fungsi apa?
- fungsi itu akhirnya menjalankan query apa?

Cara sekarang: Grep, baca file, Grep lagi, baca lagi. Ini mahal karena:

1. Hasil pencarian masuk context.
2. Context itu **dikirim ulang setiap giliran**.
3. Agent berikutnya di wave berikutnya **mencari hal yang sama lagi**.

Wiki membantu, tapi wiki menjawab **"ini fitur apa"**, bukan **"fungsi ini
dipanggil siapa dan memanggil apa"**. Wiki juga mahal untuk di-refresh.

---

## 2. Solusinya

Sebuah **peta kode kecil** (code graph) yang disimpan lokal di
`.claude/orc/graph/`. Mirip Graphify, tapi kecil dan menyatu dengan ORC.

**Default: MATI.** Kamu yang menyalakan:

```
orc config set code_graph on           # peta struktur (gratis)
orc config set code_graph_notes wave   # catatan singkat per fungsi (bayar token)
orc config set code_graph off          # default
```

---

## 3. Isinya dua lapis

### Lapis 1 — Struktur (GRATIS, 0 token)

Dibuat oleh **CLI**, bukan model. Isinya:

- fungsi, class, method, dan lokasinya (`file:baris`)
- import
- siapa memanggil siapa
- **efek**: query SQL, panggilan HTTP, baca env, tulis file

Contoh rantai yang bisa dijawab:

```
POST /orders → OrderService.create → OrderRepo.insert → SQL "INSERT INTO orders …"
```

**Kenapa bukan model yang bikin?** Semua tool di riset (Graphify,
Codebase-Memory, Aider) pakai parser, bukan model. Parser gratis dan tepat.
Model mahal dan bisa salah. Ini juga aturan ORC S1: **status dihitung oleh
CLI**.

### Lapis 2 — Notes (OPSIONAL, bayar token)

Satu kalimat per fungsi. Contoh:

> "Membuat order dalam satu transaksi dan mengirim event order.created."

Ditulis oleh agent **Sonnet 4.6 medium**. Tapi:

- agent **tidak** menulis file cache sendiri. Dia kirim ke CLI, CLI yang cek
  dan simpan.
- note hanya untuk fungsi yang **berubah** di run itu. Tidak pernah satu repo
  penuh.

---

## 4. Kenapa datanya selalu bisa dipercaya

Setiap data diikat ke **hash isinya**:

| Data | Diikat ke |
|---|---|
| Record per file | hash blob git file itu |
| Note per fungsi | hash isi fungsi itu |

**Kalau isinya berubah, data lama TIDAK ditampilkan sebagai fakta.** Kartu akan
tulis `note: stale (body changed)`.

Ini penting. Riset RepoMirage menunjukkan agent **percaya begitu saja** pada
context yang sudah basi, lalu salah.

**Graph itu PENUNJUK JALAN, bukan kebenaran.** Graph memberi alamat. Sebelum
agent bertindak, dia tetap baca potongan kodenya.

Urutan kepercayaan baru:

```
kode > struktur graph (hash sekarang) > wiki fresh > wiki stale > notes graph > tebakan model
```

---

## 5. Update sedikit-sedikit (murah)

`orc graph update`:

1. `git ls-files -s` → hash semua file dalam **1 panggilan**.
2. Bandingkan dengan cache → mana yang baru, berubah, dihapus.
3. **Parse hanya file yang berubah.**
4. Hubungkan ulang hanya panggilan yang terkena perubahan.
5. Tulis index secara atomik (file sementara → rename).

Pindah branch lalu balik lagi? Record lama **dipakai lagi**, tidak di-parse
ulang.

---

## 6. Teman satu tim ubah kode, cache kamu belum tahu

Cache ini **lokal**, tidak di-commit. Jadi:

| Situasi | Yang terjadi | Yang kamu lihat |
|---|---|---|
| Tidak ada perubahan | tidak ada | `graph: FRESH — 2,140 files · 18,902 symbols` |
| Habis `git pull` / pindah branch | preflight **update sendiri** (gratis) | `graph: 14 files changed outside ORC → updated (0.6 s) · 9 notes now stale` |
| Update gagal / auto-update dimatikan | ditandai | `graph: DRIFTED — 14 files behind; hints only, code wins` |
| Belum ada graph | build pertama | `graph: building first index (~4,000 files, est. 20 s)` |
| Setting mati | tidak ada | `graph: off` |

Jadi struktur **memperbaiki diri sendiri**. Yang ditandai hanya **notes** yang
basi, karena itu yang butuh token.

**Tidak butuh wiki.** Kalau repo belum punya wiki, graph tetap jalan sama
persis.

---

## 7. Lane mana yang ikut

**Aturan: hanya lane yang MENGUBAH KODE.**

| Lane | Preflight | Update struktur | Notes |
|---|---|---|---|
| `/orc`, `/orc-ultra` | ya | preflight · **tiap tutup wave** · setelah fix · ship | 1 dispatch per wave |
| `/orc-diy` | ya (diatur saat compile) | sama seperti `/orc` | diatur saat compile |
| `/orc-mini` | ya | preflight · setelah smoke gate hijau | 1 kali di akhir |
| `/orc-fast` | ya (**bukan** syarat gate ke-3) | preflight · setelah smoke gate hijau | 1 kali di akhir |
| `/orc-quick` | ya | preflight · **tiap request yang menulis kode** | 1 kali per request yang menulis kode |
| Lane yang tidak mengubah kode (`orc-analyze`, `orc-verify`, `orc-wiki`, `orc-learn`, …) | tidak | tidak | tidak |
| Lane dokumen (`orc-doc`, `orc-challenge`, `orc-brainstorm`, `orc-grill`, …) | tidak | tidak | tidak |

Setiap lane kode **selalu** print 1 baris `graph:` di preflight.

### Khusus `/orc-quick`

- Quick tetap **cuma baca `log_dir`**. Semua perintah graph pakai
  `--if-enabled`, jadi CLI yang cek setting, bukan quick.
- Agent notes **tidak ditanyakan** ke kamu. Aturan "selalu tanya agent" hanya
  untuk agent yang mengerjakan request kamu. Agent notes itu pembukuan ORC,
  sama seperti trace writer.
- Request yang cuma bertanya (tidak menulis kode) → tidak update, tidak notes.

---

## 8. Cara agent membaca graph

Agent **tidak pernah** buka file JSON cache. Agent panggil CLI dan dapat
**kartu** kecil dengan batas token:

```
OrderService.create  src/orders/service.ts:41-88  [blob a1b2c3 · current]
  ← called by  POST /orders          src/routes/orders.ts:22        IMPORT
  → calls      validateCart          src/cart/validate.ts:10        IMPORT
  → calls      OrderRepo.insert      src/orders/repo.ts:30          UNIQUE
      └ effect sql  "INSERT INTO orders (user_id, total) …"   repo.ts:34
  → calls      emit                  AMBIGUOUS (2): src/events/bus.ts:8, src/ws/hub.ts:40
  note  Creates the order in one transaction and emits order.created.
  wiki  orc-feature-orders.md (FRESH)
  tests test/orders/service.test.ts
  budget 310/1200 tokens · 2 callers hidden (use --depth 3)
```

Arti label di kanan:

| Label | Arti |
|---|---|
| `EXACT` | dipastikan oleh tool bahasa proyek (TypeScript / Python) |
| `IMPORT` | cocok dengan import di file itu |
| `LOCAL` | didefinisikan di file yang sama |
| `UNIQUE` | hanya ada 1 fungsi dengan nama itu di repo |
| `AMBIGUOUS` | ada 2+ kandidat — **semua ditulis** |
| `UNRESOLVED` | tidak ketemu (dynamic, reflection, package luar) |

ORC **tidak menebak**. "Tidak tahu" juga jawaban.

---

## 9. Penyimpanan: kenapa JSON, bukan SQLite

- ORC **tanpa dependency** dan mendukung **Node 18+**. Kamu pakai Node 20.17.
- `better-sqlite3` = dependency native → **tidak boleh**.
- `node:sqlite` bawaan Node butuh **Node 22.13+**, dan statusnya belum stabil
  penuh. Menaikkan syarat Node = **breaking change**.
- Jadi: **file JSON per file kode** + 1 index, ditulis atomik.
- Kecepatan baca untuk model **tidak tergantung** penyimpanan, karena model
  hanya baca kartu dari CLI.
- Nanti kalau perlu, bisa pindah ke SQLite **tanpa mengubah skill**, karena
  perintah CLI-nya sama.

---

## 10. Berapa token yang dimakan

Detail: `03-simulasi-token.md`. Ringkasnya:

| Kasus | MATI | NYALA |
|---|---|---|
| `/orc` 6 task, 3 wave (eksplorasi) | ± 520K | ± 295K |
| `/orc-quick` ubah 4 file | ± 121K | ± 64K |
| `/orc-quick` edit 1 file, nama file disebut | ± 7K | ± 10–12K |

- Build dan update struktur: **0 token model**.
- Seluruh run `/orc`: perkiraan **hemat 10–15%**, plus kualitas lebih baik.
- Paling hemat: `code_graph: on` + `code_graph_notes: off`.

Dua perbaikan dari simulasi (sudah masuk plan):

1. Agent notes kirim hasil **langsung ke CLI**. Orchestrator cuma terima 1
   baris. Hemat ± 100K per run `/orc`.
2. **Minimal 5 simbol** baru kirim agent notes (`code_graph_notes_min`). Tidak
   ada kartu kalau kamu sudah sebut file dan perubahan cuma di file itu.

---

## 11. Yang sengaja TIDAK dibuat

| Tidak dibuat | Alasan |
|---|---|
| Git hook / watcher di background | Pengguna code-review-graph mengalami proses menumpuk dan komputer hang. |
| Hook yang memaksa agent ke graph (gaya Graphify) | Kartu di slice sudah cukup. Tambah nanti kalau W0 membuktikan agent mengabaikan kartu. |
| MCP server | Skema tool MCP ± 6K token per sesi. CLI memberi data yang sama tanpa biaya itu. |
| Embedding / vector search | Butuh model atau dependency. Grep sudah gratis. |
| Commit graph ke git | File index hasil generate sering bikin konflik merge. Build ulang gratis. |

---

## 12. Keputusan

| # | Pertanyaan | Status |
|---|---|---|
| D1 | Siapa yang bikin struktur | Saran: CLI parser. Sonnet 4.6 hanya untuk notes. |
| D2 | Penyimpanan | Saran: JSON sekarang. SQLite diputuskan setelah W0. |
| D3 | Parser | Saran: pinjam tool proyek (TypeScript, Python) → pola teks. Tanpa tree-sitter. |
| D4 | `/orc-quick` | **SUDAH DIPUTUSKAN:** quick ikut build cache (struktur + notes). |
| D4.1 | Lane mana yang ikut | **SUDAH DIPUTUSKAN:** hanya lane yang mengubah kode. |
| D5 | Model notes | Saran: Sonnet 4.6 medium. Haiku 4.5 ikut diuji di W0. |
| D6 | Notes dibagi ke tim | Saran: lokal dulu. |
| D7 | Jumlah setting | Saran: 2 kunci utama (`code_graph`, `code_graph_notes`). |
| D8 | Hook pemaksa ke graph | Saran: tidak, kecuali W0 membuktikan perlu. |

---

## 13. Langkah pertama: W0 bisa MEMBATALKAN rilis

Sebelum membangun apa pun, W0 mengukur di `../orc-eval`:

- 3 skenario: fix 1 file, fitur 3 file, perubahan lintas lapisan
  (route → service → repo).
- Graph MATI vs NYALA.
- Diukur: token, jumlah tool call, jumlah `Read`, lulus/gagal.

**Kalau perubahan 3+ file tidak menghemat token atau tool call, fitur ini
tidak dirilis.** Itu hasil yang benar, bukan kegagalan.
