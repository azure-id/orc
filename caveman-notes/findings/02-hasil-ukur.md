# Hasil ukur di mesin ini

Semua angka dibaca dari `~/.claude/projects/**/*.jsonl`.
240 transcript, 22.848 giliran assistant main session.

**Satu-satunya perkiraan: byte diubah ke token dengan ~4 karakter per token.**
Semua angka lain (jumlah panggilan, jumlah baris, vektor token) dibaca apa
adanya dari catatan.

Skrip probe ada di scratchpad, sekali pakai, tidak di-commit.

---

## 1. Buku besar token

| Jenis | Token |
|---|---:|
| `input` | 115.101 |
| `cache_write` | 58.317.882 |
| `cache_read` | **5.780.327.523** |
| `output` | 20.739.971 |

### Angka paling penting di seluruh dokumen ini

**`cache_read` = 99x `cache_write`.**

Artinya: satu token yang masuk konteks dibayar sekali saat ditulis, lalu
dibaca ulang ~99 kali.

```
harga marginal 1 token yang masuk konteks
  = 1,25 + (99 × 0,10)
  ≈ 11x nilai wajarnya
```

**Kesimpulan: mencegah 1 token masuk konteks nilainya ~9x lebih besar
daripada memperpendek 1 token output.**

Ini adalah dasar ekonomi seluruh tesis caveman. Dan ini juga alasan kenapa
memotong CLAUDE.md jauh lebih besar dari memotong output apa pun.

---

## 2. Ke mana hasil tool pergi

| Tool | panggilan | ~token | % | p50 | p90 | max |
|---|---:|---:|---:|---:|---:|---:|
| **Bash** | 10.666 | **3.785.978** | **73,7%** | 516 | 3.763 | 28.305 |
| Read | 631 | 932.418 | 18,2% | 2.871 | 14.719 | 83.549 |
| Agent | 126 | 125.613 | 2,4% | 1.567 | 7.748 | 35.394 |
| sisanya | — | ~290.000 | 5,7% | | | |

**Bash 4x lebih besar dari Read.** Read gate v1.6.0 dibangun di atas kolom
18,2% itu. Temuan W0 sudah menyinggung ini; sekarang angkanya ada.

### Batas atas seluruh permukaan

Total hasil tool = 5,13 juta token = **8,8% dari `cache_write`**.

Artinya: kompresi sempurna atas **semua** hasil tool yang pernah ada pun
mentok di ~8,8%. Lebih baik dari plafon read gate (1,95%), tapi tetap terbatas.

### Bash dipecah per perintah

| perintah | panggilan | ~token | p50 | p90 |
|---|---:|---:|---:|---:|
| `sed` | 1.743 | 1.678.298 | 2.901 | 7.857 |
| `cd` | 1.743 | 576.625 | 512 | 3.351 |
| `grep` | 1.937 | 459.896 | 631 | 2.149 |
| `cat` | 583 | 275.293 | 235 | 6.683 |
| `node` | 1.106 | 194.611 | 304 | 1.680 |
| `python` | 1.138 | 116.619 | 128 | 1.040 |

---

## 3. Berapa yang sebenarnya masih bisa dipotong

Aturan gerbang caveman dijalankan atas **semua** hasil Bash asli di riwayat ini.
Yang dipertahankan: baris kegagalan, lokasi sumber, hitungan, exit code, 5 baris
pertama, 5 baris terakhir, dan 1 wakil per kelas baris kembar.

```
karakter hasil Bash : 15,15 juta
dipertahankan gerbang: 14,68 juta
BISA DIPOTONG       : 3,1%

hasil ≥ 4.000 karakter (n=977) : bisa dipotong 3,6%
```

**3,1%.**

---

## 4. Kenapa cuma 3,1% — jenis isinya

Payload Bash diklasifikasi ulang pakai heuristik `detect` milik caveman:

| Tipe terdeteksi | % output Bash di sini | target hemat caveman |
|---|---:|---|
| **code** | **69,7%** | 40–70% (buang isi fungsi) |
| text | 24,3% | 50–80% |
| diff | 2,5% | 60–80% |
| search-result | 2,2% | 80–95% |
| **json** | **0,7%** | 70–90% |
| **log** | **0,6%** | 85–95% |

Dua compressor yang bikin caveman terkenal — `log` dan `json` — hanya menyentuh
**1,3%** trafik di sini.

Yang menyentuh 69,7% adalah `code`. Dan membuang isi fungsi dari file yang
sebentar lagi di-`Edit` executor adalah persis jalur kerusakan yang temuan W1
ORC sendiri sudah namai: *"`old_string` yang direka ulang adalah bug perusak
file."*

---

## 5. Kenapa sisanya cuma 3,1% — karena sudah dikerjakan

```
rtk 0.43.0
Total commands : 10.152
Tokens saved   : 10,2 juta (76,5%)

 1. rtk read       1480    6,3 juta   26,1%
 2. rtk go test      10    1,8 juta   99,9%
 3. rtk grep       3869  924,1 ribu   22,4%
 4. rtk jest run    101  169,6 ribu   95,1%
```

**Mesin ini sudah menjalankan caveman. Namanya rtk.**

Dan pola menangnya identik dengan caveman:
`go test` 99,9% dan `jest` 95,1% (log) — `read` 26% dan `grep` 22% (kode).

Angka 3,1% di atas adalah **sisa setelah rtk**. Itu catatan jujurnya, dan itu
juga jawabannya.

---

## 6. Prefix — di sinilah uangnya

### Konteks giliran pertama, sebelum kerja apa pun dimulai

| | p10 | p50 | p90 |
|---|---:|---:|---:|
| semua project | 57.582 | 89.661 | 122.342 |
| **`C:\dev\orc`** | 71.946 | **105.865** | 123.360 |

### CLAUDE.md

```
C:\dev\orc\CLAUDE.md = 170.494 byte ≈ 42.624 token
```

Itu **~40% dari prefix setiap giliran**, dan dibaca ulang di `cache_read`
pada semua 19.902 giliran di project ini.

### Simulasi pemotongan

Terhadap tagihan nyata project ini (593,1 juta unit price-weighted):

| Dipotong | Hemat price-weighted | % tagihan project ini |
|---|---:|---:|
| 30% | 26,5 juta | **4,5%** |
| 50% | 44,1 juta | **7,4%** |
| 70% | 61,7 juta | **10,4%** |

**Catatan jujur:** ini batas atas. CLAUDE.md tumbuh dari rilis ke rilis, jadi
ukurannya tidak 170 KB sepanjang riwayat.

### Perbandingan

| | Hasil |
|---|---:|
| Plafon **seluruh** read gate v1.6.0 | 1,95% |
| Potong CLAUDE.md 50% | **7,4%** |

Potong CLAUDE.md ≈ **4x plafon read gate**, tanpa hook, tanpa kode baru.

---

## 7. Pajak subagent

| model | run | giliran | cache_write | cache_read | ~price-weighted per run |
|---|---:|---:|---:|---:|---:|
| haiku-4-5 | 81 | 1.776 | 4.805.433 | 37.999.066 | **106.239** |
| opus-5 | 23 | 524 | 2.772.785 | 10.603.206 | **166.657** |
| sonnet-4-6 | 9 | 218 | 711.909 | 5.794.096 | 143.480 |
| sonnet-5 | 9 | 143 | 636.691 | 1.758.852 | 90.286 |
| opus-4-7 | 4 | 49 | 246.425 | 689.929 | 78.854 |

Prefix satu subagent: p10 10.246 / p50 **12.585** / p90 19.846 token.

Contoh nyata, satu dispatch ORC:

```json
{"ts":"2026-09-07T17:00:21Z","ver":"2.1.263","model":"claude-haiku-4-5",
 "usage":{"cache_creation_input_tokens":12171,"output_tokens":1}}
```

**12.171 token prefix untuk menghasilkan 1 token output.**

Itu trace writer. Dan trace writer adalah agent yang paling sering ORC kirim
(49 dari dispatch yang tercatat di sini).

Detail lengkap dan implikasinya ada di `05-bug-token-subagent.md`.
