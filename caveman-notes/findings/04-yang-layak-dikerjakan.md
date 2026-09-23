# Yang layak dikerjakan

Urut dari hasil paling besar. Semua sudah diukur, bukan dikira.

---

## Tabel keputusan

| # | Kerjaan | Hasil | Usaha |
|---|---|---|---|
| 1 | Verifikasi bug token subagent, lalu hapus `tokens: null` | **kebenaran** — 2 aturan yang sudah dirilis ternyata salah | 1 probe + 1 reader |
| 2 | **Potong CLAUDE.md 50%** | **~7,4%** tagihan project ini | edit teks, nol kode |
| 3 | Pindahkan daftar invariant `rewriter/gate.go` ke ORC | kebenaran | kecil |
| 4 | Pakai aturan penanda elision caveman | kebenaran | kecil |
| 5 | `orc doctor` → finding `claude-md-oversized` | bikin #2 jaga diri sendiri | kecil |
| 6 | Ukur pajak subagent di `orc extra stats` | akurasi harga | sedang |
| — | ~~proxy / hook kompresi~~ | **3,1%, sudah diambil rtk** | ditolak |
| — | ~~pixel mode~~ | **hitungan caveman sendiri bilang rugi** | ditolak |

---

## #1 — Bug token subagent

**Baca `05-bug-token-subagent.md` dulu.** Ini yang paling penting dan paling
murah.

Singkatnya: CLAUDE.md menulis 3 kali bahwa Claude Code tidak mencatat token
subagent. Itu sudah tidak benar. Datanya ada, di file terpisah bernama
`agent-<id>.jsonl`.

Kalau benar juga di mesin kedua:
- `orc usage report` bisa berhenti melapor `tokens: null`
- `/orc-budget` bisa pakai vektor nyata, bukan proxy wall-time
- floor `tokenCount` v1.4.0 turun jadi cadangan, bukan satu-satunya bacaan

---

## #2 — Potong CLAUDE.md 50%

### Kenapa ini nomor 2 dan bukan nomor 10

```
C:\dev\orc\CLAUDE.md = 170.494 byte ≈ 42.624 token
prefix giliran pertama di project ini, p50 = 105.865 token
```

CLAUDE.md = **~40% dari prefix setiap giliran**, dibaca ulang 19.902 kali.

| Dipotong | % tagihan project ini |
|---|---:|
| 30% | 4,5% |
| **50%** | **7,4%** |
| 70% | 10,4% |

Plafon **seluruh** read gate v1.6.0 adalah 1,95%. Ini 4x lipatnya, tanpa hook,
tanpa config key, tanpa test baru.

### Apa yang dipotong

Aturan ORC sendiri sudah menyediakan jawabannya. `_shared/read-ladder.md`:

> orchestrator membaca untuk **MENEMUKAN**, mengirim subagent untuk **MEMAHAMI**.

Blok catatan rilis di CLAUDE.md (v0.43.6 sampai v1.6.0, sekitar 30 blok)
adalah isi berbentuk **MEMAHAMI** yang duduk di file berbentuk **MENEMUKAN**.

Tempatnya di `knowledge.md`, yang **sudah** memuat semuanya.

### Bentuk yang diusulkan

CLAUDE.md menyimpan:
- P0 rules
- Layout
- Common commands
- Aturan kritis yang **mengubah keputusan hari ini**
- Satu baris penunjuk per rilis: `v1.5.0 — /orc-test → knowledge.md §4z.28`

CLAUDE.md **tidak** menyimpan:
- narasi kenapa sebuah bug terjadi
- kutipan komentar kode
- daftar hal yang sengaja tidak dibuat
- sejarah rilis lengkap

### Catatan jujur

Angka 7,4% adalah **batas atas**. CLAUDE.md tidak berukuran 170 KB sepanjang
riwayat — dia tumbuh. Hasil nyatanya akan lebih kecil, tapi arahnya pasti.

---

## #3 — Ambil daftar invariant dari `rewriter/gate.go`

ORC sudah punya aturan: *"build log yang terpotong terbaca HIJAU"*
(pengecualian 2 di read gate).

Caveman punya versi yang **lebih lengkap dan sudah diuji**. Daftar yang wajib
selamat kalau sebuah output dipotong:

| Wajib selamat | Cara |
|---|---|
| kata kegagalan | `fail`, `error`, `exception`, `traceback`, `panic`, `fatal`, `warn`, `not found`, `timeout`, `denied`, `refused`, `cannot `, `unable to`, `conflict` |
| hitungan | `5 failed` — **angkanya ikut**, batas kata (`1` tidak boleh dipuaskan `21`) |
| exit code | hanya yang bukan 0 |
| lokasi sumber | `file.ext:12:5`, `Makefile:12`, `file.ts(12,5)`, `File "x", line 12` — **byte per byte** |
| baris kegagalan | utuh, hanya spasi pinggir yang boleh hilang |

**Ke mana:**
- `templates/skills/_shared/live-target.md` — `/orc-test` menangkap output sistem nyata
- pengecualian 2 read gate — perluas dari "build log" jadi daftar di atas
- `templates/hooks/README.md`

Ini murni penambahan kebenaran. Tidak ada kompresi baru yang dibangun.

---

## #4 — Penanda elision yang membawa fakta

Aturan caveman: kalau membuang N unit, penandanya **menyebut fakta yang
dihitung dari unit yang dibuang**, bukan cuma jumlahnya.

```
BURUK : ... 20 baris lagi disembunyikan
BAIK  : ... 20 baris lagi · status: fulfilled×15 shipped×3 processing×2
```

Dan **semua-atau-tidak sama sekali**: kalau nilai berbedanya lebih dari 5,
field itu tidak ditampilkan sama sekali, karena *"daftar sebagian terbaca
seperti daftar lengkap"*.

**Ke mana:** di mana pun ORC memotong sesuatu —
`orc extra` slice, `orc doc parts`, preview prune di panel.

Ini adalah versi lebih tajam dari aturan ORC yang sudah ada:
**"a count is not consent"**.

---

## #5 — `orc doctor` finding: `claude-md-oversized`

Supaya #2 tidak balik gemuk 6 bulan lagi.

```
claude-md-oversized
  CLAUDE.md = 170.494 byte ≈ 42.624 token
  ≈ 21% dari jendela 200k, dibayar setiap giliran dan setiap dispatch
  fix: pindahkan catatan rilis ke knowledge.md
```

- Ambang: perlu diukur, jangan dikarang.
- `FINDING_ROUTE` → panel `maintenance`.
- **Bukan** `--fix`-able. ORC tidak boleh mengedit CLAUDE.md user sendiri.
- Berguna untuk semua user ORC, bukan cuma repo ini.

---

## #6 — Ukur pajak subagent

Contek `packages/subagent-tax/`: server palsu di localhost, jalankan harness
sekali, ukur prefix yang dikirim.

Tapi ORC tidak perlu server palsu — datanya **sudah ada di disk**
(`agent-<id>.jsonl`). Cukup baca.

Angka mesin ini: prefix subagent p50 = **12.585 token**.
Satu dispatch trace writer: **12.171 token prefix untuk 1 token output**.

Ke `orc extra stats` dan `/orc-budget`, supaya perkiraan biaya sebuah rencana
menghitung pajak per dispatch, bukan hanya kerja yang dilakukan.

Ini juga memunculkan pertanyaan desain yang layak diukur terpisah:
**apakah trace writer masih pantas jadi dispatch?**
49 dispatch × ~12k token prefix ≈ 590 ribu token hanya untuk narasi.
Jangan diputuskan sekarang — ukur dulu.

---

## Yang ditolak, ditulis supaya tidak diusulkan lagi

| Ditolak | Alasan |
|---|---|
| Proxy / hook kompresi output Bash | 3,1% sisa. rtk sudah ambil 76,5%. |
| Compressor `code` | 69,7% trafik, tapi membuang isi fungsi = `old_string` rusak (temuan W1) |
| Pixel mode | `engine/pixel/gate.go` sendiri menghitungnya rugi untuk konten ter-cache |
| Skill gaya bicara caveman | menambah 1–1,5 ribu token per giliran; ORC sudah punya STE |
| Config key untuk mematikan salah satu di atas | tidak ada yang dibangun, jadi tidak ada yang perlu dimatikan |
