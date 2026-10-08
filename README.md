# 🛒 Shopee Affiliate Image Extractor

Browser extension untuk mengekstrak data produk beserta gambar dari **Shopee Affiliate Dashboard** secara otomatis, lengkap dengan link komisi affiliate.

---

## 📋 Fitur

- ✅ **Auto-centang checkbox** semua produk di setiap halaman
- ✅ **Ekstrak gambar** langsung dari DOM halaman
- ✅ **Navigasi otomatis** ke halaman berikutnya
- ✅ **Generate affiliate link massal** melalui tombol *"Buat Link Massal"*
- ✅ **Export data ke JSON** berisi gambar, nama, harga, penjualan, komisi, dan link affiliate
- ✅ **Progress real-time** dengan status dan progress bar
- ✅ **Draggable panel** yang bisa dipindahkan di layar
- ✅ **Stop kapan saja** jika proses terlalu lama

---

## 🚀 Cara Pakai

1. Install extension ini ke browser (Chrome/Edge) via `manifest.json`.
2. Buka halaman **Shopee Affiliate Dashboard** → [affiliate.shopee.co.id](https://affiliate.shopee.co.id).
3. Panel floating muncul di kanan atas layar.
4. Atur **target jumlah produk** (default 40, max 5000).
5. Klik tombol **Start** → extension akan:
   - Centang semua checkbox
   - Ekstrak gambar & data tiap halaman
   - Pindah ke halaman berikutnya otomatis
   - Di halaman terakhir, tekan *"Buat Link Massal"* untuk dapatkan link komisi
   - Download file `shopee_products.json` secara otomatis

---

## 📦 Output JSON

```json
{
  "extracted_at": "2026-10-08T09:55:48Z",
  "total_products": 40,
  "with_affiliate_link": 40,
  "pages_scraped": 2,
  "products": [
    {
      "product_id": "123456789",
      "namaProduk": "Contoh Product",
      "harga": "Rp 99.000",
      "penjualan": "1rb+",
      "komisi": "10% (Rp 9.900)",
      "images": ["https://...image1.jpg"],
      "linkProduk": "https://shopee.co.id/product/123456789",
      "linkKomisi": "https://shopee.co.id/aff/?product=123456789&affiliate_id=xxx"
    }
  ]
}
```

---

## ⚙️ Konfigurasi

| Opsi | Deskripsi |
|------|-----------|
| `manifest_version` | Manifest V3 (Chrome/Edge) |
| `matches` | Hanya jalan di `https://affiliate.shopee.co.id/*` |
| `run_at` | Document idle (setelah halaman siap) |

---

## ⚠️ Catatan

- Pastikan sudah login ke akun Shopee Affiliate sebelum running.
- Jangan terlalu memaksa kecepatan, biarkan halaman selesai load.
- Jika tombol *"Buat Link Massal"* tidak muncul, cek ulang halaman atau cek kembali struktur halaman Shopee.

---

## 🛠️ Teknologi

- **Vanilla JavaScript** (tanpa dependency)
- **Manifest V3** (Chrome Web Extension)
- **HTML/CSS** untuk floating panel

---

## 📝 License

Dibuat untuk kebutuhan personal automation. Gunakan dengan tanggung jawab.