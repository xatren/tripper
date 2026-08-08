# Tripper — Screen 04: Trips Library Uygulama Promptu

## Tasarım kararı

`/trips` ekranı bugün Screen 01–03 ile aynı standartta değil. Screen 01 Map Home tek bir "featured trip"i gösterir; Trips Library ise kullanıcının **tüm** seyahat arşividir — yani seçim ve tarama ekranıdır. Bu yüzden ölçüt "güzel görünmek" değil, **listenin taranabilir olması**dır.

Akış:

```text
Screen 01 — Map Home
        ↓ "See all trips"
Screen 04 — Trips Library
        ↓ kart dokunuşu
Screen 02 — Trip Overview
        ↓ Quick Actions / Itinerary
Screen 03 — Daily Itinerary
```

Trips Library yeni bir veri ürünü değildir. Mevcut `trips` / `stops` / `trip_members` sorgularını, capability kapısını, storage temizliğini ve silme akışını **aynen** kullanır; bu görev bir sunum ve bilgi mimarisi yenilemesidir.

### Ekran görüntüsünden çıkan somut problemler

| # | Problem | Kanıt |
|---|---|---|
| P1 | Sağ rayda kalıcı `OWNER` etiketi kart genişliğinin ~%25'ini yiyor, sıfır bilgi taşıyor (owner varsayılan; sahiplik zaten `...` menüsünün varlığından anlaşılıyor) | `TripsClient.tsx` `.cardRail` / `.role` |
| P2 | Geçmiş trip'lerde bile altyazı `Your next route` yazıyor | `TripsClient.tsx` sabit string |
| P3 | Tüm kartlar aynı `Completed` rozetiyle, aynı renkte → liste taranamıyor | statüye göre görsel fark yok |
| P4 | `01..05` sıra numaraları hiçbir anlam taşımıyor, gürültü üretiyor | `String(index + 1).padStart(2, '0')` |
| P5 | Kart yüksekliği ~146px, ekrana yalnızca 4 kart sığıyor | boş dikey alan |
| P6 | `7 journeys mapped / 2 ahead` + statik `Every route, one place.` sloganı dikey alan harcıyor, hiçbir aksiyona götürmüyor | `.heroSummary` |
| P7 | Sahte ARIA tabs: `role="tablist"` + `role="tab"` var ama `tabpanel`, `aria-controls`, roving tabindex yok | `.tabs` |
| P8 | `Ongoing 0` rozeti boşuna bağırıyor | koşulsuz sayı render'ı |
| P9 | Görsel yok — `Trip.cover_image_url` alanı mevcut ama ekranda hiç kullanılmıyor | `types/index.ts:17` |
| P10 | İş mantığı (`getStatus`/`daysUntil`/`durationLabel`/`statusLabel` + backdrop projeksiyonu) component içinde inline ve testsiz | `TripsClient.tsx:60-141` |
| P11 | `getStatus` `Date` nesnesi karşılaştırıyor (DST/UTC riski) ve `'ongoing' \| 'nodates'` diye **beşinci** bir durum sözlüğü uyduruyor | `lib/map-home.ts:18` `mapHomeTripStatus` `'active' \| 'undated'` diyor |
| P12 | CSS token değerlerini elle yeniden yazıyor; `font-family: inherit` yüzünden başlıklar Inter'de kalıyor | Screen 01–03 display tipografide `var(--font-fraunces)` kullanıyor |

### Onaylanan ürün kararları

1. **Kart görseli:** kapak görseli + tohumlu fallback thumbnail (60×60).
2. **Kapsam:** tam yenileme — görsel + saf helper modül + token migrasyonu + testler + bespoke skeleton.
3. **Özet bloğu:** statik slogan yerine **canlı, tıklanabilir sonraki adım** satırı.

---

## Kopyalanabilir ana uygulama promptu

```text
Tripper için Screen 04 — Trips Library ekranını yenile. Bu ekran /trips rotasıdır ve
kullanıcının tüm seyahat arşividir.

ÜRÜN AMACI

Trips Library kullanıcının seyahat arşivini taranabilir bir liste olarak sunar:

- üstte görünür başlık ve tek dokunuşluk "New trip" aksiyonu;
- canlı, tıklanabilir bir "sonraki adım" özeti;
- durum filtreleri (All / Planned / On the road / Past);
- daraltılabilir arama;
- her trip için kapak görselli, duruma göre renklenen kompakt kart;
- doğru boş durum ve gerçek geometriyle eşleşen yükleme iskeleti.

Bu ekran yeni bir veri ürünü değildir. Mevcut trips/stops/trip_members sorguları, capability
kapısı, storage temizliği ve silme akışı aynen korunur. Bu bir sunum ve bilgi mimarisi
yenilemesidir.

ÖNCE MEVCUT SİSTEMİ DAR İNCELE

Aşağıdaki dosyaları oku ve davranışlarını doğrula:

1. app/trips/page.tsx — auth guard, dört paralel sorgu, requiredQueryData sarmalayıcıları,
   tripCapabilitiesForRole ile capabilitiesByTripId üretimi.
2. app/trips/TripsClient.tsx — header, arama, hero summary, tab şeridi, TripCard, EmptyState,
   TripsMapBackdrop, silme akışı.
3. app/trips/Trips.module.css — mevcut sınıflar ve guard blokları.
4. lib/map-home.ts — localCalendarISO, mapHomeTripStatus, selectFeaturedTrip.
5. app/trip/[id]/mobile/overview-visual.ts — safeCoverImageUrl, formatShortDate deseni.
6. app/trip/[id]/mobile/itinerary/daily-itinerary.ts — saf helper modül deseni.
7. app/trip/[id]/mobile/TripOverview.module.css ve itinerary/DailyItinerary.module.css —
   güncel CSS ev stili (başlık yorumu, bölüm ayraçları, token kullanımı, guard blokları).
8. tests/trips-library.test.mts — bu ekranın mevcut contract testleri. Dört testin de
   pinlediği literaller değiştirilemez; yalnızca bilinçli olarak taşınabilir.
9. tests/accessibility-contracts.test.mts — yeni ekranı süpürecek çapraz kesit kurallar.
10. components/mobile/feedback.tsx — SkeletonBlock primitifi.
11. types/index.ts — Trip tipinde cover_image_url, countries (name + flag), vibe, updated_at.

MİMARİ SINIR: İŞ MANTIĞINI DUPLICATE ETME

Durum hesabının tek kaynağı lib/map-home.ts içindeki mapHomeTripStatus'tur. Yeni helper
bu fonksiyona delege eder; kendi tarih karşılaştırmasını yazmaz.

- 'ongoing' ve 'nodates' sözcükleri kodtan tamamen silinir; app genelinde 'active' ve
  'undated' kullanılır.
- startOfToday ve setHours(0, 0, 0, 0) tabanlı Date karşılaştırması silinir. Tüm karşılaştırma
  YYYY-MM-DD string'leri üzerinde yapılır; yerel timezone bir trip'i takvim günü sınırından
  kaydıramaz.
- Tarih formatlaması `${date}T00:00:00` kalıbıyla yapılır. lib/utils.ts içindeki formatDate
  KULLANILMAZ: new Date("2026-08-12") UTC parse ettiği için Greenwich batısında bir gün geri
  render eder.
- app/trip/[id]/mobile/trip-lifecycle.ts içinde aynı mantığın üçüncü bir kopyası var. Bu görevde
  ona dokunma; sadece not düş.

YENİ SAF HELPER MODÜL

app/trips/trips-library.ts oluştur. overview-visual.ts / daily-itinerary.ts ile birebir aynı
desen: react/next importu yok, @/ aliası yok, .ts uzantılı göreli importlar, saf fonksiyonlar,
todayISO her zaman son parametre ve varsayılanı localCalendarISO().

.ts uzantılı value importunun build'de çalıştığı doğrulanmıştır:
lib/google-places/schemas.ts ve lib/trip-country-selection.ts zaten bunu yapıyor.

Ön koşul refactor: lib/media-url.ts oluştur, safeCoverImageUrl'ü overview-visual.ts'ten aynen
taşı, overview-visual.ts bunu re-export etsin. tests/overview-visual.test.mts importunu
değiştirmeden yeşil kalmalı — davranışın değişmediğinin kanıtı budur.

Dışa açılan yüzey:

  export type TripLibraryStatus = FeaturedTripStatus   // 'active'|'upcoming'|'undated'|'completed'
  export type TripFilter = 'all' | 'planned' | 'active' | 'completed'
  export type StatusTone = 'live' | 'soon' | 'past' | 'neutral'

  tripLibraryStatus(trip, todayISO?)   -> mapHomeTripStatus'a tek satır delege
  statusBadge(trip, todayISO?)         -> { text, tone }
  tripSubtitle(trip, todayISO?)        -> string
  tripDurationLabel(trip)              -> string | null
  tripDateLine(trip)                   -> string
  tripFlags(trip, max?)                -> string
  matchesFilter(status, filter)        -> boolean
  filterCounts(trips, todayISO?)       -> Record<TripFilter, number>
  matchesQuery(trip, query)            -> boolean
  sortTripsForLibrary(trips, todayISO?)-> T[]
  libraryHeadline(trips, todayISO?)    -> { value, label, hint, hintTripId }
  tripThumbnail(trip)                  -> { kind:'image', url } | { kind:'seed', gradient, initials }
  emptyStateCopy(filter, query)        -> { title, body, cta }
  projectStopMarks(stops, tripId)      -> { id, x, y }[]

projectStopMarks, TripsMapBackdrop içindeki projeksiyon matematiğini (sıfır-span guard'ı dahil)
taşır. Backdrop bileşeni artık sadece render eder.

EKRAN YERLEŞİMİ

  [ eyebrow: Journey library ]
  [ h1: My Trips ]                    [search]  [+ New trip]
  [ arama satırı — açıldığında ]
  [ 2 · trips ahead — Barcelona Escape · in 12 days  > ]   <- tıklanabilir
  [ All 7 ][ Planned 2 ][ On the road ][ Past 5 ]
  [ trip kartı ]
  [ trip kartı ]
  ...
  [ AppBottomNav ]

HEADER

- .srOnly <h1>My trips</h1> ve <p>My Trips</p> silinir; yerine görünür
  <h1 className={styles.title}>My Trips</h1> gelir ve Fraunces ile render edilir.
- Eyebrow (MapPinned ikonu + "Journey library") korunur.
- ">New trip<" literali korunur — contract testi bunu pinliyor.

ÖZET → CANLI SONRAKİ ADIM

Statik "Every route, one place." sloganı ve "7 journeys mapped" bloğu kaldırılır.
libraryHeadline(trips) tek bir canlı satır üretir:

- büyük değer = active + upcoming sayısı, etiket "trips ahead";
- ipucu BİR BUTONDUR ve doğrudan o trip'e router.push eder:
    "Barcelona Escape · in 12 days"    (upcoming)
    "Day 3 of 9 · Barcelona Escape"    (active)
- ileride hiçbir şey yoksa: "7 trips in your archive"
- kütüphane tamamen boşsa: "Nothing planned yet"

Toplam trip sayısı kaybolmaz; "All" filtre çipinde yaşar.

FİLTRE ŞERİDİ

Dört filtre kalır, sözlük hizalanır:
  All        -> all
  Planned    -> upcoming + undated
  On the road-> active
  Past       -> completed

Sahte ARIA tabs kaldırılır. Yerine dürüst bir segmented group:

  <div className={styles.filters} role="group" aria-label="Filter trips">
    {FILTERS.map(({ id, label }) => (
      <button key={id} type="button"
              aria-pressed={filter === id}
              aria-controls="trips-list"
              data-active={filter === id}
              className={styles.filterChip}
              onClick={() => setFilter(id)}>
        {label}{counts[id] > 0 && <span className={styles.filterCount}>{counts[id]}</span>}
      </button>
    ))}
  </div>

- Sayı rozeti YALNIZCA > 0 iken render edilir ("Ongoing 0" sorunu biter).
- Liste kapsayıcısına id="trips-list" verilir.
- Şeridin altına aria-live="polite" bir bölge eklenir; filtre/arama değişiminde
  "N trips" duyurulur.
- Çip yüksekliği 38px'ten 44px'e çıkar.

ARAMA

Daraltılabilir toggle korunur (320px'te header alanını koruyor). İyileştirmeler:

- type="search", enterKeyHint="search", autoCapitalize="off", autoCorrect="off",
  spellCheck={false}, aria-controls="trips-list", aria-label="Search trips";
- Escape hem kapatır hem temizler;
- matchesQuery başlık + ülke adları + vibe etiketini tarar;
- mevcut toggleSearch içindeki "kapatırken query'yi toggle öncesi değere göre temizleme"
  hatası düzeltilir;
- sonuç sayısı live region'dan duyurulur.

KART TASARIMI

  ┌──────────────────────────────────────────────┐
  │▌ ┌──────┐  Barcelona Escape            [···] │
  │▌ │ thumb│  ● In 12 days · 🇪🇸 Spain + France  │
  │▌ └──────┘  Aug 12 – Aug 20 · 9 days          │
  └──────────────────────────────────────────────┘

DOM yapısı:

  <article className={styles.tripCard} data-status={status}>
    <button className={styles.tripMain}>   // min-height 96px, padding-right 56px
      ...thumbnail + başlık + rozet + altyazı + meta
    </button>
    <DropdownMenuTrigger className={styles.cardMenu} />  // absolute, top 8 right 8, 44x44, z-index 2
  </article>

Buton içine buton konamayacağı için menü kardeş elemandır; sağdaki 56px boşluk tam da bunun
içindir — başlık asla "..." menüsünün altına girmez.

SAĞ RAY ÖLÜR

- .cardRail ve .role sınıfları silinir.
- capabilities?.role ?? 'viewer' kalıcı etiketi kaldırılır.
- Rol bilgisi yalnızca BİLGİ TAŞIDIĞI durumda meta satırında küçük bir çip olur:
  role !== 'owner' ise "Viewer" veya "Editor".

01..05 YERİNE İKİ DURUM SİNYALİ

1. Sol accent ray: .tripCard::before, 3px, rengi data-status'tan gelen yerel değişkenle
   active    -> var(--color-success)
   upcoming  -> var(--color-accent)
   undated   -> rgba(255, 255, 255, .22)
   completed -> var(--color-info), düşük alfa

2. 60x60 thumbnail — tripThumbnail():
   - sanitize edilmiş cover_image_url varsa <img alt="" loading="lazy" decoding="async">,
     onError ile tohum karoya düşer;
   - yoksa seededGradient(trip.id) karo + baştaki ülke bayrağı emojisi;
   - bayrak da yoksa Fraunces ile trip baş harfleri.
   Deterministik tohumlama TripOverviewDomain.tsx içindeki avatar gradyan hilesiyle aynıdır.

String(index + 1).padStart(2, '0') ifadesi ve .tripIndex sınıfı silinir. index yalnızca
framer stagger gecikmesi olarak kalır.

data-status="completed" tüm kartı söndürür: thumb opacity .7, başlık --color-text-secondary,
sönük rozet. Böylece geçmiş, blok halinde taranabilir hale gelir.

DURUMA GÖRE KOPYA

statusBadge ve tripSubtitle şu tabloyu üretir:

  active    rozet: "Day 3 of 9" (iki tarih varsa), yoksa "On the road"   tone: live
            altyazı: ülkeler -> vibe -> "Add your first stop"
  upcoming  rozet: "Starts today" / "Starts tomorrow" / "In 12 days" (<=60 gün) /
                   "Starts Mar 2027" (daha uzak)                          tone: soon
            altyazı: ülkeler -> vibe -> "Destination not set yet"
  completed rozet: "Completed"                                            tone: past
            altyazı: ülkeler -> vibe -> "No destinations logged"
  undated   rozet: "Dates open"                                           tone: neutral
            altyazı: ülkeler -> vibe -> "Add dates and destinations"

Altyazı öncelik zinciri her durumda aynıdır: ülkeler -> VIBE_LABELS[vibe] -> duruma özgü
fallback. VIBE_LABELS map'i helper'a taşınır.

"Your next route" literali kodtan TAMAMEN kalkar ve doesNotMatch assertion'ı ile kilitlenir.

DOKUNMA HEDEFLERİ

- .tripMain min-height 96px
- .cardMenu 44x44
- filtre çipleri 44px
- özet ipucu butonu >= 44px

BOŞ DURUMLAR

emptyStateCopy(filter, query) nedene göre ayrışır:

  sorgu varsa      "No trips match “X”" / "Try a different name or destination." / CTA "Clear search"
  planned          "Nothing planned yet" / CTA "New trip"
  active           "No trip in progress" / "A trip appears here the day it starts." / CTA "New trip"
  completed        "No finished trips yet" / "Your past journeys collect here."
  all + sıfır trip "Your map is ready" / CTA "Create new trip"

Son daldaki "Create new trip" literali JSX'te kalmalıdır; tests/trips-library.test.mts bunu ve
en az iki router.push('/trips/new') çağrısını pinliyor.

YÜKLEME DURUMU

app/trips/loading.tsx artık generic RouteLoading re-export'u olmaktan çıkar. Yerine:

- header bloğu + filtre şeridi + gerçek 96px yüksekliğinde 4 kart iskeleti;
- SkeletonBlock (components/mobile/feedback.tsx) ve global .skeleton-pulse yeniden kullanılır;
- <div role="status" aria-live="polite"> ve sr-only "Loading your trips".

Gerçek kart geometrisi kullanıldığı için hydrate anında liste sıçraması olmaz ve tam ekran
spinner flash'ı kaybolur.

BACKDROP — DEĞİŞMEZLER

TripsMapBackdrop dekoratif kalır ve MALİYET GUARD'LARI KORUNUR:

- aria-hidden="true" inert kalır;
- Mapbox GL context'i MOUNT EDİLMEZ;
- TripboxMap, getFullRoute, LatestRouteRequestController, MAPBOX_TOKEN referansı OLMAZ;
- şekil hâlâ elimizdeki stop koordinatlarından projekte edilir;
- selectFeaturedTrip(trips) kullanımı ve <TripsMapBackdrop trip={featuredTrip} stops={stops} />
  wiring'i korunur.

Tek fark: projeksiyon matematiği projectStopMarks(stops, trip?.id ?? null) çağrısına iner.

CSS YENİDEN YAZIMI — app/trips/Trips.module.css

Screen 02/03 ev stilini benimse:

- dosya başında ekran numarası ve token sözleşmesi yorumu;
- /* ── Bölüm ── */ ayraçları;
- çok satırlı kurallar;
- YALNIZCA adlandırılmış camelCase sınıflar. Çıplak element seçicileri (.header p,
  .heroSummary strong/span/i/p, .tabs button, .searchWrap input, .emptyState strong/p/button,
  .tripMeta span) kaldırılır ve şu sınıflara dönüşür: .title, .summaryValue, .summaryLabel,
  .summaryHint, .filterChip, .filterCount, .searchInput, .searchClear, .emptyTitle, .emptyBody,
  .emptyAction, .metaItem.

Token migrasyonu (mevcut -> token):

  #ffc766                                      -> var(--color-accent-light)
  #f5a623                                      -> var(--color-accent)
  #e07b1e                                      -> var(--color-accent-dark)
  linear-gradient(120deg,#ffc766,#f5a623 55%,#e07b1e) -> var(--gradient-accent-cta)
  #1a0800                                      -> var(--color-text-on-accent)
  #fff                                         -> var(--color-text-primary)
  rgba(222,220,240,.58)                        -> var(--color-text-muted)
  rgba(222,220,240,.68/.76)                    -> var(--color-text-secondary)
  #86efac                                      -> var(--color-success-soft)
  .topScrim / .bottomScrim arka planı          -> var(--scrim-top) / var(--scrim-bottom)
  26/20/16/14/13/11px radius                   -> var(--radius-24/20/16/12)
  999px                                        -> var(--radius-full)
  8/12/16/20/24px padding ve gap               -> var(--space-8/12/16/20/24)
  tüm transition süre/easing değerleri         -> var(--motion-fast) var(--ease-standard)

--amber yerel aliası kaldırılır; token doğrudan kullanılır.

Fraunces: font-family: var(--font-fraunces), Georgia, serif ve font-weight: 700 şu sınıflara
uygulanır: .title, .summaryValue, .tripTitle, .emptyTitle, .thumbInitials. Mevcut 850 ağırlığı
Fraunces için uygun değil, kullanılmaz. Geri kalan her şey Inter'de kalır.

Yeni kurallar: .tripCard[data-status='...'] (accent değişkeni + completed sönümü),
.thumb / .thumbImage / .thumbSeed / .thumbFlag / .thumbInitials, .cardMenu (mutlak 44x44),
.filterChip[data-active='true'], .summaryHint.

GUARD BLOKLARI — KORUNUR VE GENİŞLETİLİR

  @media (max-width: 370px)   -> ikon-only New trip, thumb 52px, .summaryHint gizlenir,
                                 çip padding'i daralır
  @media (max-height: 670px)  -> header kısalır, kart min-height 88px
  prefers-reduced-motion      -> çip/buton geçişleri ve .tripCard :active transform'u kapanır
  forced-colors: active       -> bugünkü dört seçicinin ötesine .tripCard,
                                 .filterChip[data-active='true'], .statusPill, .thumbSeed,
                                 .cardMenu eklenir. Amber tint kaybolduğunda seçili çip hâlâ
                                 ayırt edilebilir olmalıdır.
  @supports not (backdrop-filter) -> .filters ve .cardMenu opak fallback'e eklenir

ERİŞİLEBİLİRLİK

- Görünür <h1>; sr-only başlık kaldırılır.
- Tüm interaktif hedefler >= 44x44.
- Renk asla tek sinyal değildir: her durumun metin rozeti vardır.
- aria-label={`Open ${trip.title}`} ve aria-label={`Open actions for ${trip.title}`} korunur.
- Dekoratif kapak görselinde alt="".
- 200% zoom'da başlık ellipsis'e girer, taşma yapmaz.
- Minimum metin boyutu 12px.

PERFORMANS

- Kapak görselleri loading="lazy" decoding="async".
- Filtre/arama sonucu useMemo ile hesaplanır.
- framer-motion stagger gecikmesi ilk 5 kartla sınırlı kalır.
- Yeni ağ isteği, yeni sorgu, yeni harita context'i EKLENMEZ.

KAPSAM DIŞI

- trips/stops/trip_members sorgu şekli.
- Silme akışı, capability kapısı, removeTripStorageObjects sırası.
- trip-lifecycle.ts birleştirmesi.
- Yeni rota, yeni sheet, yeni mutation.
- Sunucu tarafı sıralama veya sayfalama.

TESTLER

Saf/helper testleri — tests/trips-library-logic.test.mts (yeni, TODAY = '2026-08-05'):

 1. tripLibraryStatus sınır günleri dahil map-home sözlüğünü döner: başlangıç günü 'active'
    (upcoming değil), bitiş günü 'active' (completed değil), tek tarihli trip tek günlük pencere.
    Eski Date karşılaştırmasının kaçırdığı tam olarak budur.
 2. statusBadge: Starts today / Starts tomorrow / In 12 days / uzak gelecek ay formu /
    Day 3 of 9 / Completed / Dates open ve tone eşlemesi.
 3. tripSubtitle: ülke > vibe > fallback önceliği; her durum için ayrı fallback; her durumda
    assert.doesNotMatch(..., /Your next route/).
 4. tripDurationLabel: kapsayıcı sayım, "1 day" tekil, eksik sınırda null.
 5. tripDateLine: UTC kayması yok — 2026-08-12 asla "Aug 11" render etmez.
 6. matchesFilter / filterCounts: undated 'planned' altında sayılır, asla 'completed' altında
    değil; all === trips.length.
 7. matchesQuery: trim + locale lowercase, ülke adı ve vibe etiketi eşleşir, boş sorgu hepsini
    eşler.
 8. sortTripsForLibrary: active -> upcoming (en yakın başlangıç) -> undated (en yeni updated_at)
    -> completed (en yeni bitiş), id ile deterministik tiebreak.
 9. emptyStateCopy: her dal ayrı başlık; tümü-boş dalının CTA'sı "Create new trip".
10. tripThumbnail / seededGradient / tripInitials: aynı id -> aynı gradyan; javascript: kapak
    reddedilir; "Barcelona Escape" -> "BE".
11. projectStopMarks: yalnızca kendi trip'inin sonlu koordinatlı stop'ları, en fazla 6,
    sıfır-span eksende %50'ye ortalar (sıfıra bölme yok).

UI/contract testleri — tests/trips-library.test.mts güncellenir:

Mevcut dört test korunur. Bilinçli tek taşıma: stop filtre ifadesi artık helper'da olduğu için
o assertion iki dosyayı okur — ifade trips-library.ts'te, çağrı
projectStopMarks(stops, trip?.id ?? null) client'ta aranır.

Byte-identical kalması gereken literaller:
  aria-hidden="true" inert
  TripboxMap / getFullRoute / LatestRouteRequestController / MAPBOX_TOKEN doesNotMatch'leri
  <polyline points={marks.map
  styles.fallbackPin
  selectFeaturedTrip(trips)
  <TripsMapBackdrop trip={featuredTrip} stops={stops}
  >New trip<
  >Create new trip<
  capability erken dönüşü ve removeTripStorageObjects'in delete'ten önce gelmesi

Yeni contract assertion'ları:
  doesNotMatch(client, /function getStatus\(/)
  doesNotMatch(client, /setHours\(0, 0, 0, 0\)/)
  match(client, /from '\.\/trips-library\.ts'/)
  match(helper, /from '\.\.\/\.\.\/lib\/map-home\.ts'/)
  doesNotMatch(client, /styles\.cardRail/)
  doesNotMatch(client, /padStart\(2, '0'\)/)
  doesNotMatch(client + helper, /Your next route/)
  doesNotMatch(client, /Every route, one place/)
  doesNotMatch(loading, /RouteLoading/)
  match(loading, /role="status"/)
  match(css, /var\(--gradient-accent-cta\)/)
  match(css, /var\(--font-fraunces\)/)
  doesNotMatch(css, /#ffc766/)
  üç guard bloğunun (prefers-reduced-motion, forced-colors, @supports not backdrop-filter)
  varlığı

tests/accessibility-contracts.test.mts — bir test eklenir:
  görünür <h1> ve sr-only başlık yokluğu;
  role="group" aria-label="Filter trips" + aria-pressed;
  role="tablist" / role="tab" YOKLUĞU;
  aria-live="polite";
  Open ${trip.title} ve Open actions for ${trip.title} etiketleri;
  CSS'te .cardMenu 44x44 ve .tripMain min-height >= 44;
  dekoratif kapakta alt="";
  arama inputunda type="search" + aria-label.

MANUEL GÖRSEL MATRİS

Viewport: 320x568 / 375x812 / 390x844 / 430x932
Veri varyantı: 0 trip / 1 trip / 7 trip / kapaksız trip / bozuk kapak URL'i / tarihsiz trip /
               çok uzun başlık / çok ülkeli trip
Durum varyantı: yükleniyor / boş / filtreli boş / aramalı boş / dolu / reduced-motion /
                forced-colors

DOĞRULAMA

1. npm run typecheck
2. node --experimental-strip-types --test tests/overview-visual.test.mts   (media-url taşımasından hemen sonra)
3. node --experimental-strip-types --test tests/trips-library-logic.test.mts tests/trips-library.test.mts tests/accessibility-contracts.test.mts tests/map-home.test.mts
4. npm run lint
5. git diff --check
6. diff'i baştan sona oku
7. Son kapı: npm test && npm run build

KULLANICIYA TESLİM

Değişen dosyaları, silinen sınıf/fonksiyonları, korunan contract literallerini ve manuel
matriste görsel olarak doğrulanan hücreleri listele.
```

---

## Görsel yerleşim özeti

```text
┌──────────────────────────────────────────────┐
│ ⌖ JOURNEY LIBRARY                            │
│ My Trips                    [🔍]  [+ New trip]│   ← h1 Fraunces
├──────────────────────────────────────────────┤
│ 2   trips ahead                              │
│ Barcelona Escape · in 12 days              › │   ← tıklanabilir, o trip'e gider
├──────────────────────────────────────────────┤
│ [All 7] [Planned 2] [On the road] [Past 5]   │   ← role=group + aria-pressed, 0 rozeti yok
├──────────────────────────────────────────────┤
│▌ ┌────┐ Barcelona Escape              [···]  │
│▌ │🇪🇸 │ ● In 12 days · 🇪🇸 Spain + France     │
│▌ └────┘ Aug 12 – Aug 20 · 9 days             │
├──────────────────────────────────────────────┤
│▌ ┌────┐ Coastal Run                   [···]  │
│▌ │img │ ● Day 3 of 9 · 🇮🇹 Italy              │
│▌ └────┘ Aug 4 – Aug 12 · 9 days              │
├──────────────────────────────────────────────┤
│▌ ┌────┐ test2                         [···]  │   ← completed: sönük
│▌ │ T2 │ ● Completed · Coast                  │
│▌ └────┘ Jul 12 – Jul 21 · 10 days            │
└──────────────────────────────────────────────┘
│      Map      Trips      Discover    Profile │
```

---

## Durum matrisi

| Trip verisi | Durum | Rozet | Altyazı | Ray rengi | Thumb |
|---|---|---|---|---|---|
| start 12 gün sonra, ülke var | `upcoming` | `In 12 days` | `🇪🇸 Spain + France` | accent | kapak / tohum |
| start yarın | `upcoming` | `Starts tomorrow` | ülkeler | accent | kapak / tohum |
| start 8 ay sonra | `upcoming` | `Starts Mar 2027` | ülkeler | accent | kapak / tohum |
| bugün aralıkta, iki tarih | `active` | `Day 3 of 9` | ülkeler | success | kapak / tohum |
| bugün aralıkta, stop yok | `active` | `Day 3 of 9` | `Add your first stop` | success | tohum |
| bitiş geçmişte | `completed` | `Completed` | ülkeler | info, sönük | sönük |
| bitiş geçmişte, ülke yok | `completed` | `Completed` | `No destinations logged` | info, sönük | sönük |
| tarih yok | `undated` | `Dates open` | ülkeler / `Add dates and destinations` | nötr | tohum |

### Kapak fallback matrisi

| `cover_image_url` | Sonuç |
|---|---|
| geçerli http(s) veya kök-göreli yol | `<img>` render edilir, `object-fit: cover` |
| `javascript:` veya başka şema | reddedilir → tohum karo |
| yok | tohum karo + ilk ülke bayrağı |
| yok + ülke yok | tohum karo + Fraunces baş harfler |
| geçerli ama yüklenemedi | `onError` → tohum karo |

---

## Ürün kararlarının kısa gerekçesi

- **Neden kapak görseli?** `cover_image_url` zaten şemada var ve Screen 02 hero'sunda kullanılıyor; Trips'te kullanılmaması bedava bir görsel sinyalin çöpe gitmesi demek. Kapağı olmayan trip'ler için tohumlu gradyan, listeye rastgele görünmeyen ama kart başına farklı bir renk kimliği verir.
- **Neden sıra numarası değil durum rengi?** `01..05` kullanıcının umursadığı hiçbir soruya cevap vermiyor. "Hangisi devam ediyor, hangisi yaklaşıyor, hangisi bitti" sorusu ise listenin varlık sebebi.
- **Neden sağ ray ölüyor?** Kullanıcıların çoğu trip'inin sahibi. Her satırda `OWNER` yazmak, hiçbir satırda bilgi vermemek demek. Sahiplik zaten `...` menüsünün varlığıyla kodlanmış durumda; rol yalnızca owner **olmadığında** haber değeri taşıyor.
- **Neden slogan yerine canlı satır?** Ekranın üst %20'si en değerli alan. Statik bir slogan orada durmayı hak etmiyor; "sonraki seyahatine bir dokunuşta git" kısayolu hak ediyor.
- **Neden gerçek tabs değil segmented group?** Burada gerçek bir tab-panel ilişkisi yok — tek bir liste filtreleniyor. `aria-pressed` bunun dürüst karşılığı ve roving tabindex borcu doğurmuyor.

---

## Bu ekran tamamlandığında kabul kriterleri

1. `/trips` üzerinde görünür bir `<h1>` var, sr-only başlık kalmadı.
2. `Your next route` ve `Every route, one place.` literalleri kodda hiçbir yerde yok.
3. Hiçbir kartta `01..05` sıra numarası ve kalıcı `OWNER` etiketi yok.
4. Her kart kapak görseli veya deterministik tohum karo gösteriyor; bozuk URL sessizce tohuma düşüyor.
5. Completed kartlar active/upcoming kartlardan gözle görülür şekilde sönük; accent ray rengi duruma göre farklı.
6. Filtre şeridi `role="group"` + `aria-pressed` kullanıyor; `role="tablist"` / `role="tab"` kodda yok; sıfır sayılı çipte rozet yok.
7. Filtre ve arama değişimi `aria-live="polite"` bölgesinden duyuruluyor.
8. Özet satırı tıklanınca doğru trip'e gidiyor; ileride trip yoksa arşiv metni, hiç trip yoksa boş metin gösteriyor.
9. `app/trips/loading.tsx` gerçek kart geometrisiyle eşleşen bespoke skeleton; hydrate'te liste sıçraması yok.
10. `getStatus` / `startOfToday` / `'ongoing'` / `'nodates'` kodta yok; durum tek kaynaktan (`mapHomeTripStatus`) geliyor.
11. `Trips.module.css` içinde `#ffc766` gibi çıplak token değeri yok; `var(--font-fraunces)` display tipografide kullanılıyor; dört guard bloğu da yerinde.
12. `tests/trips-library.test.mts` içindeki dört mevcut test yeşil; yeni `tests/trips-library-logic.test.mts` 11 senaryoyu kapsıyor.
13. `npm test`, `npm run typecheck`, `npm run lint` ve `npm run build` yeşil.
14. Manuel görsel matriste 320 / 375 / 390 / 430 genişliklerinin tamamı doğrulandı.
