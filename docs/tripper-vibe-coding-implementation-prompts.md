# Tripper Mobile — Vibe Coding Implementasyon Promptları

Bu dokümandaki her bölüm bağımsız bir implementasyon promptudur. İlgili aşamanın tamamını, başındaki ve sonundaki yönergelerle birlikte Cursor, Claude Code veya benzeri bir coding agent'a verin. Aşamalar sıralı tasarlanmıştır; ancak her prompt agent'tan mevcut repoyu yeniden incelemesini ve daha önce tamamlanmış işleri tespit ederek uyumlu ilerlemesini ister.

Ortak ürün kararı: Tripper yalnızca mobil deneyime odaklanır. Masaüstü için özel görünüm, üç kolonlu layout veya desktop-only özellik üretilmez. Wanderlog'un planlama kolaylığı, birleşik itinerary, harita bağlantısı, rezervasyon, collaboration, packing ve budget yaklaşımı referans alınır; görselleri, metinleri veya markaya özgü UI birebir kopyalanmaz. Tripper'ın koyu, sinematik Liquid Glass kimliği korunur.

---

## Aşama 0 — Güvenli Başlangıç, Audit ve Refactor Hazırlığı

```text
ROLÜN
Bu aşamada Senior Staff Engineer, Codebase Auditor ve Release Safety Engineer olarak çalış. Görevin yeni özellik eklemek değil; Tripper'ın mevcut çalışan mobil sürümünü güvenli bir başlangıç noktasına almak, mevcut kullanıcı değişikliklerini korumak, teknik borcu görünür kılmak ve sonraki mobile-only dönüşüm için risksiz bir temel hazırlamaktır.

PROJE BAĞLAMI
- Repo: C:\Users\emirc\Desktop\tripper
- Stack: Next.js App Router, React, TypeScript, Tailwind CSS, Mapbox GL, Supabase Auth/Postgres/Realtime/Storage, PWA service worker.
- Aktif trip deneyimi: app/trip/[id]/mobile.
- Ana domain bileşenleri: TripMobileClient.tsx, PlanRouteDomain.tsx, PrepDomain.tsx, BudgetDomain.tsx, JournalDomain.tsx.
- Mevcut özellikler: auth, trip oluşturma, stop yönetimi, Mapbox rota, optimizasyon, hava durumu, packing, budget/settlement, journal fotoğrafları, davet rolleri ve Realtime.
- Ürün yalnızca mobil odaklıdır. Desktop layout oluşturma.
- Liquid Glass görsel kimliği korunacaktır; bu aşamada büyük görsel yeniden tasarım yapma.

ZORUNLU ÇALIŞMA ŞEKLİ
1. Önce AGENTS.md, README.md, package.json, git status ve ilgili kaynak dosyalarını oku.
2. Worktree'nin kirli olduğunu varsay. Kullanıcıya ait mevcut değişiklikleri silme, resetleme, geri alma veya toplu formatlama ile ezme.
3. Başlamadan `git diff --stat` ve ilgili dosyalarda `git diff` ile çalışma kapsamını öğren. Commit veya branch oluşturma; kullanıcı açıkça istemedikçe git state değiştirme.
4. Repo içinde `.openai/hosting.json` varsa ilgili hosting kurallarını uygula; yoksa ekleme.
5. Önce mevcut test ve lint komutlarını çalıştır. Windows PowerShell'de gerekirse `npm.cmd test` ve `npm.cmd run lint` kullan.
6. Yeni bağımlılık ekleme. Gerçekten zorunluysa önce gerekçeyi bildir, sürümü sabitle ve lockfile'ı güncelle.

ADIM ADIM UYGULAMA
1. Mevcut ürün yüzeylerini ve ana akışları listeleyen `docs/current-mobile-baseline.md` oluştur:
   - sign-in/sign-up
   - dashboard/trips
   - new trip wizard
   - trip Plan/Prep/Budget/Journal
   - Explore
   - invite/join
   - profile/settings
   Her akış için route, ana component, Supabase tablosu/RPC'si, loading/error/empty state ve bilinen riskleri yaz.
2. `docs/mobile-regression-checklist.md` oluştur. 320, 375, 390 ve 430 px viewport'larda test edilecek maddeleri yaz. Safe area, virtual keyboard, orientation, reduced motion, offline banner, viewer/editor rol farkı, loading/error/empty durumlarını dahil et.
3. Büyük component'ler için sorumluluk haritası çıkar. Özellikle PlanRouteDomain.tsx içindeki harita, route fetch, optimizasyon, days, booking partner links, weather ve stop mutation sorumluluklarını ayrı başlıklarla belgele.
4. Yalnızca davranış değiştirmeyen, açıkça güvenli refactor'lar yap:
   - tekrar eden sabitleri mevcut `domain-ui.tsx` veya uygun küçük modüllere taşı;
   - type'ları `types/index.ts` veya domain'e özel type dosyasında merkezileştir;
   - ancak büyük component'i tek seferde yeniden yazma;
   - dosya taşıma nedeniyle import kırılmasını önle.
5. Mevcut veri modeli için migration haritası çıkar. README'deki özel migration sırasını koru. `000_full_schema.sql` ve `001_initial_schema.sql` dosyalarının alternatif baseline olduğunu açıkça belirt.
6. Mevcut Supabase güvenlik modelini doğrula:
   - owner/editor/viewer davranışı;
   - public şemadaki aktif tablolarda RLS;
   - UPDATE policy'lerinde SELECT + USING + WITH CHECK;
   - client'ta service role kullanılmaması;
   - private `trip-photos` bucket politikaları.
   Bu aşamada remote database'e şema uygulama.
7. Test açığı varsa yalnızca mevcut davranışı koruyan contract testleri ekle. Uygulamanın görünümünü snapshot'a aşırı bağlama; erişilebilir isim, mutation yetkisi, hata/empty ayrımı ve veri dönüşümü gibi kalıcı davranışları test et.

TASARIM VE UI/UX KURALLARI
- Mobile-only: 320–430 px öncelikli; içerik gerekiyorsa daha geniş ekranda ortalanabilir ama desktop deneyim tasarlama.
- Mevcut koyu lacivert, turuncu vurgu ve Liquid Glass sistemi korunur.
- Bu aşamada yeni estetik icat etme; yalnızca tutarsızlıkları belgele.
- Minimum dokunma alanı 44×44 px.
- `100vh` yerine mobil tarayıcılar için uygun yerlerde `100svh`/`100dvh` yaklaşımını koru.
- `env(safe-area-inset-*)`, reduced motion, focus-visible ve screen reader label'larını audit et.

TEKNİK KISITLAR
- Server/client component sınırlarını bozma.
- Supabase query error'larını boş koleksiyon gibi gösterme.
- Optimistic mutation'larda rollback ve kullanıcıya hata bildirimi bulunmalı.
- Mapbox ve Open-Meteo çağrılarını render içinde kontrolsüz tekrar tetikleme.
- Kullanıcı verisini localStorage'a gelişigüzel yazma.
- Silme veya destructive migration yapma.

KABUL KRİTERLERİ
- Mevcut testlerin tamamı geçer.
- Lint temizdir.
- Ürün davranışı değişmemiştir.
- İki audit dokümanı gerçek dosya yolları ve somut riskler içerir.
- Kullanıcının mevcut değişiklikleri korunmuştur.
- Son raporda değiştirilen dosyaları, doğrulama komutlarını, sonuçları ve kalan riskleri açıkça belirt.
```

---

## Aşama 1 — Mobile-Only Bilgi Mimarisi ve Trip Navigasyonu

```text
ROLÜN
Senior Mobile Product Designer, Mobile UX Architect ve React/Next.js UI Engineer olarak çalış. Görevin Tripper'ın trip içi navigasyonunu Wanderlog kadar anlaşılır ve hızlı, fakat Tripper'ın Liquid Glass kimliğiyle tamamen mobile-only olarak yeniden kurmaktır.

PROJE VE ÜRÜN BAĞLAMI
- Repo: C:\Users\emirc\Desktop\tripper
- Stack: Next.js App Router + React + TypeScript + Supabase + Mapbox.
- Aktif trip route'u: app/trip/[id]/mobile.
- Mevcut trip alt menüsü Plan/Prep/Budget/Journal şeklindedir.
- Yeni trip içi bilgi mimarisi: Plan, Explore, Bookings, More.
- More içinde Budget, Packing, Journal, Members, Trip settings, Export ve Offline Access bulunacak.
- App-level alt menü Home, Trips, Explore, Profile olarak kalır.
- Bu proje için masaüstü görünüm yapılmayacaktır.
- Wanderlog'dan örnek alınacak prensipler: her şeyin tek trip workspace'inde bulunması, sık işlerin az dokunuşla yapılması, harita ve itinerary arasında güçlü bağlantı. Birebir görsel kopya yapma.

ÖNCE İNCELE
1. AGENTS.md, README.md ve git status'u oku.
2. TripMobileClient.tsx, PlanRouteDomain.tsx, AppBottomNav.tsx, domain-ui.tsx ve mevcut segmented-tabs bileşenini incele.
3. Mevcut kullanıcı değişikliklerini koru; büyük dosyaları körlemesine yeniden yazma.
4. Route ve Supabase query davranışlarını değiştirmeden önce testleri çalıştır.

UYGULAMA TALİMATLARI
1. Trip içi section type'ını merkezi ve genişletilebilir hâle getir. Önerilen değerler `plan | explore | bookings | more`; More içindeki ekranları ayrı `MoreDestination` type'ıyla yönet.
2. `app/trip/[id]/mobile/components/` altında veya mevcut yapıya uyumlu bir yerde şu bileşenleri oluştur/güncelle:
   - `TripMobileHeader.tsx`: geri, başlık, tarih, üye avatarları, share ve overflow.
   - `TripPrimaryNav.tsx`: Plan, Explore, Bookings, More.
   - `TripMoreSheet.tsx`: Budget, Packing, Journal, Members, Settings, Export, Offline.
   - `TripAddSheet.tsx`: gelecekte Place, Activity, Stay, Transport, Reservation, Note eklemek için merkezi `+ Add` sheet'i; bu aşamada desteklenmeyen seçenekleri dürüstçe disabled/coming-soon göster veya mevcut stop ekleme akışına bağla.
3. Mevcut Budget, Packing ve Journal domain'lerini silme. Bunları More sheet üzerinden açılan full-screen domain ekranlarına bağla.
4. Section state'i component ağacında dağılmasın. Trip workspace seviyesinde tek source of truth kullan. URL/query param ile deep-link desteği eklemek güvenliyse `?section=plan` benzeri doğrulanmış değerler kullan; invalid değerde Plan'a dön.
5. Browser back davranışını tasarla: More içindeki bir alt ekran açıksa önce onu kapat, sonra trip'ten çık. Bottom sheet açıkken back sheet'i kapatmalı.
6. Scroll state'lerini section bazında koru. Plan'dan Journal'a gidip dönünce kullanıcı liste başına fırlamasın.
7. Lazy loading'i koru: ilk açılışta sadece Plan yüklenmeli; diğer domain'ler intent/prefetch ile getirilmeli. Offline durumda gereksiz chunk prefetch yapma.
8. Viewer rolündeki kullanıcı düzenleme aksiyonları görmemeli veya disabled açıklaması almalı; güvenlik sınırı yine Supabase RLS olmalı.
9. App-level nav ile trip-level nav'ın aynı anda ekranı sıkıştırmasını engelle. Trip workspace açıkken yalnızca trip navigation göster.

LIQUID GLASS TASARIM KURALLARI
- Yüzey oranı: yaklaşık %70 sakin koyu solid yüzey, %20 kontrollü Liquid Glass, %10 turuncu vurgu.
- Base: `#06061c`–`#071216` arası koyu sinematik gradient.
- Accent: mevcut `#f5a623`; accent-light `#f8c04a`. Accent yalnızca seçili nav, ana CTA ve kritik vurgu için.
- Trip header ve primary nav glass-standard; More sheet glass-elevated; yoğun liste satırları solid/dark.
- Glass yüzeylerde okunurluk için yeterli opaklık, 1 px beyaz düşük-opacity border, üst highlight ve kontrollü shadow kullan.
- Uzun listelerde her satıra `backdrop-filter` verme.
- Spacing sistemi: 4 tabanlı ölçek; ekran yatay padding 16 px, section arası 24 px, kart içi 12–16 px, küçük gap 8 px.
- Alt nav safe-area dahil yaklaşık 64–76 px; bütün hedefler minimum 44×44 px.
- Animasyon 160–260 ms; spring yalnızca sheet/nav indicator gibi anlamlı hareketlerde. Reduced motion'da transform tabanlı gösterişli hareketleri kapat.

TEKNİK VE ERİŞİLEBİLİRLİK KISITLARI
- Modal/sheet focus trap, Escape/back kapama, `aria-modal`, başlık ilişkisi ve focus restoration sağla.
- Nav gerçek button semantics ve `aria-current` kullanmalı.
- Ekran klavyesi açıldığında CTA görünür ve içerik kaydırılabilir olmalı.
- State'i gereksiz global store'a taşıma; mevcut React state/context yeterliyse yeni kütüphane ekleme.
- Hydration mismatch yaratacak doğrudan `window` erişimini effect veya güvenli helper içine al.
- Hata, loading ve empty state'leri birbirinden ayır.

KABUL KRİTERLERİ
- 320, 375, 390, 430 px viewport'larda yatay taşma yok.
- Plan, Explore, Bookings, More tek elle kullanılabilir.
- Budget/Packing/Journal kaybolmadan More içinden açılır.
- Back, deep-link, scroll restoration ve viewer rolü doğru çalışır.
- Test ve lint geçer.
- Son raporda ekran akışını, değiştirilen dosyaları ve manuel test senaryolarını yaz.
```

---

## Aşama 2 — Liquid Glass Mobil Tasarım Sistemi

```text
ROLÜN
Design Systems Lead, Mobile UI Engineer ve Accessibility Specialist olarak çalış. Tripper'ın mevcut Liquid Glass estetiğini kaldırmadan olgunlaştır; tutarlı, performanslı ve erişilebilir bir mobile-only component sistemi kur.

BAĞLAM
- Repo: C:\Users\emirc\Desktop\tripper
- Mevcut renkler `app/trip/[id]/mobile/domain-ui.tsx` ve `app/globals.css` içinde dağınık olabilir.
- Radix tabanlı dialog/dropdown gibi bazı ortak UI bileşenleri `components/ui` altında bulunur.
- Hedef Wanderlog kadar okunaklı ve kullanıcı dostu bilgi yoğunluğu; görsel kimlik ise Tripper'a özgü koyu sinematik Liquid Glass.
- Masaüstü varyant tasarlama. 320–430 px temel aralıktır.

ÖN HAZIRLIK
1. AGENTS.md, git status, globals.css, tailwind config, domain-ui.tsx ve `components/ui` klasörünü incele.
2. Repodaki mevcut değişiklikleri koru; tüm uygulamayı tek seferde formatlama.
3. Kullanılan renk, radius, shadow, blur, spacing ve typography değerlerini `rg` ile audit et.
4. Önce mevcut test/lint tabanını çalıştır.

TASARIM TOKEN'LARI
CSS custom properties veya mevcut Tailwind yapısına uyumlu merkezi token katmanı oluştur. En az şu semantik token'lar bulunsun:
- `--color-bg-base`, `--color-bg-deep`, `--color-surface-solid`, `--color-surface-raised`
- `--color-text-primary`, `--color-text-secondary`, `--color-text-muted`
- `--color-accent`, `--color-accent-light`, `--color-success`, `--color-warning`, `--color-danger`, `--color-info`, `--color-ai`
- `--glass-subtle-fill/border/blur/shadow`
- `--glass-standard-fill/border/blur/shadow`
- `--glass-elevated-fill/border/blur/shadow`
- radius 8/12/16/20/24/full
- spacing 4/8/12/16/20/24/32
- motion fast/normal/slow ve easing/spring karşılıkları.
Mevcut turuncu `#f5a623` ve açık ton `#f8c04a` korunsun. Base arka plan mevcut `#06061c`–`#071216` ailesinde kalsın.

OLUŞTURULACAK/GÜNCELLENECEK BİLEŞENLER
1. `GlassSurface`: `subtle | standard | elevated` varyantları; semantik container, className ve ref forwarding.
2. `MobilePageHeader`: safe-area, leading/trailing action, başlık ve opsiyonel subtitle.
3. `MobileBottomSheet`: erişilebilir dialog semantics, snap davranışı gerekiyorsa minimal ve dependency'siz; keyboard-aware.
4. `FloatingActionButton`: primary add CTA, 52–56 px, uygun aria-label.
5. `DayStrip`: yatay scroll, seçili gün, today state, keyboard erişimi.
6. `StatusChip` ve `FilterChip`: durum ve filtreyi renk dışında ikon/metinle de anlat.
7. `MobileListRow`: solid yüzeyli yoğun veri satırı; leading icon, body, metadata, trailing action.
8. `EmptyState`, `InlineError`, `SkeletonBlock`, `OfflineBanner`.
9. Mevcut Button/Input/Dialog/Toast bileşenlerini bu semantik token'lara yaklaştır; public API'yi gereksiz yere kırma.

UYGULAMA KURALLARI
- Glass yalnızca yüzen navigasyon, sheet, header, seçili preview ve harita kontrollerinde güçlü kullanılmalı.
- Itinerary, booking detail, budget, packing ve journal metni gibi yoğun içeriklerde opak solid yüzey tercih edilmeli.
- Uzun listelerde blur'lu child sayısını sınırlı tut.
- `backdrop-filter` desteklenmiyorsa daha opak fallback ver.
- Accent turuncuyu normal body icon ve border'lara yayma; ana aksiyonu ayırt etmek için sınırlı kullan.
- Typography: başlıklar kompakt, body minimum 14 px civarı, yardımcı metin 12–13 px; kritik içerikte 12 px altına düşme.
- Spacing: ekran 16 px; büyük section 24 px; kart 16 px; liste 12 px; compact gap 8 px.

PERFORMANS
- Her list item'da blur veya ağır box-shadow kullanma.
- Animasyonları transform/opacity ile sınırla; layout thrashing oluşturma.
- Harita hareket ederken cam yüzeylerde sürekli filter animasyonu yapma.
- `prefers-reduced-motion` ve mevcut ReducedMotionProvider ile uyumlu ol.
- Component'leri gereksiz client component yapma; interaktivite gerekmeyen yüzeyler saf/presentational kalabilir.

ERİŞİLEBİLİRLİK
- WCAG AA kontrast hedefle; harita/fotoğraf üstündeki metne scrim ekle.
- Focus-visible belirgin olmalı.
- Touch target minimum 44×44 px.
- Sheet açıldığında focus içeriye, kapandığında tetikleyiciye dönmeli.
- Renk tek durum göstergesi olamaz.
- Dynamic status değişimlerinde uygun `aria-live` kullan; gereksiz anons yapma.

MİGRASYON STRATEJİSİ
- Önce token ve primitive'leri ekle.
- Sonra yalnızca trip shell ve bir örnek domain ekranını migrate et.
- Her ekranı tek seferde yeniden yazma.
- Eski sabitlere geçici alias vererek kontrollü geçiş yap; kullanılmayan alias'ları bu aşama sonunda temizleyebiliyorsan temizle.

KABUL KRİTERLERİ
- Üç glass seviyesi görsel ve semantik olarak ayrıdır.
- Yoğun listelerde okunabilirlik artar, Liquid Glass kimliği korunur.
- 320–430 px, safe area, klavye, reduced motion ve backdrop-filter fallback test edilir.
- Mevcut fonksiyonlar bozulmaz; lint/test geçer.
- Son raporda token tablosu, migrate edilen bileşenler ve henüz migrate edilmemiş alanlar listelenir.
```

---

## Aşama 3 — Duruma Duyarlı Mobil Trip Ana Ekranı

```text
ROLÜN
Senior Mobile Product Engineer, UX Writer ve Frontend Architect olarak çalış. Tripper'da bir trip açıldığında kullanıcının yolculuk öncesi, yolculuk sırası veya yolculuk sonrası durumuna göre en önemli bilgiyi ve sıradaki aksiyonu gösteren mobil ana ekranı oluştur.

ÜRÜN BAĞLAMI
- Mobile-only, 320–430 px.
- Koyu sinematik Liquid Glass kimliği korunacak.
- Wanderlog'un “trip bilgilerini tek yerde, açık hiyerarşiyle gösterme” kolaylığı örnek alınacak; birebir UI kopyalanmayacak.
- Mevcut Trip, Stop, Expense, Packing ve Journal verileri kullanılmalı. Veri yoksa sahte üretim verisini production path'e koyma.
- Yeni ekran mevcut Plan deneyimini kırmadan trip workspace'in giriş/overview yüzeyi olarak uygulanmalı.

İNCELEME
AGENTS.md, README, types/index.ts, trip mobile page/server queries, TripMobileClient, TripSummaryHero, route helpers, BudgetDomain ve PrepDomain'i incele. Git status ile kullanıcı değişikliklerini koru. Gerekli query'leri server'da toplu ve güvenli yap; query error'larını boş state'e dönüştürme.

UYGULAMA
1. Trip lifecycle helper oluştur:
   - `upcoming`: start_date bugünden sonra;
   - `active`: bugün start/end aralığında;
   - `completed`: end_date geçmişte;
   - `undated`: tarih yok.
   Timezone belirsizliğini belgeleyip local date karşılaştırmasını güvenli yap.
2. `TripOverviewDomain` veya uygun isimde ekran oluştur.
3. Header: geri, trip adı, tarih aralığı, member avatar stack, share ve overflow. Viewer/editor durumlarını doğru yansıt.
4. Özet kartı: gün, stop, toplam rota mesafesi/süresi ve budget summary. Eksik veri için `0` ile yanıltma; “Not set”/“Add dates” gibi açık mesaj ver.
5. Upcoming durumda:
   - geri sayım;
   - plansız günler;
   - packing progress;
   - booking/document eksikleri yalnızca gerçek veriden;
   - invite friends ve download offline gibi hazır olmayan özellikleri capability flag veya dürüst coming-soon state ile yönet.
6. Active durumda:
   - Today bölümü;
   - bir sonraki plan öğesi/stop;
   - tahmini sürüş;
   - hava durumu varsa uyarı;
   - Navigate, Arrived, Add memory, View day aksiyonları. Henüz itinerary modeli yoksa stop schedule üzerinden güvenli fallback kullan.
7. Completed durumda:
   - recap CTA;
   - mesafe, süre, visited stops, journal/photo sayısı;
   - unsettled expense varsa uyarı;
   - paylaşmadan önce privacy preview.
8. Undated durumda tarih ekleme ve plan başlatma CTA'sı göster.
9. Loading için layout-stable skeleton; error için retry; gerçek boş durum için yönlendirici empty state oluştur.
10. Veriler birbirinden bağımsızsa tüm ekranı tek query hatasında çökertme; kritik ve opsiyonel bölümleri ayır.

UI/UX
- Base koyu gradient; header/day strip glass-standard; yoğun özet kartları çoğunlukla solid-raised.
- Ana CTA turuncu; aynı ekranda en fazla bir dominant primary CTA.
- Horizontal padding 16 px, section gap 24 px, card padding 16 px, radius 16–20 px.
- Sayısal özetler kolay taranabilir; açıklayıcı label olmadan yalnız sayı gösterme.
- Başparmak alanındaki CTA'lar 44 px üzeri.
- İçerik scroll olurken header'ın yalnız gerekli kısmı sticky olabilir; blur katmanlarını çoğaltma.
- Microcopy kısa, eylem odaklı ve gerçek durumu anlatmalı.

TEKNİK KISITLAR
- Tarih ve para formatını merkezi helper'lardan kullan.
- Mesafe birimi user settings'e uymalı.
- Mapbox route'u overview için tekrar tekrar fetch etme; mevcut route state veya cache'lenebilir summary kullan.
- Expense ve private photo verileri yalnız trip membership/RLS üzerinden okunmalı.
- Analytics ekleme; repo içinde sistem yoksa yeni tracking kütüphanesi kurma.
- Optimistic state yalnız gerçek mutation olduğunda kullan; başarısızlıkta rollback/toast.

KABUL KRİTERLERİ
- Upcoming, active, completed ve undated senaryoları test edilmiştir.
- Kullanıcı uygulamayı açınca sıradaki anlamlı aksiyonu görür.
- 320–430 px'te taşma yok, loading/error/empty ayrıdır.
- Viewer yetkisiz CTA görmez.
- Test/lint geçer; son raporda veri kaynakları ve fallback davranışları anlatılır.
```

---

## Aşama 4 — Birleşik Itinerary Veri Modeli ve Mobil Timeline

```text
ROLÜN
Database Architect, Supabase Security Engineer, Domain Modeler ve Senior Mobile React Engineer olarak çalış. Tripper'ı yalnızca stop listesi kullanan yapıdan, Wanderlog benzeri fakat daha güçlü birleşik günlük itinerary modeline güvenli ve geriye uyumlu şekilde geçir.

HEDEF
Tek timeline içinde Place, Activity, Stay, Flight, Transport, Restaurant, Reservation, Note ve Free Time öğeleri bulunacak. Mevcut `stops` silinmeyecek; rota üzerindeki coğrafi ana noktalar olarak kalacak. Yeni itinerary öğeleri trip, gün ve isteğe bağlı stop/place ile ilişkilenecek.

ZORUNLU ÖN İNCELEME
1. AGENTS.md, README migration talimatı, tüm Supabase migration'ları, types/index.ts, PlanRouteDomain, trip server page ve Realtime provider'ı oku.
2. Supabase'in güncel changelog ve ilgili RLS/Realtime dokümanlarını kontrol et; eski API varsayımı yapma.
3. `supabase --help` ve migration komutunu `--help` ile keşfet. Repo CLI içermiyorsa remote DB'ye izinsiz değişiklik uygulama.
4. Mevcut iki alternatif baseline (`000` ve `001`) gerçeğini koru. Var olan migration dosyasını değiştirmek yerine additive migration oluştur.
5. Git'teki kullanıcı değişikliklerini koru.

VERİ MODELİ
Additive migration ile en az `itinerary_items` tablosunu tasarla:
- id uuid PK
- trip_id uuid not null FK
- stop_id uuid nullable FK
- item_type kontrollü text/check veya enum stratejisi: place/activity/stay/flight/transport/restaurant/reservation/note/free_time
- title, notes
- start_at/end_at timestamptz nullable; all_day boolean
- local_date date; timezone text nullable
- order_index numeric/integer
- lat/lng/address nullable
- estimated_cost numeric ve currency
- status: planned/on_the_way/arrived/completed/skipped
- is_locked boolean default false
- created_by nullable FK, created_at, updated_at
Alanları körlemesine kabul etme; repo standartlarıyla doğrula. Type-specific ayrıntıları tek dev JSONB çöplüğüne koyma. Flight/stay/reservation gibi alanlar için ileriki aşamalara açık detail tabloları veya net sınırlandırılmış metadata stratejisi tasarla.

GÜVENLİK
- Public exposed table'da RLS zorunlu.
- SELECT: trip member.
- INSERT/UPDATE/DELETE: owner/editor.
- UPDATE policy hem USING hem WITH CHECK içermeli.
- `TO authenticated` tek başına yeterli değildir; `is_trip_member/is_trip_editor` gibi mevcut helper'ları kullan.
- Anon erişimini revoke et; authenticated için gerekli Data API grant'larını açık yaz.
- SECURITY DEFINER'ı permission hatası çözmek için kullanma.
- Index: trip_id, `(trip_id, local_date, order_index)`, gerekli FK/index'ler.
- Updated_at trigger varsa mevcut güvenli pattern'i kullan.

GERİYE UYUMLULUK
1. Mevcut stop'ları otomatik ve geri döndürülemez şekilde çoğaltma. Önce read adapter oluştur:
   - itinerary öğesi varsa onu kullan;
   - yoksa stop schedule'dan geçici timeline projection üret.
2. Yeni öğe ekleme akışında gerekiyorsa stop bağlantısını kur.
3. Eski trip'ler yeni ekranda açılmaya devam etsin.
4. Backfill gerekiyorsa idempotent, ölçülebilir ve rollback planlı ayrı migration/command tasarla; otomatik çalıştırma için kullanıcı onayı iste.

MOBİL UI
1. `ItineraryTimeline`, `ItineraryDaySection`, `ItineraryItemRow`, `TravelSegmentRow`, `UnscheduledDrawer`, `ItineraryItemSheet` bileşenlerini küçük dosyalara ayır.
2. Gün strip'i yatay; seçilen gün tek source of truth.
3. Timeline satırı: saat, type icon, başlık, konum, süre, booking/status göstergesi.
4. Item detay/düzenleme full-screen sheet; uzun formu mantıklı adımlara böl.
5. Sağ/sol swipe yalnız erişilebilir alternatif aksiyonlarla birlikte kullanılmalı. Swipe zorunlu etkileşim olamaz.
6. Reorder için dnd-kit kullanılabilir çünkü repo zaten içeriyor. Touch sensor activation distance/delay ile scroll çakışmasını önle. Keyboard reorder desteğini koru.
7. Günler arası taşıma menüsü ekle; optimistic update başarısızsa eski güne/sıraya dön.
8. Time conflict'i destructive olmayan inline warning ile göster.
9. Unscheduled saved items alanı oluştur; kullanıcı `Add to day` ile gün/saat seçebilsin.

LIQUID GLASS
- Header, day strip, add sheet ve selected preview glass.
- Timeline listesi solid/dark; her row blur kullanmaz.
- Accent yalnız aktif gün, primary add ve selected item.
- 16 px ekran, 12–16 px row, 24 px section spacing.

STATE/PERFORMANS
- Server initial data + client Realtime uyumlu olsun.
- Query key/refresh davranışını trip ve date ile sınırla.
- Her item mutation'ında tüm sayfayı router.refresh yapma; lokal optimistic state ve hedefli resync kullan.
- Realtime delete limitlerini dikkate al; mevcut delete signal yaklaşımını genişleteceksen tablo allowlist, RLS ve publication'ı güvenle güncelle.
- Büyük listelerde memoization/virtualization yalnız ölçülen ihtiyaç varsa; önce basit ve doğru yapı.

TESTLER
- RLS policy contract veya SQL assertion.
- Eski stop projection.
- Gün sıralaması ve stable order.
- Timezone/local date dönüşümü.
- Viewer mutation engeli.
- Optimistic rollback.
- Empty/loading/error.

KABUL KRİTERLERİ
- Eski trip veri kaybetmeden timeline'da görünür.
- Yeni item oluşturma, düzenleme, taşıma, sıralama, tamamlama çalışır.
- RLS ve grants güvenlidir.
- Mobile timeline 320–430 px'te kullanılabilir.
- Migration additive ve belgelenmiştir; remote'a izinsiz uygulanmamıştır.
- Test/lint ve mümkünse Supabase advisor temizdir.
```

---

## Aşama 5 — Mobile Map, Bottom Sheet ve Timeline Senkronizasyonu

```text
ROLÜN
Senior Mobile Maps Engineer, Interaction Designer ve Performance Engineer olarak çalış. Tripper'ın Mapbox haritasını mobile-only, itinerary ile çift yönlü senkronize, başparmakla kullanılabilir bir planlama yüzeyine dönüştür.

BAĞLAM
- Repo Next.js/React/TypeScript ve `react-map-gl`/Mapbox GL kullanıyor.
- Mevcut harita bileşenleri: components/map/mapbox/TripboxMap.tsx, components/explore/ExploreMapbox.tsx, lib/mapbox/*.
- PlanRouteDomain route path ve route legs state'i yönetiyor.
- Hedef Wanderlog'un harita + itinerary birlikteliği kadar anlaşılır bir akış; Tripper'a özgü Liquid Glass bottom sheet.
- Sadece mobil; desktop split-pane yapma.

ÖNCE
AGENTS.md, git status, Mapbox token/client/theme/directions/optimization dosyaları, mevcut map components ve itinerary/stop state'ini incele. Kullanıcı değişikliklerini koru. Token yokken veya API hata verirken mevcut davranışı belirle.

UYGULAMA
1. Full-screen `TripMapDomain` oluştur veya mevcut plan map modunu refactor et.
2. Map üst katmanları:
   - sol üst back/list toggle;
   - sağ üst layers;
   - recenter/current location (izin verilirse);
   - route summary chip;
   - alt Liquid Glass draggable sheet.
3. Bottom sheet snap durumları: collapsed (gün özeti), medium (yer listesi), expanded (itinerary). Yeni ağır gesture dependency ekleme; mevcut araçlarla güvenilir değilse iki/üç kontrollü yükseklik ve drag handle uygula.
4. Map ve timeline selection için tek `selectedItemId` kullan:
   - pin tap -> sheet kartı/list row seçilir;
   - row tap -> map flyTo/fit ve pin highlight;
   - view değişiminde seçim korunur;
   - item silinirse seçim temizlenir.
5. Pin numaraları gün sırasını gösterir. Start/end ve farklı item type'larını renk/ikonla ayır; renk tek anlam taşımasın.
6. Yalnız seçili günün item'larını güçlü göster; diğer günleri hide veya düşük vurgu seçenekleriyle yönet.
7. Route line ve leg bilgileri: distance, duration, unavailable state. Çok noktalı rotada API limitlerini açıkça ele al.
8. Clustering'i kalabalık explore/all-trip görünümünde kullan; günlük küçük listede gereksiz cluster yapma.
9. Layer sheet: Trip places, Restaurants, Gas, Charging, Hotels, Camping, Scenic. Veri kaynağı henüz yoksa UI'ı sahte pinlerle doldurma; feature flag veya disabled açıklaması kullan.
10. Current location yalnız kullanıcı eylemiyle izin istesin. Reddedilince tekrar tekrar prompt gösterme.
11. Map load/error/no token/offline state'lerini itinerary'yi engellemeyecek şekilde tasarla.

UI/UX
- Harita tam ekran; kontroller glass-standard, bottom sheet glass-elevated.
- Sheet içindeki liste solid rows.
- Map label'larının üstünü gereksiz büyük cam kartlarla kapatma.
- Kontroller safe-area ve 16 px kenar boşluğuna uysun.
- Touch hedefleri 44 px; drag handle görsel ve erişilebilir alternatif butonlara sahip olsun.
- Sheet motion 180–260 ms; reduced motion'da instant/minimal.

PERFORMANS
- Map instance'ını tab switch'te gereksiz destroy/recreate etme.
- Source/layer verilerini memoize et; her render'da büyük GeoJSON üretme.
- Camera event'leri ile programmatic flyTo'yu ayır; sonsuz state döngüsü oluşturma.
- Directions çağrılarını debounce/cancel et; stale response yeni rotayı ezmesin.
- Offscreen section'larda map'in kontrolsüz render maliyetini ölç.
- Marker sayısı yüksekse DOM marker yerine Mapbox source/layer tercih et.

GÜVENLİK/PRIVACY
- Mapbox public token dışında secret client'a koyma.
- Precise location'ı Supabase'e otomatik kaydetme.
- External URL ve direction linklerini güvenli encode et.
- Trip membership doğrulanmadan private trip coordinate'leri client'a gönderilmemeli.

TESTLER
- Pin↔row senkronizasyonu, gün filtresi ve selection cleanup.
- API abort/stale response.
- Token yok, offline ve Mapbox hata durumları.
- Programmatic flyTo ile kullanıcı camera hareketinin ayrılması.

KABUL KRİTERLERİ
- Token yok, offline veya Mapbox hata durumunda itinerary kullanılabilir kalır.
- Pin ve timeline seçimi iki yönde, döngü üretmeden senkronize olur.
- 320–430 px, safe area, orientation change ve reduced motion manuel olarak doğrulanır.
- Lint/test geçer; final raporda Mapbox çağrı sayısı ve performans kararları açıklanır.
```

---

## Aşama 6 — Explore'dan Itinerary'ye Tek Akışta Ekleme

```text
ROLÜN
Senior Search/Discovery Product Engineer, Mobile UX Designer ve Geospatial Frontend Engineer olarak çalış. Tripper Explore'u ayrı bir vitrin olmaktan çıkarıp kullanıcının bir yeri keşfedip birkaç dokunuşla belirli trip gününe eklediği Wanderlog benzeri akıcı bir planlama aracına dönüştür.

BAĞLAM
- Mevcut route: app/explore; bileşenler ExploreClient.tsx ve ExploreMapbox.tsx.
- Mapbox geocoding client mevcut.
- Trip oluşturma ve accessible country autocomplete örnekleri mevcut.
- Yeni birleşik itinerary modeli varsa kullan; yoksa adapter ile mevcut stops'a güvenli fallback sağla.
- Mobile-only ve Liquid Glass.

İNCELE
AGENTS.md, git status, Explore server/client, Mapbox geocoding, trip list query'leri, itinerary/stop mutation ve RLS policies. Explore içindeki hardcoded/mock kaynakları belirle; production'da sahte rating/opening hours sunma.

AKIŞ
1. Explore girişinde arama, recent/selected destination ve yatay category chips.
2. List/Map segmented toggle; seçim iki görünümde korunur.
3. Sonuç kartı: ad, kategori, konum, varsa doğrulanmış rating/fotoğraf/open-now; veri yoksa alanı gizle, uydurma değer gösterme.
4. Place detail full-screen sheet:
   - fotoğraf veya kontrollü placeholder;
   - ad, kategori, adres;
   - doğrulanmış rating/hours/site/phone;
   - estimated visit duration kullanıcı tarafından ayarlanabilir;
   - route detour yalnız hesaplanmışsa;
   - Save ve Add to trip.
5. `Add to trip` akışı:
   - kullanıcının erişebildiği trip'i seç;
   - gün veya Unscheduled seç;
   - saat/süre opsiyonel;
   - item type seçimini yer kategorisinden öner ama kullanıcı değiştirebilsin;
   - duplicate kontrolü: place id varsa onunla, yoksa normalized name + yakın coordinate ile uyarı;
   - optimistic success ve “View in itinerary” CTA.
6. Trip context içindeki Explore'da trip seçme adımını atla ve aktif trip'i kullan.
7. Plansız kaydetme ile belirli güne ekleme ayrı aksiyonlar olsun.
8. Rota üzerindeki öneri için başlangıçta güvenli temel hazırla: route corridor hesaplanmıyorsa “near destination” olarak doğru adlandır; sahte detour dakika gösterme.

VERİ MODELİ
- Harici place kimliğini, provider adını, lat/lng, normalized address ve kullanıcı notunu ayır.
- Provider response'un tamamını kontrolsüz JSONB olarak saklama.
- Bir `places` normalization tablosu eklemek gerekiyorsa additive migration, RLS/grants/index ve dedupe stratejisi tasarla.
- API provider kullanım koşullarına ve cache kısıtlarına uy; Mapbox verisini izin verilmeyen biçimde kalıcı kopyalama.
- Secret key client'a koyma.

UI/UX
- Search/header ve filtreler glass-standard; sonuç listesi solid cards; place detail glass-elevated sheet + solid content sections.
- Ekran padding 16, chip gap 8, section 24, card 12–16.
- Tek dominant CTA `Add to trip`; Save secondary.
- Loading skeleton, zero results önerisi, network error retry ve rate limit mesajı ayrı.
- Klavye açılınca search sonuçları ve close action erişilebilir kalmalı.
- Results list keyboard/screen reader semantics; icon-only button aria-label.

PERFORMANS
- Search 250–400 ms debounce ve AbortController.
- Eski response yeni sorguyu ezmesin.
- Minimum karakter ve gereksiz API çağrısı koruması.
- Görseller lazy-load; layout shift azalt.
- Map/list arasında sonuçları tekrar fetch etme.
- Result count yüksekse clustering/source-layer.

GÜVENLİK
- Trip listesi yalnız authenticated member erişimi.
- Add mutation owner/editor; viewer'a uygun açıklama.
- External URL protocol allowlist (`https/http/tel`) ile aç.
- Query inputlarını encode et; HTML inject etme.

KABUL KRİTERLERİ
- Kullanıcı Explore'da bir yer bulup aktif trip'in belirli gününe tek akışta ekler.
- Duplicate uyarısı ve Unscheduled seçeneği çalışır.
- Harita/list seçim state'i korunur.
- Hata/loading/empty doğru ayrılır.
- Mock veri production'da gerçek gibi gösterilmez.
- Test/lint geçer ve final raporda provider/veri kısıtları açıklanır.
```

---

## Aşama 7 — Gerçek Bookings ve Güvenli Attachment Merkezi

```text
ROLÜN
Travel Product Engineer, Supabase Database/Storage Security Architect ve Mobile Form UX Specialist olarak çalış. Tripper'daki booking partner dış linklerini gerçek rezervasyon kayıtlarından ayır ve Wanderlog benzeri, tüm rezervasyon/bilet/belgelerin tek yerde bulunduğu güvenli mobile-only Bookings merkezi oluştur.

HEDEF KATEGORİLER
Flight, Stay, Car Rental, Train, Ferry, Restaurant, Activity, Pass ve Other. İlk sürüm manuel kayıt + PDF/görsel yükleme + URL içermeli. Gmail OAuth veya otomatik mailbox scanning bu aşamaya dahil değildir. Metin yapıştırmadan parse özelliği ancak güvenli ve açıkça doğrulanabilir bir yardımcı olarak yapılabilir; AI zorunlu değildir.

ÖN İNCELEME
AGENTS.md, README migration sırası, git status, PlanRouteDomain içindeki BookingsTab/bookingUrl, journal Storage migration/policies, account deletion route ve itinerary modelini incele. Supabase güncel Storage/RLS docs ve changelog'u kontrol et. Remote database'e izinsiz migration uygulama.

VERİ MODELİ
Additive migration ile yapılandırılmış model tasarla:
1. `reservations`:
   - id, trip_id, itinerary_item_id nullable;
   - reservation_type;
   - provider, title, confirmation_number;
   - start_at/end_at, timezone;
   - address/lat/lng;
   - amount/currency/payment_status;
   - status confirmed/pending/cancelled/completed;
   - booking_url, notes;
   - created_by, created_at, updated_at.
2. `reservation_travelers` gerekiyorsa member/user bağlantısı ile; hassas passport numarası saklama.
3. `reservation_attachments`:
   - reservation_id, storage_path, original_name, mime_type, size_bytes, uploaded_by, created_at.
4. FK delete davranışını bilinçli seç; trip silinince cleanup, itinerary item silinince rezervasyonun kaybolmaması için SET NULL düşünülebilir.
5. Index trip/date/type ve FK'lerde.

RLS/STORAGE
- Bütün public tablolar RLS.
- Trip members SELECT; owner/editor mutate.
- UPDATE USING + WITH CHECK.
- Anon revoke, authenticated gerekli grant.
- Bucket private olmalı; public URL üretme. Kısa ömürlü signed URL veya authenticated download kullan.
- Storage object path: `{trip_id}/reservations/{reservation_id}/{uuid.ext}`; kullanıcı filename'ını path olarak kullanma.
- MIME allowlist PDF/JPEG/PNG/WebP ve makul size limit; yalnız client `accept` yeterli değildir, server/storage policy ve runtime validation yap.
- Upsert kullanılıyorsa INSERT+SELECT+UPDATE policy gereksinimini karşıla; mümkünse immutable uuid path ile replace ihtiyacını azalt.
- Account deletion ve trip deletion attachment cleanup davranışını güncelle.
- Service role asla client'ta bulunmaz.

MOBİL UI
1. `BookingsDomain`: upcoming/previous, type filter, search.
2. Booking card: type, title, tarih/saat, confirmation, payment/status; confirmation numarasını gereksiz ana ekranda tamamen açık göstermek privacy açısından değerlendir.
3. Detail sheet: View document, directions, call, open provider, add/link to itinerary, share within trip.
4. Add/Edit flow'u full-screen sheet ve bölümlere ayır:
   - type/basic info;
   - date/location;
   - payment/confirmation;
   - attachments/notes;
   - itinerary link.
5. “Find a stay” dış partner araması ayrı secondary akış olarak kalmalı; kayıtlı Bookings ile karışmamalı.
6. Upload progress, cancel/retry, offline queued/unsupported state, cleanup failure ve partial success göster.
7. Booking itinerary'ye bağlanınca doğru gün/saatte item oluştur veya mevcut item'a linkle; duplicate üretme.

LIQUID GLASS/UI
- Header/filter glass-standard; cards çoğunlukla solid-raised; add/detail sheet glass-elevated çerçeve + solid form sections.
- Accent primary save/add; status renkleri semantik token.
- 16 px ekran, 12–16 card, 24 section; touch target 44.
- Belge önizlemesi mobilde güvenli; bilinmeyen dosyayı inline render etme, download/open seçeneği sun.

HATA/PERFORMANS
- Reservation kaydı başarılı, attachment başarısızsa kullanıcıya partial success ve retry sun; kaydı sessizce silme.
- Upload öncesi validation; progress state; object URL cleanup.
- Signed URL'leri state/cache'de sınırlı süre tut, loglama.
- Liste query'sinde attachment binary veya gereksiz metadata çekme.
- External URL allowlist/encoding.

TESTLER
- RLS member/editor/viewer.
- Private attachment access.
- File validation/path generation.
- Reservation↔itinerary linking ve duplicate önleme.
- Partial upload failure/retry.
- Account/trip deletion cleanup contract.

KABUL KRİTERLERİ
- Kullanıcı rezervasyon ekler, düzenler, belge yükler ve itinerary'ye bağlar.
- Üye olmayan kullanıcı belgeye erişemez.
- Bookings ve Find a stay birbirinden anlaşılır biçimde ayrıdır.
- Migration additive, grants/RLS/index/storage policy eksiksizdir.
- Test/lint/advisor mümkün olduğunca temiz; final raporda deploy sırası ve manuel Storage doğrulaması yazılır.
```

---

## Aşama 8 — Gün Bazlı Rota ve Program Optimizasyonu

```text
ROLÜN
Route Optimization Engineer, Applied Algorithms Engineer, Mobile Decision UX Designer ve Mapbox Integration Specialist olarak çalış. Mevcut stop sıralama optimizasyonunu, sabit saatleri ve kullanıcı tercihlerini koruyan güvenli günlük itinerary optimizasyonuna yükselt.

ÜRÜN PRENSİBİ
Wanderlog'daki “Optimize route” kolaylığını örnek al; ancak Tripper'da hiçbir değişiklik kullanıcı onayı olmadan uygulanmamalı. Her öneri önce Current vs Optimized önizlemesinde süre, mesafe ve taşınan öğelerle gösterilmeli. Kilitli rezervasyonlar/saatler hareket etmemeli. Kullanıcı Apply veya Cancel seçmeli ve uygulanan işlem geri alınabilmeli.

BAĞLAM
- Repo: C:\Users\emirc\Desktop\tripper
- Mevcut `lib/mapbox/optimize.ts`, `lib/mapbox/directions.ts` ve PlanRouteDomain içinde preview/apply akışı var.
- Mapbox Optimization API v1 mevcut implementasyonda en fazla 12 waypoint sınırı kullanıyor olabilir.
- Yeni itinerary modeli varsa item start/end, local date, is_locked ve status alanlarını kullan.
- Mobile-only Liquid Glass.

ÖN İNCELEME
AGENTS.md, git status, Mapbox client/optimize/directions, itinerary types/migrations, stop reorder RPC/migration ve mevcut optimize preview testlerini incele. Mapbox'ın güncel resmi Optimization/Directions API dokümanında limit, profile ve waypoint davranışını doğrula. Teknik sorularda yalnız resmi dokümana güven. Kullanıcı değişikliklerini koru.

OPTİMİZASYON SEVİYELERİ
1. Seviye 1 — deterministik rota:
   - seçili gün;
   - başlangıç ve bitiş;
   - coğrafi item'lar;
   - mevcut sıra;
   - distance/duration;
   - locked item'lar ve sabit zaman aralıkları.
2. Seviye 2 — schedule-aware:
   - item duration;
   - opening hours yalnız doğrulanmış veri varsa;
   - check-in/out ve rezervasyon saatleri;
   - meal/break constraints;
   - maksimum günlük sürüş.
3. Gelecek için extension points:
   - weather, live traffic, golden hour, sunset, scenic preference, EV charging.
   Bunları veri kaynağı yokken uydurma skorlarla production'a ekleme.

UYGULAMA
1. UI component'inden bağımsız saf optimizer input/output type'ları oluştur.
2. Preflight validation:
   - en az gerekli coordinate sayısı;
   - API waypoint limiti;
   - duplicate/missing coordinate;
   - locked window çakışması;
   - selected day doğruluğu.
3. API çağrısı ile schedule feasibility hesaplamasını ayır. Mapbox coğrafi sıra önerir; uygulama sabit saat ve süre kurallarını kontrol eder.
4. Sonuç feasible değilse otomatik uygulama önerme; hangi constraint'in bozduğunu kullanıcıya açıkla.
5. `OptimizationPreviewSheet`:
   - Current ve Optimized toplam süre/mesafe;
   - saved time/distance yalnız pozitif ve gerçekten hesaplanmışsa;
   - taşınan item listesi;
   - kilitli item açıklaması;
   - Apply, Cancel.
6. Apply işlemini mümkünse atomik RPC ile yap. RPC owner/editor membership'i server-side doğrulasın, input item'ların aynı trip/güne ait olduğunu kontrol etsin, tüm order değerlerini tek transaction'da güncellesin.
7. SECURITY DEFINER gerekiyorsa yalnız gerekçeli, auth.uid doğrulamalı, sabit search_path, PUBLIC execute revoke ve hedefli authenticated grant ile; mümkünse security invoker/RLS yaklaşımını tercih et.
8. Undo için önceki order snapshot'ını session içinde kısa süre sakla veya audit/operation modeli tasarla; sessiz kalıcı geçmiş büyütme.
9. Concurrent edit durumunda optimistic concurrency kullan: updated_at/version değiştiyse apply'i reddet ve refresh/preview tekrar iste.
10. AbortController ile iptal, stale response koruması ve rate-limit/error feedback ekle.

UI/UX
- Optimize CTA seçili günün planında görünür; sürekli parlayan AI butonu yapma.
- Preview glass-elevated; karşılaştırma içerikleri solid sections.
- Accent turuncu Apply için; destructive/constraint uyarıları semantik warning/danger.
- “33 miles saved” gibi sayıları label ve baz ölçümle göster.
- Loading sırasında mevcut plan kullanılabilir kalmalı.
- Reduced motion; sheet ve reorder animasyonları kısa.

TEKNİK KISITLAR
- API token/URL güvenli encode.
- Floating-point distance/süre karşılaştırmasında tolerans.
- Fixed start/end davranışını test et.
- Tüm trip'i tek günlük optimize çağrısına yanlışlıkla gönderme.
- Hata durumunda mevcut order'a dokunma.
- Viewer optimize edemez; RLS/RPC bunu da enforce eder.

TESTLER
- 3 item basic optimize.
- Fixed first/last.
- Locked item/time window.
- API limit aşımı.
- Missing coordinate.
- Stale response ve concurrent version conflict.
- Apply atomicity/rollback.
- Viewer denial.

KABUL KRİTERLERİ
- Kullanıcı seçili günü optimize eder, farkı görür, onaylar veya iptal eder.
- Locked/sabit rezervasyonlar korunur.
- Apply atomik ve yetkili; hata order'ı bozmaz.
- Undo veya açık recovery vardır.
- Test/lint geçer; final raporda algoritma sınırları ve kullanılmayan gelecek sinyalleri belirtilir.
```

---

## Aşama 9 — Gelişmiş Mobil Budget, Split ve Settlement

```text
ROLÜN
Fintech-minded Product Engineer, Database Architect ve Mobile Data Visualization Designer olarak çalış. Mevcut Tripper budget/equal split özelliğini Wanderlog kadar kolay fakat özel split, settlement, receipt ve çoklu para birimine hazır güvenilir bir mobil masraf merkezine dönüştür.

BAĞLAM
- Mevcut dosyalar: BudgetDomain.tsx, budget-settlement.ts, types/index.ts, expenses migration'ları ve testleri.
- Equal split hesaplaması ve departed/missing payer davranışı için mevcut testler var; bunları bozma.
- Trip currency USD/EUR/GBP/TRY seçeneklerine sahip.
- Mobile-only Liquid Glass; finansal doğruluk görsel gösterişten öncelikli.

ÖN İNCELEME
AGENTS.md, git status, budget component/helper/tests, expense RLS, members model ve account deletion attribution davranışını incele. Para hesaplarını float ile yapıp yapmadığını tespit et. Kullanıcı değişikliklerini koru. Yeni exchange-rate entegrasyonu eklemeden önce veri kaynağı ve güncellik ihtiyacını netleştir.

VERİ MODELİ
1. Mevcut expenses tablosunu geriye uyumlu genişlet veya additive tablolar oluştur:
   - expense currency;
   - original_amount ve gerekiyorsa converted_amount/rate_snapshot/rate_date;
   - expense_splits: expense_id, participant/member/user reference, share_type, share_value veya kesin amount_minor;
   - settlements/payments: from_member, to_member, amount/currency, status, settled_at, created_by;
   - receipt attachment metadata.
2. Finansal hesapları minor units veya güvenli decimal yaklaşımıyla yap. JS binary float ile settlement üretme.
3. Split invariant: tüm share amount'ları expense total ile tam olarak reconcile olmalı; remainder deterministik dağıtılmalı.
4. Departed member ve silinmiş kullanıcı attribution'ını koruyan mevcut yaklaşımı bozma.
5. RLS: trip members read; editor/owner expense create/manage; settlement tarafında ürün kararıyla ilgili katılımcı/owner yetkisi. UPDATE USING + WITH CHECK.
6. Receipt private Storage path/policy; reservation attachments güvenli altyapısı varsa reuse et, ayrı public bucket açma.

MOBİL UI
1. Budget header:
   - Budget, Spent, Remaining;
   - progress bar;
   - over-budget warning;
   - currency açıkça gösterilir.
2. Category breakdown: Stay, Food, Fuel, Transport, Activities, Shopping, Other. Küçük ekranda erişilebilir horizontal bars/list tercih et; karmaşık pie chart zorunlu değil.
3. Expense list: tarih grubu, category icon, description, payer, amount; filtre/sort.
4. Add Expense full-screen flow:
   - amount/currency;
   - category/description/date;
   - payer;
   - participants;
   - equal/exact/percentage split;
   - linked itinerary item;
   - receipt/note;
   - review/save.
5. Split editor her değişimde remaining amount/percentage gösterir, toplam tutmuyorsa save disabled ve açıklayıcı hata.
6. Settlement ekranı net transfer önerileri verir: “A pays B”. Ödendi işaretleme confirmation ve undo/reopen sağlar.
7. Currency conversion yoksa farklı para birimlerini sahte tek toplamda birleştirme; ayrı göster. Kur snapshot özelliği eklenirse kaynak ve tarih görünür olmalı.

LIQUID GLASS/UI
- Header/summary glass-standard veya elevated; finans listeleri solid.
- Primary add/save accent; negatif remaining danger, olumlu settled success.
- Renk tek sinyal değildir; ikon/metin kullan.
- 16 px screen, 24 section, 12 row; 44 px touch.
- Amount input numeric keyboard, locale-aware display fakat parse/storage deterministik.

TEKNİK/PERFORMANS
- Settlement pure functions; UI'dan bağımsız ve kapsamlı testli.
- Query aggregation güvenli; büyük veri için server/database aggregate düşünülebilir, RLS'yi bypass eden view oluşturma. View kullanırsan security_invoker ve grants.
- Optimistic create/delete rollback.
- Partial receipt upload retry.
- Idempotent settlement mutation; çift tap çift ödeme üretmemeli.
- Sensitive receipt/log data console'a yazma.

TESTLER
- Equal/exact/percentage split.
- 1–4+ member ve remainder cents.
- Missing/departed member.
- Multi-currency separate totals/rate snapshot.
- Settlement idempotency/reopen.
- RLS ve viewer denial.
- Receipt validation/access.

KABUL KRİTERLERİ
- Kullanıcı eşit veya özel split ile masraf ekler.
- Borç transferleri kuruş hassasiyetinde reconcile olur.
- Ödeme kapatma/geri açma çalışır.
- Farklı currency yanıltıcı toplanmaz.
- Private receipt güvenlidir.
- Eski expenses görünür ve mevcut testler geçer.
```

---

## Aşama 10 — Trip Readiness, Packing ve Ortak Hazırlık

```text
ROLÜN
Mobile Productivity UX Engineer, Collaboration Product Designer ve Supabase Engineer olarak çalış. Mevcut packing list'i, kimin ne getireceğinin ve yolculuk öncesi eksiklerin açıkça görüldüğü Trip Readiness merkezine dönüştür.

BAĞLAM
- Mevcut `PrepDomain.tsx`, `packing_items` migration'ı, vibe-aware template'ler ve Realtime sync var.
- Yeni More navigasyonunda Packing/Prep buradan açılır.
- Mobile-only Liquid Glass.
- Wanderlog'un checklist kolaylığını örnek al, Tripper'a kişiye atama, readiness ve road-trip hazırlığı ekle.

ÖN İNCELEME
AGENTS.md, git status, PrepDomain, packing schema/RLS/Realtime, trip members/capabilities ve accessibility contract testlerini incele. Mevcut template seed davranışının duplicate üretip üretmediğini kontrol et. Kullanıcı değişikliklerini koru.

VERİ MODELİ
1. `packing_items` additive alanları değerlendir:
   - assigned_to nullable user/member;
   - quantity positive integer;
   - priority low/normal/high;
   - due_date nullable;
   - scope everyone/personal/shared;
   - completed_by/completed_at;
   - notes;
   - order_index.
2. Sadece packing değil hazırlık task'ları gerekiyorsa `trip_tasks` tablosu oluştur: category packing/reservation/document/payment/vehicle/custom. Packing'i zorla tek generic JSON modeline çevirmeden migration stratejisi seç.
3. RLS trip member read, editor/owner mutate. Kişisel/private checklist istenmiyorsa tüm item'lar trip paylaşımıdır; private davranış varsayma.
4. Realtime publication/delete signal'a yeni tablo eklenirse allowlist, RLS ve delete filtre limitini güvenle ele al.
5. Template import idempotent olmalı; aynı label/category normalize edilerek duplicate uyarısı verilmeli ama kullanıcının bilinçli duplicate'ini engelleme.

MOBİL UI
1. Prep overview:
   - readiness yüzdesi;
   - Packing, Reservations, Documents, Payments, Vehicle, Custom sections;
   - gerçek veri yoksa tamamlandı gibi gösterme.
2. Packing domain:
   - category accordion/list;
   - completed/total;
   - assignee avatar/name;
   - quantity/priority;
   - hızlı check;
   - filter: All, Mine, Unassigned, Remaining.
3. Add item inline hızlı akış + detay sheet. Klavye açıldığında input/CTA görünür.
4. Assign member sheet; departed member davranışı açık.
5. Reorder category içinde dnd-kit; scroll çakışması ve keyboard alternative.
6. Template picker: trip vibe'a göre öneri, preview, seçili import; kullanıcıya zorunlu seed yapma.
7. “Who brings what” summary.
8. Viewer read-only; owner/editor aksiyonları capability'ye göre.

UI/UX
- Overview/readiness glass-standard; checklist container solid.
- Checkbox 44 px touch row içinde; checked state renk + icon + strike-through ile.
- Accent primary add/import; overdue warning/danger.
- 16 px screen, 24 section, 12 row, 8 compact gaps.
- Tamamlanan item'ları aşırı soluk yapıp okunamaz hâle getirme.
- Haptic API kullanacaksan progressive enhancement ve izin/destek kontrolü; zorunlu değil.

STATE/HATA
- Check mutation optimistic, failure rollback + toast.
- Realtime remote update kullanıcı edit formunu sessizce ezmesin; active editing conflict göstergesi veya submit version check.
- Offline aşamasına hazır mutation boundary tasarla, fakat bu aşamada yarım offline kuyruk üretme.
- Loading/error/empty ayrımı.
- Readiness hesaplamasını saf helper ve testle; 0 item için %100 gösterme.

TESTLER
- Template idempotency.
- Readiness empty/partial/complete.
- Assign/departed member.
- Viewer denial.
- Realtime reconciliation/optimistic rollback.
- Minimum touch target/accessibility names.

KABUL KRİTERLERİ
- Kullanıcı item ekler, kişiye atar, işaretler, filtreler ve reorder eder.
- Vibe template kontrollü import edilir.
- Readiness gerçek veriden doğru hesaplanır.
- Canlı collaboration ve yetkiler bozulmaz.
- Test/lint geçer; migration ve Realtime deploy notları yazılır.
```

---

## Aşama 11 — Güvenli Gerçek Offline Trip Kullanımı

```text
ROLÜN
Offline-First Web Architect, PWA Engineer, Data Security Engineer ve Mobile Reliability Specialist olarak çalış. Tripper'ın yalnız statik asset cache'leyen service worker'ını, kullanıcı tarafından seçilen trip verisine offline erişim ve kontrollü mutation queue sağlayan güvenli bir sisteme yükselt.

KRİTİK BAĞLAM
- Mevcut `public/sw.js` özellikle authenticated SSR sayfalarını cache'lemeyerek başka kullanıcı verisinin sızmasını önlüyor. Bu güvenlik ilkesini bozma.
- `RegisterSW.tsx` cache temizleme desteğine sahip.
- Journal upload içinde offline/queued davranış parçaları olabilir.
- Supabase Realtime online sync sağlıyor.
- Offline harita tile indirme Mapbox lisans/SDK yeteneklerine bağlıdır; resmi dokümana bakmadan vaat etme.

ÖN ARAŞTIRMA
AGENTS.md, git status, service worker, PWA registration, auth logout/account deletion cache cleanup, Supabase client ve tüm domain mutation'larını incele. IndexedDB için browser-native çözüm yeterliyse yeni dependency ekleme. Mapbox ve Supabase güncel resmi offline/caching dokümanlarını kontrol et.

GÜVENLİ MİMARİ
1. Authenticated HTML/API response'larını generic Cache Storage'a koyma.
2. Kullanıcının açıkça `Download trip` dediği trip için IndexedDB'de versioned, user-scoped snapshot sakla.
3. Her kayıt anahtarında user_id + trip_id namespace; uygulama açarken aktif auth user ile eşleşmeyen snapshot'ı gösterme.
4. Logout, account deletion ve auth user değişiminde private IndexedDB/Cache verisini temizle.
5. Snapshot veri seti:
   - trip/member summary;
   - itinerary/stops;
   - reservations metadata;
   - packing/tasks;
   - expenses gerekli güvenli özeti;
   - journal text;
   - route geometry;
   - izinli ve önceden açılmış küçük media cache manifesti.
6. Confirmation/belge gibi hassas attachment'ları varsayılan offline indirme; ayrı açık seçim, cihaz uyarısı ve encryption gerçekçi değilse bunu dürüstçe belirt.
7. Schema version ve migration fonksiyonları; bozuk snapshot'ta güvenli discard/redownload.

MUTATION QUEUE
1. Offline izinli aksiyonları açık allowlist yap: packing toggle/add, journal note, expense create, itinerary status/note gibi.
2. Queue item: idempotency_key, user_id, trip_id, entity, action, sanitized payload, base_version/updated_at, created_at, retry_count, status.
3. Her mutation'a deterministic client id/UUID ver; reconnect double-submit duplicate üretmesin.
4. Bağlantı gelince FIFO olmak zorunda olmayan dependency-aware flush; parent create önce child upload.
5. Exponential backoff, max retry ve kullanıcıya manual retry/discard.
6. 401/403'te retry loop yapma; auth refresh/permission lost olarak durdur.
7. 409/version conflict'te critical fields için compare/review; basit completed toggle için tanımlı merge policy.
8. Server ack sonrası queue ve snapshot atomik güncellensin.

UI
- Trip More > Offline Access ekranı: Download, last updated, size estimate, included data, Remove download.
- Global offline banner: Offline · N changes waiting.
- Sync center sheet: pending/failed/conflict ve Retry.
- Domain satırında queued/error küçük status; kullanıcı değişikliğin cihazda olduğunu anlar.
- Liquid Glass banner/sheet; içerik solid.
- “Offline ready” yalnız snapshot başarıyla doğrulandıysa.

SERVICE WORKER
- Public immutable asset stratejisini koru.
- Network request interception'da private SSR cache sızıntısı yaratma.
- Versiyonlu cache adı ve kontrollü cleanup.
- Background Sync API'yi tek güven kaynağı yapma; Safari desteği sınırlı olabilir. App foreground reconnect de flush etmeli.
- SW update lifecycle ve eski cache cleanup testleri.

PERFORMANS/QUOTA
- IndexedDB transaction'larını küçük ve atomik tut.
- Storage estimate API varsa progressive kullan.
- Büyük image/blob'ları sınırlı ve kullanıcı kontrollü.
- QuotaExceeded için partial rollback ve açıklayıcı hata.

TESTLER
- User A snapshot User B'ye görünmez.
- Logout/account delete cleanup.
- Offline open.
- Queue idempotency/double reconnect.
- 401/403 stop, transient retry, conflict.
- Schema version upgrade/corrupt data.
- SW authenticated page non-cache contract.

KABUL KRİTERLERİ
- İndirilmiş trip uçak modunda açılır.
- İzinli değişiklikler queued görünür ve reconnect'te bir kez uygulanır.
- Kullanıcı değişiminde private veri sızmaz.
- Map offline kapsamı desteklenmiyorsa açıkça sınırlandırılmıştır.
- Test/lint geçer; threat model ve manuel offline test matrisi final rapora eklenir.
```

---

## Aşama 12 — Presence, Yorumlar ve Rol Yönetimiyle Collaboration

```text
ROLÜN
Realtime Collaboration Architect, Supabase Security Engineer ve Mobile Collaboration UX Designer olarak çalış. Mevcut canlı tablo senkronizasyonunu kullanıcı tarafından anlaşılır hâle getir; presence, hafif edit indicators, yorumlar, activity feed ve güvenli owner/editor/viewer yönetimi ekle.

BAĞLAM
- Mevcut `trip_members` authoritative model, owner/editor/viewer rolleri ve `lib/supabase/trip-realtime.tsx` var.
- Stops, packing, expenses, journal için Postgres Changes ve delete signal uygulanmış.
- Supabase güncel dokümanı yüksek ölçek için Broadcast'i öneriyor; küçük ölçekte mevcut yapı çalışabilir. Blind migration yapma, ölçek/karmaşıklık kararını belgeleyerek seç.
- Mobile-only; canlı desktop cursor yapma.

ÖN İNCELEME
AGENTS.md, git status, migration 012/016, realtime provider, join route, capabilities ve üye profile query'lerini incele. Supabase changelog, Presence, Broadcast authorization ve Postgres Changes limitlerini resmi docs'tan doğrula.

FEATURE'LAR
1. Presence:
   - trip-specific private channel;
   - online user id, display name/avatar reference, current section, optional editing entity id;
   - heartbeat/leave cleanup;
   - minimum kişisel veri, precise location yok.
2. UI:
   - header avatar stack;
   - “Emma is editing this activity” küçük indicator;
   - stale presence timeout;
   - screen reader için spam yaratmayan status.
3. Comments:
   - `trip_comments` veya entity comments modeli: trip_id, entity_type allowlist, entity_id, body, created_by, timestamps, optional parent_id;
   - mention gerekiyorsa structured mention relation; raw HTML saklama.
4. Activity feed:
   - her minor keystroke'u loglama;
   - create/move/complete/reservation/member gibi anlamlı olaylar;
   - retention/pagination.
5. Member management:
   - owner rol değiştirir, çıkarır, invite code/link yeniler;
   - owner kendini son owner iken düşüremez/çıkaramaz;
   - viewer read-only;
   - editor member yönetemez.

SUPABASE GÜVENLİK
- Presence/Broadcast channel topic yetkisi trip membership ile RLS authorization.
- Client'tan gelen presence payload authorization kaynağı değildir.
- Comments public table RLS: members select, editor/owner create; edit/delete policy ürün kararına göre author veya owner ve trip membership.
- Entity id'nin aynı trip'e ait olduğunu DB constraint/trigger/RPC ile doğrula; cross-trip comment injection olmasın.
- Role mutation için atomik RPC; caller owner, target same trip, last owner invariant.
- SECURITY DEFINER kullanılırsa auth.uid check, fixed search_path, PUBLIC revoke, minimum grant.
- Invite code rotation eski kodu atomik invalidate eder.
- User metadata authorization için kullanılmaz.

REALTIME STRATEJİSİ
- Mevcut Postgres Changes'i küçük ölçek için sürdürmek mümkünse gereksiz rewrite yapma.
- Comments/feed için filtered subscription.
- Delete filter limitini doğru ele al.
- 3.000+ concurrent subscriber gibi ölçek hedefi yoksa premature Broadcast migration yapma; fakat abstraction boundary bırak.
- Reconnect/resubscribe duplicate listener üretmesin.

MOBİL UI
- Members full-screen sheet: online state, role, owner actions.
- Entity detail içinde Comments tab/section; composer keyboard-aware.
- Activity feed More içinde.
- Liquid Glass header/sheet, solid comment/feed rows.
- Optimistic comment + failed retry; mention suggestions erişilebilir.
- Presence göstergeleri küçük, rahatsız etmeyen; renk + metin/icon.

HATA/CONFLICT
- Permission revoked olduğunda client state temizlenip güvenli route'a yönlendirilmeli.
- Role değişikliği UI capability'lerini refresh etmeli; stale JWT/app metadata'ya dayanma.
- Comment optimistic failure rollback/retry.
- Offline comment queue yalnız offline altyapı tamamlandıysa entegre et; aksi hâlde dürüst offline disabled state.

TESTLER
- Owner/editor/viewer matrix.
- Last owner protection.
- Cross-trip entity comment denial.
- Invite rotation.
- Presence join/leave/stale cleanup.
- Duplicate subscription prevention.
- Permission revoked while open.

KABUL KRİTERLERİ
- Üyeler kimin online/nerede çalıştığını görür.
- Yorum ve rol yönetimi güvenlidir.
- Viewer mutation yapamaz.
- Presence authorization client payload'a güvenmez.
- Realtime reconnect istikrarlı; test/lint/advisor mümkün olduğunca temiz.
```

---

## Aşama 13 — Travel Mode, Timeline–Journal Birleşimi ve Recap

```text
ROLÜN
Travel Experience Product Designer, Mobile Camera/Media Engineer, Privacy Engineer ve Senior React Developer olarak çalış. Tripper'ı planlama uygulamasından yolculuk sırasında kullanılan ve sonrasında sinematik bir anıya dönüşen ürüne taşı. Itinerary olaylarıyla journal'ı birleştir, fakat kullanıcı kontrolünü ve privacy'yi koru.

BAĞLAM
- Mevcut JournalDomain, private `trip-photos` bucket, TripSummaryHero, RouteReplayMap ve recap image helper var.
- Itinerary status alanları planned/on_the_way/arrived/completed/skipped olarak tasarlanmış olabilir.
- Mobile-only Liquid Glass; yolculuk sırasında tek elle ve hızlı kullanım kritik.
- Wanderlog'un planı saklama gücünü aşacak farklılaştırıcı aşamadır.

ÖN İNCELEME
AGENTS.md, git status, JournalDomain/photo upload, privacy migration, recap components, itinerary model, offline queue ve account deletion cleanup'ı incele. Kullanıcı değişikliklerini koru. Media izinleri ve browser support için progressive enhancement kullan.

TRAVEL MODE
1. Active trip'te Today/Travel Mode girişi.
2. Sıradaki item kartı: title, ETA, weather/booking uyarısı yalnız gerçek veriden.
3. Hızlı aksiyonlar:
   - Start/On the way;
   - Arrived;
   - Complete/Skip;
   - Add photo;
   - Add note;
   - Record expense;
   - Add unplanned stop.
4. Status transition kuralları saf state machine/helper ile; invalid geçiş ve double tap engeli.
5. Navigate dış harita uygulamasına güvenli link; kullanıcı seçimi/encoding.
6. Otomatik precise location tracking yapma. Kullanıcı açıkça eklerse konumu journal event'e bağla.

TIMELINE–JOURNAL MODELİ
1. Planlanan itinerary item ile kullanıcı journal entry'sini aynı tabloya zorla birleştirme. Ayrı kaynakları birleşik presentation timeline'da göster.
2. Gerekirse `trip_events`/`journal_events` additive model:
   - event_type arrived/completed/photo/note/unplanned/expense-link;
   - trip_id, itinerary_item_id nullable, occurred_at, created_by, visibility, metadata sınırlandırılmış;
   - server/user timestamp ayrımı.
3. Auto event üretimi idempotent olsun; status retry duplicate event üretmesin.
4. Kullanıcı event'i gizleyebilsin/düzenleyebilsin; plan geçmişi ile özel journal notunu ayır.
5. Journal photos private; signed URL, file validation, cleanup ve offline retry mevcut güvenliği korur.

MOBİL UI
- Unified day story timeline: time rail + itinerary event + journal note/photo.
- Quick composer bottom sheet; uzun form yok.
- Camera/file input progressive; upload progress/retry.
- Unplanned stop ekleme 2–3 adımda.
- Glass header/quick action dock; story list solid/dark; photo overlay scrim.
- Accent yalnız next action/add memory.
- 44 px touch, safe area, outdoor/high glare için yüksek kontrast.

TRIP SONRASI RECAP
1. Planlanan ve gerçekten tamamlanan item farkı.
2. Stats: distance/duration yalnız route verisinden; visited stops/status; photo/journal/expense counts.
3. Route replay reduced-motion alternatifi.
4. Recap preview: kullanıcı hangi fotoğraf/not/stat'ın paylaşılacağını seçer.
5. Confirmation number, private note, member debt, precise private detail varsayılan paylaşım içeriğine girmez.
6. Canvas/image share helper failure fallback; Web Share yoksa download.

OFFLINE/CONCURRENCY
- Offline altyapı varsa event/note/photo queue ile entegre ol.
- Photo binary queue quota ve retry.
- Aynı status iki cihazdan değişirse idempotency/version handling.
- UI queued/synced/failed state'i gösterir.

TESTLER
- Status state machine.
- Event idempotency.
- Offline retry/double submit.
- Private photo access.
- Recap privacy allowlist.
- Stats empty/partial/complete.
- Reduced motion.

KABUL KRİTERLERİ
- Yolculuk sırasında ana aksiyonlar tek elle hızlıdır.
- Plan ve gerçek olaylar birleşik timeline'da görünür ama veri modeli güvenli ayrıdır.
- Offline/failed media kullanıcıya görünür ve retry edilir.
- Recap paylaşmadan önce privacy preview vardır.
- Test/lint geçer; final raporda otomatik event ve privacy kararları açıklanır.
```

---

## Aşama 14 — Güvenli AI Trip Copilot ve Kullanıcı Hafızası

```text
ROLÜN
AI Product Architect, Applied AI Safety Engineer, Supabase Privacy Architect ve Mobile Conversational UX Designer olarak çalış. Tripper'ın planı okuyabilen, açıklanabilir değişiklikler önerebilen ve yalnız kullanıcı onayıyla uygulayan bir AI Trip Copilot oluştur. Kullanıcı tercih hafızası açık izinli, görünür, düzenlenebilir ve silinebilir olmalı.

TEMEL ÜRÜN KURALI
AI hiçbir itinerary, reservation, expense veya trip verisini sessizce değiştirmez. Her mutation önerisi yapılandırılmış diff olarak gösterilir: ne değişecek, neden, hangi veri kullanıldı ve risk/çatışma. Kullanıcı Apply dediğinde normal yetkili domain mutation/RPC'leri çalışır. Cancel hiçbir veri değiştirmez. Kilitli/sabit reservation item'ları korunur.

BAĞLAM
- Repo Next.js/Supabase/Mapbox.
- OpenAI veya başka AI provider bağımlılığı mevcut olmayabilir. Önce package/env/server architecture'i incele; provider key client'a asla koyma.
- Itinerary, optimization, weather, bookings, offline ve collaboration aşamaları varsa onların doğrulanmış servis sınırlarını reuse et.
- Mobile-only Liquid Glass.
- Wanderlog'un AI yardım kolaylığı örnek alınır; Tripper farkı gerçek plan diff'i, road-trip preference ve kullanıcı kontrolüdür.

ÖN İNCELEME VE GÜNCEL DOKÜMAN
1. AGENTS.md, git status, package.json, server routes, env pattern, itinerary/optimization types ve RLS'i incele.
2. Kullanılacak AI sağlayıcının güncel resmi dokümanını kontrol et. OpenAI kullanılıyorsa yalnız resmi OpenAI docs ve repo/local docs'a güven; güncel model ve structured output API'sini doğrula.
3. Yeni dependency gerekiyorsa sürümü sabitle ve lockfile güncelle; gerekçesiz SDK ekleme.
4. API key yalnız server env; `NEXT_PUBLIC_` kullanma.

MİMARİ
1. Server-only AI endpoint/action oluştur:
   - authenticated user doğrulama;
   - trip membership/capability kontrolü;
   - rate limit/budget limit;
   - minimal context assembly;
   - structured schema validation;
   - audit-safe response.
2. Prompt'a tüm database dump'ını gönderme. Yalnız aktif trip için gerekli itinerary özetini, constraints ve izinli tercihleri gönder.
3. Reservation confirmation number, attachment content, private journal, member email, ödeme detayları varsayılan context'e dahil edilmez. Gerekiyorsa açık kullanıcı eylemi ve redaction.
4. Structured output schema:
   - natural-language summary;
   - assumptions;
   - warnings;
   - proposed_operations[] allowlist: create_item/update_time/move_item/reorder/add_break/replace_place gibi;
   - operation id, target id, before, after, reason;
   - sources/signals;
   - confidence uygun biçimde, sahte kesinlik yok.
5. Output'u runtime schema ile validate et. Bilinmeyen operation veya cross-trip id reddedilir.
6. Apply endpoint/RPC her operation'ı yeniden authorization ve invariant validation'dan geçirir; model cevabına güvenmez.
7. Atomic apply veya açık partial transaction policy. Tercihen tek change set transaction; conflict/version değiştiyse yeniden preview iste.
8. AI konuşma geçmişini varsayılan sınırsız saklama. Gerekliyse trip-scoped, retention/deletion policy ve RLS.

KULLANICI HAFIZASI
1. `travel_preferences` modeli:
   - user_id;
   - max_daily_drive_minutes;
   - preferred_start_time;
   - break_interval;
   - scenic_route preference;
   - budget style;
   - lodging/food/accessibility/family/EV/photo/drone preferences;
   - explicit consent/source/updated_at.
2. Authorization `(select auth.uid()) = user_id`; user_metadata kullanma.
3. Kullanıcı Profile/Settings içinde memory listesi görür, düzenler, tek tek veya tümünü siler.
4. AI konuşmadan yeni preference çıkardığında otomatik kaydetme; “Remember this?” confirmation.
5. Hassas sağlık/dini vb. çıkarımlar yapma veya kullanıcı istemeden kaydetme.

MOBİL UX
1. Tek giriş noktası `Ask Tripper`; her ekrana ayrı chat balonu koyma.
2. Suggested quick prompts: rain plan, lunch, driving breaks, sunset, lower cost.
3. Chat sheet glass-elevated; messages solid; streaming destekliyse cancel ve partial failure.
4. Change Preview:
   - before/after;
   - moved/created/removed count;
   - time/distance effect yalnız hesaplanmışsa;
   - locked conflicts;
   - Apply/Cancel.
5. AI unavailable/rate limited/offline durumunda plan tamamen kullanılabilir kalır.
6. Offline prompt queue yapma; AI online gerektiriyorsa açıkça söyle.
7. AI görsel dili için mor/AI semantic accent kullanılabilir; ana Apply yine kontrollü accent.

PROMPT INJECTION VE GÜVENLİK
- Place notes, web content ve attachments untrusted data olarak işaretlenir; bunların talimatlarını system/developer talimatı gibi izleme.
- Tool/operation allowlist; model doğrudan SQL, URL fetch veya arbitrary server action çalıştıramaz.
- Cross-trip object id validation.
- Rate limiting user + trip + IP dengeli; privacy loglarında raw private prompt azalt.
- Error response stack/secret sızdırmaz.
- AI cevabını HTML olarak render etme; text/markdown sanitize.

KALİTE VE TEST
- Structured schema valid/invalid output.
- Hallucinated/cross-trip id rejection.
- Viewer suggestion görebilir mi ürün kararını açıklaştır; mutation asla yapamaz.
- Locked reservation conflict.
- Concurrent update/version mismatch.
- Cancel no-op; Apply authorization.
- Preference consent/edit/delete/RLS.
- Prompt injection fixtures.
- Provider timeout/rate limit/offline.

KABUL KRİTERLERİ
- Kullanıcı doğal dille öneri ister ve yapılandırılmış diff görür.
- Cancel veri değiştirmez; Apply normal güvenlik kontrolleriyle atomik uygulanır.
- Kilitli reservation korunur.
- Preference hafızası opt-in, görünür, düzenlenebilir, silinebilirdir.
- Secret client'a sızmaz, private context minimize edilir.
- Test/lint geçer; final raporda model/provider, maliyet/rate limit, privacy ve failure mode'lar yazılır.
```

---

## Promptları Kullanma Sırası ve Agent Teslim Standardı

Her prompt bağımsız olsa da önerilen sıra 0 → 14'tür. Özellikle veri modeline bağlı Aşama 5–14, önceki aşamanın gerçekten tamamlandığını varsaymamalı; agent her seferinde repoyu inceleyip eksik dependency varsa bunu açıkça raporlamalı ve güvenli adapter/fallback kullanmalıdır.

Her agent teslimatında şunları istemeyi unutmayın:

1. Değiştirilen ve oluşturulan dosyaların listesi.
2. Uygulanan migration'ın adı ve deploy sırası; remote'a uygulanıp uygulanmadığı.
3. Çalıştırılan test/lint/build komutları ve sonuçları.
4. 320, 375, 390 ve 430 px manuel mobil test sonuçları.
5. Owner/editor/viewer yetki matrisi etkisi.
6. Loading, error, empty, offline ve retry davranışları.
7. Bilinen sınırlar ve bir sonraki aşamaya bırakılan işler.
8. Kullanıcının mevcut worktree değişikliklerinin korunup korunmadığı.
