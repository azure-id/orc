# Caveman itu apa

Caveman adalah **3 produk berbeda dengan 1 nama**. README-nya sengaja
mencampur ketiganya. Memisahkannya adalah inti analisa ini.

| Lapisan | Menyerang | Cara | Lisensi |
|---|---|---|---|
| **Skill** (89 baris markdown) | apa yang model **tulis** | aturan gaya bahasa | MIT |
| **Engine + Proxy** (Go, ~500 file) | apa yang model **baca** | ubah byte sebelum masuk konteks | BSL-1.1 |
| **Learn / measure** | ke mana token **pergi** | baca transcript sendiri | MIT |

Angka 65% di README = skill. Angka 33% = proxy. **Dua produk beda, tidak
bisa dijumlah.**

---

## 1. Skill — memperpendek output

Isi menariknya bukan gaya bicara caveman. Yang menarik adalah **aturan-aturan
yang mereka hapus setelah diukur**:

- Jangan bikin singkatan baru (`cfg`, `impl`, `req`). Tokenizer memecahnya sama
  dengan kata penuh. **Nol token hemat**, tapi pembaca jadi susah.
- Jangan pakai panah `→`. Itu satu token sendiri. **Tidak hemat.**
- Jangan rusak tata bahasa biar terdengar caveman. `"when it not"` justru
  **1 token lebih mahal** dari `"when not"`.

Jadi ini skill kompresi yang sudah diuji ke tokenizer, dan sebagian besar ide
"masuk akal"-nya sudah dibuang karena terbukti tidak hemat.

Dua pengaman yang bagus:

- **Auto-Clarity** — kompresi dimatikan untuk: peringatan keamanan, konfirmasi
  aksi tidak bisa di-undo, dan urutan multi-langkah yang bisa salah dibaca.
- **Boundaries** — apa pun yang disimpan di luar chat (kode, komentar, commit,
  dokumen, issue) ditulis dengan bahasa normal.

Skill ini juga memakai **ASD-STE100 Simplified Technical English** — standar
yang sama dengan `bin/webui/i18n/TERMS.md` milik ORC.

---

## 2. Engine — bagian yang benar-benar menghasilkan uang

`detect()` mengelompokkan payload jadi 12 tipe, lalu mengirimnya ke compressor.

| Tipe | Target hemat |
|---|---|
| `log` | 85–95% |
| `search-result` | 80–95% |
| `json` | 70–90% |
| `diff` | 60–80% |
| `text` / HTML | 50–80% |
| `code` | 40–70% |

Ada 4 ide desain yang bagus. **3 di antaranya sudah ORC temukan sendiri.**

### 2a. Tangga keamanan S0–S4

File: `engine/safety/safety.go`

Setiap compressor **mendeklarasikan kelasnya sendiri**. Kelas itu melekat pada
metode, bukan pilihan user.

- S0/S1 = tidak mengubah byte yang dilihat model.
- S4 = lossy, mengubah byte yang dilihat model.

**S4 tidak boleh jalan sama sekali kalau byte asli belum disimpan dulu.**
Komentar aslinya: *"hasil lossy tanpa jalan pemulihan melanggar kontrak
reversibility."*

Ini sama dengan aturan ORC: "measured is not unknown".

### 2b. Gerbang penerimaan deterministik ← **file terbaik di repo**

File: `rewriter/gate.go`

Hasil kompresi **ditolak** kalau tidak terbukti mempertahankan:

| Yang wajib selamat | Cara cek |
|---|---|
| setiap kata gagal (`fail`, `error`, `panic`, `timeout`, ...) | harus masih ada |
| hitungan `5 failed` | **harus lengkap dengan angkanya** |
| `exit code N` yang bukan 0 | batas kata, `1` tidak boleh dipuaskan oleh `12` |
| lokasi `file.ext:123` | **byte per byte**, parafrase tidak dihitung |
| setiap baris yang membawa kegagalan | utuh, tanpa spasi pinggir |

Komentar aslinya, sangat mirip cara ORC menulis aturan:

> *"Penolakan tidak ada biayanya, jadi setiap cek di sini boleh berlebihan.
> Satu-satunya arah berbahaya adalah menerima hasil yang membuang kegagalan
> yang masih harus ditangani agent: itu mengubah penghematan token jadi belokan
> salah yang sunyi."*

> *"Log compiler dengan 200 warning jadi permanen tidak bisa dikompresi karena
> aturan lokasi sumber. Biaya itu kami terima, bukan dikecualikan, karena
> pengecualian baru boleh dibela setelah ada data yang membuktikan blok jenis
> itu memang mahal."*

### 2c. Penanda elision yang membawa fakta

File: `compressors/invariants.go`

Waktu membuang N unit yang mirip, penandanya **menyebut fakta yang dihitung
dari unit yang dibuang**, bukan cuma jumlahnya:

```
status: fulfilled×15 shipped×3 processing×2
name=min..max        <- pakai string nilai ASLI, tidak dibulatkan
```

Dan enumerasi bersifat **semua-atau-tidak sama sekali**. Kalau nilai berbedanya
lebih dari 5, field itu **tidak ditampilkan sama sekali**. Alasannya:

> *"Daftar sebagian terbaca seperti daftar lengkap."*

Ini persis aturan ORC "a count is not consent" dan "unknown is not zero".

### 2d. `contextwindow.Pack()`

Memilih potongan konteks yang muat dalam budget token:

- **BM25** (k1=1.5, b=0.75) untuk relevansi
- **peluruhan waktu** eksponensial, paruh waktu 6 jam
- **+0.8** untuk baris yang mengandung `ERROR|FATAL|PANIC|TRACEBACK|FAIL|SECURITY|REGRESSION`
- hasil dikembalikan **dalam urutan asli**, supaya kronologi tidak rusak

Tanpa embedding, tanpa jaringan, deterministik.

---

## 3. Pixel mode — dan kenapa matematikanya sendiri bilang tidak

`caveman convert` mengubah SKILL.md jadi gambar PNG, lalu model membacanya
sebagai gambar. Klaim: hemat 61%.

Tapi lihat `engine/pixel/gate.go`:

```
biaya gambar = tokenGambar × (1,25 + 0,10 × (N-1))
biaya teks   = tokenTeks   × 0,10 × N
```

Begitu isinya **masuk cache** — dan semua skill serta CLAUDE.md pasti masuk
cache — teks dibaca dengan tarif 0,10x selamanya, sementara gambar tetap bayar
1,25x untuk ditulis.

**Untuk payload ORC ini rugi. Hitungan caveman sendiri yang bilang.**

---

## 4. Lapisan kejujuran — bagian yang paling patut ditiru

`docs/HONEST-NUMBERS.md` membantah tabel di README-nya sendiri:

| Klaim README | Kata HONEST-NUMBERS |
|---|---|
| "hemat output 65%" | **"Belum dipublikasikan — repo tidak punya hasil mentah yang sudah direview"** |
| hemat input dari skill | **0%** |
| input yang skill **tambah** | **~1–1,5 ribu token setiap giliran** |

Dan mereka menyimpan kasus-kasus rugi:

- `#145` — user mengukur rugi bersih.
- `#506` — Copilot menagih per *request*, jadi caveman tidak bisa membantu sama sekali.
- `#550` — satu A/B di Cursor: **4,3 juta token dengan caveman vs 1 juta tanpa**.
  Tidak bisa diulang. Tetap dipajang.

Di tabel benchmark, baris merah `Dashboard HTML alert +9,9%` dibiarkan, dengan
catatan:

> *"Hari saya menyembunyikan satu baris merah adalah hari kalian harus berhenti
> percaya baris hijaunya."*

---

## 5. `subagent-tax` — alat ukur yang layak dicontek

`packages/subagent-tax/` menyalakan server palsu di localhost yang menyamar
jadi endpoint provider, menjalankan tiap harness satu kali, dan **mengukur
prefix yang dikirim ulang setiap subagent sebelum mulai kerja**.

Di mesin mereka: Claude Code ~43 ribu token (91 tool, 63 MCP).

Ini relevan buat ORC karena ORC mengirim banyak subagent. Angka mesin ini ada
di `02-hasil-ukur.md`.
