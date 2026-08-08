# Konaklama vs. Ara Durak — Gün Sayımı ve Harita Hiyerarşisi Planı

**Tarih:** 2026-08-08
**Sorun sahibi senaryo:** RealTrip1 — 13 gün olarak planlanmış, uygulamada 22 gün görünüyor. 22 stop var.

---

## 1. Sorunun kökü (doğrulanmış)

Bugün her stop zorunlu olarak **en az 1 gece** sayılıyor. Dört yerde birden clamp var:

| Yer | Kod | Etki |
|---|---|---|
| `supabase/migrations/008_trip_persistence.sql:12` | `nights integer not null default 1` | Yeni eklenen her stop 1 gece ile doğuyor |
| `app/trip/[id]/mobile/itinerary-projection.ts:145` | `Math.max(1, stop.nights ?? 1)` | Projeksiyon 0 geceyi kabul etmiyor |
| `app/trip/[id]/mobile/trip-domain-utils.ts:51` | `Math.max(1, nights[stop.id] ?? 1)` | Plan sekmesi takvimi aynı şekilde şişiyor |
| `app/trip/[id]/mobile/PlanRouteDomain.tsx:302` | `Math.max(1, current + delta)` | Kullanıcı 0'a indiremiyor |

Sonuç zinciri: 22 stop → 22 gece → `buildTimeline` (`itinerary-projection.ts:263`) gün aralığını `rangeEnd`'i son projeksiyon tarihine kadar uzatarak hesaplıyor (satır ~305-311), `trip.end_date`'i aşıyor → itinerary 22 gün üretiyor.

Not: DB kısıtı zaten `check (nights >= 0)` — yani **0 gece şu an bile şemaya uygun**. Migration'da yapılacak tek şey `default` değişikliği; kısıt gevşetmeye gerek yok.

İkinci şikâyet — "bazı konumlar birbirine çok yakın" — ayrı bir problem: `TripboxMap` tüm noktaları DOM `<Marker>` olarak basıyor (`components/map/mapbox/TripboxMap.tsx:287`), kümeleme (clustering) yok. Düşük zoom'da yakın duraklar üst üste biniyor (ekran görüntüsündeki San Francisco / Eureka bölgesi).

---

## 2. Çözüm modeli: iki sınıf durak

Tek bir kavram ekliyoruz — durağın **gece barındırıp barındırmadığı**:

- **Konaklama durağı (base / overnight stop)** — `nights >= 1`. Trip'in gününü **bu** tanımlar. Haritada büyük pin, gün numarası etiketi.
- **Ara durak (waypoint / day stop)** — `nights = 0`. Gün **eklemez**. O günün planına asılır. Haritada küçük, sönük nokta.

### Neden ayrı bir kolon değil de `nights`?

`stops.stop_type` (`'origin' | 'destination' | 'waypoint' | 'overnight'`) kolonu zaten var ama pratikte **rota rolü** için kullanılıyor (`origin`/`destination`); `overnight` değeri kodda hiç yazılmıyor. Buna ikinci bir anlam yüklemek iki kaynaklı gerçek (dual source of truth) yaratır: `nights=2` ama `stop_type='waypoint'` gibi imkânsız durumlar mümkün olur.

**Karar:** Tek gerçek kaynağı `stops.nights`. Türetilmiş yardımcı:

```ts
// lib/stops.ts (yeni)
export type StopKind = 'overnight' | 'waypoint'
export function stopKind(stop: { nights?: number | null }): StopKind {
  return (stop.nights ?? 0) > 0 ? 'overnight' : 'waypoint'
}
```

`stop_type` olduğu gibi bırakılıyor (rota rolü olarak `origin`/`destination` anlamını korur).

### Projeksiyonun doğal davranışı

Clamp kalkınca mevcut cursor mantığı zaten istediğimizi yapıyor:

```
A (2 gece), W1 (0), W2 (0), B (1 gece)   trip start = 1 Haz
A  → arrival 1 Haz, dayStart 1, cursor → 3 Haz
W1 → arrival 3 Haz, dayStart 3          (gün eklemez)
W2 → arrival 3 Haz, dayStart 3
B  → arrival 3 Haz, dayStart 3, cursor → 4 Haz
```

Yani iki konaklama arasındaki ara duraklar **yol günü**ne (A'dan çıkış = B'ye varış günü) düşüyor. Bu, road trip semantiği için doğru davranış; ek mantık gerekmiyor.

---

## 3. Faz planı

### Faz 1 — Veri modeli + sayım (temel düzeltme) — ✅ TAMAMLANDI (2026-08-08)

Uygulanan dosyalar: `supabase/migrations/20260808120000_stop_overnight_semantics.sql` (elle uygulanacak), `itinerary-projection.ts`, `trip-domain-utils.ts`, `PlanRouteDomain.tsx`, `itinerary/ItineraryTimeline.tsx`, `bookings/FindStaySection.tsx`, `lib/ics.ts`, `types/index.ts`, `tests/stop-nights.test.mts`.

Plandan üç sapma:
1. **`lib/stops.ts` açılmadı.** `stopNights()` yardımcısı `itinerary-projection.ts` içinde export edildi — o modül bilinçli olarak `@/` import'u içermiyor (node test runner alias çözmüyor), ayrı bir dosyaya koymak bu kuralı bozardı.
2. **`lib/ics.ts` etkileniyor** (aşağıdaki tabloda "etkilenmiyor" yazıyordu). `nights`'ı doğrudan okumuyor ama `computeStopSchedule`'dan türeyen `departure`'ı alıyor: 0-geceli durakta `departure === arrival` olur ve `DTEND` dışlayıcı olduğu için sıfır uzunlukta bir etkinlik çıkardı. `icsEndDate` güvencesi eklendi.
3. **Gün içi sıralama hatası çıktı ve düzeltildi.** Projeksiyonların hepsi `orderIndex = -1` alıyordu; aynı güne düşen ara duraklar id'ye göre alfabetik sıralanıyordu. Artık `orderIndex = index - stops.length` — hâlâ negatif (günün başında), ama rota sırasını koruyor.

Ek olarak, plan dışı ama Faz 1'in doğrudan sonucu olan bir boşluk kapatıldı: aralık dışına taşan duraklar sessizce kaybolmasın diye itinerary'ye `overflow` uyarısı eklendi (aşağıya bkz.).

<details>
<summary>Faz 1 orijinal planı</summary>

**Migration:** `supabase/migrations/2026xxxxxxxxxx_stop_overnight_semantics.sql`

```sql
-- Yeni eklenen duraklar varsayılan olarak "ara durak" (gün eklemez).
-- Konaklama olacak duraklar nights'ı açıkça >= 1 yazar.
alter table public.stops alter column nights set default 0;
```

- Mevcut veriye **dokunulmuyor** (bütün eski duraklar `nights=1` kalır → bugünkü davranışla birebir aynı). Toplu dönüşüm Faz 5'te kullanıcı kontrolünde.
- `013_create_trip_with_stops.sql` / `20260715233000_validate_create_trip_with_stops.sql` içindeki insert'ler `nights` yazmıyor → yeni default'u alırlar. Sihirbazdan gelen şehirler muhtemelen **konaklama** olmalı → RPC'de `coalesce((s->>'nights')::int, 1)` ile açıkça 1 geç ve payload validasyonuna `nights` alanını ekle.

**Kod:**
- `itinerary-projection.ts:145` → `Math.max(0, stop.nights ?? 0)`
- `trip-domain-utils.ts:51` → `Math.max(0, nights[stop.id] ?? 0)`; `computeStopSchedule` 0 gecede `departure = arrival` ve `dayEnd = dayStart` döndürmeli (negatif aralık üretmemeli)
- `PlanRouteDomain.tsx:302` → alt sınır 0
- `types/index.ts` `nights?: number` yorumunu güncelle: "0 = ara durak, gün eklemez"
- Yeni `lib/stops.ts` + `stopKind`

**`buildTimeline` gün aralığı (`itinerary-projection.ts:305-325`):** trip'in hem `start_date` hem `end_date`'i varsa gün listesi **trip aralığıyla sınırlansın**. Aralığın dışına taşan projeksiyon günleri sessizce yeni gün üretmek yerine "Trip tarihlerinin dışında" uyarı grubunda toplansın (`unscheduled` benzeri bir `overflow` kovası). Böylece 13 günlük bir trip hiçbir koşulda 22 gün göstermez.

**Testler:**
- `tests/` altına `stop-nights-projection.test.mts`: 0 geceli durak gün eklemiyor; ara duraklar doğru güne düşüyor; hepsi 0 gece olan trip 1 gün üretiyor
- `daily-itinerary.test.mts` / mevcut projeksiyon testleri: gün sayısı trip aralığını aşmıyor
- Regresyon: `nights` `undefined` geldiğinde davranış (eski satırlar 1, yeni satırlar 0)

</details>

**Gerçekleşen `overflow` davranışı:** `Timeline` arayüzüne `overflow: TimelineEntry[]` eklendi. Trip'in hem `start_date` hem `end_date`'i varsa stop projeksiyonları gün aralığını genişletmiyor; aralığa sığmayanlar `overflow`'a düşüyor. **Kullanıcının açıkça tarihlediği item'lar** eskisi gibi aralığı genişletmeye devam ediyor (bu onun kendi seçimi). Tarih aralığı olmayan trip'lerde projeksiyonlar hâlâ aralığı belirliyor. `ItineraryTimeline` `overflow` boş değilse "N stops fall past your return date" uyarısını gösteriyor — hem `plan` hem `daily` varyantında.

**Faz 1 sonrası mevcut davranış:** RealTrip1 gibi bir trip (22 durak × 1 gece, 12 geceye sığmıyor) artık 22 gün göstermiyor; tarih aralığına sığan duraklar günlere dağılıyor, kalanlar uyarı olarak listeleniyor. Kullanıcı Plan sekmesindeki "−" düğmesiyle durakları 0 geceye (Day stop) indirerek trip'i düzeltebiliyor. Faz 2 bunu bir toggle'a, Faz 5 toplu aksiyona çeviriyor.

### Faz 2 — Plan sekmesi UI (kullanıcı kontrolü) — ✅ TAMAMLANDI (2026-08-08)

Uygulanan dosyalar: `app/trip/[id]/mobile/PlanRouteDomain.tsx`, `tests/accessibility-contracts.test.mts`.

Yapılanlar:

- Her durak kartının aksiyon satırında iki durumlu kontrol: **🌙 Overnight** / **📍 Day stop** (`role="switch"`, `aria-checked`, `aria-label="Stay overnight in {stop}"`).
- Konaklamada gece stepper'ı görünür (min 1); ara durakta stepper yerine **"Adds no day"** rozeti çıkar.
- Stepper'ın "−" düğmesi 1'de duruyor; 0'a inmek yalnızca toggle ile.
- Uyarı çipi (`role="status"`): *"You planned N nights; your dates cover M."* + **Update dates** / **Spread nights**.
- Yeni sözleşme testi: `each stop names its overnight/day-stop switch and keeps the stepper above zero`.

Plandan sapmalar / netleştirmeler:

1. **`changeNights` bölündü.** Optimistic update + rollback + retry toast deseni `setStopNights(id, next)` içine taşındı; `changeNights(id, delta)` ve toggle'ın kullandığı `setStopIsOvernight(id, overnight)` ikisi de onu çağırıyor. Tek davranış farkı: retry artık delta'yı yeniden uygulamak yerine **hedef değeri** yazıyor — rollback sonrası doğru olan bu.
2. **"Tarihleri güncelle" = yalnızca `end_date`.** Plan sekmesinde tarih editörü yok ve `trip` bir server prop'u; bu yüzden aksiyon `end_date = start_date + nightsPlanned` yazıp `router.refresh()` çağırıyor (Overview'daki `TripDatesSheet` ile aynı yazma yolu). `start_date` yoksa buton hiç görünmüyor. Tam tarih düzenleme hâlâ Overview'da.
3. **"Geceleri dağıt" tanımlandı.** Konaklama duraklarının **kümesi korunuyor**, trip'in toplam gecesi bu duraklara olabildiğince eşit bölünüyor (`floor` + kalan baştakilere). Konaklama sayısı toplam geceden fazlaysa buton gizleniyor (kimseyi sessizce 0 geceye düşürmemek için).
4. **Toplu yazma ConfirmDialog yerine Undo toast'u.** `ConfirmDialog`'un onay düğmesi yıkıcı (kırmızı) stilinde; gece dağıtmak yıkıcı değil. Bunun yerine anında uygulanıp "Undo" aksiyonlu başarı toast'u gösteriliyor. Bulk `nights` RPC'si olmadığı için N tane tekil `update` atılıyor; **kısmi hatada yalnızca başarısız satırlar geri alınıyor**, böylece ekran sunucunun kabul ettiğinden sapmıyor.
5. **Toggle'ın yeri** ana satır değil, kartın mevcut rename/delete aksiyon satırının sol ucu — ana satır (sıra rozeti + isim + adres + stepper) zaten dar.
6. **Salt-okunur üyeler** toggle görmüyor; eskisi gibi "N nights" / "Day stop" metni kalıyor.

### Faz 3 — Harita pin hiyerarşisi — ✅ TAMAMLANDI (2026-08-08)

Uygulanan dosyalar: `lib/map-pins.ts` (yeni), `components/map/mapbox/TripboxMap.tsx`, `app/dashboard/DashboardClient.tsx`, `app/trip/[id]/mobile/PlanRouteDomain.tsx`, `app/trip/[id]/mobile/components/OverviewRouteBackdrop.tsx`, `tests/map-pin-hierarchy.test.mts` (yeni).

Yapılanlar:

- `TripboxMapPoint.kind?: 'overnight' | 'waypoint'` eklendi. `compact` kaldırılmadı ama artık yalnızca **fallback**: `resolvePinKind()` önce `kind`'a bakar, yoksa `compact`'e düşer. İkisi de yoksa `overnight` — yani durak gecesi kavramı olmayan çağıranlar (gün içi aktivite pinleri) eskisi gibi tam boy ve numaralı kalır.
- Boyut/stil tablosu birebir uygulandı (32/38 vs 13/22, `ACCENT` vs `#77779a`, 3px vs 1.5px kenarlık, glow yalnızca konaklamada).
- Z-sırası: `paintOrder` memo'su render'dan önce `waypoint` → `overnight` sıralıyor. Dizi indeksi sıralamayla birlikte taşınıyor, böylece `label ?? index + 1` fallback'i hâlâ **rota sırasını** gösteriyor, boyama sırasını değil.
- Etiket artık `projectStopSchedule().dayStart`'tan geliyor: Plan sekmesi `1 → 22` yerine `D1 → D13` gösteriyor.

Plandan sapmalar / netleştirmeler:

1. **Yeni `lib/map-pins.ts` açıldı.** Pin modeli (`stopPinKind`, `stopDayLabel`, `tripDayCountFromDates`, `buildRouteMapPins`) üç ekranın ortak dili; `trip-map-model.ts` rota-yerel ve zaten *itinerary item* pinlerini kuruyor, `app/dashboard` oraya temiz erişemiyor. Modül `@/` import'suz — node test runner doğrudan çalıştırıyor. `dayStart`'ı kendisi hesaplamıyor, **parametre olarak alıyor**; tek gerçek kaynağı `projectStopSchedule` kalsın diye cursor mantığı kopyalanmadı.
2. **`role === 'end'` elması artık konaklamaya özel.** Döndürülmüş kare + mor renk, 3px kenarlık ve gün rozetiyle birlikte "varış noktası" olarak okunan bir bütün; 13px'lik eğik bir kare okunmuyor. Son durak ara durak ise düz sönük nokta kalıyor. Aynı gerekçeyle ara durağın sönük rengi `itemType`/`role` renklerinin önüne geçiyor — açık `markerColor` veren çağıran hâlâ kazanıyor.
3. **Seçili ara durak glow'unu koruyor.** Tablodaki "glow yok" *dinlenme* stili; seçim halkası ikisinde de duruyor, yoksa dokunulan nokta dokunulmuş gibi görünmüyordu. Seçim ayrıca 13 → 22 büyüme veriyor.
4. **Aralık dışı konaklamalar rozetsiz.** RealTrip1 gibi 22 durağın hepsi `nights=1` olan trip'lerde 13 günü aşan duraklara `stopDayLabel()` `null` dönüyor: 13 günlük bir trip'e "D14" basmak sessiz bir hata olurdu. Pin tam boy kalıyor (haritadan düşmüyor), popup alt satırına **"Past your return date"** ekleniyor. `Timeline.overflow` uyarısıyla aynı olayı anlatıyorlar. Toplu düzeltme Faz 5.
5. **`DailyItineraryView.tsx` değişmedi — bilinçli.** Oradaki pinler trip durakları değil, *tek bir günün* aktiviteleri; hepsine aynı `D3` rozetini basmak bilgi taşımaz. `kind` vermiyor, dolayısıyla legacy yolla tam boy + gün içi sıra numarası alıyor. `TripMapDomain.tsx` de saf pass-through olduğu için dokunulmadı. `TripsClient.tsx` bu haritayı hiç kullanmıyor (plandaki liste eskiymiş).
6. **`DashboardClient.tsx` `@/app/trip/[id]/mobile/itinerary-projection`'ı import ediyor.** Repoda ilk `@/app/...` import'u. Alternatifi `projectStopSchedule`'ın cursor mantığını `lib/`'e kopyalamaktı; ikinci bir gerçek kaynak, çirkin bir import yolundan daha kötü. Map Home'da ayrıca **"buradasın" durağı hiyerarşiyi eziyor**: 0 geceli olsa bile tam boy pin alıyor, 13px'lik noktaya düşmüyor.
7. **`OverviewRouteBackdrop`'ın Mapbox-yoksa fallback'i de güncellendi.** Aynı hiyerarşiyi taklit ediyor; yoksa harita hatasında rota eşit ağırlıklı pinlere geri dönüyordu.

Testler: `tests/map-pin-hierarchy.test.mts` (9 test) — `nights`'tan kind türetme, gün numarası etiketi, aralık dışı davranışı, rota rolleri, ve `TripboxMap`/`PlanRouteDomain` kaynak sözleşmeleri (boyut tablosu, `kind` > `compact` önceliği, paint sırası, indeks fallback'inin sıralamadan etkilenmemesi). `overview-map-backdrop` ve `trip-map-sync` testleri değişmeden geçiyor; toplam 258 → 267.

### Faz 4 — Yakın noktaların ayrışması (declutter) — 4a ✅, 4b açık

Ekran görüntüsündeki asıl görsel problem. İki seçenek:

**4a — Hızlı kazanım (ekran-uzayı eleme).** — ✅ TAMAMLANDI (2026-08-08)

Uygulanan dosyalar: `lib/map-pins.ts` (`declutterWaypoints`, `WAYPOINT_DECLUTTER_GAP_PX`), `components/map/mapbox/TripboxMap.tsx`, `tests/map-pin-hierarchy.test.mts`.

DOM marker mimarisi korundu. Pinler `map.project()` ile ekran koordinatına çevriliyor, birbirine `< 18px` yakın **ara duraklar** tek bir `+N` balonuna toplanıyor; balona dokunmak 2 zoom seviyesi yaklaştırıyor ve grup kendiliğinden çözülüyor. Konaklama pinleri hiçbir koşulda gizlenmiyor.

Plandan sapmalar / netleştirmeler:

1. **`zoom` değil `moveend`'e bağlandı.** Pan tüm noktaları eşit kaydırır, ama zoom/pitch/bearing aradaki mesafeyi değiştirir; üçünü ayrı ayrı dinlemek yerine kamera durulunca tek bir `cameraNonce` artıyor. Sürükleme sırasında yeniden hesap yok, yani balon titremiyor.
2. **`useMemo` değil `useEffect`.** Hesap canlı kamerayı okumak için `mapRef.current`'a bakıyor; render sırasında ref okumak `react-hooks/refs` kuralını ihlal ediyor. Sonuç state'e yazılıyor — kamera durduktan sonra bir ekstra render, buna karşılık kural ihlali yok.
3. **Seçili ve yeni eklenen pin `pinned`.** Popup'ın çapa yaptığı marker'ı gizlemek popup'ı boşlukta bırakırdı; `dropInId` de drop animasyonunu kaybederdi. İkisi de kümelenmiyor.
4. **Gruplama lider pine göre ölçülüyor**, en yakın üyeye göre değil. Zincirleme yakınlık (`A~B`, `B~C`, ama `A≁C`) tek bir balonun haritada sürüklenmesine yol açardı.
5. **Konaklama pini komşusunu da yutmuyor.** Plan yalnızca "ara duraklar toplanır" diyordu; konaklamanın yanındaki ara durak kendi pini olarak kalıyor, çünkü onu yutmak konaklama pininin anlamını (bir gece = bir pin) bulanıklaştırırdı.
6. **`new Map()` kullanılamadı** — `Map` bu dosyada react-map-gl bileşeni. Küme araması paint slot'una göre seyrek dizi.
7. **Projeksiyon `try/catch` içinde.** Geçiş halindeki bir kamera projeksiyonu reddedebiliyor; hata halinde tüm pinler tek tek çiziliyor (güvenli taraf: hiçbir durak kaybolmuyor).

**4b — Kalıcı çözüm (native clustering).** Ara duraklar DOM marker olmaktan çıkıp `cluster: true` olan bir GeoJSON `Source` + `circle`/`symbol` `Layer`'a taşınır (Mapbox GL'in yerleşik kümelemesi). Konaklama pinleri DOM `<Marker>` olarak kalır — böylece her zaman üstte, tıklanabilir ve animasyonlu. Yüzlerce durakta performans da çözülür. **Hâlâ açık:** durak sayısı >50 olan trip'ler ortaya çıkınca ayrı iş kalemi.

### Faz 5 — Mevcut trip'ler için geri dönüş (backfill) — ✅ TAMAMLANDI (2026-08-08)

Uygulanan dosyalar: `app/trip/[id]/mobile/PlanRouteDomain.tsx`, `app/trip/[id]/mobile/itinerary/daily-itinerary.ts`, `app/trip/[id]/mobile/itinerary/ItineraryTimeline.tsx`, `app/trip/[id]/mobile/itinerary/DailyItineraryView.tsx`, `app/trip/[id]/mobile/itinerary/DailyItinerary.module.css`, `app/explore/ExploreClient.tsx`, `scripts/check-pending-migrations.sql`, `supabase/tests/functional/create_trip_with_stops_nights.spec.sql` (yeni), `tests/stop-nights.test.mts`, `tests/map-pin-hierarchy.test.mts`, `tests/daily-itinerary.test.mts`, `tests/accessibility-contracts.test.mts`.

Yapılanlar:

- **"Make all day stops"** (`makeAllDayStops`): geceli tüm durakları tek batch'te 0'a çeker, ardından kullanıcı 🌙 toggle'ıyla konaklama yerlerini işaretler. Faz 2'deki `writeNightsBatch` deseni aynen kullanıldı: optimistic update, kısmi hatada yalnızca başarısız satırların rollback'i, "Undo" aksiyonlu toast. `ConfirmDialog` yok (onay düğmesi yıkıcı stilde; bu iş yıkıcı değil).
- **"Tarihleri planıma uydur"** ayrı bir aksiyon olarak eklenmedi — Faz 2'nin `matchDatesToPlan`'ı (`end_date = start_date + nightsPlanned`) zaten tam olarak bu işi yapıyor ve aynı bölgede duruyor.
- Sıfır geceli plan için yeni durum metni: *"No overnight stops yet. Tap 🌙 on the places you sleep — day stops ride along without adding a day."*

Plandan sapmalar / netleştirmeler:

1. **Ayrı bir kart açılmadı; mevcut uyuşmazlık çipi kademelendi.** Kullanıcının sorduğu ilişki sorusunun cevabı bu: iki yüzey yan yana durmuyor, **tek** `role="status"` bölgesi üç metinden birini gösteriyor.
   - `needsBackfill` → çip metni + *"Every stop still holds a night. Clear them all, then tap 🌙 on the places you actually sleep."* açıklaması + **Make all day stops** düğmesi.
   - `noOvernightStops` → *"No overnight stops yet…"* (aksiyon yok).
   - aksi halde → Faz 2'deki çip, olduğu gibi.

   Gerekçe: ayrı bir kart, `end_date`'i yazan **ikinci** bir "Update dates" düğmesi demekti. Her aksiyonun tek bir uygulaması var; yalnızca hangi kelimelerin çıktığı değişiyor. `tests/accessibility-contracts.test.mts` dosyada `role="status"`ın **tam olarak bir kez** geçtiğini doğruluyor — bir gün ikinci bir yüzey eklenirse test düşer.
2. **Kart koşulu "gerçek uyuşmazlık"tan daha dar.** `needsBackfill = canEdit && nightsMismatch && nightsPlanned > nightsTotal && uncuratedRoute`, burada `uncuratedRoute = stops.length >= 3 && overnightStops.length === stops.length`. Üç eleme: (a) yalnızca **aşırı** planlanmış rota — az planlanmış bir trip'in çözümü gece silmek değil; (b) **hiç kimsenin dokunmadığı** rota (her durak geceli) — kullanıcı bilinçli olarak 4 konaklama seçtiyse ona "hepsini temizle" önermek yaptığı işi geri almasını istemek olur; (c) 1–2 duraklı trip'te "hangi yerde uyuyorsun" bir küratörlük problemi değil, stepper zaten orada.
3. **"Update dates" sıfır geceli planda gizleniyor** (`nightsPlanned > 0` koşulu eklendi). Aksi halde "Make all day stops"tan hemen sonra basılan düğme `end_date = start_date` yazıp trip'i tek güne düşürürdü — geri alınabilir ama sürpriz bir yıkım. O durumda çip zaten talimat metnine dönüyor.
4. **`Spread nights` kartta da duruyor.** RealTrip1 şeklinde (22 durak × 1 gece) `canSpreadNights` matematiksel olarak zaten `false`, ama 3 durak × 5 gece / 13 günlük bir trip'te hem `needsBackfill` hem `canSpreadNights` doğru olabiliyor. Kart aksiyon kaldırmıyor, ekliyor.
5. **`makeAllDayStops` batch'e yalnızca geceli durakları koyuyor.** Zaten 0 olan satırlar yazılmıyor — kısmi hata raporu bir no-op satır üzerinden verilmesin diye.
6. **Salt-okunur üye talimat metni görmüyor.** `needsBackfill` zaten `canEdit` istiyordu; `noOvernightStops` de öyle — "Tap 🌙…" bir viewer'ın hiç görmediği bir toggle'a işaret ederdi. Tarihleri olan bir trip'te viewer yine sade uyarı çipini görüyor: aynı olguyu bildiriyor, ondan bir şey yapmasını istemiyor.

**Faz 3'ten kalan aralık dışı davranış:** Rozetsiz pin + "Past your return date" popup'ı **kaldırılmadı, artık bir çıkışı var.** Faz 5'in işi bu durumu *ortadan kaldırmak* olarak yazılmıştı; gerçekleşen daha muhafazakâr: durum sürüyor (veri hâlâ öyle) ama Plan sekmesi düzeltmeyi tek dokunuşta öneriyor. Rozetsiz pini tamamen yok saymak, kullanıcı kartı kullanmadan Plan'dan çıktığında haritayı sessizce yanlış bırakırdı.

Testler (273 → 281):
- `tests/stop-nights.test.mts` (+2): geceler temizlendikten sonra **tarihli** trip gün sayısını tarihlerden korur (13 gün, 22 durak 1. günde, rota sırasında, `overflow` boş); **tarihsiz** trip tam olarak **1** gün üretir — 0 olsa Plan boş-durum ekranına düşer ve 22 durak görünmez olurdu.
- `tests/map-pin-hierarchy.test.mts` (+1): tüm geceler temizlenince her pin sönük nokta, hiçbiri rozetli değil, hiçbirine "Past your return date" yazılmıyor (gecesi olmayan durağın aşacağı bir günü yok), `start`/`end` rolleri duruyor.
- `tests/accessibility-contracts.test.mts` (+1): kademeli bölge sözleşmesi (tek `role="status"`, koşullar, `writeNightsBatch` kullanımı, sıfır gecede gizlenen "Update dates").
- `tests/daily-itinerary.test.mts` (+4): aşağıdaki kontrol listesi maddesi 3.

---

## 4. Etkilenen yüzeyler (kontrol listesi)

| Alan | Değişiklik |
|---|---|
| `itinerary-projection.ts` | clamp kaldır, gün aralığını trip'e sınırla |
| `trip-domain-utils.ts` | clamp kaldır, `computeStopSchedule` 0-gece davranışı |
| `PlanRouteDomain.tsx` | ✅ konaklama/ara durak toggle, stepper sınırı, kademeli uyarı bölgesi + backfill aksiyonu |
| `TripboxMap.tsx` | ✅ `kind` prop, boyut/renk/paint sırası, ekran-uzayı declutter |
| `lib/map-pins.ts` | ✅ yeni — pin kind'ı, gün rozeti, aralık dışı davranışı, `declutterWaypoints` |
| `DashboardClient.tsx` | ✅ pin `kind` + gün numarası etiketi; alt yazı ayrımı **gerekmiyordu** (bkz. §4a) |
| `TripsClient.tsx`, `TripOverviewDomain.tsx`, `TripCard.tsx` | **gerekmiyor** — üçü de zaten tarihlerden sayıyor (bkz. §4a) |
| `DailyItineraryView.tsx` | ✅ gün başlığında "Night in {yer}"; ara duraklar zaten gün içi girdi (Faz 1) |
| `013` / `20260715233000` RPC'leri | ✅ `20260808120000` içinde düzeltildi (bkz. §4a-0) |
| `types/index.ts` | `nights` yorumu |
| `lib/trip-photo.ts`, `trips-library.ts` | etkilenmiyor (yalnızca `stop_type` okuyor) — doğrulandı |
| `lib/ics.ts` | ✅ `DTEND` güvencesi — 0 geceli durak sıfır uzunlukta etkinlik üretmiyor |
| `bookings/FindStaySection.tsx` | ✅ 0 geceli duraklar için konaklama arama linki gösterilmiyor |
| `itinerary/ItineraryTimeline.tsx` | ✅ `overflow` uyarısı |
| `lib/offline/*`, `lib/mapbox/*` | `nights` kullanmıyor — doğrulandı |

## 4a. Kontrol listesi doğrulaması (2026-08-08, koda bakılarak)

Yukarıdaki tablonun işaretsiz satırları tek tek koda bakılarak doğrulandı. Üçünün ikisi zaten doğruydu; tablo eskiydi.

### 4a-0. Sihirbaz regresyonu — zaten düzeltilmiş, **yeni migration yazılmadı**

Rapor edilen canlı hata (`20260715233000_validate_create_trip_with_stops.sql:130-139` insert'inin `nights` yazmaması) **Faz 1 ile aynı migration içinde kapatılmış**: `20260808120000_stop_overnight_semantics.sql`, `alter column nights set default 0`ın hemen ardından fonksiyonu `create or replace` ile yeniliyor —

- satır 118: payload guard'a `(stop ? 'nights' and coalesce(stop->>'nights','') !~ '^\d+$')` eklenmiş, yani negatif değer reddediliyor;
- satır 148/156: insert `nights` kolonunu yazıyor, `coalesce((s->>'nights')::int, 1)`.

Planın istediği düzeltme birebir bu. Uygulanmış bir dosyayı **çoğaltmak** için ikinci bir migration yazmak, aynı fonksiyonu iki kez tanımlayan bir zincir bırakırdı; onun yerine canlı veritabanının hangi yarısını aldığını **doğrulanabilir** hale getirdik (aşağıya bkz.).

İki ek bulgu:

- **Sihirbaz `p_stops` göndermiyor.** `components/trips/new/Step5.tsx:51-68` RPC'yi çağırırken `p_stops` parametresini hiç geçmiyor — sihirbazdan çıkan trip **sıfır durakla** doğuyor, kullanıcı durakları sonradan Plan'dan ekliyor (ve orada yeni default'u, yani ara durağı alıyor — istenen davranış). Dolayısıyla `p_stops` gönderen tek canlı çağıran **Explore'un "Use this route"** akışı (`app/explore/ExploreClient.tsx:236`). Hatanın etki alanı prompt'ta tarif edilenden dar.
- **Client `nights` göndermiyor, RPC default'una güveniliyor.** Karar: `ExploreClient` payload'ında `nights` yok; şablon rotasının waypoint'leri uyunacak şehirler ve RPC eksik değeri "1 gece" okuyor. Açık `1` yazmak aynı sözleşmeyi ikinci bir yere kopyalar ve senkron tutulması gerekirdi. Gerekçe kodun içine yorum olarak yazıldı.

**Canlı DB doğrulaması** için `scripts/check-pending-migrations.sql`'e iki yeni `check_kind` ve iki satır eklendi:

- `column_default` → `stops.nights=0` (ALTER çalıştı mı?)
- `function_source` → `create_trip_with_stops|nights` (fonksiyon yenilendi mi?)

`function`/`table` varlık kontrolleri bu ayrımı yapamıyordu: `create_trip_with_stops` 013'ten beri var, "hangi sürüm canlı" sorusuna cevap vermiyordu. **İlk satır TRUE ve ikinci satır FALSE ise** sihirbaz/Explore trip'leri gerçekten 0 geceli duraklarla doğuyor; migration'ın ikinci yarısını SQL Editor'de tekrar çalıştırmak yeterli (`create or replace`, idempotent).

Davranış testi `supabase/tests/functional/create_trip_with_stops_nights.spec.sql` (yeni, 4 blok): `nights`siz durak 1 gece alır; açık `nights` (0 dahil) birebir yazılır; negatif değer trip yaratılmadan reddedilir; tabloya doğrudan insert (Plan'ın "Add destination" yolu) 0 alır — iki yolun **bilinçli** olarak ayrıldığını kilitler. `tests/` altına değil buraya kondu: test edilen şey SQL (kolon default'u, payload guard'ı, plpgsql gövdesindeki `coalesce`); bir node testi ancak migration dosyasının **metnini** doğrulayabilirdi, ki bu migration'ın hiç uygulanmadığı bir veritabanında da geçerdi.

### 4a-1. `TripOverviewDomain.tsx` / `TripCard.tsx` — **gerekmiyor**

- `TripOverviewDomain.tsx:543` → `totalDays = trip.start_date && trip.end_date ? totalNights(trip) + 1 : 0`. Tarihlerden. Durak sayısı hiç girmiyor.
- `components/dashboard/TripCard.tsx:21` → `getNights(trip.start_date, trip.end_date)`. Tarihlerden.
- `app/trips/trips-library.ts:197` zaten doğrulanmıştı.

`TripOverviewDomain.tsx:542` `computeStopSchedule`'ı `stop.nights ?? 1` ile besliyor — `stopNights()` ile aynı legacy fallback, tutarlı.

### 4a-2. `DashboardClient.tsx` alt yazısı — **gerekmiyor**

`tripDuration()` (satır 62-66) `calendarDays(start, end) + 1` ile **tarihlerden** hesaplıyor; satır 394 bunu durak sayısıyla yan yana basıyor: `{validStops.length} stops · 13 days`. Yani istenen "13 gün · 22 durak" ayrımı zaten yerinde ve gün sayısı hiçbir zaman durak sayısından türemiyor.

### 4a-3. `DailyItineraryView.tsx` — yarısı hazırdı, yarısı **eksikti ve yapıldı**

- *"Ara duraklar gün içi girdi olarak"* → Faz 1'de olmuş: `buildTimeline` 0 geceli durak projeksiyonlarını o günün `entries`'ine koyuyor (negatif `orderIndex`, rota sırasında). Ek iş yok.
- *"Gün başlığında o gecenin konaklama yeri"* → **gerçek bir boşluk.** Durak projeksiyonu yalnızca **varış** gününde görünüyor; 4 gecelik bir Floransa konaklamasının 2., 3. ve 4. gününde ekranda o gecenin nerede geçtiğini söyleyen hiçbir şey yoktu (o günler tamamen boş görünüyordu).

Yapılan: `overnightBaseByDay()` (yeni, `itinerary/daily-itinerary.ts`) — `D` gününde başlayan `N` geceli konaklama `D…D+N-1` gecelerini adlandırıyor; `D+N` yola çıkılan sabah, sıradakine ait. Ara duraklar hiçbir gecenin sahibi değil. `ItineraryTimeline` bunu hesaplayıp günlük ekranın başlığına veriyor: tarih satırının altında 🌙 **"Night in Florence"**.

Tasarım notu: **tarih değil gün numarası** ile anahtarlanıyor. Böylece modül tarih aritmetiğinden tamamen uzak kalıyor (repoda `addDays`ın üç kopyası var, dördüncüsü açılmadı) ve `daily-itinerary.ts` node test runner için `@/`-import'suz kalmayı sürdürüyor — her çağıranın elinde `TimelineDay.dayNumber` zaten var, tarihsiz trip'lerin ise başka bir şeyi yok. Çakışmada **sonraki** konaklama kazanıyor: bir geceyi iki konaklamanın talep etmesi aşırı planlanmış rota demek, sonraki de yolun sonundaki yatak.

Yan fayda: aynı `overnightBaseByDay` `DayStrip`'in **ölü dalını** da tamir etti. `ItineraryTimeline`'daki eski `stopNameByDate` haritası yalnızca `day.date === null` iken okunuyordu, o da `.get('')` ile — yani hiçbir zaman eşleşmiyordu. Yorumdaki *"Day 3 · Florence"* hiç çalışmamış. Artık tarihsiz günler gerçekten konaklama adını gösteriyor.

`DailyRoutePreview`'a dokunulmadı: oradaki pinler trip durakları değil, tek bir günün aktiviteleri — Faz 3'ün gerekçesi geçerli.

## 5. Riskler

- **Sessiz veri anlamı kayması.** Default 0 olduktan sonra "eski durak = 1 gece, yeni durak = 0 gece" bir dönem birlikte yaşayacak. ✅ Faz 5'teki açık kullanıcı akışı bunu görünür kılıyor; sessiz otomatik backfill yapılmadı.
- ~~**Sihirbaz regresyonu.**~~ ✅ `20260808120000` fonksiyonu `coalesce((s->>'nights')::int, 1)` ile yeniliyor; davranış `supabase/tests/functional/create_trip_with_stops_nights.spec.sql` ile kilitlendi. Canlı DB'nin migration'ın **ikinci yarısını** aldığı `scripts/check-pending-migrations.sql`'in yeni `function_source` satırıyla doğrulanabilir (bkz. §4a-0).
- **Tümü ara durak olan trip.** ✅ Test edildi: tarihsiz trip tam olarak 1 gün (0 değil), tarihli trip gün sayısını tarihlerinden korur ve tüm duraklar 1. günde toplanır; haritada hepsi sönük nokta olur ama hiçbiri düşmez.
- **Harita etiketi anlam değişimi.** Pin numarası "durak sırası"ndan "gün numarası"na geçiyor. Aynı gün içinde birden fazla konaklama olamayacağı için çakışma yok, ama dokümana/ekran görüntülerine yansıtılmalı.

## 6. Önerilen sıra

1. ~~**Faz 1 + sihirbaz düzeltmesi**~~ — ✅ tamamlandı; migration uygulandı
2. ~~**Faz 2**~~ — ✅ tamamlandı; kullanıcı konaklama işaretleyebiliyor
3. ~~**Faz 3**~~ — ✅ tamamlandı; harita hiyerarşisi ve gün numaralı pinler yerinde
4. ~~**Faz 4a**~~ — ✅ tamamlandı; yakın ara duraklar `+N` balonuna toplanıyor
5. ~~**Faz 5**~~ — ✅ tamamlandı; RealTrip1 gibi trip'ler Plan sekmesinden tek dokunuşla düzeltilebiliyor

**Kalan tek iş: Faz 4b** (ara durakların GeoJSON cluster `Layer`'ına taşınması) — durak sayısı >50 olan trip'ler ortaya çıkınca açılacak ayrı iş kalemi. Bunun dışında plan kapandı.
