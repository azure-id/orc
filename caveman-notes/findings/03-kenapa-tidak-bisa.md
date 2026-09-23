# Kenapa port caveman ke ORC akan gagal

Ini penolakan berdasar ukuran, bukan pendapat.

---

## Yang akan dibangun kalau kita nekat

Caveman versi ORC pasti berbentuk **hook `PostToolUse`**. Mekanismenya nyata
dan didukung Claude Code sejak v2.1.121 (April 2026):

```json
{
  "hookSpecificOutput": {
    "hookEventName": "PostToolUse",
    "updatedToolOutput": "teks pengganti yang dilihat model"
  }
}
```

Hook memotong output Bash sebelum masuk konteks. Persis yang caveman lakukan
lewat proxy. Secara teknis: bisa. Secara hasil: tidak.

---

## Alasan 1 — sisanya cuma 3,1%

Aturan gerbang caveman dijalankan atas semua hasil Bash asli di mesin ini.

```
bisa dipotong: 3,1%
```

Bandingkan dengan ongkosnya: 1 hook baru, 1 kelas compressor per tipe konten,
1 gerbang penerimaan, 1 CCR store untuk pemulihan, config key, doctor finding,
panel, test, dan dokumentasi.

Read gate v1.6.0 sudah ditolak secara ekonomi pada plafon **1,95%** dan tetap
dirilis dalam keadaan **mati**. Ini 3,1% dengan ongkos bangun 4x lipat.

---

## Alasan 2 — 69,7% isinya kode, dan kode tidak boleh dipotong

| Tipe | % trafik Bash | compressor caveman |
|---|---:|---|
| **code** | **69,7%** | buang isi fungsi |
| log | 0,6% | 85–95% hemat |
| json | 0,7% | 70–90% hemat |

Dua compressor unggulan caveman menyentuh **1,3%** trafik di sini.

Yang menyentuh 69,7% adalah compressor `code`, yang cara kerjanya membuang isi
fungsi dan menyisakan import + signature.

**Itu jalur kerusakan file.** Temuan W1 ORC sendiri sudah menuliskannya:
executor harus membaca file **utuh** sebelum `Edit`, karena `old_string` yang
direka ulang adalah bug perusak file.

Jadi bagian terbesar dari trafik justru bagian yang paling terlarang untuk
dikompresi.

---

## Alasan 3 — sudah ada yang mengerjakan

```
rtk 0.43.0 — 10.152 perintah — hemat 10,2 juta token (76,5%)
```

rtk sudah duduk di depan Bash. Pola menangnya sama persis dengan caveman:
`go test` 99,9%, `jest` 95,1% (log), `read` 26%, `grep` 22% (kode).

Angka 3,1% itu **sisa setelah rtk selesai bekerja**.

Membangun compressor kedua di atas stream yang sudah dikompresi = persis baris
merah caveman sendiri:

> `Dashboard HTML alert   +9,9%`
> *"Kasus itu tidak punya transform kompresi, jadi caveman membayar overhead-nya
> sendiri dan tidak memenangkan apa pun."*

---

## Alasan 4 — pixel mode juga rugi

`caveman convert` mengubah skill jadi gambar. Tapi gerbangnya sendiri
(`engine/pixel/gate.go`) menghitung:

```
biaya gambar = tokenGambar × (1,25 + 0,10 × (N-1))
biaya teks   = tokenTeks   × 0,10 × N
```

Semua skill dan CLAUDE.md **masuk cache**. Teks yang sudah di cache dibaca
dengan tarif 0,10x selamanya. Gambar tetap harus bayar 1,25x untuk ditulis.

Untuk payload ORC yang panjang dan selalu di-cache, teks menang.
**Hitungan caveman sendiri yang menolak ini.**

---

## Ringkasan penolakan

| Ide caveman | Untuk ORC | Alasan |
|---|---|---|
| Proxy / hook kompresi output | **TOLAK** | 3,1% sisa, sudah diambil rtk |
| Compressor `code` | **TOLAK** | jalur kerusakan file (temuan W1) |
| Pixel mode | **TOLAK** | gerbang caveman sendiri bilang rugi di konten ter-cache |
| Skill gaya caveman | **TOLAK** | ORC sudah punya STE di `i18n/TERMS.md`, dan skill ini menambah 1–1,5 ribu token per giliran |

---

## Yang jujur harus disebut

Pada disiplin yang membuat caveman bagus — gerbang penerimaan, tangga
keamanan, baris merah yang tetap dipajang, penanda "unknown bukan nol" —
**ORC sudah lebih maju**.

`_shared/extra-dispatch.md`, aturan `--json is not a summary`, dan sembilan
contract token `a lane that ...` adalah versi yang lebih ketat dari apa yang
caveman tegakkan di Go.

Yang caveman punya dan ORC tidak: **lapisan byte di bawah model**.
Dan di mesin ini, lapisan itu **sudah terisi oleh rtk**.
