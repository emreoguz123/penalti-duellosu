# ⚽ Penaltı Düellosu

1v1 / 2v2 / bota karşı penaltı oyunu. Tarayıcıda ve telefonda çalışır.
Telefonda "Ana ekrana ekle" ile uygulama gibi açılır.

## Yerelde çalıştırma

```bash
npm install
npm start
```

- `http://localhost:3000` → bu bilgisayarda
- `http://192.168.x.x:3000` → telefondan (aynı Wi-Fi'de olmalı)

## İnternette yayınlama

Oyun tek bir Node.js sunucusudur (statik dosyalar + WebSocket). WebSocket destekleyen
herhangi bir Node barındırma servisinde çalışır. Veritabanı yoktur, odalar bellekte tutulur.

### Seçenek 1 – Render (ücretsiz, en kolay)
1. Projeyi GitHub'a yükle.
2. https://render.com → **New → Blueprint** → bu repoyu seç (`render.yaml` hazır).
   Ya da **New → Web Service**: Build `npm ci --omit=dev`, Start `node server.js`.
3. Birkaç dakika sonra `https://penalti-duellosu.onrender.com` gibi bir adres verir.

Not: Ücretsiz planda 15 dk kimse girmezse sunucu uyur; ilk açılış ~30-50 sn sürer.
Sunucu uyuyunca/yeniden başlayınca açık odalar kaybolur.

### Seçenek 2 – Railway / Fly.io / kendi sunucun (Docker)
`Dockerfile` hazır:
```bash
docker build -t penalti .
docker run -p 3000:3000 penalti
```
Sunucu `PORT` ortam değişkenini okur. HTTPS'i barındırma servisi sağlar; oyun otomatik `wss://` kullanır.

### Önemli
- Odalar sunucunun belleğinde tutulur → **tek instance** çalıştır (yatay ölçekleme yapma).
- Sağlık kontrolü: `GET /healthz`

## Kurallar
- Kale 3×2 = 6 bölge. Kaleci 3, şutör 3 bölge seçer (20 sn ya da ikisi de Hazır).
- Şans: şutörün 3 seçimi %25'er + %25 dışarı (arka planda hesaplanır, sonuç animasyonda görünür).
  Seçim kalecinin kapattığı bölgeyse kurtarış, boşsa gol.
- 5'er atış, eşitlikte ani ölüm.

## Dosyalar
- `server.js` – oda yönetimi, kurallar, şut sonucu (sunucu tarafında, hile yapılamaz)
- `public/` – arayüz, animasyonlar, sesler, ikonlar, manifest
- `tools/make-icons.js` – ikon PNG'lerini yeniden üretir
- `Dockerfile`, `render.yaml` – yayınlama ayarları
