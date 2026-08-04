# Tripper — Token-Verimli Aktif Gezi UI/UX Promptları

Bu sürüm, küçük UI değişiklikleri için büyük dosyaların ve aynı belgelerin tekrar tekrar okunmasını önlemek amacıyla hazırlanmıştır. Görevler mikro fazlara ayrılmıştır; her prompt yalnız gerekli sembolleri ve yakın çevresini inceletir.

## Kullanım modeli

- Aynı geliştirme oturumunda sırasıyla ilerleniyorsa **Bağlam Kartı yalnız bir kez** verilir.
- Sonraki görevlerde yalnız ilgili `UX-0X` promptu kullanılır.
- Yeni bir oturum açılıyorsa Bağlam Kartı + tek görev promptu birlikte verilir.
- Bir görev tamamlanmadan sonraki görevin dosyaları okunmaz.

## Bağlam Kartı — Her oturumda yalnız bir kez

```text
Tripper, Next.js + TypeScript ile geliştirilmiş dark-only, mobile-first bir gezi uygulamasıdır.
Aktif gezi alanı app/trip/[id]/mobile altındadır. Supabase şeması, RLS, realtime ve veri
sözleşmeleri bu UI görevlerinde değişmeyecek.

Tasarım kuralları:
- Mevcut Dusk/Liquid Glass kimliğini koru.
- Ekran başına yalnız bir baskın amber CTA kullan.
- Dense listelerde blur kullanma.
- Kritik metin minimum 12 px, dokunma hedefi minimum 44×44 px.
- 320–430 px, safe-area, keyboard, reduced-motion ve owner/editor/viewer davranışlarını koru.
- Yeni bağımlılık, global state veya migration ekleme.

TOKEN KORUMA PROTOKOLÜ:
1. Önce git status --short ve AGENTS.md dosyasını kontrol et. README veya docs dosyalarını
   otomatik olarak okuma; bu prompt gerekli ürün kararlarını içeriyor.
2. 400 satırdan büyük bir dosyayı baştan sona okuma.
3. Önce rg -n ile promptta verilen sembolü bul; yalnız eşleşmenin yaklaşık 40–80 satır
   çevresini oku. İkinci bir bölge gerekmedikçe dosyanın başka kısmını açma.
4. Importları yalnız ekleme/değiştirme gerektiğinde ilk 30–50 satırdan kontrol et.
5. Repo genelinde broad grep veya mimari keşif yapma. Yalnız promptta listelenen dosyalar
   ve doğrudan import edilen küçük type/helper dosyaları kapsamda.
6. Önceki görev aynı dosyayı okuduysa tekrar okuma; mevcut oturum bağlamını ve git diff’i kullan.
7. Değişiklikten sonra tüm dosyayı yeniden okuma. rg ile değişen sembolleri ve
   git diff -- <hedef-dosyalar> çıktısını kontrol et.
8. Her mikro görevde yalnız npm run typecheck ve ilgili dar testi çalıştır. Full lint/test/build
   yalnız UX-09 final kapısında çalıştırılacak.
9. İlgisiz kodu refactor etme. Kullanıcı istemedikçe commit/push yapma.
```

---

## UX-01 — Yanıltıcı ve teknik UI metinlerini temizle

### Hedef dosyalar

- `app/trip/[id]/mobile/TripOverviewDomain.tsx`
- `app/trip/[id]/mobile/PlanRouteDomain.tsx`
- `app/trip/[id]/mobile/PrepDomain.tsx`
- `app/trip/[id]/mobile/components/TripMoreSheet.tsx`

### Kopyalanabilir prompt

```text
Bağlam Kartı kurallarını uygula. Yalnız dört küçük UI metni/ölü ucu düzelt.

Dosyaları bütünüyle okuma. Şu eşleşmeleri rg -n ile bul ve yalnız yakın çevresini aç:
- TripOverviewDomain.tsx: "Offline access is coming soon"
- PlanRouteDomain.tsx: "migration 008"
- PrepDomain.tsx: "migration 010"
- TripMoreSheet.tsx: "Trip settings"

Değişiklikler:
1. Overview’daki "Download for offline" satırını UX-03 gerçek bağlantıyı kurana kadar kaldır.
   Çalışmayan CTA veya "coming soon" toast bırakma.
2. Plan nights save hatasını kullanıcı diline çevir:
   "Couldn't save this change. Check your connection and try again."
   Mevcut Retry callback’ini koru.
3. Prep yükleme hatasından migration bilgisini çıkar:
   "Check your connection and try again."
4. Çalışmayan Trip settings satırını More sheet JSX’inden kaldır.
   MoreDestination type’ını bu görevde temizleme; gereksiz kapsam büyütme.

Davranış, sorgu, state veya navigation değiştirme.

Doğrulama:
- rg ile "migration 008|migration 010|Offline access is coming soon|Trip settings" hedef
  UI dosyalarında kalmadığını kontrol et.
- npm run typecheck çalıştır.
- git diff’i yalnız bu dört dosya için incele.

Kabul:
- Teknik migration metni kullanıcıya görünmüyor.
- İki çalışmayan/yanıltıcı giriş yok.
- Retry davranışı korunuyor.
```

---

## UX-02 — Onboarding geliştirme kontrolünü production’dan kaldır

### Hedef dosya

- `components/onboarding/mobile-entry-flow.tsx`

### Kopyalanabilir prompt

```text
Bağlam Kartı kurallarını uygula. Yalnız onboarding restart kontrolünün görünürlüğünü düzelt.

Dosyayı bütünüyle okuma. rg -n "Restart onboarding" ile JSX’i bul; state reset handler’ı
gerekirse yalnız adı üzerinden ayrıca bul. Importları değiştirmek gerekmiyorsa dosyanın başını okuma.

"Restart onboarding" kontrolünü yalnız process.env.NODE_ENV === 'development' iken render et.
Development davranışını ve onboarding reset fonksiyonunu koru. Production’da kontrol DOM’a
hiç eklenmemeli; yalnız CSS ile gizleme kullanma.

Mevcut test stiline uygun küçük bir contract testi ekle veya var olan onboarding testine ekle.
Test production render sözleşmesini mümkün olan en dar şekilde doğrulasın. Bu görev için yeni
test kütüphanesi ekleme.

Doğrulama:
- npm run typecheck
- yalnız ilgili onboarding/accessibility test dosyası
- git diff -- components/onboarding/mobile-entry-flow.tsx <ilgili-test>

Kabul:
- Development’ta restart kontrolü çalışıyor.
- Production’da DOM’a render edilmiyor.
- Onboarding akışı ve Skip/Continue davranışı değişmiyor.
```

---

## UX-03 — More menüsünü grupla ve mevcut veriden özet göster

### Hedef dosyalar

- `app/trip/[id]/mobile/components/TripMoreSheet.tsx`
- `app/trip/[id]/mobile/domain-ui.tsx`
- `app/trip/[id]/mobile/TripMobileClient.tsx`
- `app/trip/[id]/mobile/overview-data.ts` — yalnız type isimlerini görmek için, düzenleme beklenmiyor

### Kopyalanabilir prompt

```text
Bağlam Kartı kurallarını uygula. More menüsünü grupla ve yeni sorgu oluşturmadan üç kısa
durum özeti göster.

DAR OKUMA:
1. TripMoreSheet.tsx içinde yalnız TripMoreSheetProps, function signature ve BottomSheet JSX’ini oku.
2. domain-ui.tsx içinde yalnız SheetOptionRowProps ve SheetOptionRow fonksiyonunu oku.
3. TripMobileClient.tsx içinde yalnız TripMoreSheet çağrısını rg ile bul ve çevresini oku.
4. overview-data.ts küçükse yalnız TripOverviewData ve row type’larını oku.
TripMobileClient veya domain-ui dosyalarının geri kalanını okuma.

Uygulama:
1. TripMoreSheet’e `overview: TripOverviewData` prop’u ekle. TripMobileClient zaten sahip olduğu
   `overview` değerini iletsin. Yeni fetch, hook veya Supabase sorgusu ekleme.
2. SheetOptionRow’a optional `trailing?: ReactNode` ekle. Verilmediğinde eski görünüm değişmesin.
3. More içeriğini iki semantik section altında göster:
   - Trip essentials: Budget, Packing, Journal
   - Manage & share: Members, Activity, Export, Offline access
4. Mevcut overview rows içinden kısa trailing değerler türet:
   - Budget ready: toplam expense amount; error: "Unavailable"; boş: "No expenses"
   - Packing ready: checked/total; error: "Unavailable"; boş: "Not started"
   - Journal ready: entry count; error: "Unavailable"; boş: "No entries"
   Currency biçimi için projede bu dosyanın zaten eriştiği helper yoksa yeni büyük dependency
   zinciri açma; kısa count/status tercih et.
5. Group heading en az 12 px ve aria-labelledby ile section’a bağlı olsun.
6. Satır min-height ve mevcut focus/touch davranışını koru.

Kapsam dışı:
- Offline sheet state’ini taşımak; UX-04.
- Overview query’lerini veya DB projection’larını büyütmek.
- Domain ekranlarını değiştirmek.

Doğrulama:
- npm run typecheck
- ilgili mevcut UI/accessibility testi
- git diff yalnız bu üç değişen dosya

Kabul:
- More iki anlaşılır gruptan oluşuyor.
- Üç özet yalnız mevcut overview verisinden geliyor.
- Error state sahte sıfır göstermiyor.
- Satırlar 320 px’te sıkışmıyor ve erişilebilir adlarını koruyor.
```

---

## UX-04 — Overview ve More için tek Offline Access sheet kullan

### Hedef dosyalar

- `app/trip/[id]/mobile/TripMobileClient.tsx`
- `app/trip/[id]/mobile/TripOverviewDomain.tsx`
- `app/trip/[id]/mobile/components/TripMoreSheet.tsx`
- `app/trip/[id]/mobile/components/OfflineAccessSheet.tsx` — yalnız props sözleşmesi için

### Kopyalanabilir prompt

```text
Bağlam Kartı kurallarını uygula. Overview ve More aynı OfflineAccessSheet instance’ını açsın.

DAR OKUMA:
- TripMobileClient: yalnız state tanımları, TripOverviewDomain çağrısı, TripMoreSheet çağrısı
  ve component return’ünün sheet render edilen alt bölgesi.
- TripOverviewDomain: yalnız props interface, function parametreleri ve UX-01’de kaldırılan
  readiness rows çevresi.
- TripMoreSheet: yalnız props, offlineOpen kullanımları ve OfflineAccessSheet JSX’i.
- OfflineAccessSheet: yalnız export edilen props interface ve function signature.
Dosyaların tamamını okuma.

Uygulama:
1. Offline sheet open/close state’inin tek owner’ı TripMobileClient olsun.
2. OfflineAccessSheet’i TripMobileClient seviyesinde bir kez render et ve mevcut trip, userId,
   members, stops, itinerary ve routeGeometry değerlerini aynen ilet.
3. TripMoreSheet kendi OfflineAccessSheet state/render’ını kaldırıp `onOpenOffline` callback’i alsın.
   Offline satırı bu callback’i çağırmalı ve More sheet kapanmalı.
4. TripOverviewDomain `onOpenOffline` callback’i alsın. Get ready bölümüne çalışan
   "Offline access" / "Download this trip" satırını geri ekle.
5. Aynı anda More ve Offline sheet açık kalmasın. Offline kapanınca kullanıcı primary section
   bağlamını kaybetmesin. Mevcut browser history yaklaşımını yeniden tasarlama; yalnız state
   çakışmasını engelle.
6. Focus return: Overview’dan açıldıysa Overview satırına, More’dan açıldıysa More tetikleyicisine
   dönmeli. Mevcut MobileBottomSheet focus davranışı yeterliyse duplicate focus kodu yazma.

Yeni offline cache API, sorgu veya durum badge’i ekleme.

Doğrulama:
- npm run typecheck
- mevcut offline güvenlik/cache testleri arasından doğrudan ilgili olanlar
- Overview → Offline aç/kapat
- More → Offline aç/kapat
- aynı anda tek dialog kontrolü
- git diff yalnız hedef dosyalar

Kabul:
- Uygulamada tek OfflineAccessSheet instance’ı var.
- İki giriş de aynı çalışan akışı açıyor.
- Nested/double modal oluşmuyor.
- Kapanışta section ve focus bağlamı korunuyor.
```

---

## UX-05 — Aktif Overview’da tek CTA ve açık weather state

### Hedef dosyalar

- `app/trip/[id]/mobile/TripOverviewDomain.tsx`
- `lib/weather/openMeteo.ts` — yalnız mevcut dönüş sözleşmesi gerekirse

### Kopyalanabilir prompt

```text
Bağlam Kartı kurallarını uygula. Yalnız aktif gezi Overview kartını sadeleştir.

TripOverviewDomain büyük dosyadır; tamamını okuma. rg ile yalnız şu bölgeleri aç:
- "const [weather"
- "fetchDayWeather"
- "function ActiveContent"
- "Navigate to"
- "Open Travel Mode"
Props/type değişimi için yalnız ActiveContent signature çevresini kullan.
openMeteo.ts dosyasını yalnız fetchDayWeather dönüş/hata sözleşmesi belirsizse aç.

Uygulama:
1. ActiveContent içinde tek amber primary CTA bırak: "Open Travel Mode".
2. Overview’daki external Google Maps "Navigate to..." CTA’sını tamamen kaldır.
   Navigasyon TravelModeDomain içindeki mevcut Navigate/provider sheet üzerinden yapılacak.
3. "View day" ve canEdit için "Add memory" secondary/ghost olarak kalabilir.
4. Weather state’i şu union ile açıkla:
   idle | loading | ready | unavailable | error.
   Büyük bir reducer yazma; küçük local state yeterli.
5. Hedef yoksa idle; forecast horizon dışında/provider null ise unavailable; rejection ise error.
   Loading sırasında layout’u zıplatmayan kısa skeleton/metin, unavailable için
   "Forecast not available yet", error için "Weather unavailable" göster.
6. Stale response hedef değiştikten veya component unmount olduktan sonra state yazmamalı.
   Mevcut cancellation boolean/AbortSignal yaklaşımını en küçük değişiklikle genişlet.
7. Weather state primary CTA ile yarışmamalı; warning yalnız rain/snow için kullanılmalı.

Bu görevde TravelModeDomain’i okuma veya değiştirme; navigasyon akışı zaten orada.

Doğrulama:
- npm run typecheck
- varsa overview/weather dar testleri
- rg ile ActiveContent bölgesinde amber primary action sayısını kontrol et
- git diff yalnız hedef dosya(lar)

Kabul:
- Aktif Overview’da tek baskın amber CTA var.
- External navigation Overview’dan kaldırılmış.
- Loading, forecast yokluğu ve provider hatası birbirine karışmıyor.
- Unmount/target change sonrası stale weather görünmüyor.
```

---

## UX-06 — Plan sheet handle ve scroll/drag ayrımı

### Hedef dosya

- `app/trip/[id]/mobile/PlanRouteDomain.tsx`

### Kopyalanabilir prompt

```text
Bağlam Kartı kurallarını uygula. Yalnız draggable Plan sheet’in kontrol ve gesture davranışını düzelt.

PlanRouteDomain çok büyüktür; tamamını okuma. rg ile şu sembolleri bul ve her biri çevresinde
en fazla 60–80 satır oku:
- `sheetHeight`
- `onPointerDown` veya drag başlangıç handler’ı
- `snapPoints`
- `toggleSheet`
- `draggable bottom sheet`
- mevcut 36×5 drag handle JSX’i
Import gerekirse yalnız ilk 40 satırı aç.

Uygulama:
1. Drag başlangıcını yalnız handle/header kontrolüne bağla. Scroll edilen content container’dan
   sheet drag başlatma.
2. Görsel handle’ı en az 44 px dokunma alanı olan button’a dönüştür.
3. Button:
   - type="button"
   - mevcut snap seviyesine göre aria-label "Expand plan" veya "Collapse plan"
   - aria-expanded
   - Enter/Space click davranışıyla bir sonraki anlamlı snap noktasına geçiş
4. Pointer drag mevcut min/max clamp ve nearest-snap davranışını korusun.
5. Reduced-motion açıkken animate duration 0 kalsın.
6. Liste `overflowY: auto` davranışını ve bottom nav için safe-area padding’ini bozma.
7. Yeni gesture kütüphanesi ekleme.

Bu görevde route fetch, stops, itinerary veya CTA düzenini değiştirme; UX-07 kapsamı.

Dar test ekle:
- snap toggle sonucu;
- reduced-motion;
- content pointer down’ın drag başlatmaması mümkünse helper/behavior testi.

Doğrulama:
- npm run typecheck
- ilgili dar test
- 320 px kısa viewportta manuel drag + list scroll
- git diff -- app/trip/[id]/mobile/PlanRouteDomain.tsx <test>

Kabul:
- Handle tap, keyboard ve pointer ile çalışıyor.
- Liste scroll’u sheet’i sürüklemiyor.
- Snap ve reduced-motion davranışı korunuyor.
```

---

## UX-07 — Plan sekmelerinde sticky CTA ve rota hata iletişimi

### Hedef dosya

- `app/trip/[id]/mobile/PlanRouteDomain.tsx`

### Kopyalanabilir prompt

```text
UX-06 ile aynı oturumdaysan PlanRouteDomain’i yeniden okuma; mevcut bağlam ve git diff’i kullan.
Yeni oturumdaysan Bağlam Kartı kurallarını uygula ve yalnız aşağıdaki sembolleri aç:
- `routeStatus`
- `summaryDistanceText`
- `SegmentedTabs`
- `activeTab === 'route'`
- `activeTab === 'days'`
- mevcut Add destination/FAB render’ı
- itinerary item sheet açma callback’i

Uygulama:
1. Sheet içinde sekmeye bağlı tek sticky primary action:
   - Route: "Add destination"
   - Days: "Add activity"
   Mevcut form/sheet açma callback’lerini yeniden kullan. Yeni form oluşturma.
2. CTA sheet scroll içeriğinin sonunda kaybolmamalı; bottom nav ve safe-area üstünde kalmalı.
   320 px’te içerik üstünü gereksiz kaplamamalı.
3. Viewer için iki mutation CTA da render edilmemeli.
4. Pinned route summary:
   - idle/0–1 stop: yalnız stop count
   - loading: "Calculating route…" + ölçüsü sabit skeleton
   - ready: stop count + distance + duration
   - unavailable: "Route unavailable" + küçük Retry
5. Retry mevcut route request akışını tekrar çağırmalı. LatestRouteRequestController ve stale
   request korumasını bypass etme.
6. Optimize yalnız canEdit, online ve 2+ stop koşullarında aktif olsun. Koşul sağlanmıyorsa
   gizlemek tercih edilir; görünür disabled bırakılırsa nedeni erişilebilir açıklamayla ver.
7. Ekranda aynı anda ikinci amber CTA oluşturma. Optimize secondary görünümde kalmalı.

Bu görevde stop mutation/realtime algoritmasını refactor etme.

Doğrulama:
- npm run typecheck
- ilgili route/map testleri
- 0, 1, 2+ stop; ready/loading/unavailable; viewer/editor
- 320 ve 430 px görsel kontrol
- yalnız PlanRouteDomain diff’ini incele

Kabul:
- Her sekmede en fazla bir primary CTA var.
- CTA scroll altında kaybolmuyor.
- Rota hatası sonsuz loading veya sahte mesafe göstermiyor.
- Retry stale request korumasını koruyor.
```

---

## UX-08 — Yalnız kritik 11 px metinleri düzelt

### Hedef dosyalar

- `app/trip/[id]/mobile/components/TripPrimaryNav.tsx`
- `app/trip/[id]/mobile/TripOverviewDomain.tsx`
- `app/trip/[id]/mobile/TravelModeDomain.tsx`
- UX-01–07 diff’inde değişmiş diğer UI dosyaları

### Kopyalanabilir prompt

```text
Bağlam Kartı kurallarını uygula. Repo genelinde tipografi refactor’ı yapma.

Yalnız hedef dosyalarda şu dar aramayı çalıştır:
rg -n "fontSize: (10|11|11\\.5)|fontSize: '(10|11|11\\.5)" <hedef-dosyalar>

Her eşleşmenin yalnız yakın JSX bloğunu oku. Şunları minimum 12 px yap:
- bottom navigation label;
- tarih/durum/hata/privacy metni;
- sheet eylem açıklaması;
- offline/realtime durumu;
- kullanıcının karar vermesi için gereken metadata.

Dekoratif SVG içi ölçü, görsel badge detayı veya erişilebilir adı ayrıca bulunan kritik olmayan
işaretleri otomatik büyütme. Tüm 11 px eşleşmeleri körlemesine değiştirme.

Ek kontroller:
1. TripPrimaryNav 5 öğeyle 320 px genişlikte taşmamalı.
2. Metin sığmıyorsa fontu tekrar küçültme; gap/padding/wrap düzenle.
3. Mevcut dosya tokens.* kullanıyorsa raw renk ekleme. DUSK kullanan dosyada toplu token
   migrasyonu yapma.
4. Yeni blur veya amber accent ekleme.

Doğrulama:
- npm run typecheck
- 320/375/390/430 px bottom nav ve ilgili ekran screenshot/manuel kontrol
- %200 text zoom spot check
- git diff yalnız hedef dosyalar

Kabul:
- Kritik metin 12 px altında değil.
- Bottom nav 320 px’te taşıma yapmıyor.
- Gereksiz görsel refactor veya toplu token değişimi yok.
```

---

## UX-09 — Dar erişilebilirlik testleri ve final kalite kapısı

### Hedef dosyalar

- `tests/accessibility-contracts.test.mts`
- gerekiyorsa mevcut ilgili test dosyaları
- `docs/mobile-regression-checklist.md` — yalnız artık yanlış olan maddeler

### Kopyalanabilir prompt

```text
Bağlam Kartı kurallarını uygula. UX-01–08 değişiklikleri için yalnız gerekli regresyon
testlerini ve final kalite kapısını tamamla.

Önce git diff --name-only ile gerçekten değişen dosyaları listele. Büyük UI dosyalarını yeniden
okuma. Test beklentilerini git diff ve export edilen prop/label sözleşmelerinden üret.

Ekle/güncelle:
1. Production onboarding restart kontrolü yok.
2. More grupları ve temel destination accessible name’leri var.
3. TripPrimaryNav active state aria-current kullanıyor.
4. Plan handle erişilebilir isim, aria-expanded ve minimum touch target taşıyor.
5. Active Overview’da yalnız bir primary amber action sözleşmesi var.
6. Migration numaraları kullanıcı metninde yok.
7. Offline akışında aynı anda tek sheet/dialog render ediliyor.

Kaynak regex testi yalnız projedeki mevcut test yaklaşımı buysa kullan; mümkün olan davranışlar
için mevcut component/E2E altyapısını tercih et. Yeni ağır test framework’ü ekleme.

docs/mobile-regression-checklist.md içinde yalnız şu artık yanlış olabilecek satırları rg ile bul:
- routeLoading sonsuz spinner known bug
- weather silent failure
- Offline access coming soon
Kodda düzelmişse maddeleri güncelle; dokümanın tamamını yeniden yazma.

FINAL KAPI:
- npm run typecheck
- npm run lint
- npm test
- npm run build
- git diff --check
- git status --short

Manuel matris:
- 320, 375, 390, 430 px
- active Overview, Plan Route, Plan Days, More, Offline, Travel Mode
- editor ve viewer
- online/offline
- reduced-motion
- virtual keyboard altında en az bir Plan formu

Service worker pretest üretimi tracked dosya değiştirirse bunun beklenen olup olmadığını kontrol et;
kullanıcı değişikliklerini geri alma.

Kabul:
- Tüm kalite komutları geçiyor.
- Mobil checklist güncel kodla çelişmiyor.
- Yeni testler yalnız değişen UX sözleşmelerini koruyor.
- İlgisiz dosya veya geniş snapshot churn yok.
```

---

## Önerilen uygulama sırası ve oturum grupları

Token tüketimini azaltmak için görevleri şu oturumlarda grupla:

1. **Oturum A:** UX-01 + UX-02  
   Küçük metin ve production guard değişiklikleri.

2. **Oturum B:** UX-03 + UX-04  
   Aynı More/Overview/shell bağlamı tekrar kullanılabilir.

3. **Oturum C:** UX-05  
   Yalnız aktif Overview ve weather state.

4. **Oturum D:** UX-06 + UX-07  
   Büyük `PlanRouteDomain.tsx` yalnız bir kez okunur.

5. **Oturum E:** UX-08 + UX-09  
   Yalnız değişen dosyalar üzerinden görsel/a11y final sweep.

## Token bütçesi kontrol listesi

Her görev sonunda şu sorulara “evet” cevabı verilebilmelidir:

- Büyük dosyada yalnız hedef sembol çevresi mi okundu?
- Aynı docs dosyaları tekrar okunmadı mı?
- Repo genelinde gereksiz arama yapılmadı mı?
- Yalnız hedef dosyalar değişti mi?
- Full test/build yalnız final fazda mı çalıştırıldı?
- Sonraki görev için gerekli kısa handoff, dosyanın tamamı yerine git diff üzerinden verilebilir mi?

Bu yöntemle özellikle `TripMobileClient.tsx`, `TripOverviewDomain.tsx` ve
`PlanRouteDomain.tsx` gibi büyük dosyalar her mikro geliştirmede tekrar baştan okunmaz.
