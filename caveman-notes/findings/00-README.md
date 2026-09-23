# Analisa Caveman untuk ORC

Tanggal: 09-09-2026
Sumber: https://github.com/juliusbrussee/caveman (repo di-clone dan dibaca penuh)
Ukuran: 240 transcript Claude Code di mesin ini, 22.848 giliran main session.

**Ini dokumen proses. Jangan di-commit.** (Aturan CLAUDE.md soal working-process
documents.)

---

## Jawaban singkat

**Tidak. Jangan bikin caveman versi ORC.**

Alasannya bukan pendapat, tapi hasil ukur:

- Hanya **3,1%** output Bash di mesin ini yang masih bisa dipotong.
- **rtk sudah jadi caveman-nya mesin ini** — sudah potong 10,2 juta token (76,5%).
- 69,7% output Bash adalah **kode sumber**. Memotong isi fungsi = executor salah
  `Edit` = file rusak.

**Tapi ada yang lebih besar dan lebih murah:**

| Yang dikerjakan | Hemat | Usaha |
|---|---:|---|
| Potong CLAUDE.md 50% | **7,4%** dari total tagihan repo ini | edit teks saja |
| Read gate v1.6.0 (sudah ada) | maksimal 1,95% | 1 hook + 1 rilis |

Potong CLAUDE.md = 4x lebih besar dari plafon read gate, tanpa kode baru.

**Dan ada satu bug yang lebih penting dari semuanya:** ORC menulis di CLAUDE.md
bahwa Claude Code tidak mencatat token subagent. Itu **sudah tidak benar**.
Lihat `05-bug-token-subagent.md`.

---

## Daftar file

| File | Isi |
|---|---|
| `01-caveman-itu-apa.md` | Caveman itu 3 produk, bukan 1. Cara kerja tiap bagian. |
| `02-hasil-ukur.md` | Semua angka dari mesin ini. |
| `03-kenapa-tidak-bisa.md` | Kenapa port proxy caveman akan gagal. |
| `04-yang-layak-dikerjakan.md` | Daftar kerja, urut dari hasil paling besar. |
| `05-bug-token-subagent.md` | Bug pengukuran di ORC. Baca ini duluan. |

Urutan baca kalau buru-buru: **05 → 04 → 02**.
