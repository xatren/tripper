# Tripper — Screen 01: Map Home Uygulama Promptu

## Tasarım kararı

Login sonrasında açılan mevcut kart tabanlı dashboard, tam ekran ve harita merkezli bir ana sayfaya dönüştürülecek. Bu ekran Figma referansındaki kompozisyonu kullanacak; ancak referanstaki temsili dünya haritası yeniden üretilmeyecek. Arka planda Tripper'ın mevcut gerçek Mapbox haritası, gerçek durakları ve mevcut rota verisi kullanılacak.

Bu ekranın ürün rolü **“Map Home”** olacaktır:

- Kullanıcı uygulamayı açtığı anda en ilgili seyahatini harita üzerinde görür.
- Harita uygulamanın ana görsel odağıdır.
- Üstte global destinasyon araması bulunur.
- Altta seçili seyahatin kompakt özet kartı yer alır.
- En altta yüzen global navigasyon bulunur.
- Seyahat planını düzenlemek için kullanıcı mevcut trip workspace içindeki Plan ekranına girer.

Ana sayfadaki harita bir özet/keşif yüzeyidir. Durak ekleme, silme, yeniden sıralama, gece sayısı değiştirme ve rota optimizasyonu burada yapılmaz.

---

## Kopyalanabilir ana uygulama promptu

```text
Tripper'ın login sonrası `/dashboard` ekranını kart tabanlı listeden tam ekran bir “Map Home”
deneyimine dönüştür.

ÜRÜN BAĞLAMI

Tripper, Next.js App Router + TypeScript + Supabase + Mapbox kullanan dark-only,
mobile-first bir seyahat uygulamasıdır. Mevcut Dusk/Liquid Glass kimliği korunacaktır.
Uygulamanın gerçek Mapbox bileşeni `components/map/mapbox/TripboxMap.tsx` dosyasındadır.
Mevcut dashboard verileri `app/dashboard/page.tsx` tarafından alınır ve
`app/dashboard/DashboardClient.tsx` tarafından render edilir.

Figma referansındaki temsili dünya haritasını veya kıtalar arası noktalı rotayı kopyalama.
Figma'dan yalnızca ekran kompozisyonunu al:

- tam ekran harita;
- harita üstünde yüzen arama alanı;
- seçili/öncelikli seyahatin alt özet kartı;
- en altta yüzen global navigation;
- sakin, premium, tek odaklı görsel hiyerarşi.

Harita olarak Tripper'ın mevcut gerçek Mapbox dark map stilini, gerçek trip stop noktalarını
ve mevcut route path verisini kullan.

TEMEL MİMARİ SINIR

İki harita deneyimini birbirine karıştırma:

1. Map Home (`/dashboard`)
   - seyahat özeti ve keşif yüzeyidir;
   - salt okunur veya düşük etkileşimlidir;
   - pin seçme, haritayı hareket ettirme, konuma dönme ve trip açma davranışları olabilir;
   - durak mutation'ları içermez.

2. Plan Map (`/trip/[id]/mobile`, Plan sekmesi)
   - mevcut düzenleme yüzeyidir;
   - durak ekleme/silme/sıralama, optimize, route retry ve gün planlama burada kalır.

Plan domain davranışlarını Map Home'a taşımaya veya duplicate etmeye çalışma.

ÖNCE DAR İNCELEME YAP

1. `git status --short` ve `AGENTS.md` kontrol et. Kullanıcının mevcut değişikliklerini koru.
2. Şu dosyaları hedefli şekilde incele:
   - `app/dashboard/page.tsx`
   - `app/dashboard/DashboardClient.tsx`
   - `components/ui/AppBottomNav.tsx`
   - `components/dashboard/TripCard.tsx`
   - `components/dashboard/dashboard-ui.ts`
   - `components/map/mapbox/TripboxMap.tsx`
   - `lib/mapbox/directions.ts`
   - `types/index.ts` içindeki yalnızca Trip, Stop ve rota ile ilgili tipler
3. Büyük trip domain dosyalarını baştan sona okuma. Gerekirse yalnızca şu kullanımları `rg -n`
   ile bul ve yakın çevresini incele:
   - `TripboxMap`
   - `getFullRoute`
   - `routePath`
   - stop → map point dönüşümü
4. Mevcut rota helper'ını güvenli şekilde yeniden kullan. Plan domain'deki mutation/realtime
   akışını dashboard'a taşımak için büyük refactor yapma.

ÖNCELİKLİ SEYAHAT SEÇİMİ

Map Home açıldığında tek bir `featuredTrip` seç. Tarih karşılaştırmalarını yerel saat kaynaklı
off-by-one üretmeyecek şekilde mevcut tarih yardımcılarıyla veya saf tarih helper'ıyla yap.

Seçim önceliği:

1. Bugün tarih aralığı içinde olan aktif seyahat.
2. Başlangıç tarihi bugünden sonraki en yakın seyahat.
3. Tarihi olmayan seyahatler arasından en son güncellenen.
4. Yalnızca tamamlanmış seyahatler varsa en yakın zamanda tamamlanan.
5. Hiç seyahat yoksa `featuredTrip = null`.

Birden fazla aktif seyahat varsa önce başlangıç tarihi en yakın olanı, eşitlikte `updated_at`
değeri daha yeni olanı seç. Bu seçim mantığını JSX içine gömme; saf ve test edilebilir bir helper
olarak yaz.

İlk sürümde ana ekranda yalnızca featured trip'in duraklarını ve rotasını göster. Kullanıcının
tüm seyahatlerinin pinlerini aynı anda haritaya basma. “Trips” yüzeyi tüm seyahatleri listelemeye
devam eder.

VERİ YÜKLEME

- Mevcut profil, trips ve membership/capabilities sorgularını koru.
- Featured trip seçimini mümkünse server tarafında veya paylaşılan saf helper ile deterministik yap.
- Yalnızca featured trip için gerekli `stops` verisini `order_index` sırasıyla al.
- Rota verisi veritabanında güvenilir biçimde persist edilmiyorsa mevcut Mapbox directions helper'ı
  ile client tarafında hesapla.
- 0–1 stop için directions isteği atma.
- Rota isteği hata verirse stop pinlerini göstermeye devam et.
- Rota hatası dashboard'u error boundary'ye düşürmemeli ve sonsuz loading üretmemeli.
- Yeni Supabase migration ekleme.
- Mapbox/Google API anahtarını client'a yeni bir yöntemle sızdırma.
- Aynı rota için gereksiz tekrar isteklerini engelle. Mevcut helper/caching sözleşmesi varsa koru.

TAM EKRAN YERLEŞİM

Ana container:

- `height: 100svh` ve güvenli fallback;
- maksimum 430 px'e sıkıştırılmış kart sayfası gibi görünmemeli;
- Mapbox canvas viewport'un tamamını kaplamalı;
- body/page scroll oluşturmamalı;
- safe-area inset'leri desteklemeli;
- bottom nav ve trip kartı haritanın üzerinde overlay olarak durmalı.

Katman sırası:

1. Mapbox haritası.
2. Harita için üst/alt okunabilirlik scrim'leri.
3. Üst arama alanı ve gerekli map kontrolleri.
4. Durum mesajları.
5. Featured trip kartı.
6. Global bottom navigation.

Haritanın üzerinde ağır, tüm ekranı matlaştıran bir gradient kullanma. Üstte arama metnini ve
altta kart/nav alanını okunur tutacak lokal scrim yeterlidir.

HARİTA SUNUMU

- Mevcut dark Mapbox stili ve uygulama theme ayarları korunmalı.
- Kamera featured trip'in geçerli koordinatlı duraklarını otomatik olarak kadraja almalı.
- Fit bounds padding'i üst arama alanını, alt trip kartını ve bottom nav'ı hesaba katmalı.
- 1 stop varsa şehir/tek durak ölçeğinde göster.
- 0 stop varsa trip country/focus location mevcutsa onu kullan; yoksa nötr bir geniş görünüm göster.
- Harita ilk açıldığında rotayı ekranın altına veya büyük bir siyah gökyüzü boşluğuna itmemeli.
- Reduced motion açıkken fly/fit animasyon süresi 0 olmalı.
- Harita yüklenemezse ekran boş siyah kalmamalı. Dusk uyumlu statik placeholder ve anlaşılır kısa
  mesaj göster; trip kartı ve navigation kullanılabilir kalmalı.

PIN YOĞUNLUĞU

Figma örneğinde az durak vardır; gerçek Tripper seyahatlerinde 20+ durak olabilir. Ana sayfada
mevcut Plan haritasındaki tüm büyük numaralı pinleri körlemesine kullanma.

Map Home için görsel öncelik:

- başlangıç noktası: belirgin;
- mevcut/sonraki durak: amber ve en güçlü vurgu;
- bitiş noktası: belirgin;
- ara duraklar: daha küçük ve sakin;
- tamamlanan duraklar: dimmed;
- seçilen pin: popup veya küçük detail callout.

İlk uygulamada güvenli bir clustering altyapısı yoksa yeni ağır bağımlılık ekleme. Bunun yerine
harita zoom seviyesine göre etiket yoğunluğunu azalt veya ara durakları küçük marker olarak çiz.
Plan ekranındaki bilgi yoğunluğunu Map Home'a taşıma.

ROTA ÇİZGİSİ

- Gerçek directions sonucu varsa gerçek route path çiz.
- Directions sonucu yoksa durakları sahte bir sürüş rotası gibi düz çizgiyle birleştirme.
- Uçuş/feribot/deniz aşan segmentler için ulaşım türü bilinmiyorsa yanlış bir yol iddiasında bulunma.
- İlk sürümde rota bulunamazsa yalnızca pinleri göstermek kabul edilebilir.
- “Route unavailable” ana sayfanın baskın mesajı olmamalı.

Rota durumu:

- loading: küçük, sakin “Calculating route…” durumu;
- ready: kartta mesafe/süre gösterilebilir;
- unavailable: kart içinde veya üstte küçük bir status chip:
  “Route unavailable · itinerary still available”;
- unavailable durumunda küçük Retry sunulabilir;
- hata Map Home'un kullanımını engellememeli.

ÜST ARAMA ALANI

Figma kompozisyonundaki yüzen arama alanını Map Home'un üstünde uygula.

- Placeholder: “Where to next, traveler?” veya ürün diline uygun mevcut İngilizce karşılığı.
- En az 48 px yükseklik.
- Sol tarafta search ikonu.
- Dusk/Liquid Glass yüzeyi, yeterli kontrast ve ince border.
- Safe-area top dikkate alınmalı.
- Arama alanı harita label'larını gereksiz kapatmamalı.

İlk aşamada mikrofon özelliği gerçekten uygulanmayacaksa mikrofon ikonu koyma. Çalışmayan kontrol
render etme.

Arama etkileşimi için mevcut global Explore/Google Places akışını yeniden kullanmak mümkünse
arama alanına dokununca mevcut `/explore` yüzeyini veya mevcut search sheet'ini aç. Bu görev
kapsamını aşacak büyük bir entegrasyon gerekiyorsa arama alanını çalışan bir `/explore`
navigasyonu yap; sahte input oluşturma.

HARİTA KONTROLLERİ

Yalnızca Map Home için gerçekten gerekli kontrolleri göster:

- kullanıcının konumuna dön;
- trip rotasına yeniden kadrajla;
- mevcut bileşende güvenilir şekilde destekleniyorsa layers/style.

Kontroller 44×44 px dokunma hedefi taşımalı, harita üstünde glass yüzeyde görünmeli ve arama
alanıyla çakışmamalı. Plan ekranındaki liste, optimize veya editing kontrollerini ekleme.

FEATURED TRIP KARTI

Haritanın alt kısmında, bottom navigation'ın hemen üzerinde tek bir kompakt glass kart göster.
Bu kart aynı zamanda genişleyebilir Route Preview sheet'in collapsed durumudur. Kullanıcı karta
dokunduğunda veya handle üzerinden yukarı çektiğinde `Your Route` görünümüne genişlemelidir.

Kart içeriği:

- trip title;
- durum badge'i: ACTIVE / UPCOMING / UNDATED / COMPLETED;
- “Today”, “12 days left”, “Starts in 4 days” gibi doğru kısa tarih durumu;
- stop count;
- başlangıç ve bitiş şehirleri veya ilk birkaç duraktan kısa rota özeti;
- varsa toplam mesafe ve süre;
- erişilebilir “Open trip” anlamı.

Collapsed kartın birincil davranışı Route Preview'ı açmaktır. Trip Overview'a geçiş için kartta
erişilebilir `Open trip` affordance'ı veya genişletilmiş sheet içinde açık bir hedef bulunmalıdır.
İç içe geçmiş belirsiz button'lar oluşturma. Delete, invite-code copy ve yönetim eylemlerini bu
kompakt karta doldurma; bunlar Trips/More/Plan yüzeylerinde kalmalı.

Kart haritadaki kritik rotayı kapatmamalı. Harita fit bounds padding'i kart yüksekliğini dikkate
almalı. Kart ile bottom nav arasında görsel nefes bırak, fakat gereksiz ölü alan üretme.

Kart örnek bilgi hiyerarşisi:

California Road Trip                         ACTIVE
22 stops · 12 days left
San Diego → Los Angeles → Portland

Hiç trip yoksa featured kart yerine küçük bir onboarding CTA göster:

- başlık: “Where will you go next?”
- ikincil metin: ilk rotayı oluşturmaya davet;
- tek amber CTA: “Create a trip” → `/trips/new`;
- “Join with invite code” secondary action mevcut çalışan dialog/flow ile erişilebilir kalmalı.

EXPANDABLE ROUTE PREVIEW SHEET

Featured trip kartının genişletilmiş hali Figma'daki `Your Route` kompozisyonunu kullanmalıdır.
Bu ayrı bir sayfa veya ikinci rota editörü değildir; Map Home'un progressive-disclosure durumudur.

Sheet seviyeleri:

1. `collapsed`
   - yalnız featured trip kartı;
   - harita ana görsel odağıdır;
   - global search ve bottom navigation görünürdür.

2. `half`
   - `Your Route` başlığı;
   - stop count + trip duration;
   - ilk 2–3 durak;
   - route summary;
   - harita kullanılabilir alanın üst yarısında kalır.

3. `expanded`
   - tüm durakların scroll listesi;
   - Map Home bağlamı korunur;
   - sheet kendi içinde scroll eder;
   - bottom safe-area dikkate alınır.

Sheet açılma davranışı:

- collapsed karta tap sheet'i en az half seviyesine getirir;
- handle pointer/touch ile sürüklenebilir;
- handle en az 44 px erişilebilir touch target taşımalı;
- handle button olarak Enter/Space ile anlamlı snap seviyesi değiştirmeli;
- `aria-expanded` ve `Expand route preview` / `Collapse route preview` label'ları kullanılmalı;
- içerik scroll'u sheet drag'ini yanlışlıkla başlatmamalı;
- reduced-motion'da snap animasyonu kapatılmalı;
- yeni gesture kütüphanesi eklenmemeli.

ROUTE FOCUS MODE

Sheet half veya expanded olduğunda Map Home `Route Focus` durumuna geçebilir. Bu durumda üstteki
global arama alanı geçici olarak trip toolbar'a dönüşür:

- back/collapse control;
- featured trip title;
- mevcut çalışan share/invite hedefi varsa Share control;
- Share çalışmıyorsa sahte icon render etme.

Back/collapse Route Preview'ı collapsed seviyeye getirir ve global search geri gelir. Browser back
sheet açıkken önce sheet'i kapatmalı; kullanıcıyı beklenmedik biçimde dashboard'dan çıkarmamalı.

Route Focus yalnız sunum state'idir. Featured trip seçimini, route datasını veya global navigation
ownership'ini değiştirmez.

ROUTE PREVIEW STOP SATIRLARI

Durakları `order_index` sırasıyla göster. Her satır:

- sıra numarası;
- küçük destinasyon thumbnail'i veya kontrollü fallback;
- şehir/durak adı;
- varsa ülke/konum metadata'sı;
- arrival–departure date veya stop schedule'dan türeyen tarih aralığı;
- sonraki durağa güvenilir mesafe/süre bilgisi;
- seçili durum.

Durak satırına tap:

- Mapbox kamerayı ilgili stop'a götürür;
- ilgili marker'ı vurgular;
- seçimi erişilebilir biçimde bildirir;
- doğrudan mutation yapmaz.

Thumbnail kaynağı yoksa sahte uzaktan fotoğraf URL'si üretme. Güvenilir mevcut place/journal görseli
yoksa deterministik Dusk gradient, monogram veya küçük map fallback kullan. Provider fotoğrafı
kullanılıyorsa attribution/cache sözleşmesini koru.

Travel segment copy yalnız gerçek veriye dayanmalıdır:

- ulaşım türü gerçekten biliniyorsa `2h 15m flight to next stop` gibi tür gösterilebilir;
- yalnız Mapbox driving sonucu varsa mesafe/süreyi nötr biçimde göster;
- tür bilinmiyorsa `2h 15m · 142 km to next stop`;
- route yoksa `Route to next stop unavailable`;
- durakları düz çizgiyle bağlayıp gerçek rota veya uçuş gibi sunma.

MAP HOME İLE PLAN ARASINDAKİ MUTATION SINIRI

Route Preview varsayılan olarak salt okunur olmalıdır. Figma'daki drag handle, delete `×`, nights
stepper ve inline optimize kontrollerini Map Home'a taşımak mevcut Plan ile ikinci bir editör üretir.

Map Home Route Preview'da:

- stop select/center yapılabilir;
- route özeti görüntülenebilir;
- `Open trip` ile Trip Overview açılabilir;
- editor/owner için `Edit route` mevcut Plan → Route yüzeyini açar;
- editor/owner için `Add new stop` mevcut çalışan Plan add-destination akışını doğrudan açabilir;
- viewer yalnız görüntüler;
- inline delete/reorder/nights/optimize yoktur.

`Add new stop` için Plan'ın mutation ve country-scoped geocoding akışını yeniden kullan. Map Home
içinde ikinci insert/geocoding/realtime controller yazma. Doğrudan add sheet açmak shell mimarisinde
güvenli değilse `Edit route` üzerinden Plan'a git; çalışmayan CTA bırakma.

SHEET VE HARİTA SENKRONU

- Sheet yüksekliği değiştiğinde Mapbox canvas `resize()` almalı.
- Resize kullanıcının seçtiği camera center/zoom'u gereksiz yere sıfırlamamalı.
- İlk sheet açılışında route mevcut görünür alana fit edilebilir.
- Fit padding güncel sheet yüksekliği, toolbar ve safe-area'yı hesaba katmalı.
- Stop seçildiğinde yalnız ilgili stop'a odaklan; her render'da full-route fit yapma.
- `Fit entire route` ayrı 44×44 map control olabilir.
- Sheet kapanınca global Map Home kadrajına kontrollü dönülebilir.
- Route request failure sheet'i veya stop listesini kaldırmamalı.

GLOBAL BOTTOM NAVIGATION

Figma'daki yüzen, kapsül biçimli bottom nav kompozisyonunu temel al. Ancak olmayan bir sosyal
özelliği varmış gibi gösterme.

Bu görevde mevcut ürün kapsamına dayalı güvenli ilk navigasyon:

- Map → `/dashboard` (active)
- Trips → `/trips`
- Discover → `/explore`
- Profile → `/profile`

Beşinci öğe için çalışan ve global anlamı olan mevcut bir hedef doğrulanmadan `Friends` ekleme.
Mevcut `AppBottomNav` sözleşmesi farklıysa önce tüm kullanan rotaları kontrol et. Dashboard için
aceleyle özel ve uygulamanın geri kalanından kopuk ikinci bir global nav sistemi üretme. Gerekirse
paylaşılan bileşeni geriye uyumlu biçimde genişlet.

Bottom nav kuralları:

- safe-area bottom desteği;
- minimum 44 px touch target;
- kritik label en az 12 px;
- aktif Map öğesi amber;
- inactive öğeler muted;
- glass yüzey haritadan ayrılmalı;
- 320–430 px genişlikte taşmamalı;
- `aria-current="page"` ile aktif hedef belirtilmeli.

VISUAL LANGUAGE

- Dusk/Liquid Glass tasarım token'larını kullan.
- Harita ana görsel olduğu için eski dashboard ambient orb'larını haritanın üstüne taşıma.
- Tek baskın amber aksiyon kuralını koru.
- Emoji merkezli dashboard görünümünü kaldır.
- Yeni stok görsel veya dekoratif dünya illüstrasyonu ekleme.
- Cam yüzeylerde aşırı blur kullanma; metin kontrastını koru.
- Harita attribution ve provider gerekliliklerini görünür ve erişilebilir tut.

DURUMLAR VE EDGE CASE'LER

Aşağıdaki durumların her biri bilinçli UI almalı:

1. Hiç trip yok.
2. Trip var ama tarih yok.
3. Trip var ama stop yok.
4. Tek stop var.
5. 2–5 stop var.
6. 20+ stop var.
7. Sadece tamamlanmış trip var.
8. Birden fazla aktif/upcoming trip var.
9. Mapbox token yok veya map load başarısız.
10. Directions loading.
11. Directions başarısız.
12. Offline açılış.
13. Viewer rolü.
14. Reduced motion.
15. Route Preview collapsed/half/expanded.
16. Sheet açıkken browser back.
17. 20+ stop ile expanded sheet scroll.

Offline durumda mevcut cache/snapshot altyapısında güvenilir stop verisi varsa haritayı/placeholder'ı
ve trip kartını göster. Offline desteği bu görevde baştan tasarlama; sahte “live” rota durumu verme.

ERİŞİLEBİLİRLİK

- Ana sayfanın erişilebilir `h1` veya eşdeğer sayfa adı olmalı; görsel olarak gizli olabilir.
- Haritaya anlamlı accessible label ver.
- Marker seçimi yalnızca renge bağlı olmamalı.
- Harita kontrollerinin her birinde benzersiz aria-label bulunmalı.
- Trip kartının accessible name'i trip adı ve açma eylemini içermeli.
- Durum güncellemeleri yalnızca gerçekten gerekli olduğunda sakin live region kullanmalı.
- Harita gesture'ları navigation ve kartlara erişimi engellememeli.
- `%200` text zoom ve 320 px genişlikte temel eylemler görünür kalmalı.

PERFORMANS

- Mapbox'u mümkünse mevcut deferred/dynamic import yaklaşımıyla yükle.
- İlk harita yüklenirken yerleşim zıplamasını engelle.
- Trips listesinin tamamı için directions çağırma; yalnızca featured trip.
- Stop ve route türetimlerini gereksiz render'larda tekrar hesaplama.
- Map component'i geçici state yüzünden yeniden mount edilmemeli.
- Route fetch için stale response koruması ve cleanup kullan.
- Yeni ağır harita veya gesture bağımlılığı ekleme.
- Aynı stop listesini Map Home ve Route Preview için ayrı fetch etme.
- Expanded sheet'te yalnız görünür/gerekli thumbnail'leri lazy load et.

KAPSAM DIŞI

- Plan domain'i yeniden tasarlamak.
- Trip veri modeline cover image eklemek.
- Global Friends/social sistemi oluşturmak.
- Voice search eklemek.
- Uçuş/feribot segment veri modelini bu görevde icat etmek.
- Tüm Trips ekranını yeniden tasarlamak.
- Supabase migration veya RLS değişikliği.
- Kullanıcının mevcut seyahatlerini otomatik silmek/değiştirmek.
- Map Home içinde ikinci route mutation/reorder/delete/optimize sistemi yazmak.

TESTLER

Saf helper testleri ekle:

- aktif trip seçimi;
- en yakın upcoming trip seçimi;
- undated fallback;
- completed fallback;
- eşitlik durumunda deterministic seçim;
- boş trip listesi.

UI/contract test yaklaşımı projede nasıl kurulmuşsa dar biçimde doğrula:

- dashboard Map Home shell render ediyor;
- featured trip kartı doğru trip'i açıyor;
- featured trip kartı Route Preview'ı açıyor;
- collapsed/half/expanded snap state'i çalışıyor;
- stop satırı ilgili marker'ı seçip kamerayı odaklıyor;
- browser back önce açık sheet'i kapatıyor;
- viewer Route Preview'da mutation kontrolü görmüyor;
- Add/Edit route mevcut Plan akışına bağlanıyor ve duplicate mutation yazmıyor;
- 0–1 stop için directions çağrısı yapılmıyor;
- route failure pinleri/kartı ortadan kaldırmıyor;
- no-trip CTA `/trips/new` hedefine gidiyor;
- nav aktif state'i Map;
- viewer için mutation kontrolü yok.

MANUEL GÖRSEL MATRİS

- 320×568
- 375×812
- 390×844
- 430×932

Her boyutta:

- üst safe area;
- search bar;
- map controls;
- route fit;
- 1, 5 ve 22 pin;
- featured trip card;
- bottom nav;
- Mapbox attribution;
- no-trip state;
- route unavailable state;
- reduced motion kontrol edilecek.

DOĞRULAMA KOMUTLARI

Değişiklikten sonra:

1. `npm run typecheck`
2. ilgili dar dashboard/map/helper testleri
3. `npm run lint`
4. `git diff --check`
5. yalnızca hedef dosyaların `git diff` incelemesi

Tam test/build gerekiyorsa final kalite kapısında:

- `npm test`
- `npm run build`

KULLANICIYA TESLİM

- Değişen dosyaları kısa listele.
- Featured trip seçim mantığını açıkla.
- Rota başarısızlığında ne gösterildiğini belirt.
- Test ve doğrulama sonuçlarını bildir.
- Bilinen, kapsam dışı bırakılmış sonraki adımları kısa yaz.
```

---

## Görsel yerleşim özeti

```text
┌─────────────────────────────────────┐
│ safe area                           │
│  [ Search destinations…          ]  │
│                              [◎]    │
│                              [▱]    │
│                                     │
│                                     │
│        REAL MAPBOX MAP              │
│                                     │
│       ●────●────●                    │
│        FEATURED TRIP ROUTE          │
│                                     │
│  ┌───────────────────────────────┐  │
│  │ Summer Getaway        ACTIVE │  │
│  │ 3 stops · 12 days left       │  │
│  │ Barcelona → Amalfi → Santorini│  │
│  └───────────────────────────────┘  │
│   [Map] [Trips] [Discover] [Profile]│
│             safe area               │
└─────────────────────────────────────┘
```

Bu wireframe içerik yoğunluğunu anlatır; piksel ölçüsü veya birebir ikon talimatı değildir.

### Route Preview expanded durumu

```text
┌─────────────────────────────────────┐
│ [←] Mediterranean Summer    [Share]│
│                                     │
│          REAL MAPBOX MAP            │
│             ●────●                  │
│                  ╲──●               │
│                                     │
├────────────── drag handle ──────────┤
│ Your Route             3 stops · 12d│
│                                     │
│ [1] [img] Barcelona, Spain          │
│           Jul 10 – Jul 14           │
│           2h 15m · 142 km next      │
│                                     │
│ [2] [img] Amalfi Coast, Italy       │
│           Jul 14 – Jul 18           │
│           Route to next unavailable │
│                                     │
│ [3] [img] Santorini, Greece         │
│           Jul 18 – Jul 22           │
│                                     │
│ [ Add new stop ]   [ Edit route ]   │
│             safe area               │
└─────────────────────────────────────┘
```

Bu durum rota önizlemesidir. Inline silme, nights stepper, reorder ve optimize mevcut Plan ekranında
kalır.

---

## Ürün kararlarının kısa gerekçesi

- **Harita ilk ekran:** Tripper'ın temel değeri rota ve yolculuktur; kart listesi yerine ürünü doğrudan görünür kılar.
- **Tek featured trip:** Harita kalabalığını azaltır ve “şimdi ne önemli?” sorusunu cevaplar.
- **Plan'dan ayrı Map Home:** Ana ekranın sakinliğini korur, yanlışlıkla mutation riskini azaltır.
- **Gerçek rota yoksa sahte çizgi yok:** Kullanıcıya yanlış sürüş/ulaşım bilgisi verilmez.
- **Kompakt trip kartı:** Haritayı kapatmadan bağlam ve bir sonraki eylemi verir.
- **Genişleyen Route Preview:** Kullanıcıyı ayrı ekrana atmadan tüm rotayı inceletir; editing iş
  mantığını duplicate etmeden Plan'a kontrollü geçiş sağlar.
- **Global navbar:** Uygulama seviyesi hedeflerle trip içi domain hedeflerini birbirinden ayırır.
- **Friends şimdilik yok:** Üründe karşılığı olmayan bir global sosyal özelliğin vaadi verilmez.

---

## Bu ekran tamamlandığında kabul kriterleri

- Login sonrası `/dashboard` gerçek Mapbox haritası merkezli açılır.
- Kullanıcının en ilgili seyahati deterministik olarak seçilir.
- Yalnızca seçili seyahatin durakları haritada gösterilir.
- Harita rotayı arama alanı, kart ve navbar arasında doğru kadrajlar.
- Featured trip kartı collapsed/half/expanded Route Preview sheet olarak çalışır.
- Sheet açıldığında Route Focus toolbar doğru görünür; kapatıldığında global search geri gelir.
- Route Preview stop satırları haritadaki gerçek marker'larla senkron çalışır.
- Expanded sheet 20+ stop ile bağımsız ve akıcı scroll eder.
- Browser back açık Route Preview'ı önce kapatır.
- Map Home'da inline delete/reorder/nights/optimize mutation'ları bulunmaz.
- Add/Edit route aksiyonları mevcut Plan akışını yeniden kullanır.
- 20+ stop ana ekranı okunamaz hale getirmez.
- Directions başarısızlığı harita pinlerini, trip kartını veya navigation'ı engellemez.
- Hiç seyahat yoksa harita bağlamında çalışan Create/Join yolları bulunur.
- Ana sayfada trip mutation kontrolü yoktur.
- Mevcut Plan haritasının editing davranışı bozulmaz.
- 320–430 px, safe-area, reduced-motion ve erişilebilirlik gereksinimleri karşılanır.
- Typecheck, ilgili testler ve lint geçer.
