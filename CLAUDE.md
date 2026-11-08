# WordChain: proje notları (Claude Code için)

Bu dosyayı her açılışta oku. Kullanıcı Türkçe konuşur ve teknik biri değildir.

## Kullanıcıyla nasıl konuşulur
- Çok sade, jargonsuz, adım adım Türkçe anlat. Teknik bilgisi yok, "mala anlatır gibi" anlatılmasını istiyor.
- Her değişiklikten sonra, GitHub'a hangi dosyaları yüklemesi gerektiğini söyle. Kullanıcı dosyaları GitHub'a elle yüklüyor, Render otomatik yeniden yayınlıyor.
- Dürüst ol: neyi test ettiğini, neyi test edemediğini açıkça söyle.
- 20 TL Challenge'ın seçeneklerini (data/konular.bin içindeki ürünler) kullanıcıya YAZMA, sürpriz bozulmasın. Sadece konu adlarını söyleyebilirsin.

## Proje nedir
Ücretsiz, reklamsız, üyeliksiz çok oyunculu oyun sitesi. Adres: wordchain.com.tr. Kod GitHub'da, Render'a otomatik yayınlanıyor.
Node.js 22, `ws` (WebSocket). Odalar bellekte durur. Telefonda ve bilgisayarda çalışır. Tasarım Kahoot'a benzer (mor sahne, beyaz kartlar, kalın renkli düğmeler, avatarlar).

Üç oyun var, ana ekranda üç kart olarak duruyor:
1. **Kelime Zinciri** (2-6 kişi): önceki kelimenin son harfiyle yeni kelime. Sözlük: `words.txt` (54.107 kelime = Zemberek + TDK 12. baskıdan eklenenler). Mantık: `server.js` ve `dictionary.js`.
2. **20 TL Challenge** (2 kişi): birer 20 TL ile ürünler açık artırmayla alınır. Mantık: `challenge.js`. Konular: `data/konular.bin` (55 konu, sıkıştırılmış JSON). Her oyunda 20 seçenek çekilir, 3-4 tanesi bomba. Kural: her kalan ürün hakkı için en az 1 TL kenarda kalır (5 ürünlük oyunda ilk ürüne en fazla 16 TL).
3. **Veni, Vidi, Vici** (2-6 kişi): Türkiye haritasında soru bilerek il fethetme. Mantık: `conquest.js`. Sorular: `data/sorular.bin` (1.459 soru, yalnızca örnek kontrol yapıldı, doğrulukları tam denetlenmedi). Harita ve komşuluk: `public/harita.json` (Natural Earth, kamu malı). Süreler: il seçme 20 sn, soru 30 sn, sonuç 8 sn. Saldırıya uğrayan, henüz il seçmediyse seçemez, doğrudan savunma sorusu alır. Rakibin iline saldırma kararı geri alınamaz.

## Dosyalar
- `server.js`: ana sunucu, oda ve bağlantı yönetimi, Kelime Zinciri kuralları.
- `web.js`: sayfaları sunar. `dictionary.js`: sözlük.
- `public/index.html`, `style.css`, `app.js` (çekirdek, `window.WC`), `challenge.js`, `conquest.js`: ekranlar. `sound.js`: sesler.
- `public/sw.js`: uygulama önbelleği. Ekranla ilgili her değişiklikte içindeki sürüm numarasını artır (şu an `wordchain-v12`), yoksa kullanıcılar eski hali görür.
- `public/credits.html`: lisanslar sayfası. Yeni açık kaynak içerik kullanırsan buraya ekle.
- Güvenlik kuralı: sayfalarda satır içi script ve stil yok (CSP: yalnızca kendi dosyalarımız). `style="..."` yazma, CSS dosyasına koy.
- `tests/`: testler (aşağıda).

## Ortam ayarları (hızlı test için küçültülebilir)
`PORT`, `MIN_TURN_S`, `MIN_DECIDE_S`, `SOLD_DELAY_MS`, `START_DELAY_MS`, `CQ_PICK_MS`, `CQ_ANSWER_MS`, `CQ_REVEAL_MS`. Yalnızca test için: `CQ_TEST_ADJ=1` (Veni Vidi Vici'de oyuncuları yan yana başlatır).

## Test
Sunucuyu başlat: `PORT=3111 node server.js` (Veni Vidi Vici testleri için `CQ_PICK_MS=1500 CQ_ANSWER_MS=1500 CQ_REVEAL_MS=400 START_DELAY_MS=300`).
- `node tests/sim-challenge.js`: 20 TL Challenge'ı 900 farklı oyunla simüle eder, kimsenin ürün sayısının eksik kalmadığını doğrular. Sunucu gerekmez.
- `node tests/test-veni-vidi-vici.js`: Veni Vidi Vici'yi 2-6 oyuncuyla baştan sona oynatır, kopma ve ayrılma senaryolarını dener. Çalışan sunucu gerekir.

## Bilinen noktalar
- Soru hatalı bildirimleri Render kayıtlarına `[SORU-BILDIRIMI]` olarak düşer.
- Kaynak soru ve konu dosyaları zip içinde yok (bin dosyaları derlenmiş hali). Soru/konu eklemek istenirse yeniden hazırlanmalı.
- TDK sözlüğü (tanımlarıyla) GitHub'da `ogun/guncel-turkce-sozluk` projesinde, `sozluk/v12/v12.gts.json.tar.gz` dosyasında. İndirme `raw.githubusercontent.com` üzerinden çalışıyor.

## Sıradaki fikirler (konuşuldu, henüz yapılmadı)
- **Uydur Bakalım** (kullanıcı en çok bunu istiyor): TDK'dan nadir bir kelime gelir, herkes sahte anlam yazar, sonra herkes gerçeği bulmaya çalışır. Önerilen puanlama: gerçeği bulan 2 puan, uydurmasına inanılan kişiye inanan başına 1 puan, kurucu 5/8/10 tur seçer. Eşitlikte önce gerçeği çok bulan, sonra çok kandıran kazanır, yine eşitse berabere. Gerçek anlama çok benzeyen veya başkasıyla aynı uydurma reddedilir. Kullanıcı puanlamayı henüz onaylamadı.
- Diğer fikirler: Kelime Hırsızı, Kaç Kelime?, Cümle Düellosu, Ortak Düşünce, İli Vur, Emoji ile Anlat.
- Veni Vidi Vici için daha fazla soru.
