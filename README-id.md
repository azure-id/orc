<div align="center">

# 🐋 ORC

**Kumpulan skill orkestrator untuk [Claude Code](https://claude.com/claude-code).**

*Terima permintaan → pahami → rencanakan → beri nilai → kerjakan paralel → periksa → uji → kirim.*

![npm](https://img.shields.io/npm/v/%40azure-id%2Forc?style=for-the-badge&color=cb3837&logo=npm)
![Version](https://img.shields.io/badge/version-0.56.0-blue.svg?style=for-the-badge)
![License](https://img.shields.io/badge/license-MIT-green.svg?style=for-the-badge)
![Node](https://img.shields.io/badge/node-%3E%3D18-brightgreen.svg?style=for-the-badge)
![Claude Code](https://img.shields.io/badge/Claude_Code-Skills-purple.svg?style=for-the-badge)
![Dependencies](https://img.shields.io/badge/dependencies-zero-lightgrey.svg?style=for-the-badge)

**Versi terbaru: v0.56.0** · diperbarui 27-08-2026 · [daftar perubahan lengkap](CHANGELOG.md)

**Ada di npm: [`@azure-id/orc`](https://www.npmjs.com/package/@azure-id/orc)** — `npm i -g @azure-id/orc`

**🇬🇧 [Read this in English](README.md)**

</div>

---

> **Tentang terjemahan ini.** Halaman ini memakai bahasa yang sederhana supaya
> mudah dipahami. Semua **perintah, nama berkas, nama model, dan kata status**
> ditulis apa adanya dalam bahasa Inggris — itu bukan kata biasa, itu nama yang
> harus Anda ketik persis seperti aslinya.
>
> Kalau ada bagian yang terasa berbeda dengan versi Inggris, **[README.md](README.md)
> yang berlaku**.

---

> [!CAUTION]
> **Naik versi dari sebelum v0.56.0? Lakukan ini sekali saja.**
>
> Nama paket pindah dari `orc` (tanpa scope) menjadi **`@azure-id/orc`**.
> Keduanya memakai nama perintah yang sama, yaitu `orc`. npm tidak mau
> memberikan perintah itu kepada paket baru selama paket lama masih
> memegangnya - jadi **semua** cara pasang gagal dengan pesan yang sama, dan
> `orc upgrade` tidak bisa memperbaiki dirinya sendiri:
>
> ```text
> npm error code EEXIST
> npm error File exists: C:\Users\anda\AppData\Roaming\npm\orc
> ```
>
> Jalankan tiga baris ini sekali saja. Isi folder `.claude/` Anda tidak
> disentuh, dan `orc.config.yaml` Anda tetap aman:
>
> ```bash
> npm uninstall -g orc          # lepaskan perintah `orc` dari paket lama
> npm i -g @azure-id/orc        # pasang paket yang sekarang
> orc update                    # pasang ulang ke proyek ini (pakai --global untuk ~/.claude)
> ```
>
> **Mulai v0.56.0, `orc upgrade` mengurus ini untuk Anda** - paket lama dihapus
> lebih dulu, lalu paket baru dipasang, dan ORC memberi tahu Anda saat
> melakukannya. `orc doctor` juga menyebutkan nama paket lama kalau masih ada.
>
> **Jangan** memakai `npm i -g -f`. `--force` menimpa berkas perintah dan
> membiarkan paket lama tetap terpasang di bawahnya - tidak memiliki apa pun,
> dan tidak pernah diperbarui lagi.

---

## Apa itu ORC?

Anda memberi ORC sebuah permintaan — bisa satu kalimat, bisa sebuah dokumen
kebutuhan. ORC akan:

1. mencari tahu apa sebenarnya maksud Anda,
2. membuat rencana kerja,
3. mengirim setiap tugas ke **model paling murah yang masih sanggup mengerjakannya**,
4. mengerjakan tugas-tugas yang tidak saling bentrok **secara bersamaan**,
5. memeriksa hasilnya,
6. mengujinya terhadap definisi "selesai" yang sudah Anda setujui,
7. lalu mengirimkannya.

ORC menyimpan catatan kerjanya ke disk sambil jalan. Jadi pekerjaan panjang tetap
selamat kalau Anda berhenti di tengah, kalau kuota token habis, atau kalau Anda
membuka sesi obrolan yang benar-benar baru.

**ORC bukan program yang berjalan sendiri.** ORC adalah kumpulan berkas markdown
berisi **skill**, **perintah garis miring** (`/perintah`), dan **definisi
subagen** yang dibaca dan diikuti oleh Claude Code. Paket npm ini — yang tidak
punya satu pun dependensi — hanya menyalin berkas-berkas itu ke folder `.claude/`
Anda.

```text
                       ┌──────── Anda yang menentukan cakupan + persetujuan ────────┐
  permintaan / dokumen ──▶ terima ─▶ pahami ─▶ rencana ─▶ nilai ─▶ ⇉ gelombang paralel ⇉ ─▶ periksa ─▶ uji ─▶ kirim
                                     (berdasar kode)      (per tugas)   (model termurah yang sanggup)   (disimpan ke disk)
```

---

## 👀 Lihat dulu sebelum Anda pakai

Setiap lane ditulis lengkap sebagai **mock run** — contoh jalannya: apa yang Anda
ketik, apa yang ORC balas, dan berkas apa yang muncul di disk. Tidak ada yang
benar-benar dijalankan untuk membuatnya. Contoh-contoh itu ada supaya Anda tidak
perlu membakar token hanya untuk tahu sebuah perintah melakukan apa.

### **▶ [Mulai di sini: `mock-run/INDEX.md`](mock-run/INDEX.md)**

Bisa juga dibaca tanpa meninggalkan komputer Anda:

```bash
orc mock-run list           # semua contoh, urut dari yang paling awal dibaca
orc mock-run show orc-pact  # baca satu
orc ui                      # ▸ Mocked Skill Use — contoh yang sama, bisa dicari
```

---

## Kenapa dibuat seperti ini?

Satu agen yang diberi pekerjaan nyata selalu gagal dengan cara yang sama: ia
diam-diam memilih satu tafsiran dari permintaan Anda, memakai model termahal
untuk semuanya, lupa keputusan begitu konteksnya dipadatkan, bilang "selesai"
terhadap definisi yang tidak pernah ditulis siapa pun, mengutip kode yang tidak
ada, dan tidak meninggalkan apa pun untuk diperiksa.

Itu semua **masalah proses** — persis masalah yang di tim manusia diselesaikan
dengan pembagian peran, review, dan kesepakatan tertulis. ORC menuliskan
kedisiplinan itu sebagai skill:

- **Mengatur dan mengerjakan adalah dua pekerjaan berbeda.** Sang orkestrator
  tidak pernah menulis kode. Bahkan perubahan satu baris pun dikirim ke subagen,
  supaya konteks orkestrator tetap ringan sepanjang pekerjaan.
- **Setiap tugas diberi nilai, dan nilai itu yang memilih model.** Anda melihat
  tabelnya sebelum apa pun dimulai, dan setiap agen punya nama serta model yang
  dikunci — jadi model apa yang benar-benar dipakai adalah fakta yang bisa Anda
  periksa.
- **"Selesai" ditulis sebelum pekerjaan dimulai.** Tahap penerimaan menghasilkan
  spesifikasi yang Anda setujui, dan definisi "selesai" di dalamnya jadi bahan
  pengujian terakhir.
- **Tidak ada yang dipercaya begitu saja, semuanya harus dibuktikan.** Kutipan
  `berkas:baris`, keluaran build apa adanya, temuan yang menunjuk baris nyata —
  dan orkestrator memeriksa sampel dari bukti itu, jadi kutipan karangan langsung
  ditolak, bukan ikut masuk ke tugas berikutnya.
- **Disk lebih dipercaya daripada ingatan.** ORC rajin menyimpan titik simpan,
  jadi setiap jeda jadi titik lanjut yang bersih — termasuk di sesi baru.
- **Ketelitian bisa diatur.** Tulang punggung yang sama bisa jalan sebagai
  `/orc-mini` (satu subagen), `/orc` (fitur sungguhan), dan `/orc-ultra`
  (dengan penasihat dan gerbang penilaian).
- **Ia belajar.** Pola kode membuat agen menulis mirip gaya kode Anda, wiki
  membuat setiap rencana berikutnya lebih tajam, dan catatan jejak dibaca oleh
  `/orc-retro` yang menyetel ulang penilaiannya dari kerja nyata.

---

## Cara mulai

ORC ada di npm dengan nama **[`@azure-id/orc`](https://www.npmjs.com/package/@azure-id/orc)**.

```bash
npm i -g @azure-id/orc          # pasang
npm i -g @azure-id/orc@latest   # perbarui ke rilis terbaru
```

<details>
<summary>Atau pasang langsung dari GitHub</summary>

<br>

```bash
npm i -g https://github.com/azure-id/orc/archive/refs/heads/main.tar.gz
```

</details>

Lalu, di dalam sebuah proyek:

```bash
orc init            # pasang ke ./.claude   (proyek ini saja)
orc init --global   # pasang ke ~/.claude   (semua proyek)
orc onboarding      # panduan lengkap langsung di terminal — tanpa buka GitHub
orc config          # lihat atau ubah pengaturan (nol token model)
orc ui              # panel kendali lokal
orc --help          # semua perintah
```

Setelah dipasang:

1. Tempelkan templat PR tim Anda ke `skills/orc/subskills/orc-pr/pr.md`.
2. Tambahkan `.claude/orc/run/` ke `.gitignore` proyek Anda.
3. Jalankan **`/agents`** untuk memastikan Claude Code Anda menerima id model
   milik para agen.
4. **Jalankan sesi utama Anda di Opus 5.** Sebuah subagen tidak akan pernah bisa
   memakai model yang lebih baik daripada sesi Anda. Ini penyebab paling sering
   dari keluhan "kok modelnya salah" — lihat
   [pemilihan model](guides/model-selection.md).
5. Kalau sebuah `/perintah` tidak muncul, mungkin Claude Code Anda membaca
   perintah dari folder lain — pindahkan berkas di `commands/` ke sana.

<details>
<summary><b>Tetap memakai versi terbaru</b></summary>

<br>

`orc update` menyalin ulang berkas yang **sudah ada** di paket ini. Perintah itu
tidak menyentuh internet sama sekali. **`orc upgrade` adalah yang menarik versi
baru**: ia mengambil paket terbaru dulu, lalu memasangnya. Berkas
`.claude/orc.config.yaml` Anda selamat di kedua perintah itu.

```bash
orc version                              # versi Anda, dan apakah ada yang lebih baru
orc changelog                            # apa yang akan Anda DAPAT kalau upgrade
orc upgrade                              # ambil yang terbaru, lalu perbarui proyek ini
orc upgrade --global                     # sama, tapi untuk ~/.claude
orc upgrade --from @azure-id/orc         # dari npm, disebut jelas
orc upgrade --from github:azure-id/orc   # dari fork, atau spesifikasi npm apa pun
```

Atau perbarui paketnya sendiri lalu pasang ulang:

```bash
npm i -g @azure-id/orc@latest
orc update
```

Pemeriksaan versi dilakukan lewat HTTPS, hasilnya disimpan 24 jam, dan gagal
diam-diam kalau Anda sedang offline. Matikan dengan `ORC_NO_UPDATE_CHECK=1`.

Anda tidak perlu menjalankan perintah untuk tahu ada versi baru: pemberitahuan
yang sama muncul di dalam Claude Code lewat hook milik ORC, dengan **nol token
model** — hook itu skrip yang dijalankan Claude Code, bukan giliran model.

Kalau pemasangan dari GitHub gagal (sering terjadi di **NVM**), `orc upgrade`
akan mencoba ulang sendiri dengan berkas tarball biasa.

</details>

> **"ORC tidak melihat wiki saya"?** Jalankan **`orc wiki sync`**, bukan
> pemindaian baru. Dokumen tanpa manifest itu *belum terdaftar*, bukan hilang —
> ini biasa terjadi kalau pemindaian berhenti di salah satu jeda `/orc-wiki`.
> Sync membangun ulang daftarnya dari dokumen yang sudah Anda punya, gratis.

> **"Sebenarnya ORC tahu apa tentang proyek saya?"** `orc wiki docs` menampilkan
> semua dokumen yang terdaftar, `orc wiki coverage` memberi tahu berapa banyak
> kode Anda yang sudah pernah ditulis di dokumen, dan `orc pattern show <lang>`
> mencetak kebiasaan kode yang diberikan ke setiap agen penulis kode di sini.
> Semuanya gratis dan hanya membaca —
> **[`guides/knowledge-reads.md`](guides/knowledge-reads.md)**.

---
## Hook di terminal

ORC punya hook terminal supaya Anda bisa melihat: persentase jendela konteks,
pemakaian 5 jam, pemakaian mingguan, dan beberapa hal lain.

<img width="725" height="96" alt="image" src="https://github.com/user-attachments/assets/6a649c87-81ea-4fd9-9d0b-6bb4b97fe9cd" />

<br>

---

## Lane yang tersedia

> [!TIP]
> Lane ini menyambung secara alami: **`/orc-brainstorm` → `/orc-grill` →
> `/orc-analyze` → `/orc-plan` → `/orc-route` → `/orc`**. Anda boleh mulai dari
> mana saja.

### Membuat sesuatu

| Perintah | Kegunaannya | Contoh jalannya |
|---|---|---|
| **`/orc`** | Alur penuh: terima → rencana → gelombang paralel bernilai → periksa → uji → kirim. Rajin menyimpan titik simpan; bisa dilanjutkan di sesi baru. | [lihat](mock-run/orc.md) |
| **`/orc-ultra`** | Sama, ditambah penasihat Opus 5 **xhigh** dan tiga gerbang penilaian. Analisis dalam, pola kode, tes, dan keamanan dipaksa menyala. Memang mahal. | [lihat](mock-run/orc-ultra.md) |
| **`/orc-mini`** | Satu agen Sonnet 5, satu pemeriksaan build + tes, lalu kirim. Melewati review penuh dan pengujian. Bisa pindah ke alur penuh di tengah jalan kalau diminta. | [lihat](templates/skills/orc-mini/examples/mini-run-mock.md) |
| **`/orc-fast`** | Lane tercepat. Butuh wiki yang masih segar **dan** pola kode yang sudah tersimpan; kalau ada, ia melewati tahap analis dan perencana sepenuhnya. Kalau salah satu syarat tidak ada, ia mundur ke `/orc-mini` — obrolan tidak pernah berhenti. | [lihat](mock-run/orc-fast.md) |
| **`/orc-quick`** | Minta apa saja: perbaikan kecil, pertanyaan, mencari bug, menaikkan versi dependensi, komentar PR. Lihat → tanya sekali → kerjakan. **Selalu bertanya agen mana yang mau dipakai**, dan tidak ada pengaturan yang bisa mengubah itu. | [lihat](mock-run/orc-quick.md) |
| **`/orc-diy`** | Lane racikan Anda sendiri, disusun di terminal dengan `orc diy` lalu dikompilasi. Kalau belum disetel atau sudah basi, ia menolak jalan dan menawarkan `/orc` biasa. | [lihat](mock-run/orc-diy.md) |

### Memikirkan apa yang mau dibuat

| Perintah | Kegunaannya | Contoh jalannya |
|---|---|---|
| **`/orc-brainstorm`** | Idenya belum ada. Ia membuat banyak calon ide memakai beberapa sudut pandang, **tanpa mengkritik apa pun saat masih mengumpulkan**, mengelompokkannya jadi beberapa arah nyata, menguji setiap arah, lalu merekomendasikan satu dan **menunggu — ia tidak pernah memilih untuk Anda**. Setiap daftar pilihan selalu diakhiri satu slot untuk ide Anda sendiri. | [lihat](mock-run/orc-brainstorm.md) |
| **`/orc-grill`** | Idenya sudah ada satu, tapi masih kabur. Ia bertanya beberapa ronde, **mencari faktanya sendiri** alih-alih menyuruh Anda menghafal isi kode Anda sendiri, dan tidak pernah menjawab pertanyaannya sendiri. Selesai kalau *Anda* bilang idenya sudah pas. | [lihat](mock-run/orc-grill.md) |
| **`/orc-analyze`** | Dokumen atau permintaan → spesifikasi yang jelas batasnya dan berpijak pada kode. Setiap klaim membawa bukti `berkas:baris`, atau berubah jadi pertanyaan. Mode dalam menambah beberapa pemeriksa paralel. | [lihat](templates/skills/orc-analyze/examples/analyze-mock.md) |
| **`/orc-plan`** | Permintaan atau spesifikasi → rencana tugas sungguhan: berkas nyata, urutan ketergantungan, sifat tiap tugas, dan keputusan tes per tugas. | [lihat](mock-run/orc-plan.md) |
| **`/orc-doc`** | Menulis dokumen panjang — PRD, TSD, kesepakatan antar tim, laporan status, atau runbook — sebagai Markdown yang bisa diimpor rapi ke Notion, Obsidian, Google Docs, Coda, Craft, dan GitHub. **ORC tidak pernah membaca isi dokumennya**: tiap bagian jadi berkasnya sendiri di `sections/`, tiap penulis memegang tepat satu berkas, tiap pemeriksa membaca satu potongan, dan `document.md` hanyalah hasil rakitan yang dibangun ulang gratis. Setiap gelombang adalah titik berhenti yang aman, dan berbulan-bulan kemudian bisa dilanjutkan tanpa Anda menjelaskan ulang apa pun. | [lihat](mock-run/orc-doc.md) |
| **`/orc-route`** | Rencananya sudah ada — lane mana yang sebaiknya mengerjakan? Ia menyebut satu lane, lalu pilihan lain beserta apa yang Anda korbankan, dan lane mana yang tidak mungkin beserta syarat yang menghalanginya. **Ia menolak memilih lane hanya dari satu kalimat**, karena itu sama saja menebak. | [lihat](mock-run/orc-route.md) |
| **`/orc-explain`** | "Tunggu, tadi apa?" Ia mengulang pesan terakhir: intinya dulu, lalu latar belakang yang tadi dianggap sudah Anda tahu, lalu semua istilah khas ORC dijelaskan dengan kata-kata proyek Anda sendiri. | [lihat](mock-run/orc-explain.md) |
| **`/orc-poly`** | Satu perubahan yang menyentuh dua repo atau lebih, tanpa jadi melenceng. Kode repo tetangga hanya dibaca; ia membekukan batas bersama jadi sebuah kontrak lalu menulis satu rencana per repo. Ia tidak pernah membangun apa pun. | [lihat](templates/skills/orc-poly/examples/poly-run-mock.md) |

### Mengajari ORC tentang proyek Anda

| Perintah | Kegunaannya | Contoh jalannya |
|---|---|---|
| **`/orc-wiki`** | Memindai kode Anda jadi `wiki/` yang menetap, tiap klaim menunjuk berkas nyata, lalu mengarahkan `CLAUDE.md` ke sana. Kesegarannya dihitung saat dibaca, tidak pernah disimpan. Mahal dan harus Anda minta — ia selalu memperingatkan dulu. | [lihat](templates/skills/orc-wiki/examples/wiki-run-mock.md) |
| **`/orc-pattern`** | Mempelajari kebiasaan kode Anda per bahasa, supaya agen menulis kode yang mirip gaya kode Anda. Kebiasaan Anda yang menang; aturan wajib soal keamanan dan kebenaran tetap dibawa. | [lihat](mock-run/orc-pattern.md) |
| **`/orc-learn`** | Dokumen pengenalan untuk manusia, satu fitur sekali jalan, menunjuk `berkas:baris`. Tersimpan lokal dan diabaikan git. | [lihat](templates/skills/orc-learn/examples/learn-run-mock.md) |
| **`/orc-claude`** | Membuat atau menyegarkan `CLAUDE.md` repo ini dari fakta yang sudah diperiksa. Tanpa pertanyaan; tulisan Anda sendiri tidak pernah dipotong. | [lihat](templates/skills/orc-claude/examples/claude-run-mock.md) |
| **`/orc-export`** | Merangkum wiki, pola kode, `PACT.md`, dan kartu batas jadi satu `AGENTS.md` yang bisa dibawa ke mana-mana — diturunkan, bersidik jari, bisa diperiksa dengan `--check`. Supaya ORC tidak jadi jebakan. | [lihat](mock-run/orc-export.md) |

### Memeriksa apa yang sudah terjadi

| Perintah | Kegunaannya | Contoh jalannya |
|---|---|---|
| **`/orc-challenge`** | Menilai sesuatu yang **sudah jadi** — TSD, PRD, ADR, kontrak API, README, satu modul kode — terhadap tujuan yang **Anda** nyatakan, lalu **berhenti dan menyuruh Anda memperbaikinya di sesi lain**. ORC menilai, Anda memperbaiki, ORC menilai lagi: **ia tidak pernah memperbaiki apa yang ia nilai**, karena sesi yang baru saja menulis perbaikan pasti memberi nilai bagus pada pekerjaannya sendiri. **Dan ia tidak pernah menebak arti "bagus" di sini.** | [lihat](mock-run/orc-challenge.md) |
| **`/orc-pact`** | Janji-janji yang dipegang proyek Anda, dan mana yang sekarang diragukan. Empat status, semuanya **dihitung saat dibaca**: HOLDING · DRIFTED · **UNCHECKABLE** (status jujur — bukan kegagalan) · BROKEN. Ia tidak pernah mengarang janji dan tidak pernah mencabut janji untuk Anda. | [lihat](mock-run/orc-pact.md) |
| **`/orc-boundary`** | Apa yang **sebaiknya tidak** dicoba ORC di sini, dan apa persisnya yang akan mengubah itu. EXECUTE · ESCALATE · REFUSE, per area. **REFUSE selalu menyebutkan apa yang akan membuatnya jadi boleh.** Ia hanya membatasi ORC sendiri, tidak pernah membatasi perintah Anda. | [lihat](mock-run/orc-boundary.md) |
| **`/orc-verify`** | Menguji hanya perubahan yang belum di-commit: build, tes, kewajaran diff, dan temuan pada tangga P0–P3. Hanya membaca. | [lihat](templates/skills/orc-verify/examples/verify-mock.md) |
| **`/orc-aftermath`** | Apakah yang kita kirim kemarin bertahan? Dinilai dari masa depan repo itu sendiri: berkas yang cepat ditulis ulang, commit yang dibatalkan, tes yang dihapus, janji yang patah. **Perubahan berulang itu sinyal, bukan vonis**, dan ia tidak pernah menyebut nama orang. | [lihat](mock-run/orc-aftermath.md) |
| **`/orc-budget`** | Berapa biaya sebuah pekerjaan, dalam satuan yang benar-benar ditagihkan ke Anda. Sebuah **vektor token** — input baru, tulis cache, baca cache, output; tidak pernah dicampur — ditampilkan empat cara: token, dolar, persen dari jendela 5 jam Anda, dan risiko jendela konteks. Butuh rencana, bukan satu kalimat. | [lihat](mock-run/orc-budget.md) |
| **`/orc-retro`** | Mengolah catatan jejak jadi laporan kalibrasi lalu mengirimkannya ke hulu sebagai PR. | [lihat](templates/skills/orc-retro/examples/retro-mock.md) |

### Mengirim dan menyerahkan

| Perintah | Kegunaannya | Contoh jalannya |
|---|---|---|
| **`/orc-pr-setup`** | Menentukan di mana perubahan besar dipotong jadi beberapa pull request bertumpuk: lapisan berurutan, masing-masing dengan tujuan, daftar berkas, dan perkiraan biaya. Ia berhenti dan bertanya di setiap sambungan yang meragukan, dan tidak pernah menyentuh git. | [lihat](mock-run/orc-pr-setup.md) |
| **`/orc-pr-driver`** | Menjalankan rencana itu: satu branch per lapisan, **pemeriksaan hijau wajib di dasar tiap lapisan**, `gh stack submit`, lalu susun ulang dan merge dari bawah ke atas. | [lihat](mock-run/orc-pr-setup.md) |
| **`/orc-handoff`** | Untuk orang yang tidak membaca kode. Nilainya ditentukan oleh **ada atau tidaknya pemeriksaan murah**, bukan oleh jenis berkasnya. Ia menampilkan perintah pembatalan *sebelum* menulis, dan tidak pernah menyentuh berkas merah. | [lihat](mock-run/orc-handoff.md) |

---

## Dokumen yang benar-benar bisa dipindahkan

`/orc-doc` menulis dokumen panjang — dan Markdown dipilih justru karena berkas
Markdown bisa dibawa ke mana-mana:

| Tujuan | Bisa impor `.md`? |
|---|---|
| Notion · Obsidian · Google Docs · Coda · Craft · Apple Notes · GitHub | **langsung bisa** |
| Docusaurus · Hugo · Jekyll · MkDocs | bisa — dan justru *butuh* front matter YAML |
| Confluence | tidak langsung. Siapkan aplikasi importir dari marketplace |
| Microsoft OneNote | **tidak bisa**. Ubah dulu ke Word atau PDF |

Tabel itu bukan hiasan: `orc doc lint --target` benar-benar menegakkan batas
nyata dari tempat tujuan dokumen Anda. Notion hanya punya tiga tingkat judul,
jadi H4 di sana adalah **error**. Paragraf yang dipotong keras per baris adalah
error di mana pun, karena potongan di kolom 80 akan jadi ganti baris sungguhan di
dalam paragraf Notion.

Ada lima templat dasar — `prd` · `tsd` · `collaboration` · `report` · `workflow` —
masing-masing sebagai lantai, bukan kandang. `orc doc templates` mencetaknya;
Anda juga boleh membawa templat sendiri dan judul-judulnya akan jadi kerangka.

**Penjelasan lengkap: [`guides/documents.md`](guides/documents.md).**

---

## `orc ui` — panel kendali

Halaman web lokal untuk **semua bagian ORC yang bukan ai**. Satu batas yang
menentukan segalanya: **ia tidak pernah menjalankan lane, tidak pernah memanggil
`claude`, dan tidak pernah memanggil API model.** Semua yang ditampilkan atau
ditulisnya berasal dari keluaran CLI yang pasti.

<img width="1870" height="1269" alt="image" src="https://github.com/user-attachments/assets/207fe821-9aa6-430e-bdcc-968340cc687f" />

```bash
orc ui                 # jalan di 127.0.0.1:9921 dan membuka browser
orc ui --port 9930     # port yang Anda sebut sendiri tidak akan pindah — bentrok berarti error
orc ui --no-open       # cetak URL-nya saja
orc ui --idle 0        # matikan mati-otomatis saat menganggur (bawaan: 30 menit)
orc ui --fixtures      # data contoh, tidak perlu proyek sama sekali
orc ui --stop          # matikan server proyek ini
```

| Panel | Menampilkan | Bisa mengubah |
|---|---|---|
| Overview | versi, `orc doctor`, kesegaran wiki, apa yang sedang menunggu — plus **Worth doing**, satu daftar semua hal yang butuh keputusan Anda | — |
| Settings | semua kunci pengaturan, dikelompokkan, masing-masing dengan kontrolnya sendiri | perubahan disiapkan dulu, lalu diterapkan bersama |
| Runs | riwayat pekerjaan; satu baris terbuka di tempat berisi ringkasan keadaan, teks untuk melanjutkan, titik simpan, dan ekor catatan jejak | — |
| **Knowledge** | **lima tab**: kesegaran wiki DAN **isinya** (setiap dokumen, apa yang dicakupnya, seberapa sering dibaca), cakupan terhadap berkas terlacak Anda, pola kode beserta pertentangan yang ditandai, ingatan perbaikan dengan pemangkasan yang **ditinjau dulu baru diterapkan**, dan tampilan repo tetangga yang hanya bisa dibaca | `wiki sync`, `gotcha prune` |
| Stats | pemakaian lane dan agen, penurunan model, serta tab **Cost** yang batangnya menjaga "baca cache" tetap terlihat terpisah | — |
| Flow | alur DIY yang sudah dikompilasi, gerbangnya, dan urutan semua fasenya | `diy set`, `diy compile`, preset |
| Crosslink | **Design** (batas antar repo sebagai gambar) dan **Settings** (kesegaran tiap tetangga) | `crosslink add` / `remove` |
| Promises · Boundary · Self-serve | buku janji, kartu batas, dan permukaan yang boleh diubah orang non-teknis | `pact check`, `pact sync`, `handoff set` |
| **Docs** | setiap dokumen `/orc-doc` sebagai **pita** — satu blok per bagian, lebarnya sesuai panjangnya dan warnanya sesuai statusnya — plus berkas tiap bagian, jalur gelombang, kartu kesehatan lint, dan pratinjau gelombang | `doc compile` · `doc migrate` |
| **Mocked Skill Use** | semua contoh jalannya yang ikut dikirim bersama ORC, dikelompokkan dan bisa dicari, dengan panel baca | — |
| Learn | panduan `orc onboarding`, satu bagian sekali baca | — |
| Experiment | setiap lane dengan tombol salin; membuka sesi Claude di terminal | — |
| Maintenance | `update`, `update --prune`, `doctor --fix`, `upgrade` | tinjau dulu, baru terapkan |

- **Panel ini *adalah* CLI.** Ia membaca `orc <perintah> --json` dan menjalankan
  perintah asli untuk setiap penulisan, jadi ia tidak mungkin melenceng dari
  CLI — ia tidak menyimpan salinan kedua dari apa pun.
- **Tindakan gratis dapat tombol. Tindakan berbayar dapat perintah untuk disalin.**
- **Tidak ada yang berjalan otomatis**, dan pemangkasan selalu menyebut **setiap**
  berkas. Sebuah angka bukan berarti persetujuan.
- **Diperlakukan sebagai permukaan tulis**: hanya loopback, token baru tiap kali
  dijalankan, pemeriksaan Host untuk mencegah DNS rebinding, tanpa CORS, dan
  perubahan hanya lewat POST.
- **Hanya untuk proyek ini, tidak ada pengaturan `--global`.** Kalau ada
  pemasangan global yang bisa mengalahkan pemasangan proyek, setiap halaman
  memasang spanduk peringatan. Ia hanya melaporkannya; ia tidak pernah menyunting
  pengaturan global.
- **Bahasa Inggris dan Indonesia.** Yang diterjemahkan hanya kalimat milik panel
  itu sendiri — kunci pengaturan, id model, jalur berkas, perintah, dan pesan
  doctor dicetak persis seperti tulisan CLI, karena kunci pengaturan yang
  diterjemahkan adalah kunci yang tidak ada.

Nol dependensi, tanpa langkah build: `node:http`, JavaScript biasa, dan CSS yang
ditulis tangan.

---

## Bagaimana modelnya dipilih

Setiap tugas diberi nilai 0–100 dengan **hitungan, bukan perasaan**: perencana
melaporkan beberapa sifat tugas (luasnya, kebaruannya, kerumitan logikanya,
permukaan tes, risiko yang dikutip, ketidakpastian) dan satu rumus tetap yang
dipublikasikan mengubahnya jadi angka. Risiko yang dikutip memaksa nilai minimal
70. Nilai itu dipetakan lewat tabel yang dipublikasikan ke **agen bernama dengan
model terkunci** — jadi apa yang benar-benar berjalan bisa diperiksa, bukan
sekadar diminta lewat kalimat.

> **Aturan yang paling sering membuat orang bingung:** model sebuah subagen tidak
> akan pernah lebih tinggi daripada model sesi utama Anda. Jalankan sesi Anda di
> Opus 5.

**Penjelasan lengkap — pita nilainya, `opus5_only`, dan penjaga tingkat yang
dipasang `orc init`: [guides/model-selection.md](guides/model-selection.md).**

---

## Pengaturan

Pengaturan diubah lewat **CLI `orc config`** — masukan dan keluaran terminal yang
pasti, jadi biayanya **nol token model**.

```bash
orc config              # menu interaktif
orc config list         # pengaturan yang sedang berlaku
orc config recommend    # baca repo ini, sarankan SATU profil, beserta alasannya
orc config profile paranoid
```

Perubahan Anda tersimpan di `.claude/orc.config.yaml`, dan `orc update` tidak
pernah menimpanya. `orc ui` ▸ Settings menyunting kunci yang sama lewat pemeriksa
yang sama.

**Semua kunci, nilai bawaannya, dan gunanya masing-masing:
[guides/configuration.md](guides/configuration.md).**

---

## Isi paketnya

```
templates/
├── skills/       29 skill — lane di atas, plus yang tidak punya perintah
│                 sendiri: context-combiner, orc-advisor, orc-judge,
│                 orc-analyze-mini, dan _shared/ (kesepakatan lintas lane)
├── commands/     27 perintah garis miring
├── hooks/        penjaga effort (PreToolUse) · peringatan statusline · catatan jejak
└── agents/       40 subagen dengan model terkunci + MODEL-MAPPING.md
bin/cli.js        pemasang, penyunting pengaturan, penyusun alur, pembaca status
                  pekerjaan, dan separuh pasti dari setiap lane. Setiap pembacaan
                  bisa menjawab --json
bin/webui/        `orc ui` — panel kendali lokal: css/ + js/ + i18n/<bahasa>/ +
                  fixtures/, satu berkas per lapisan dan per panel. Nol dependensi
bin/mockrun-catalog.js   katalog contoh jalannya (diturunkan dari berkas di disk)
mock-run/         contoh-contoh jalannya itu sendiri — mulai dari INDEX.md
guides/           pengaturan · pemilihan model · dokumen · pembacaan pengetahuan
```

Skill `orc` sendiri hanyalah **tulang punggung** yang tipis: ia hanya memuat
referensi atau sub-skill ketika fase itu benar-benar berjalan, jadi tugas kecil
tidak perlu membayar mesin besar.

---

## Panduan yang lebih panjang

Beberapa lane membawa panduan lengkapnya sendiri, di sebelah skill-nya, dengan
bahasa yang sederhana:

| Panduan | Baca kalau |
|---|---|
| [ORC-QUICK](templates/skills/orc-quick/README.md) | Anda ingin contoh lengkap lane cepat |
| [ORC-DIY](templates/skills/orc-diy/README.md) | Anda ingin meracik lane sendiri |
| [ORC-WIKI](templates/skills/orc-wiki/README.md) | Anda ingin basis pengetahuan, dan pengaturan crosslink antar repo |
| [ORC-PR-SETUP](templates/skills/orc-pr-setup/README.md) | Anda ingin memecah perubahan besar jadi PR bertumpuk |
| [ORC-PR-DRIVER](templates/skills/orc-pr-driver/README.md) | Anda sudah punya rencana tumpukan dan ingin membangun, mengirim, dan me-merge-nya |
| [Pengaturan](guides/configuration.md) · [Pemilihan model](guides/model-selection.md) | Anda ingin semua kuncinya, atau pita penilaiannya |

Setiap skill juga membawa `SKILL.md` dan `references/`-nya sendiri. Panduan di
atas adalah versinya untuk manusia.

---

## Status evaluasi

Kumpulan skill ini dinilai **dari ujung ke ujung**, bukan berkas per berkas: satu
spesifikasi yang bisa dijalankan per lane, diuji terhadap proyek Express di
kotak pasir, dan dinilai dari bukti di disk — catatan jejak, folder pekerjaan,
dan berkas hasil.

Putaran penuh terakhir adalah **30 evaluasi terhadap payload v0.34.0**: 25 berkas
hasil terisi dan 38 berkas jejak, dengan 5 evaluasi yang tidak pernah dinilai dan
2 yang hanya dinilai sebagian — semuanya disebutkan namanya di laporan. Semua
yang ditemukan di sana sudah diperbaiki di rilis berikutnya atau masih tercatat.
Bacalah sebagai catatan putaran itu, bukan sebagai audit terkini:
[EVAL-REPORT.md](EVAL-REPORT.md).

---

## Prinsip rancangannya

- **Jangan pernah menulis kode di lapisan paling atas.** Orkestrator mengatur;
  subagen bernilai yang mengerjakan.
- **Batasi cakupannya dulu, baru dikerjakan paralel.** Salah paham jauh lebih
  murah diperbaiki sebelum lima agen membangun di atasnya.
- **Disk lebih dipercaya daripada ingatan.** Setiap jeda adalah titik lanjut yang
  bersih.
- **Model terkunci dan bisa diperiksa.** Agen bernama, modelnya tertulis di
  frontmatter.
- **Kode Anda yang menang.** Pola yang dipelajari mengalah pada proyek Anda;
  hanya aturan keamanan dan kebenaran yang tidak bisa ditawar.
- **Pengetahuan itu tambahan.** Wiki membuat perencanaan lebih baik kalau ada,
  dan tidak membebani apa pun kalau tidak ada.
- **Katakan apa yang tidak Anda ketahui.** `UNCHECKABLE`, `no card`,
  `insufficient history` adalah jawaban sungguhan. Tebakan yang terdengar yakin
  lebih buruk daripada mengakui ada yang tidak diketahui.

---

## Daftar perubahan

**Riwayat lengkap: [CHANGELOG.md](CHANGELOG.md)** — atau `orc changelog`, yang
hanya mencetak yang lebih baru dari versi yang Anda punya.

### v0.55.1 — ORC sudah ada di npm _(27-08-2026)_

**ORC diterbitkan dengan nama [`@azure-id/orc`](https://www.npmjs.com/package/@azure-id/orc).**
Pemasangan lewat GitHub tetap jalan, dan isi paketnya tidak berubah sama sekali —
ini hanya soal cara memasangnya sekarang punya nama.

- **`npm i -g @azure-id/orc`** untuk memasang, dan
  **`npm i -g @azure-id/orc@latest`** untuk memperbarui. `orc upgrade` sudah
  melakukan keduanya sejak dulu dan tetap begitu.
- **Pemasangan dari GitHub sekarang jadi cadangan**, bukan cara utama — tetap ada
  di bagian "Cara mulai", dilipat, untuk fork atau kalau Anda mengunci sebuah
  branch.

### v0.51.0 — alat yang sudah Anda punya, dan koneksi yang membuktikan dirinya _(22-08-2026)_

**Koneksi `orc extra`.** Dua alat coding yang bisa diberi pekerjaan oleh ORC
adalah **program di komputer Anda sendiri**, bukan situs — jadi sekarang keduanya
jadi penyedia kelas satu, punya kotak hubungkan masing-masing, dan daftar model
yang dibangun dari apa yang benar-benar bisa dijangkau akun Anda.

- **Program bisa saja belum terpasang, dan panelnya mengatakan itu lebih dulu** —
  empat keadaan, dihitung setiap kali, tidak pernah diingat. Alat yang belum
  terpasang tidak diberi tombol yang tidak mungkin berhasil, dan `orc extra add`
  menolak sambil menyebutkan perintah pemasangannya.
- **ORC membuka terminal Anda sendiri dan menjalankan pemasangannya di sana.**
  Bukan pekerjaan tersembunyi di latar — di dalamnya, permintaan hak
  administrator, kegagalan izin, unduhan 80 MB, dan tunggu empat puluh detik
  semuanya terlihat sama: *tidak terjadi apa-apa*. Perintahnya tampil sebelum
  tombolnya, jendelanya milik Anda, dan **ORC tidak pernah meminta hak
  administrator**. Tidak ada terminal yang bisa dibuka? Anda tetap dapat
  perintahnya untuk disalin.
- **Uji koneksi sekarang bertingkat**: programnya ada · cukup baru · sudah masuk
  akun · model apa yang bisa dijangkau akun ini · dan, hanya kalau Anda minta,
  **apakah pesan sungguhan benar-benar dijawab** — lengkap dengan waktu tempuh,
  jawabannya, dan empat jenis hitungan token yang tidak pernah dicampur.
- **Model yang terdaftar bukan berarti model yang bekerja.**
  `orc extra models <nama> --test <id>` adalah satu-satunya cara membedakannya.
- **Kedua alat lokal itu tidak memberi tahu model mana yang menjawab**, jadi ORC
  menuliskan kalimat itu, bukan membiarkan kolom kosong.
- **`extra_enabled` tidak bisa dinyalakan sebelum ada yang menjawab** — dulu ia
  akan terbaca NYALA padahal artinya MATI.

Sebelumnya: **v0.50.0 — pekerjaan yang berjalan di tempat lain** (`orc extra`),
**v0.49.1 — dewan penilai, dan `--json` yang berhenti membuang isinya**,
**v0.49.0 — dokumen itu folder, dan berkasnya hasil rakitan** (`/orc-doc`), dan
**v0.48.1 — satu berkas untuk satu hal, dan dokumen yang bisa diselesaikan**.
[Baca semuanya di daftar perubahan](CHANGELOG.md).

---

## Yang dibutuhkan

- **Claude Code** — dialah yang membaca skill, perintah, dan agennya.
- **Node 18+** — hanya untuk pemasangnya. Skill-nya sendiri tidak punya
  dependensi apa pun.

## Lisensi

MIT — kolom `license` di `package.json` adalah pernyataan resminya.
