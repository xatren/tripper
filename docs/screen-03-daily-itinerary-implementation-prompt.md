# Tripper — Screen 03: Daily Itinerary Uygulama Promptu

## Tasarım kararı

Bu ekran ayrı bir üçüncü aşamadır. Kullanıcı Screen 02 Trip Overview içindeki **Quick Actions → Itinerary** kutusuna dokunduğunda doğrudan Daily Itinerary ekranı açılacaktır.

Akış:

```text
Screen 01 — Map Home
        ↓ featured trip
Screen 02 — Trip Overview
        ↓ Quick Actions / Itinerary
Screen 03 — Daily Itinerary
```

Kullanıcı Itinerary’ye dokunduktan sonra arada Route sekmesine, Plan seçim ekranına veya başka bir ara yüzeye düşmeyecektir. Daily Itinerary mevcut itinerary veri modelini, mutation akışlarını, realtime davranışını, offline queue’yu ve rol yetkilerini yeniden kullanacaktır; paralel ikinci bir itinerary sistemi yazılmayacaktır.

---

## Kopyalanabilir ana uygulama promptu

```text
Tripper için Screen 03 — Daily Itinerary ekranını uygula. Bu ekran Screen 02 Trip Overview içindeki
Quick Actions → Itinerary kutusundan doğrudan açılmalıdır.

ÜRÜN AMACI

Daily Itinerary seçilen tek bir seyahat gününü görsel zaman çizelgesi olarak sunar:

- üstte gün numarası ve gerçek tarih;
- önceki/sonraki gün navigasyonu;
- saat sıralı itinerary kartları;
- kategori ikonu, süre ve konum;
- lifecycle/status'a göre anlamlı timeline;
- seçilen günün küçük rota haritası;
- editor/owner için aktivite ekleme ve mevcut düzenleme aksiyonları;
- viewer için tam kullanılabilir salt okunur görünüm.

Bu ekran yeni bir veri ürünü değildir. Mevcut `itinerary_items`, projected stops, status machine,
drag reorder, item sheet, optimization, realtime ve offline mutation altyapısının yeni görsel
sunumudur.

GİRİŞ NOKTASI

Screen 02 Trip Overview Quick Actions grid'indeki ilk tile'ın label'ı `Itinerary` olmalıdır.

- Tile `onOpenItinerary` benzeri açık bir callback çağırmalı.
- Callback ownership `TripMobileClient` seviyesinde olmalı.
- Kullanıcı doğrudan Daily Itinerary ekranına gelmeli.
- Varsayılan Plan → Route görünümüne uğramamalı.
- Back kontrolü doğrudan Trip Overview'a dönmeli.
- Browser history/back aynı mantıksal dönüşü üretmeli.
- Deep link stratejisi mevcut shell route modeline uyuyorsa seçili gün URL/query ile ifade edilebilir;
  sırf bu ekran için kırılgan bir paralel router mimarisi kurma.

SCREEN 02 SINIRLI WIRING

Bu görevin Screen 02'de yapacağı tek değişiklik Itinerary tile'ının label ve navigation bağlantısıdır.
Screen 02'nin hero, progress, focus card, members veya diğer Quick Actions tasarımını bu görevde
yeniden ele alma.

ÖNCE MEVCUT SİSTEMİ DAR İNCELE

1. `git status --short` ve `AGENTS.md` kontrol et; kullanıcı değişikliklerini koru.
2. Büyük dosyaları baştan sona okuma. `rg -n` ile hedef sembolleri bul ve yakın çevresini incele.
3. Ana hedefler:
   - `app/trip/[id]/mobile/TripMobileClient.tsx`
   - `app/trip/[id]/mobile/TripOverviewDomain.tsx` yalnız Quick Action bağlantısı
   - `app/trip/[id]/mobile/PlanRouteDomain.tsx` yalnız Days/Itinerary mount bölgesi
   - `app/trip/[id]/mobile/itinerary/ItineraryTimeline.tsx`
   - `app/trip/[id]/mobile/itinerary/ItineraryDaySection.tsx`
   - `app/trip/[id]/mobile/itinerary/ItineraryItemRow.tsx`
   - `app/trip/[id]/mobile/itinerary/ItineraryItemSheet.tsx` yalnız props sözleşmesi
   - `app/trip/[id]/mobile/itinerary/TravelSegmentRow.tsx`
   - `app/trip/[id]/mobile/itinerary-projection.ts`
   - `app/trip/[id]/mobile/trip-lifecycle.ts`
   - `app/trip/[id]/mobile/components/TripMobileHeader.tsx`
   - `app/trip/[id]/mobile/components/TripPrimaryNav.tsx`
   - `components/map/mapbox/TripboxMap.tsx`
   - `lib/mapbox/directions.ts`
   - `lib/travel-mode.ts` yalnız status transition sözleşmesi
   - `types/index.ts` yalnız ItineraryItem/Status/Type, Stop ve Trip tipleri
4. Şu mevcut davranışları doğrula:
   - `buildTimeline` ve projected stop satırları;
   - selected day state;
   - `ItineraryItemSheet` create/edit;
   - day reorder ve realtime pause;
   - offline mutation queue;
   - optimize preview;
   - status transition guard;
   - unscheduled drawer.

MİMARİ SINIR: İŞ MANTIĞINI DUPLICATE ETME

Daily Itinerary için ikinci bir CRUD/state sistemi yazma. Mevcut `ItineraryTimeline` iş mantığını
yeniden kullan veya küçük, net parçalara ayır:

- timeline/day projection;
- selected-day controller;
- item mutation handlers;
- item sheet state;
- reorder/optimize handlers;
- new visual daily view.

Tercih edilen sonuç:

- Daily Itinerary shell seviyesinde ayrı bir görünür screen/domain olur;
- mevcut Plan Route yüzeyi rota düzenleme görevini sürdürür;
- itinerary business logic ortak bileşen/hook üzerinden tek kaynaktan çalışır;
- aynı anda iki ayrı mounted itinerary controller realtime/mutation dinlemez;
- `items` ve `setItems` ownership mevcut `TripMobileClient` seviyesinde kalır.

Sırf dosya küçültmek için geniş refactor yapma. Fakat iki kopya save/reorder/status fonksiyonu
oluşturmaktan kaçınmak için gerekli dar extraction kabul edilir.

EKRAN YERLEŞİMİ

Ekran tam yükseklik mobil yüzeydir:

1. Safe-area altında günlük header.
2. Dikey timeline ve itinerary kartları.
3. Günün route/map preview alanı.
4. Editor action veya empty state.
5. Mevcut trip navigation için alt boşluk/safe-area.

İçerik dikey scroll eder. Header mümkünse sticky kalır, ancak 320×568 kısa ekranda itinerary
içeriğini gereksiz sıkıştırmamalıdır. Harita preview içeriğin doğal devamıdır; sabit overlay değildir.

GÜNLÜK HEADER

Header içeriği:

- sol: önceki gün;
- merkez: `Day 3 of 12`;
- merkez alt: `Thursday, July 16`;
- sağ: sonraki gün;
- ayrı, açık bir Back to Overview kontrolü mevcut shell/header sözleşmesiyle sağlanmalı;
- editor/owner için Add Activity kontrolü erişilebilir bir yerde bulunmalı.

Önceki/sonraki gün:

- ilk günde previous disabled;
- son günde next disabled;
- disabled kontrol focus/semantik olarak doğru davranmalı;
- gün değiştiğinde selected item temizlenmeli veya yeni güne ait değilse temizlenmeli;
- ekran yeni günün başına kaydırılmalı;
- reduced-motion'da yatay geçiş animasyonu olmamalı.

Swipe gün navigasyonu eklenirse:

- dikey scroll ile kavga etmemeli;
- yeni gesture bağımlılığı eklenmemeli;
- keyboard ve ok button'ları her zaman eşdeğer çalışmalı;
- swipe zorunlu değil, button davranışı birincildir.

Başlığa dokununca gün seçici açmak mevcut `DayStrip`/day options ile küçük kapsamda mümkünse ekle.
Yeni ağır calendar kütüphanesi ekleme.

İLK SEÇİLİ GÜN

Deterministik seçim:

1. query/deep link ile geçerli bir gün verilmişse o gün;
2. seyahat aktifse bugün;
3. upcoming ise ilk gün;
4. completed ise son anlamlı itinerary günü veya son gün;
5. undated projection'da ilk available day;
6. timeline boşsa empty state.

Mevcut `ItineraryTimeline` selected day algoritmasını tek kaynak olarak koru veya testlerle eşdeğer
hale getir. Ayrı ikinci tarih algoritması yazma.

TIMELINE TASARIMI

Figma'daki sol dikey çizgi günlük akışı temsil eder. Çizgi dekoratif olmaktan öte gerçek durum
anlamı taşımalıdır.

Her itinerary kartı çizgi üzerindeki kendi node'u ile hizalanır:

- planned: neutral/cyan outline node;
- on_the_way: hareket/travel accent;
- arrived: güçlü cyan node;
- completed: check node ve dimmed kart;
- skipped: kesik/muted node ve kart;
- conflict: warning node.

Aktif seyahatin bugünkü gününde mevcut saate göre “now” göstergesi eklenebilir:

- yalnız güvenilir timed item verisi varsa;
- cyan nokta + erişilebilir `Current time` anlamı;
- sabit olarak timeline'ın en üstüne çizilmemeli;
- gelecek/geçmiş günlerde now marker gösterilmemeli;
- yalnız renkle anlatılmamalı.

Projected stop entry'leri timeline'da korunmalı ve `From route` anlamı kaybolmamalı. Stop projection'ı
DB item'a dönüştürme veya migration/backfill yapma.

KART BİLGİ HİYERARŞİSİ

Her kart:

- category/type ikonu;
- start time veya All day;
- title;
- address/location;
- duration;
- status görünümü;
- locked/conflict/booking gibi mevcut anlamlı işaretler.

Figma düzenine yaklaş:

- ikon solda renkli daire;
- saat ve süre üst metadata;
- başlık güçlü;
- konum pin ikonu + address muted;
- kartlar solid dark surface; dense listede blur yok;
- minimum kritik metin 12 px;
- title iki satıra kadar izin verebilir;
- duration sağ üstte küçük ama okunur;
- kart yüksekliği sabit değil, içeriğe göre büyür.

Kategori renkleri semantik ve tutarlı olmalı. Mevcut `ITEM_TYPE_META` tek kaynak olsun; ikinci type
label/icon tablosu oluşturma. Gerekirse `ITEM_TYPE_META` küçük biçimde renk metadata'sıyla genişlet.

KART ETKİLEŞİMİ

Kart tap:

- item detail/edit sheet'i açar veya mevcut seçme davranışını kullanır;
- viewer detay görebilir ama mutation yapamaz;
- editor mevcut edit/move/delete/toggle-complete aksiyonlarına ulaşır;
- nested action ve drag handle tap'leri ana card tap'i tetiklemez.

Drag reorder:

- mevcut dnd-kit ve realtime pause/resume korunur;
- yalnız editable item'lar;
- projected stop ve locked item kuralları korunur;
- touch long-press list scroll'unu bozmamalı;
- keyboard reorder korunmalı;
- saat verilmiş item'ların order/time çelişkisi varsa mevcut conflict sinyalini kaybetme.

TRAVEL SEGMENTLERİ

Mevcut `TravelSegmentRow` işlevi korunabilir, ancak Figma timeline'ını gereksiz uzatmamalı.

- iki koordinatlı item arasında gerçek route sonucu varsa kısa travel metadata göster;
- loading layout'u zıplatmamalı;
- failure sonsuz spinner üretmemeli;
- ulaşım türü bilinmiyorsa sürüş olduğu iddia edilmemeli;
- harita preview ile aynı rota sonucu paylaşılabiliyorsa duplicate API request atma.

ADD ACTIVITY

Figma görüntüsünde mutation CTA görünmüyor; çalışan ürün için editor/owner'a ekleme yolu gereklidir.

Tercih sırası:

1. Header'da 44×44 `Add activity` icon button;
2. Gün sonunda secondary `Add activity` row;
3. Empty state içinde `Add to this day`.

Ekranda aynı anda birden fazla baskın amber CTA gösterme. Header plus kullanılıyorsa timeline sonunda
ikinci amber buton olmasın. Viewer'da mutation CTA render edilmemeli.

Add action mevcut `ItineraryItemSheet` create flow'unu seçili gün ile açmalı. Yeni form yazma.

EMPTY / UNSCHEDULED

Seçili gün boşsa:

- title: `Nothing planned yet`;
- editor: `Add an activity, stay, or note to this day` + çalışan Add action;
- viewer: `An editor can fill this day in`;
- map preview için sahte rota çizme.

Unscheduled drawer mevcut işlevini korumalı. Yeni tasarımda gün içeriğini domine etmemeli; küçük
secondary row/sheet entry olarak erişilebilir olabilir. Move-to-day akışı bozulmamalı.

TODAY'S MAP TRACK / DAY ROUTE PREVIEW

Timeline'ın altında kompakt bir harita preview göster. Başlık seçili güne göre dinamik olmalı:

- seçili gün bugün: `Today's route`;
- diğer gün: `Day 3 route`;
- tek koordinat: `Day 3 locations`;
- koordinat yok: harita yerine `No mapped places for this day` fallback.

Harita:

- yalnız seçili günün geçerli lat/lng taşıyan entry'leri;
- itinerary sırasına göre marker;
- selected/current item vurgusu;
- 16:7 veya benzeri kompakt geniş aspect ratio;
- rounded border ve Dusk uyumlu çerçeve;
- scroll sırasında gesture yakalamayan read-only preview;
- preview'a tap tam Plan Map veya gün odaklı map yüzeyini açabilir.

Uydu görünümü Figma'da görsel olarak güçlüdür, fakat mevcut `TripboxMap` dark stil sözleşmesini genişletmek
gerekiyorsa bunu kontrollü yap:

- optional preview style/variant geriye uyumlu olsun;
- Plan ve Map Home default stilini değiştirme;
- Mapbox attribution görünür kalsın;
- token/style yoksa dark map veya Dusk placeholder kullan;
- sırf uydu görseli için ikinci harita kütüphanesi ekleme.

ROTA DOĞRULUĞU

- 0 koordinat: map yok/fallback;
- 1 koordinat: tek marker, rota çizgisi yok;
- 2+ koordinat: mevcut Mapbox directions helper ile route isteği;
- gerçek sonuç varsa route line;
- sonuç yoksa yalnız marker'lar;
- düz çizgiyi gerçek rota gibi gösterme;
- request abort/stale response koruması için `LatestRouteRequestController` veya eşdeğer mevcut
  yaklaşımı kullan;
- gün değişince önceki günün route sonucu yeni güne yazılmamalı;
- route failure Daily Itinerary ekranını error boundary'ye düşürmemeli;
- aynı koordinatlar için Timeline travel segments ve map preview mümkünse tek hesap paylaşmalı.

STATUS / LIFECYCLE DAVRANIŞI

Mevcut status machine:

- planned;
- on_the_way;
- arrived;
- completed;
- skipped.

`lib/travel-mode.ts` transition guard'ını bypass etme. UI'da mümkün olmayan status mutation sunma.
Completed item line-through/dimmed olabilir, ancak metin kontrastı erişilemez seviyeye düşmemeli.

Upcoming trip:

- item'lar planned görünür;
- now marker yok;
- Travel Mode mutation'ları zorla açılmaz.

Active trip / bugün:

- current/next item daha güçlü görünür;
- geçerli transition action'ları erişilebilir;
- now marker kullanılabilir.

Completed trip:

- timeline geçmiş kayıt olarak okunur;
- yanlışlıkla active CTA gösterilmez;
- journal/recap bağlantısı ayrı ekranın sorumluluğudur.

NAVIGATION

Screen 03 ayrı bir trip içi yüzeydir:

- Back → Screen 02 Trip Overview;
- previous/next → yalnız gün değiştirir;
- card → detail/edit;
- map preview → tam map/Plan bağlamı;
- bottom navigation kararı tüm 12 ekran tamamlanana kadar mevcut `TripPrimaryNav` davranışını korur.

Figma alt barındaki `Map / Trips / Discover / Friends / Profile` yapısını bu görevde projeye zorla
taşıma. Özellikle mevcut olmayan global `Friends` özelliğini ekleme. Global/trip navigation dönüşümü
ayrı bir final navigation promptunda ele alınacaktır.

Mevcut TripPrimaryNav korunuyorsa:

- içerik bottom nav altında kalmamalı;
- aktif hedefin semantiği tutarlı olmalı;
- Daily Itinerary için Plan active gösterilebilir, fakat back yine Overview'a dönmelidir.

LOADING / ERROR / OFFLINE

Loading:

- header ölçüsü sabit;
- 3–4 timeline card skeleton;
- map preview skeleton;
- büyük layout shift yok.

Error:

- itinerary data failure tüm trip shell'i zorunlu olarak düşürmüyorsa section-level retry;
- route failure yalnız map preview alanında degrade;
- sahte boş gün gösterme.

Offline:

- cached itinerary görünür;
- mevcut offline mutation queue ile izin verilen item değişiklikleri çalışır;
- route tile yüklenemiyorsa Dusk map fallback;
- offline durumunda gerçekmiş gibi yeni distance/duration üretme;
- pending sync durumu anlaşılır ama sakin gösterilir.

ERİŞİLEBİLİRLİK

- ekran `Daily itinerary` accessible page name taşımalı;
- `Day 3 of 12` heading olmalı;
- previous/next benzersiz aria-label: `Previous day`, `Next day`;
- disabled gün kontrolleri doğru semantik;
- timeline ordered list veya anlamlı group/list semantiği;
- kart accessible name saat + başlık + durum içermeli;
- now marker screen reader için `Current time` anlamı taşımalı;
- map preview accessible summary: `Day 3 route with 4 mapped stops`;
- map görseli timeline bilgisinin tek kaynağı olmamalı;
- tüm touch target'lar minimum 44×44;
- kritik metin minimum 12 px;
- %200 text zoom'da header ve kartlar kırılmamalı;
- renk tek başına status/type anlatmamalı.

PERFORMANS

- aynı anda yalnız seçili günün ağır kart/map içeriğini render et;
- diğer günlerin map'lerini önceden mount etme;
- map preview'ı gerekirse deferred/dynamic load et;
- selected day değişiminde gereksiz Supabase refetch yapma; lifted items verisini kullan;
- route request'lerini coordinate key ile sınırla;
- stop/item projection'ı memoize et;
- 30+ item gününde kullanılabilir scroll performansı;
- yeni carousel, calendar, map veya gesture bağımlılığı ekleme.

KAPSAM DIŞI

- Screen 01 Map Home'u değiştirmek.
- Screen 02 hero/focus/progress/members tasarımını değiştirmek.
- Global navigation mimarisini tamamlamak.
- Friends özelliği eklemek.
- Yeni itinerary tablosu veya migration.
- Status machine'i değiştirmek.
- Yeni item editor formu yazmak.
- Bookings/Budget/Journal ekranlarını yeniden tasarlamak.
- Ulaşım türü bilinmiyorsa flight/ferry/driving tahmin etmek.

TESTLER

Saf/helper testleri:

- initial selected day: deep link/today/upcoming/completed/undated;
- previous/next bounds;
- dinamik map başlığı;
- 0/1/2+ coordinate route davranışı;
- current-time marker yalnız active today;
- status → timeline node görünümü;
- item order ve projected stop preservation;
- route stale response guard.

UI/contract testleri mevcut proje yaklaşımıyla:

- Overview Itinerary tile Daily Itinerary'yi açar;
- Back Overview'a döner;
- Day X of Y ve tarih görünür;
- ilk/son gün arrow disabled;
- viewer'da Add/Edit/Delete yok;
- editor Add Activity mevcut sheet'i açar;
- empty state doğru role copy'si;
- completed/skipped semantics;
- route failure timeline'ı kaldırmaz;
- map preview koordinatsız item'larda sahte çizgi göstermez;
- TripPrimaryNav davranışı bozulmaz;
- realtime/offline mutation contract'ları korunur.

MANUEL GÖRSEL MATRİS

Viewport:

- 320×568
- 375×812
- 390×844
- 430×932

Veri:

- 0 item;
- 1 item;
- 4 item;
- 15+ item;
- all-day item;
- uzun title/address;
- mixed timed/untimed;
- projected stop;
- locked/conflict item;
- 0/1/4 mapped item.

Durum:

- upcoming;
- active today;
- active başka gün;
- completed;
- owner/editor/viewer;
- online/offline/pending sync;
- route loading/ready/failure;
- reduced motion;
- 200% text zoom.

DOĞRULAMA

Uygulamadan sonra:

1. `npm run typecheck`
2. itinerary projection, map sync, lifecycle ve travel-mode ilgili dar testleri
3. yeni Screen 03 dar testleri
4. `npm run lint`
5. `git diff --check`
6. yalnız hedef dosyaların diff incelemesi

Final kalite kapısı:

- `npm test`
- `npm run build`

KULLANICIYA TESLİM

- Screen 02 → Screen 03 navigation bağlantısını belirt.
- Reuse edilen mevcut itinerary iş mantığını açıkla.
- Timeline status ve map fallback davranışını özetle.
- Viewer/editor farkını belirt.
- Test ve doğrulama sonuçlarını bildir.
```

---

## Görsel yerleşim özeti

```text
┌──────────────────────────────────────┐
│  ‹          Day 3 of 12           › │
│             Thursday, July 16        │
│                                      │
│  ●  09:00                            │
│  │  ┌─────────────────────────────┐  │
│  │  │ 🚌 Depart to Ravello   45m  │  │
│  │  │    Amalfi Bus Station       │  │
│  │  └─────────────────────────────┘  │
│  │                                   │
│  ●  10:30                            │
│  │  ┌─────────────────────────────┐  │
│  │  │ Explore Villa Cimbrone  2h  │  │
│  │  │ Ravello High Cliff          │  │
│  │  └─────────────────────────────┘  │
│  │                                   │
│  ●  13:00                            │
│  │  ┌─────────────────────────────┐  │
│  │  │ Lunch at Cumpà Cosimo 1h30 │  │
│  │  └─────────────────────────────┘  │
│  │                                   │
│  └                                   │
│                                      │
│  Day 3 route                         │
│  ┌────────────────────────────────┐  │
│  │     READ-ONLY MAP PREVIEW      │  │
│  │       ● ───── ● ───── ●        │  │
│  └────────────────────────────────┘  │
│                                      │
│  [existing trip primary navigation] │
└──────────────────────────────────────┘
```

Wireframe bilgi hiyerarşisini gösterir; birebir ikon veya piksel şartı değildir.

---

## Durum matrisi

| Durum | Timeline | Ana aksiyon | Harita |
|---|---|---|---|
| Upcoming | Planned node’lar | Add activity | Seçili gün preview |
| Active / bugün | Now marker + status | Travel/status aksiyonları | Güncel rota |
| Active / başka gün | Status node’ları, now yok | Add/edit | Seçili gün rota |
| Completed | Completed/skipped geçmişi | Detay görüntüleme | Arşiv rota preview |
| Viewer | Salt okunur | Mutation yok | Görüntülenebilir |
| Route unavailable | Timeline aynı kalır | Item aksiyonları çalışır | Yalnız pin/fallback |

---

## Bu ekran tamamlandığında kabul kriterleri

- Trip Overview’daki `Itinerary` kutusu Screen 03’ü doğrudan açar.
- Kullanıcı arada Route sekmesine düşmez.
- Back doğrudan Trip Overview’a döner.
- Gün başlığı, gerçek tarih ve sınırları doğru previous/next kontrolleri vardır.
- Mevcut itinerary item’ları tek günlük görsel timeline’da gösterilir.
- Status’lar timeline node ve kart durumuna doğru yansır.
- Aktif gün dışında sahte now marker gösterilmez.
- Editor mevcut item sheet ile aktivite ekleyebilir; viewer mutation kontrolü görmez.
- Drag reorder, realtime pause, offline queue, projected stops ve status guard korunur.
- Gün haritası yalnız gerçek koordinatlı item’ları kullanır.
- Gerçek route yoksa sahte düz rota çizilmez; timeline kullanılabilir kalır.
- Screen 02’nin diğer bölümleri ve mevcut trip domain’leri değiştirilmez.
- Global navbar dönüşümü bu görevde yapılmaz.
- 320–430 px, safe-area, reduced-motion ve erişilebilirlik gereksinimleri karşılanır.
- Typecheck, ilgili testler, lint ve final build geçer.

