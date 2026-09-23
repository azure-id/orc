# Simulasi pemakaian token — `orc graph`

Ditulis dengan kalimat pendek dan kata sederhana.

> **Semua angka di sini PERKIRAAN.** Belum ada yang diukur. Wave W0 di
> `02-PLAN.md` yang akan mengukur angka aslinya. Angka dalam **token**, bukan
> dolar. Untuk dolar dan persen jatah 5 jam, pakai `orc budget`.

---

## 1. Hal paling penting: token dikirim ULANG setiap giliran

Setiap kali agent jalan satu giliran (turn), **seluruh isi context dikirim lagi**
ke model.

Contoh:

- Agent membaca hasil pencarian **9.000 token** di giliran ke-5.
- Agent masih jalan sampai giliran ke-16.
- Berarti 9.000 token itu dikirim lagi di **11 giliran** berikutnya.
- Total diproses: 9K + (9K × 11) ≈ **108K token**.

Token yang dikirim ulang biasanya kena **cache read**. Harganya lebih murah dari
input baru. **Tapi tetap dihitung.**

**Akibatnya:**

- Kartu graph kecil (1K) yang menggantikan pencarian besar (9K) menghemat
  **jauh lebih dari 8K**, karena yang 9K tidak ikut dikirim ulang.
- Sebaliknya, apa pun yang masuk ke context **orchestrator** (yang hidup
  sepanjang run) jadi mahal, walau kecil.

---

## 2. Asumsi yang dipakai

| Hal | Perkiraan |
|---|---|
| 1 baris kode | ± 10 token |
| 1 panggilan Grep + hasilnya | ± 350 token |
| 1 baca potongan file (range, ± 60 baris) | ± 900 token |
| 1 kartu graph | ± 400–600 token |
| Biaya awal 1 subagent baru (system prompt, tools, file agent, slice) | ± 5.700 token |
| Sisa giliran orchestrator `/orc` setelah preflight | ± 25 giliran |

---

## 3. Bagian mana yang makan token

| Bagian | Token model | Keterangan |
|---|---|---|
| Build graph pertama kali | **0** | Dikerjakan CLI (parser). Model cuma lihat 1 baris ± 40 token. |
| Update karena teman satu tim ubah kode | **0** | Sama. CLI bandingkan hash file lewat `git ls-files -s`. |
| Baris `graph:` di preflight / tutup wave | ± 100–300 per panggilan | Masuk context yang memanggil. |
| Kartu di slice agent | ± 400–600 per kartu, maks 3 | Dikirim ulang tiap giliran agent itu. |
| Agent notes (Sonnet 4.6 medium) | ± 17K–35K input per dispatch | Biaya awal tetap + baca potongan kode. |
| **Penghematan** | lebih sedikit Grep, lebih sedikit baca file, lebih sedikit giliran | Karena eksplorasi yang hilang juga tidak dikirim ulang. |

---

## 4. Simulasi A — `/orc` "tambah kode diskon di checkout"

**Proyek contoh:** API Express + TypeScript, ± 1.800 file.
**Rencana:** 6 task, 3 wave.

- 4 task menyentuh **banyak file** (route → service → repo → SQL).
- 2 task menyentuh **1 file** saja.

### 4.1 Satu executor, task banyak file

| | Graph MATI | Graph NYALA |
|---|---|---|
| Eksplorasi | 5 Grep + 3 baca potongan + 1 baca full file yang tidak diedit ≈ **9,0K** | 2 kartu (1,1K) + 1 Grep + 1 baca potongan ≈ **2,4K** |
| Jumlah giliran | 16 | 12 (riset SuperCoder: ± 22% lebih sedikit) |
| Total input termasuk kirim ulang | 9K + 9K × 10 ≈ **99K** | 1,1K × 12 + 1,25K × 10 ≈ **26K** |

File yang **akan diedit** tetap dibaca full di kedua kondisi. Itu aturan ORC.
Jadi bagian itu tidak dihitung di sini.

### 4.2 Seluruh run (hanya input terkait eksplorasi)

| Peran | MATI | NYALA |
|---|---|---|
| 4 executor task banyak file | 404K | 126K |
| 2 executor task 1 file (kartu cuma jadi beban) | 8K | 12K |
| Planner (`orc graph impact` ganti pencarian) | 108K | 20K |
| Reviewer (impact dari diff) | 0 | 9K |
| Orchestrator (baris graph di context panjang) | 0 | 52K |
| Agent notes, 3 wave (14 + 9 + 5 simbol) | 0 | 76K input / 4K output |
| **Total** | **± 520K** | **± 295K** |

**Hemat ± 225K token** (± 43% dari bagian eksplorasi).

### 4.3 Kalau dilihat dari seluruh run

Satu run `/orc` 6 task memproses jauh lebih banyak dari eksplorasi saja.
Tebakan: **1,5–2 juta token input**. Jadi hematnya untuk seluruh run
kira-kira **10–15%**.

Ini cocok dengan riset SuperCoder: **± 9% token lebih sedikit** dan
**± 22% giliran lebih sedikit**. Tapi di riset itu, **keuntungan terbesarnya
kualitas**: task yang berhasil naik dari **41,9% ke 50,4%**.

### 4.4 Pengaruh setting notes

| `code_graph_notes` | Total NYALA | Hemat dibanding MATI |
|---|---|---|
| `off` | ± 220K | ± 300K |
| `end` (1 dispatch untuk 28 simbol) | ± 270K | ± 250K |
| `wave` (3 dispatch) | ± 295K | ± 225K |

**Kesimpulan:** di dalam **satu run**, notes lebih mahal dari yang dihemat.
Notes baru untung di **run berikutnya**: 1 note (± 40 token) bisa menggantikan
baca potongan kode tetangga (± 900 token), yang juga ikut dikirim ulang.

---

## 5. Kenapa 1 dispatch notes makan 17K–35K

Contoh 1 wave dengan **14 simbol** yang berubah:

```
giliran 1  biaya awal 5,7K                         → input 5,7K
           (agent minta 14 baca potongan sekaligus)
giliran 2  5,7K + 14 potongan × 600 = 14,1K        → input 14,1K
giliran 3  agent tulis 14 notes (JSON)             → input 14,1K, output 1,5K
                                                     total ± 34K input
```

**Biaya awal 5,7K selalu dibayar per dispatch.** Jadi:

| Jumlah simbol | Perkiraan input |
|---|---|
| 1 | ± 18K |
| 5 | ± 23K |
| 14 | ± 34K |
| 40 | ± 60K |

**Batch kecil = pemborosan.** 1 simbol pun sudah bayar ± 18K.

---

## 6. Simulasi B — `/orc-quick`, dua request dalam 1 sesi

### 6.1 Request 1: "ganti `total` jadi `amount` di payload POST /orders"

Menyentuh route, service, repo, dan test = 4 file.

| | MATI | NYALA |
|---|---|---|
| Sesi utama "look" (tinggal di context ± 20 giliran) | 3,2K → ± 67K | 1,1K → ± 23K |
| Agent pilihan kamu | ± 54K | ± 17K |
| Agent notes (6 simbol) | 0 | ± 24K input / 0,8K output |
| **Total** | **± 121K** | **± 64K** (± 40K kalau notes `off`) |

**Hemat ± 57K.** Graph sangat membantu di sini.

### 6.2 Request 2: "ganti pesan log di `src/util/logger.ts`"

Kamu sudah sebut nama filenya. Cuma 1 simbol.

| | MATI | NYALA (desain awal) | NYALA (sesudah 2 perbaikan) |
|---|---|---|---|
| Sesi utama | ± 7K | ± 19K | ± 10–12K |
| Agent | ± 0 tambahan | ± 3K (kartu tidak berguna) | 0 (tidak ada kartu) |
| Agent notes (1 simbol) | 0 | ± 18K | 0 (di bawah minimum, ditunda) |
| **Total** | **± 7K** | **± 40K (+33K lebih boros)** | **± 10–12K (+3–5K)** |

**Kesimpulan:** graph **hemat besar** di perubahan banyak file, tapi **boros**
di edit kecil 1 file. Ini sama dengan temuan riset: untungnya ada di perubahan
**3 file atau lebih**.

---

## 7. Dua perbaikan yang ditemukan dari simulasi ini

Keduanya **sudah dimasukkan** ke `02-PLAN.md` (§6.2, §6.3, §6.4, §7, §8, §11, §12).

### Perbaikan 1 — agent notes kirim hasil langsung ke CLI

**Masalah desain awal:** agent notes mengembalikan ± 2K teks notes ke
orchestrator setiap wave. Context orchestrator hidup sepanjang run. Jadi 2K itu
dikirim ulang ± 25 giliran → **± 100K token tambahan** di 1 run.

**Perbaikan:**

- Agent notes menjalankan sendiri `orc graph notes apply -` (JSON lewat stdin).
- **CLI tetap satu-satunya yang menulis** (aturan S1). CLI yang cek validitas.
- Orchestrator cuma terima **1 baris** (± 60 token):
  `notes: 14 applied · 0 rejected`.

### Perbaikan 2 — jangan kirim agent untuk batch kecil

**Masalah:** 1 simbol sudah makan ± 18K karena biaya awal subagent.

**Perbaikan:**

- Setting baru `code_graph_notes_min`, default **5**.
- Kalau simbol yang menunggu note kurang dari 5 → **tidak ada dispatch**.
- **Tidak ada yang hilang.** Daftar "yang menunggu" dihitung ulang dari hash
  isi fungsi. Jadi simbol itu muncul lagi di batch berikutnya.
- Tambahan: **tidak ada kartu** kalau kamu sudah sebut nama file DAN
  perubahannya cuma di dalam file itu. Kartu di situ tidak menghemat pencarian
  apa pun, cuma dikirim ulang.

---

## 8. Ringkasan satu layar

| Kasus | MATI | NYALA |
|---|---|---|
| `/orc` 6 task, 3 wave (eksplorasi) | ± 520K | ± 295K (`wave`) · ± 270K (`end`) · ± 220K (`off`) |
| `/orc-quick` ubah 4 file | ± 121K | ± 64K (± 40K notes `off`) |
| `/orc-quick` edit 1 file, nama file disebut | ± 7K | ± 10–12K |

- **Build dan update struktur graph: 0 token model.**
- **Seluruh run `/orc`: perkiraan hemat 10–15%.** Keuntungan terbesar: kualitas
  dan lebih sedikit giliran.
- **Notes rugi di 1 run, untung di run berikutnya.** Kalau mau hemat maksimal:
  `code_graph: on` + `code_graph_notes: off`.
