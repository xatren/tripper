# Tripper — Screen 02: Visual Trip Overview Uygulama Promptu

## Tasarım kararı

Map Home üzerindeki featured trip kartına dokunulduğunda seyahatin görsel ana ekranı açılacaktır. Bu ekran mevcut `TripOverviewDomain` işlevlerini koruyacak, ancak metin ve özet kart ağırlıklı yapı yerine fotoğraf merkezli bir “trip control center” kompozisyonuna taşınacaktır.

Ekranın temel bölümleri:

1. Büyük destinasyon/seyahat kapak görseli.
2. Kapak üzerinde trip adı, tarih, yaşam döngüsü durumu ve geri sayım.
3. Fotoğraflı veya görsel fallback’li yatay durak şeridi.
4. Yaşam döngüsüne göre değişen bağlamsal odak kartı.
5. Hazırlık/ilerleme göstergesi.
6. Mevcut domain’lere giden altı hızlı aksiyon.
7. Üye avatarları ve yetkiye bağlı davet aksiyonu.

Bu ekran yeni veri icat etmeyecek; mevcut trip, stop, overview, member, route ve lifecycle sözleşmelerini kullanacaktır. `trips.cover_image_url` alanı mevcut şemada bulunduğu için yeni migration gerekmeyecektir.

---

## Kopyalanabilir ana uygulama promptu

```text
Tripper'ın mevcut trip Overview ekranını Figma'daki fotoğraf merkezli “Trip Overview”
kompozisyonuna taşı. Mevcut veri, lifecycle, yetki ve domain navigation davranışlarını koru.

ÜRÜN BAĞLAMI

Kullanıcı login sonrasında Map Home'a gelir. Map Home'daki featured trip kartına dokunduğunda
`/trip/{id}/mobile` içindeki Overview açılır. Yeni Trip Overview, kullanıcının seyahati için görsel
kontrol merkezi olmalıdır:

- seyahatin kimliğini kapak görseliyle hissettirir;
- “şimdi ne önemli?” sorusuna tek bağlamsal kartla cevap verir;
- Plan, Budget, Bookings, Packing, Journal ve Travel Mode'a hızlı erişim sağlar;
- üyeleri görünür kılar;
- mevcut trip workspace state ve navigation mimarisini bozmaz.

Figma ekranını birebir statik kopyalama. Mevcut Tripper verilerine ve aşağıdaki lifecycle
durumlarına uyarlanmış, gerçek çalışan bir ekran üret:

- undated;
- upcoming;
- active;
- completed.

MEVCUT MİMARİYİ KORU

Ana hedef dosyalar:

- `app/trip/[id]/mobile/TripOverviewDomain.tsx`
- `app/trip/[id]/mobile/TripMobileClient.tsx`
- `app/trip/[id]/mobile/overview-data.ts`
- `app/trip/[id]/mobile/trip-lifecycle.ts`
- `app/trip/[id]/mobile/trip-domain-utils.ts`
- `app/trip/[id]/mobile/components/TripMobileHeader.tsx`
- `app/trip/[id]/mobile/components/TripPrimaryNav.tsx`
- `components/design/tokens.ts`
- `components/mobile/tokens.ts`
- `types/index.ts` içindeki yalnızca Trip, Stop, TripMember ve Profile tipleri

Gerekli olduğunda yalnızca props/navigation bağlantıları için:

- `app/trip/[id]/mobile/page.tsx`
- `app/trip/[id]/mobile/components/TripMoreSheet.tsx`
- `app/trip/[id]/mobile/JournalDomain.tsx` içindeki signed photo yaklaşımı

Dar inceleme yap:

1. `git status --short` ve `AGENTS.md` kontrol et.
2. Büyük dosyaları baştan sona okuma.
3. `rg -n` ile yalnızca şu sembolleri bul ve yakın çevresini aç:
   - `TripOverviewDomainProps`
   - `TripOverviewDomain`
   - `tripLifecycle`
   - `UpcomingReadiness`
   - `ActiveContent`
   - `CompletedContent`
   - `TripOverviewDomain` çağrısı
   - `TripPrimaryNav`
   - `openMoreDestination`
   - `selectSection`
4. Mevcut overview sorgularını, error ayrımını ve retry akışını anlamadan JSX'i değiştirme.
5. Kullanıcının ilgisiz değişikliklerini koru; geniş refactor yapma.

TEMEL YERLEŞİM

Mobil ekran dikey bir scroll container olacaktır:

1. Edge-to-edge hero image.
2. Hero ile içerik arasında yatay stop carousel.
3. Lifecycle focus card.
4. Progress block.
5. Quick Actions grid.
6. Trip Members.
7. Alt safe-area ve mevcut trip navigation kararı.

Sayfa 320–430 px genişlikte çalışmalı. Hero dışındaki içerik 16 px yatay padding kullanabilir.
Hero tam genişlikte olmalı; mevcut `main` container padding'i hero'yu daraltıyorsa Overview için
kontrollü edge-to-edge varyant oluştur. Diğer domain ekranlarının padding'ini bozma.

HERO

Hero yaklaşık 240–280 px yüksekliğinde, ekranın en güçlü görsel alanı olmalıdır.

İçerik:

- arka plan trip cover;
- üstte safe-area içinde Back ve Settings/More kontrolleri;
- altta glass/scrim üzerinde trip title;
- date range;
- trip scope veya member özeti;
- lifecycle badge;
- lifecycle'a göre tek zaman mesajı.

Hero text kontrastı busy fotoğraflarda da AA seviyesinde kalmalıdır. Fotoğrafın alt kısmında lokal
dark scrim/gradient kullan. Tüm görseli ağır blur ile kapatma.

Back:

- Map Home mimarisi uygulanmışsa `/dashboard` hedefine dönmeli.
- Henüz uygulanmamış geçiş döneminde mevcut güvenli geri davranışını koru.
- `router.back()` ile belirsiz dış history'ye dönmek yerine mevcut shell kararını takip et.

Settings/More:

- mevcut çalışan More sheet'i açmalı;
- yeni, boş settings ekranı üretme;
- en az 44×44 px touch target;
- fotoğraf üzerinde görünür scrim/glass yüzey.

KAPAK GÖRSELİ KAYNAĞI

Şemada mevcut `trips.cover_image_url` alanını birincil kaynak olarak kullan. Yeni migration ekleme.

Kaynak önceliği:

1. Geçerli ve izin verilen `trip.cover_image_url`.
2. Mevcut private journal fotoğraflarından güvenli signed URL ancak overview server/client veri
   sözleşmesi bunu açıkça ve küçük kapsamla destekleyebiliyorsa.
3. Mevcut Mapbox static route/focus görüntüsü güvenli şekilde yeniden kullanılabiliyorsa.
4. Vibe/country odaklı Dusk gradient + minimal landmark/route placeholder.

Bu görevde üçüncü taraf stok fotoğraf servisi ekleme. Google Places provider görselini kalıcı
trip cover gibi cache/persist etme. Provider attribution ve kullanım sözleşmesi belirsizse fallback
kullan.

Güvenlik:

- arbitrary URL'yi tehlikeli inline CSS/HTML olarak kullanma;
- Next Image remote config uyumsuzluğu varsa kontrollü `<img>` + referrer/cross-origin davranışını
  incele veya mevcut image yaklaşımını kullan;
- private journal storage path'ini doğrudan public URL gibi render etme;
- signed URL yüklenemezse hero layout bozulmamalı.

Kapak seçme/yükleme UI'si bu ekranın ilk uygulama kapsamı değildir. Hero mevcut cover'ı tüketir;
cover yönetimi ayrı bir sonraki görev olabilir.

LIFECYCLE HERO COPY

Badge ve zaman mesajı aynı bilgiyi tekrar etmemeli.

Undated:

- badge: `DATES NOT SET`
- zaman mesajı: `Add dates to unlock your trip timeline`

Upcoming:

- badge: `UPCOMING`
- zaman mesajı: `12 days away`, `Tomorrow` veya `Today`

Active:

- badge: `DAY 4 OF 12`
- zaman mesajı: `Today in Barcelona` gibi mevcut stop schedule'dan türeyen bağlam

Completed:

- badge: `COMPLETED`
- zaman mesajı: `View trip recap` veya completion date

`12 DAYS` ve `12 days away` gibi aynı countdown'u iki kez gösterme. Date range ayrı metadata olarak
kalabilir. Tarih hesaplarında mevcut `tripLifecycle`, `currentTripDay`, `daysBetween`,
`localDateISO` helper'larını kullan; JSX içinde ikinci paralel tarih algoritması yazma.

Trip scope satırı:

- tek üyeyse `Personal trip`;
- birden fazlaysa gerçek member sayısı (`3 travelers`);
- kullanıcı rolünü müşteri metnine taşımak gerekli değil;
- veri yoksa sahte “Personal Trip” gösterme.

DURAK CAROUSEL

Hero'nun altında yatay scroll/snap çalışan stop chip'leri göster.

Her chip:

- en az 44 px yükseklik;
- görsel thumbnail veya güvenilir fallback;
- stop name;
- arrival/departure date ya da schedule'dan türeyen kısa aralık;
- tek satırda taşmayan, ellipsis kullanan isim;
- erişilebilir isim;
- seçildiğinde Plan/Days içindeki ilgili stop'a gitme imkânı mevcut navigation sözleşmesiyle
  küçük kapsamda sağlanabiliyorsa uygula.

Carousel kuralları:

- sonraki chip'in kısmi görünmesi yatay kaydırma affordance'ı versin;
- scrollbar görsel olarak gizlenebilir ama keyboard/touch scroll çalışmalı;
- 20+ stop performansı ve yatay akış korunmalı;
- DOM'da gereksiz ağır görseller mount etme; native lazy loading kullan;
- stop sırası `order_index` ile deterministik olmalı.

Stop thumbnail veri modelinde doğrudan fotoğraf yoktur. Bu nedenle:

1. Güvenilir stop photo URL mevcut değilse gerçek fotoğraf varmış gibi sahte uzaktan URL üretme.
2. Mapbox/focus thumbnail güvenli ve maliyet kontrollü değilse kullanma.
3. Fallback olarak stop türü, ülke veya konum tabanlı deterministik gradient/monogram kullan.
4. Görsel fallback tüm chip'lerde tutarlı olmalı ve “yüklenemeyen fotoğraf” gibi görünmemeli.

Stop yoksa carousel yerine kompakt bir card göster:

- `No destinations yet`
- editor/owner için `Start planning` → Plan;
- viewer için açıklayıcı salt okunur metin.

LIFECYCLE FOCUS CARD

Figma'daki `TODAY'S PREPARATION` kartını lifecycle'a göre dinamik hale getir. Aynı kart her durumda
aynı başlığı göstermemeli.

Undated:

- başlık: `NEXT STEP`
- içerik: tarih ekleme veya ilk durağı planlama;
- action: mevcut çalışır hedef.

Upcoming:

- başlık: `TODAY'S PREPARATION`
- packing/trip task/readiness verisinden en önemli tamamlanmamış öğe;
- secondary action: `Review checklist`.

Active:

- başlık: `TODAY'S PLAN`
- bugünün sıradaki itinerary öğesi veya mevcut/sonraki durak;
- secondary action: `View itinerary`.

Completed:

- başlık: `TRIP HIGHLIGHTS`
- journal/photo/recap özeti;
- secondary action: `Open recap`.

Odak kartında sahte görev veya placeholder ürün metni gösterme. Veri bölümünün yüklenmesi başarısızsa
0 değerinden sahte “all done” sonucu çıkarma. Mevcut `OverviewSection` ready/error ayrımını koru.

Uzun görev başlığı:

- iki satıra kadar görünmeli;
- kritik anlamı ellipsis ile tamamen kaybetmemeli;
- kartın sağındaki action ile çakışmamalı;
- gerekiyorsa başlık/action'ı ayrı satırlara geçir.

Hazırlık verisinde gerçek `trip_tasks` overview projection'ı yoksa bu görev için geniş sorgu zinciri
eklemeden mevcut packing/readiness özetini kullan. Yeni query eklemek gerekiyorsa yalnızca gereken
minimal alanları seç ve section-level error davranışı ekle.

PROGRESS BLOCK

Upcoming durumda hazırlık ilerlemesini göster:

- label: `Preparation progress`;
- sağda `75% done`;
- progressbar semantiği (`role="progressbar"`, aria-valuemin/max/now);
- değer mevcut readiness/packing verisinden türemeli;
- 0 öğe varsa `0%` ile sahte başarısızlık hissi vermek yerine `Not started` durumu gösterilebilir;
- data error varsa yüzde gösterme; `Progress unavailable` göster.

Active durumda bu alan isteğe göre bugünkü itinerary progress'e dönüşebilir; güvenilir hesap yoksa
upcoming preparation progress'i aktif seyahatte zorla gösterme. Completed durumda recap/journal veya
settlement durumuna ayrılmış lifecycle içeriğini kullan.

Progress görseli:

- track koyu/neutral;
- fill cyan/teal;
- amber yalnızca primary action için;
- animasyon reduced-motion tercihine uymalı.

QUICK ACTIONS

İki satır, üç sütun grid kullan:

1. Plan
2. Budget
3. Bookings
4. Checklist
5. Photos
6. Travel Mode

Navigation eşleşmeleri:

- Plan → `onSelectSection('plan')`
- Budget → `onOpenDestination('budget')`
- Bookings → `onSelectSection('bookings')`
- Checklist → `onOpenDestination('packing')`
- Photos → `onOpenDestination('journal')`
- Travel Mode → `onOpenDestination('travel')`

Figma'daki `Itinerary` label'ı yerine `Plan` kullan; Tripper'da rota ve days aynı domain altındadır.
`Go Live` tek başına kullanma; canlı yayın çağrışımı yapar. Görsel vurgu korunacaksa label `Travel Mode`
veya lifecycle'a göre `Start Travel Mode` / `Continue Journey` olsun.

Quick action kuralları:

- her tile minimum 44 px touch target, pratikte yaklaşık 88–100 px yükseklik;
- icon + label;
- accessible name;
- tek baskın amber tile yalnızca active lifecycle'da Travel Mode olabilir;
- upcoming/undated durumda Travel Mode amber olmamalı veya disabled sahte kontrol olarak görünmemeli;
- completed durumda Travel Mode yerine `Trip Recap` gösterme kararı alınabilir, fakat navigation
  eşleşmesi gerçek çalışan Journal/recap akışına gitmeli;
- viewer navigation yapabilir; mutation yapmayan domain erişimi engellenmemeli;
- tile içine sahte badge/count doldurma.

TRIP MEMBERS

Alt bölümde gerçek `members` verisinden avatar satırı göster:

- ilk 4 üye avatarı;
- devamı varsa `+N`;
- avatar URL yoksa mevcut initials fallback;
- avatar image alt metni veya erişilebilir member adı;
- satıra dokunmak mevcut Members destination'ını açabilir;
- `+` invite kontrolü yalnızca mevcut capabilities sözleşmesi izin veriyorsa gösterilmeli;
- UI yetkisi RLS'in yerine geçmez.

Üye profili eksikse layout bozulmamalı. Aynı user duplicate görünmemeli.

NAVIGATION KARARI

Figma ekranında trip bottom nav görünmüyor; mevcut uygulamada `TripPrimaryNav` vardır. Kalan ekranlar
tamamlanmadan navigation mimarisini geri dönüşü zor şekilde kaldırma.

İlk güvenli uygulama:

- yeni Overview kompozisyonunu uygula;
- mevcut `TripPrimaryNav` davranışını koru;
- hero, carousel ve içerik için bottom nav yüksekliğine uygun padding bırak;
- Quick Actions ile bottom nav aynı hedeflere gidebilir; bu geçiş aşamasında kabul edilebilir;
- nav kaldırma kararını tüm 12 Figma ekranı birlikte değerlendirildiğinde ayrı görevde ver.

Eğer kullanıcı sonraki aşamada açıkça navbar'sız trip workspace isterse bu promptun kapsamını genişletme;
ayrı navigation migration promptu yaz.

HEADER ENTEGRASYONU

Mevcut `TripMobileHeader` Overview üzerinde hero ile duplicate olabilir. Overview için:

- aynı anda hem standart solid header hem hero içi back/settings render etme;
- shell'e `variant` veya Overview'a özel header ownership'i küçük ve açık şekilde ekle;
- diğer Plan/Explore/Bookings/domain header'larını değiştirme;
- focus, aria-label ve back davranışını koru.

GÖRSEL DİL

- Dusk/Liquid Glass token'larını kullan.
- Hero dışında arka plan koyu lacivert olmalı.
- Cyan/teal bilgi ve progress için kullanılabilir.
- Amber tek primary/active aksiyon içindir.
- Raw renk kullanımını çoğaltmak yerine mevcut token katmanını genişletmek gerekiyorsa küçük ve
  semantik ekleme yap.
- Emoji kullanma.
- İnce line ikonlar ve tutarlı stroke kalınlığı.
- Kart border'ları düşük kontrastlı ama görünür.
- Aşırı blur, glow veya gradient ekleme.

LOADING / ERROR / EMPTY

Hero:

- cover loading sırasında sabit aspect/height placeholder;
- image error'da anında kontrollü fallback;
- layout shift yok.

Overview sections:

- mevcut expenses/packing/journal section'ları bağımsız degrade olmaya devam etmeli;
- bir section error olduğunda tüm Overview düşmemeli;
- fake zero veya “all complete” gösterme;
- retry gerekiyorsa ilgili kart içinde sun.

Stops:

- boşsa Start planning state;
- load error server boundary davranışını koru.

Members:

- boş/eksik profile için initials fallback;
- membership refresh sonrası görünüm güncellenmeli.

OFFLINE

- cover daha önce cache edilmediyse fallback göster;
- private signed URL süresi dolmuşsa kırık image bırakma;
- trip/stop/overview cached data varsa kullan;
- offline iken çalışan domain'lere navigation engellenmemeli;
- bu görevde offline altyapısını baştan tasarlama.

ERİŞİLEBİLİRLİK

- Hero trip title sayfanın `h1` öğesi olmalı.
- Back ve More butonları benzersiz aria-label taşımalı.
- Busy image üstündeki metin AA kontrasta sahip olmalı.
- Carousel erişilebilir label ve keyboard scroll davranışı taşımalı.
- Quick action tile'ları button semantiğinde olmalı.
- Progress gerçek progressbar semantiği taşımalı.
- Üye davet butonu yalnız `+` karakteriyle isimlendirilmemeli; `Invite trip member` aria-label kullan.
- Renk tek başına lifecycle veya active state anlatmamalı.
- 200% text zoom'da hero metadata ve focus card kullanılabilir kalmalı.
- Minimum touch target 44×44 px.

PERFORMANS

- Hero görselini doğru responsive size ile yükle; orijinal dev fotoğrafı kontrolsüz indirme.
- Stop thumbnail'lerinde lazy loading kullan.
- Aynı signed URL için tekrar tekrar request üretme.
- Overview görünür değilken yeni fotoğraf/refetch döngüsü başlatma; mevcut `visible` sözleşmesini kullan.
- Büyük carousel için gereksiz animation wrapper oluşturma.
- Lifecycle ve schedule türetimlerini memoize et; mevcut helper'ları tekrar kullan.
- Yeni ağır carousel/image kütüphanesi ekleme.

KAPSAM DIŞI

- Yeni cover upload/edit UI.
- Yeni third-party stock photo API.
- Stop tablosuna photo column migration.
- TripPrimaryNav'ı tüm uygulamadan kaldırmak.
- Plan, Budget, Bookings, Packing veya Journal domain'lerini yeniden tasarlamak.
- Travel Mode veri modelini değiştirmek.
- Supabase RLS/policy değişikliği.
- Map Home'u bu görevde uygulamak.

TESTLER

Dar saf/helper testleri:

- undated/upcoming/active/completed hero copy;
- countdown tekrarının olmaması;
- Personal trip vs member count;
- stop date label;
- stop order;
- progress ready/empty/error durumu;
- active Travel Mode accent kararı;
- completed recap action kararı.

UI/contract testleri mevcut proje yaklaşımıyla:

- trip title `h1`;
- cover URL yokken fallback;
- image error fallback;
- 0 stop Start planning;
- quick action hedefleri;
- viewer'da mutation/davet kontrolü yok;
- progressbar aria değerleri;
- invite button accessible name;
- existing section error fake zero göstermiyor;
- existing TripPrimaryNav çalışıyor.

MANUEL GÖRSEL MATRİS

Viewport:

- 320×568
- 375×812
- 390×844
- 430×932

Durum:

- cover var/yok/error;
- 0, 1, 3 ve 20 stop;
- undated/upcoming/active/completed;
- owner/editor/viewer;
- 1, 4 ve 8 üye;
- packing ready/empty/error;
- online/offline;
- reduced motion;
- 200% text zoom.

Kontrol:

- hero crop;
- text contrast;
- stop carousel scroll;
- uzun trip/stop/task adları;
- Quick Actions 320 px'te taşmıyor;
- Members satırı;
- bottom nav içerik üstünü kapatmıyor;
- safe-area top/bottom.

DOĞRULAMA

Uygulamadan sonra:

1. `npm run typecheck`
2. ilgili overview/lifecycle/accessibility dar testleri
3. `npm run lint`
4. `git diff --check`
5. hedef dosyaların diff incelemesi

Final kalite kapısı gerekiyorsa:

- `npm test`
- `npm run build`

KULLANICIYA TESLİM

- Değişen dosyaları kısa listele.
- Hero cover/fallback önceliğini belirt.
- Lifecycle'a göre değişen bölümleri açıkla.
- Quick Action eşleşmelerini özetle.
- TripPrimaryNav'ın neden şimdilik korunduğunu belirt.
- Test ve doğrulama sonuçlarını bildir.
```

---

## Görsel yerleşim özeti

```text
┌──────────────────────────────────────┐
│  ←                              ⚙   │
│                                      │
│          TRIP COVER IMAGE            │
│                                      │
│  ┌────────────────────────────────┐  │
│  │ Mediterranean Summer  UPCOMING │  │
│  │ Jul 10 – Jul 22 · 3 travelers  │  │
│  │                    12 days away│  │
│  └────────────────────────────────┘  │
├──────────────────────────────────────┤
│ [● Barcelona] [● Amalfi] [● Rome] → │
│                                      │
│ ┌──────────────────────────────────┐ │
│ │ TODAY'S PREPARATION   Checklist │ │
│ │ ○ Secure transit visa…          │ │
│ └──────────────────────────────────┘ │
│                                      │
│ Preparation progress       75% done │
│ ███████████████░░░░░░░░░░░░░░░░░░ │
│                                      │
│ Quick Actions                        │
│ [ Plan ] [ Budget ] [ Bookings ]     │
│ [Checklist] [Photos] [Travel Mode]   │
│                                      │
│ Trip Members                         │
│ (A) (B) (C) (+)                      │
│                                      │
│ [existing trip primary navigation]   │
└──────────────────────────────────────┘
```

Wireframe bilgi hiyerarşisini gösterir; birebir piksel veya ikon şartı değildir.

---

## Yaşam döngüsü matrisi

| Lifecycle | Hero badge | Hero mesajı | Odak kartı | Vurgulu aksiyon |
|---|---|---|---|---|
| Undated | Dates not set | Add dates to unlock timeline | Next step | Plan / Add dates |
| Upcoming | Upcoming | N days away | Today’s preparation | Checklist |
| Active | Day X of Y | Today in [stop] | Today’s plan | Travel Mode |
| Completed | Completed | View trip recap | Trip highlights | Recap / Photos |

---

## Fotoğraf fallback matrisi

| Durum | Gösterim |
|---|---|
| `cover_image_url` geçerli | Gerçek trip cover |
| Güvenli signed journal cover mevcut | Signed member-only fotoğraf |
| Mapbox route snapshot mevcut | Rota odaklı görsel hero |
| Hiçbiri yok | Vibe/country tabanlı Dusk placeholder |
| Görsel yükleme hatası | Aynı Dusk placeholder; kırık image ikonu yok |

---

## Bu ekran tamamlandığında kabul kriterleri

- Trip Overview fotoğraf veya kaliteli fallback merkezli açılır.
- Hero’da trip adı, tarih ve lifecycle bilgisi tekrarsız gösterilir.
- `12 DAYS` + `12 days away` gibi duplicate countdown yoktur.
- Duraklar sıralı, yatay ve 20+ stopta kullanılabilir görünür.
- Fotoğrafı olmayan duraklarda sahte URL yerine kontrollü görsel fallback vardır.
- Focus card undated/upcoming/active/completed durumuna göre değişir.
- Progress error durumunda sahte `0%` veya `100%` göstermez.
- Altı Quick Action gerçek mevcut domain hedeflerine gider.
- `Go Live` yerine Travel Mode anlamı açıkça ifade edilir.
- Üyeler gerçek profil verisinden gelir ve davet yetkisi doğru uygulanır.
- Mevcut domain query, retry, realtime ve RLS davranışları bozulmaz.
- Mevcut `TripPrimaryNav` bu aşamada korunur.
- 320–430 px, safe-area, reduced-motion ve erişilebilirlik gereksinimleri karşılanır.
- Typecheck, ilgili testler ve lint geçer.
