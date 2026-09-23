# Read Gate — penjelasan singkat

ORC v1.6.0. Ditulis dengan kalimat pendek dan kata sederhana.

---

## 1. Masalahnya apa

ORC punya aturan: **sesi utama membaca untuk MENCARI. Untuk MEMAHAMI, kirim
agent.** Agent baca pakai context dia sendiri, bukan context kamu.

Aturan ini ditulis di 3 tempat:

- `_shared/read-ladder.md`
- `/orc-doc` aturan 0
- `/orc-quick` baris 21

**Tapi tidak ada yang mengecek.** Cuma tulisan. Model bisa lupa.

Ini kali ke-6 ORC menemukan fakta yang cuma "diingat" model.

---

## 2. Solusinya

File baru: `templates/hooks/orc-read-gate.js`

Ini **hook**. Dia jalan tiap kali ada `Read`. Dia bisa bilang **tidak**.

**Default: MATI (`off`).** Kalau mati, hasilnya sama persis seperti hook ini
tidak ada. Ada test yang membuktikan itu.

Cara menyalakan:

```
orc config set read_gate warn     # kasih tahu, file tetap dibaca
orc config set read_gate block    # tolak baca
orc config set read_gate off      # default
```

---

## 3. Cara kerja — hasil test asli

File contoh: `big-plan.md`, **2.400 baris**. Gate menyala mode `block`.

| No | Situasi | Hasil |
|----|---------|-------|
| 1 | Orchestrator baca full | **DITOLAK** |
| 2 | Executor (agent) baca file yang sama | Boleh, diam |
| 3 | Orchestrator baca pakai `offset`/`limit` | Boleh, diam |
| 4 | File `build.log` 2.400 baris | Boleh, diam |
| 5 | Mode `warn` | Boleh + ada catatan |
| 6 | Mode `off` | Boleh, diam |
| 7 | Menyala, tapi tidak ada run jalan | Boleh, diam |

**Nomor 2 paling penting.** File sama, ukuran sama, gate sama — tapi executor
tetap boleh baca full.

Kenapa? Karena executor **harus** baca file utuh sebelum dia `Edit`. Kalau
dilarang, dia akan menebak isi file, lalu **file jadi rusak**.

### Yang muncul kalau ditolak

```
⛔ ORC read gate — big-plan.md is 2400 lines, over the 1000-line threshold.

   Do one of these instead:
     • Read with offset/limit — always allowed.
     • Grep for what you need, then read that range.
     • Dispatch an agent to read it (agent reads are never gated).

   orc config set read_gate warn
```

**Menolak saja tidak cukup.** Pesannya harus kasih jalan lain. Kalau tidak,
orang akan matikan fiturnya.

---

## 4. Kapan gate DIAM

Ini bagian penting. Semua ini disengaja:

| Keadaan | Alasan |
|---------|--------|
| Agent yang baca | Agent harus baca utuh sebelum edit. Kalau tidak, file rusak. |
| `read_gate: off` | Ini default. |
| Tidak ada run ORC jalan | Gate mengatur cara ORC baca. Bukan mengatur sesi kamu. |
| Pakai `offset`/`limit` | Ini justru cara yang benar. Tidak mungkin ditolak. |
| File di bawah 1.000 baris | Lihat bagian 5. |
| File `.log`, `.xml`, `.jsonl` | ORC baca file ini untuk tentukan lulus/gagal. Kalau dipotong, **build gagal terlihat seperti build sukses**. Itu jauh lebih bahaya. |
| Hook error | Selalu diloloskan. Gate yang error lalu memblokir = tool rusak. |

**Gate tidak bisa lihat perintah shell** seperti `cat`, `head`, `sed`. Cuma
tool `Read`.

---

## 5. Kenapa 1.000 baris, bukan 350

Sumber aslinya pakai 350 baris. **Angka itu tidak cocok untuk ORC.**

Alasan: 350 dihitung dari kirim-agent yang butuh 10–30 detik. Di ORC:

| Yang diukur | Hasil | Jumlah sampel |
|---|---|---|
| Kirim agent (waktu) | **76 detik** (tengah) | 125 |
| Kirim agent (token) | **13.276 token** untuk baca file 4 baris | 1 |
| Panjang 1 baris | **55,2 karakter** | 316 |

Hitungannya: **962–1.024 baris**. Jadi dipakai **1.000**.

Kalau pakai 350, ORC kirim agent untuk kerjaan yang biayanya lebih mahal
daripada baca sendiri.

---

## 6. Soal hemat token — baca ini pelan-pelan

**Ini TIDAK menghemat total token. Ini menghemat CONTEXT.**

Kirim agent itu **menambah** biaya ~13.276 token. Tapi isi file tidak masuk ke
context orchestrator.

Kenapa context mahal? Karena file yang masuk context:

1. Dibayar 1x harga penuh (`cache_write`)
2. Lalu dibaca ulang **setiap giliran berikutnya** (`cache_read`)

Jadi makin lama file itu nongkrong di context, makin mahal.

### Angka nyata

Kolom "sisa giliran" = berapa lama file itu masih nongkrong di context.

| Baris | Sisa giliran | Baca sendiri | Kirim agent | Hemat |
|---|---|---|---|---|
| 1.000 | 0 | 13.800 | 14.076 | −276 (rugi) |
| 1.000 | 10 | 27.600 | 14.876 | **+12.724** |
| 1.000 | 50 | 82.800 | 18.076 | **+64.724** |
| 2.400 | 200 | 695.520 | 30.076 | **+665.444** |

### Titik impas berubah-ubah

```
sisa 0 giliran   → 1.020 baris
sisa 10 giliran  →   539 baris
sisa 50 giliran  →   218 baris
sisa 200 giliran →   104 baris
```

**Angka 1.000 itu kasus terburuk** (file dibaca di giliran terakhir). Jadi
1.000 itu aman, tapi kebesaran untuk kondisi normal.

Kalau kamu sudah punya data dari mode `warn`, boleh diturunkan:

```
orc config set read_gate_max_lines 500
```

### Tapi jujur: totalnya kecil

Dari 239 transkrip yang diukur:

- File ≥1.000 baris: **cuma 5 kali**
- File ≥350 baris: **23 kali**
- Semua baca-full: **~1%** dari total biaya context

Per satu kali baca, hematnya besar. Tapi kejadiannya jarang.

**Jadi ini pagar pengaman, bukan program hemat biaya.**

---

## 7. Kalau file lebih dari 1.000 baris, orchestrator baca gimana

Pakai tangga 4 langkah. Berhenti di langkah yang sudah menjawab pertanyaan.

| Langkah | Lakukan | Berhenti kalau |
|---|---|---|
| 1. Cari | `Grep` / `Glob` cari nama fungsi atau teks error | cuma butuh tahu **di mana** |
| 2. Garis besar | baca baris import dan nama fungsi | butuh daftar fungsi |
| 3. Potongan | baca ±40 baris sekitar hasil langkah 1 | butuh 1 fungsi saja |
| 4. Full | baca semua | file itu **memang subjek tugas**, atau **mau diedit** |

### Contoh nyata

`bin/cli.js` = **42.576 baris**. 42x lebih besar dari batas.

Saya baca file itu belasan kali hari ini. **Tidak pernah sekali pun full.**

```bash
grep -n "const guardCmd\|const traceCmd" bin/cli.js
#   → ketemu baris 251, 341

sed -n '265,300p' bin/cli.js
#   → baca 35 baris itu saja
```

Langkah 1 → langkah 3. Selesai.

### Kalau memang harus baca full

Ada 3 jalan, semuanya ditulis di pesan penolakan:

1. **Baca sebagian:** `Read(file, offset: 400, limit: 200)` — tidak pernah ditolak
2. **Kirim agent:** dia baca full di context dia, lalu lapor hasilnya
3. **Turunkan gate:** `orc config set read_gate warn`

Langkah 4 (baca full) itu **sah**, bukan dosa. Kalau file itu memang subjek
tugas atau mau diedit, itu justru aturan resminya.

---

## 8. Dampak ke skill ORC lain

### Sekarang: NOL

Default `off`. Tidak ada satu pun lane yang berubah sampai kamu nyalakan.

### Kalau dinyalakan

**Semua agent aman.** ~51 agent ORC (executor, scout, wiki scanner, doc writer,
challenge lens) baca bebas. Gate tidak bisa lihat mereka.

Dari data: 524 baca oleh agent vs 581 baca oleh sesi utama. Jadi separuh
kegiatan baca ORC memang sudah di luar jangkauan gate.

| Lane | Dampak |
|---|---|
| `/orc-wiki`, `/orc-analyze` (scout) | Tidak ada. Semua kerja lewat agent. |
| `/orc-doc` | **Cocok sekali.** Aturan 0 melarang orchestrator baca isi dokumen. Gate bikin aturan itu jadi nyata. |
| `/orc-explain` | Tidak ada. Lane ini tidak pernah buka run. |
| `/orc`, `/orc-mini` | Bisa kena, saat orchestrator baca dokumen plan/spec besar. |

Di repo ini cuma ada **2 file payload** yang ≥1.000 baris. Jadi jarang bunyi.

### Satu risiko yang jujur harus disebut

Kalau ada run jalan, **lalu kamu minta edit file >1.000 baris langsung di sesi
utama** — gate akan menolak baca full-nya.

Model masih bisa baca sebagian lalu edit. Tapi editnya berdasarkan pandangan
sebagian. Ini jenis kesalahan yang sama seperti yang dicegah untuk executor.

Lane ORC sendiri tidak pernah edit source dari sesi utama, jadi ini bahaya
kalau kamu pakai campuran (kerja manual + ORC jalan).

**Karena itu: mulai dari `warn` dulu, jangan langsung `block`.**

---

## 9. Catatan penting

**Belum pernah ada run ORC yang jalan dengan gate menyala.**

Semua test pakai payload buatan yang dikirim ke hook. Jalur aslinya belum
pernah dicoba di run beneran.

Karena itu defaultnya `off`. Run pertama yang menyalakan gate = percobaan
pertama yang sungguhan.
