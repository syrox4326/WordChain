# WordChain: yayınlama rehberi

Bu klasörde oyunun tamamı var. Oyunun çalışması için küçük bir "sunucu" gerekiyor. Sunucu, odadaki herkesin ekranını aynı anda güncelleyen yer. Aşağıda bunu ücretsiz ve reklamsız şekilde internete koymanın yolu var.

Klasörün içindekiler:

- `server.js` : odalar ve Kelime Zinciri kuralları
- `challenge.js` : 20 TL Challenge oyununun kuralları
- `data/konular.bin` : 20 TL Challenge'ın 55 konusu ve seçenekleri. Sürpriz bozulmasın diye bilerek sıkıştırılmış, açılıp okunamaz. Yeni konu eklemek için bana söylemen yeterli.
- `web.js` : sitenin dosyalarını sunan ve güvenliğini sağlayan parça
- `public/index.html`, `style.css`, `app.js`, `challenge.js` (20 TL Challenge ekranları) : ekranda gördüğünüz her şey
- `public/sound.js` : ses efektleri (tarayıcıda üretilir, ses dosyası yoktur)
- `public/manifest.webmanifest` ve `sw.js` : telefona uygulama gibi eklenmesini sağlar
- `public/icons` : uygulama simgeleri ve paylaşım görseli
- `public/credits.html` : sitenin altındaki "Lisanslar" sayfası (robots.txt de burada)
- `public/avatars` : 24 hayvan avatarı (her biri ayrı dosya)
- `public/fonts` : sitenin yazı tipi (internetten ayrıca bir şey yüklenmez)
- `words.txt` ve `dictionary.js` : sözlük kontrolü (yaklaşık 30 bin kök kelime ve ek kuralları)
- `package.json` ve `package-lock.json` : sunucunun hangi parçalara ihtiyacı olduğunu söyler
- `SOZLUK-NOTICE.txt`, `ZEMBEREK-LICENSE.txt`, `AVATAR-LICENSE.txt` ve `FONT-LICENSE.txt` : sözlüğün, avatarların ve yazı tipinin kaynağı ve lisansı, silme

## Önce bilgisayarında denemek istersen (isteğe bağlı)

1. Bilgisayarına Node.js kur (nodejs.org, "LTS" yazan sürüm).
2. Bu klasörü aç, içinde bir terminal/komut satırı aç.
3. Sırayla şunları yaz, her birinden sonra Enter'a bas:
   - `npm install`
   - `npm start`
4. Tarayıcıda `http://localhost:3000` adresini aç. Aynı Wi-Fi'deki telefonlardan oynamak için bilgisayarının yerel adresini kullanabilirsin.

## İnternette yayınlamak (Render, ücretsiz)

Bunun için iki ücretsiz hesap gerekiyor: GitHub ve Render. İkisi de e-posta ile açılıyor.

**1. Dosyaları GitHub'a koy**

1. github.com'a gir, hesap aç.
2. Sağ üstteki **+** işaretine bas, **New repository** de.
3. İsim olarak `wordchain` yaz, **Public** seçili kalsın, **Create repository** de.
4. Açılan sayfada **uploading an existing file** yazısına bas.
5. Zip'ten çıkardığın klasörün **içindeki** her şeyi sürükle: `server.js`, `dictionary.js`, `words.txt`, `package.json`, `package-lock.json`, dört bilgi/lisans dosyası (`.txt` ve `.md`) ve `web.js`, `challenge.js` ve `data` ile `public` klasörleri. `public` klasörünün içindeki `avatars`, `fonts` ve `icons` klasörleri de onunla birlikte gelmeli.
6. Aşağıdaki **Commit changes** düğmesine bas.

Bu adımı bilgisayardan yapman en kolayı. Telefonlar klasör yüklemeyi çoğu zaman desteklemiyor.

**2. Render'da sitenin yayına çıkmasını sağla**

1. render.com'a gir, **Get Started** de ve GitHub ile giriş yap.
2. **New +** düğmesine, sonra **Web Service**'e bas.
3. GitHub'daki `wordchain` deposunu seç.
4. Ayarları şöyle doldur:
   - **Language**: Node
   - **Build Command**: `npm install`
   - **Start Command**: `npm start`
   - **Instance Type**: Free
5. **Deploy** de. Birkaç dakika sonra sayfanın üstünde `https://...onrender.com` diye bir adres çıkar. Oyununuzun adresi bu.

**3. Oynamak**

1. Bu adresi aç, avatarına dokunup bir hayvan seç, adını yaz, kaç kişi olacağınızı ve düşünme süresini (30 ile 180 saniye arası) seç, **Oda kur**'a bas.
2. Çıkan linki arkadaşlarına gönder. Onlar linke basıp avatarını seçer, adını yazınca odaya girer.
3. Kurucu dışındaki herkes **Hazırım**'a basar, sonra kurucu **Maçı başlat**'a basar. Önce 3-2-1 geri sayımı gelir.

## Bilmen gerekenler

- Ücretsiz Render, 15 dakika kimse oynamazsa siteyi uyutur. Uyuyan siteyi ilk açan kişi yaklaşık 1 dakika bekler. Servise binmeden önce adresi bir kez açıp uyandırman iyi olur. ([Render ücretsiz plan bilgisi](https://render.com/docs/free))
- Render sunucuyu istediği zaman yeniden başlatabilir. Bu olursa açık odalar silinir, yeni bir oda kurmanız gerekir.
- Oda kurarken "Sözlük kontrolü" kutusu açık gelir. Açıkken sözlükte olmayan kelime kabul edilmez, ama yazan kişi elenmez, süre devam eder ve yeni bir kelime dener. Kapatırsan her kelime geçer ve kelimenin geçerliliğini arkadaşlar kendi aralarında karara bağlar.
- Sözlük, TDK'nın değil, Zemberek projesinin açık lisanslı kök kelime listesidir. Fiiller -mek/-mak ile yazılır (gelmek). Kitaplar, güzellik, arabacı gibi yaygın çoğul ve yapım ekli kelimeler de kabul edilir. Ama "geldim", "evde" gibi çekimli kelimeler ve özel isimler kabul edilmez. Kabul edilmesi gereken bir kelime reddedilirse kutuyu kapatarak oynayabilirsin.
- Sözlüğe kelime eklemek istersen `words.txt` dosyasının sonuna her satıra bir kelime olacak şekilde ekle.
- Düşünme süresini her oda kurulurken ekrandan seçersin (varsayılan 45 saniye). Elenmek için süreyi kaçırmak gerekir. Daha önce yazılmış bir kelimeyi yazan kişi elenmez, uyarılır ve süresi bitene kadar yeniden dener.
- Elenen oyuncular oyun bitene kadar akışı izlemeye devam eder. Oyun sonunda sıralama ve podyum görünür.
- Sesler (geri sayım, sıra sende, kelime yazılınca, eleme, süre bitmeden son 5 saniye, kazanma) sağ üstteki hoparlör düğmesiyle kapatılıp açılır. Tercih telefonda hatırlanır. Telefonlar sesi ancak ekrana ilk dokunuştan sonra çaldığı için ilk dokunuştan sonra duyulur.

## Telefona uygulama gibi eklemek

**iPhone:** Siteyi Safari'de aç, alttaki **Paylaş** düğmesine dokun, **Ana Ekrana Ekle**'yi seç, **Ekle**'ye bas. Site, iPhone'dan açınca bu adımları kendisi de gösterir.

**Android (APK olmadan):** Siteyi Chrome'da aç. Ana sayfada **Ana ekrana ekle** düğmesi çıkar. Basınca oyun, kendi simgesiyle ve adres çubuğu olmadan uygulama gibi açılır.

**Android (APK dosyası):** APK'yı bu ortamda üretemedim, çünkü gereken araçların indirilmesine izin verilmiyordu. Siteniz yayına girdikten sonra kendin 5 dakikada üretebilirsin:

1. Telefonda ya da bilgisayarda pwabuilder.com adresini aç.
2. Kutuya oyununun adresini (`https://...onrender.com`) yaz, **Start** de.
3. Sayfa bitince **Package for stores** düğmesine, sonra **Android**'e bas.
4. **Generate package** de. İçinden bir zip iner.
5. Zip'in içindeki `.apk` dosyasının adını `WordChain.apk` yap.
6. GitHub'daki `wordchain` deposunda `public` klasörüne gir, **Add file > Upload files** de, bir `downloads` klasörü açıp dosyayı oraya yükle (yani yol `public/downloads/WordChain.apk` olsun) ve **Commit changes** de.

Bundan sonra Android telefonlarda sitenin altında **Android uygulamasını indir (APK)** düğmesi kendiliğinden çıkar. Dosya yoksa düğme hiç görünmez. APK'yı ilk açan kişi telefonun "bilinmeyen kaynak" iznini onaylamalı.

## 20 TL Challenge nasıl oynanır

1. Ana sayfada **20 TL Challenge**'a bas. Adını yaz, bir **konu** seç (55 konu var, "Rastgele konu" da var), kaç ürün alınacağını (3 ile 8 arası, varsayılan 5) ve karar süresini (15, 30 ya da 60 saniye) seç, **Oda kur**'a bas.
2. Çıkan linki arkadaşına gönder. O adını yazıp katılır, **Hazırım**'a basar, sen **Oyunu başlat**'a basarsın. Lobide ayarları **Ayarları değiştir** düğmesiyle sonradan da değiştirebilirsin.
3. İkinizin de 20 TL'si var. Ekrana sırayla birer ürün gelir. Oyun ürüne otomatik olarak birinize 1 TL teklif yazar. Diğer oyuncu ürünü **Bırak**abilir (ürün, teklifi verene o fiyata gider) ya da **Artır** ile teklifi 1 TL yükseltebilir. Sonra sıra ona geçer.
4. Karar süresi dolarsa otomatik olarak "Bırak" sayılır.
5. İkiniz de seçtiğiniz sayıda ürün alınca ya da paranız bitince oyun biter. Sonra ikiniz de **hangi liste daha iyi** diye oy verirsiniz. Oylar aynıysa kazanan belli olur, farklıysa tartışıp yeniden oylarsınız. **Tekrar oyla** yeni oyun başlar, isterseniz konuyu değiştirirsiniz.
6. Ürünlerin arasında bombalar da var, yani alınca pişman olunacak kötü ürünler. Hangisi olduğunu bilemezsiniz.
7. Bir oyuncu oyun sırasında odadan çıkarsa, kalan oyuncu hükmen kazanır.
