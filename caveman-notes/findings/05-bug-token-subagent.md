# BUG — ORC bilang token subagent tidak tercatat. Sudah tidak benar.

Temuan ini **tidak ada hubungannya dengan caveman**. Ketemu waktu mengukur.
Menurut saya ini yang paling penting dari seluruh analisa.

---

## Yang ORC tulis sekarang

Di `CLAUDE.md`, disebut 3 kali (v1.2.0 dan v1.4.0):

> *"Claude Code records NO token usage for a dispatched subagent (`isSidechain`
> is never set, verified across every transcript on two machines)"*

Akibat dari kalimat itu:

- `orc usage report` mengurutkan baris berdasar **wall time**, bukan token
- setiap baris Claude melaporkan `tokens: null`
- v1.4.0 membangun mekanisme **floor** `tokenCount` dari agent panel, dengan
  label `not-seen`, karena dianggap itu satu-satunya sumber

---

## Yang sebenarnya ada di disk

```
giliran assistant sidechain yang membawa usage : 2.710

  input        60.074
  cache_write   9.173.243
  cache_read   56.845.149
  output        1.301.335

rentang tanggal : 2026-06-13  →  2026-09-07
versi Claude Code: 2.1.170, 2.1.217, 2.1.219, 2.1.239,
                   2.1.241, 2.1.246, 2.1.263
```

Data ini **lengkap 4 jenis token**, sama seperti main session.
Yang terbaru **2 hari lalu**, di Claude Code 2.1.263.

---

## Kenapa terlewat — alasannya struktural, bukan ceroboh

**Datanya ada di file terpisah.**

```
~/.claude/projects/<project>/
  ├─ <session-uuid>.jsonl      <- main session
  └─ agent-<id>.jsonl          <- SATU FILE PER DISPATCH SUBAGENT
```

**126 dari 240 transcript di mesin ini adalah file `agent-*.jsonl`.**

Kalau yang di-scan hanya transcript main session, hasilnya memang nol — persis
seperti yang ORC dokumentasikan. Auditnya benar untuk file yang dia lihat.
Filenya yang tidak semua dilihat.

---

## Bukti — satu dispatch ORC nyata

```json
{
  "ts": "2026-09-07T17:00:21Z",
  "ver": "2.1.263",
  "model": "claude-haiku-4-5-20251001",
  "usage": {
    "input_tokens": 10,
    "cache_creation_input_tokens": 12171,
    "cache_read_input_tokens": 0,
    "output_tokens": 1
  },
  "file": "agent-a77fe7356ca53e093.jsonl"
}
```

Itu `orc-trace-writer-haiku-4-5`.

**12.171 token prefix untuk menghasilkan 1 token output.**

---

## Biaya nyata per run subagent

| model | run | giliran | cache_write | cache_read | ~price-weighted / run |
|---|---:|---:|---:|---:|---:|
| haiku-4-5 | 81 | 1.776 | 4.805.433 | 37.999.066 | **106.239** |
| opus-5 | 23 | 524 | 2.772.785 | 10.603.206 | **166.657** |
| sonnet-4-6 | 9 | 218 | 711.909 | 5.794.096 | 143.480 |
| sonnet-5 | 9 | 143 | 636.691 | 1.758.852 | 90.286 |
| opus-4-7 | 4 | 49 | 246.425 | 689.929 | 78.854 |

Prefix satu subagent: p10 10.246 / **p50 12.585** / p90 19.846 token.

Dispatch yang tercatat di riwayat ini:

```
orc-trace-writer-haiku-4-5      49   <- paling sering
orc-system-analyst-opus-5-high   8
orc-executor-haiku-4-5           5
orc-planner-opus-5-med           4
orc-executor-opus-4-7-high       4
... dan seterusnya
```

---

## Apa artinya

### 1. Dua aturan yang sudah dirilis harus diperbaiki

`CLAUDE.md` v1.2.0 dan v1.4.0. Kalimat "records NO token usage" harus diganti.

Tapi **jangan langsung dibalik jadi "selalu tercatat"**. Yang benar:
- tercatat di `agent-<id>.jsonl`, **bukan** di transcript main session
- terlihat sejak setidaknya 2.1.170
- harus diverifikasi di mesin kedua sebelum aturannya diubah

### 2. `orc usage report` bisa berhenti bohong sopan

Sekarang: `tokens: null` + alasan, diurut wall time.
Bisa jadi: vektor 4 jenis yang nyata, diurut biaya.

Aturan ORC sendiri: **"unknown bukan nol"**. Sekarang ada kesempatan naik satu
tingkat lagi: **"unknown padahal terukur"** juga bentuk ketidakjujuran.

### 3. `/orc-budget` bisa memakai angka nyata

Formula facet→score yang dicerminkan di `bin/cli.js` sekarang meramal biaya
dispatch tanpa data. Sekarang ada 126 run nyata untuk kalibrasi.

### 4. Floor `tokenCount` v1.4.0 turun jadi cadangan

Mekanisme agent panel tetap berguna (dia bisa lihat run yang sedang jalan),
tapi dia bukan lagi satu-satunya bacaan. Transcript lebih lengkap dan tidak
punya masalah "agent selesai di antara dua render".

### 5. Pertanyaan desain baru — jangan dijawab sekarang

`orc-trace-writer` adalah agent yang paling sering ORC kirim.
49 dispatch × ~12k token prefix ≈ **590 ribu token hanya untuk narasi**.

Aturan v0.32.0 bilang narasi harus **di-dispatch, bukan diingat**, dan alasan
itu masih benar. Tapi harganya sekarang bisa diukur.

**Ukur dulu di beberapa mesin. Jangan diputuskan dari satu riwayat.**

---

## Langkah berikutnya

1. Jalankan probe yang sama di mesin kedua.
2. Kalau ketemu juga → perbaiki kalimat di `CLAUDE.md` dan `knowledge.md`.
3. Tambahkan pembaca `agent-*.jsonl` ke `orc usage report`.
4. Kalibrasi ulang `/orc-budget` dengan 126 run nyata.

**Saya tidak mengubah apa pun. Ini laporan.**
