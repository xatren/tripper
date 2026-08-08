# Tripper — Private Beta Hazırlık Yol Haritası

Bu belge, uygulamayı gerçek kullanıcıya (private beta) açmak için gereken işleri **sırayla uygulanabilir mikro görevlere** böler. Her görevin kopyalanabilir bir promptu vardır; yeni oturumda Bağlam Kartı + tek görev promptu verilir.

**Kaynak:** `docs/project-analysis-roadmap.md` (RM/TD envanteri) ve 2026-08-05 tarihli repo taraması. Format olarak `docs/active-trip-ui-ux-implementation-prompts.md` desenini izler; o yaklaşım bu repoda çalıştığı kanıtlanmıştır.

## Neden bu işler

Ürün tarafı bitti (Aşama 0–13, Dusk Faz 1–13, UX-01…UX-09). Güvenlik tarafında RM-000/001/002/010/011/012 kapandı. Beta'yı bugün engelleyen şey feature eksikliği değil, dört boşluk:

1. **Görünürlük yok** — `next.config.mjs` tek security header içermiyor, `app/global-error.tsx` yok (client crash = sessiz beyaz ekran), correlation ID yok. (TD-010, TD-015)
2. **Tarayıcıda hiçbir şey test edilmiyor** — 22 test dosyasının hepsi saf logic; `docs/mobile-regression-checklist.md`'de 30 madde elle bekliyor.
3. **Şema gerçeği belirsiz** — migration'lar elle uygulanıyor, ledger yok; 005/006 prod'da uygulanmamış. (TD-004)
4. **Üç kullanıcı-görünür hata** — aşağıda BETA-01/02.

---

## Bağlam Kartı — Her oturumda yalnız bir kez

```text
Tripper, Next.js 16 + React 19 + TypeScript ile geliştirilmiş dark-only, mobile-first bir
gezi uygulamasıdır. Backend Supabase (Postgres + RLS + Realtime + Storage). Aktif gezi alanı
app/trip/[id]/mobile altındadır. Hedef: uygulamayı private beta'ya hazırlamak.

Kurallar:
- Mevcut Dusk/Liquid Glass kimliğini koru. Ekran başına tek baskın amber CTA.
- Kritik metin minimum 12 px, dokunma hedefi minimum 44×44 px.
- 320–430 px, safe-area, keyboard, reduced-motion ve owner/editor/viewer davranışlarını koru.
- Mevcut yardımcıları yeniden kullan, yeni soyutlama icat etme.
- Yeni bağımlılık yalnız görev açıkça söylüyorsa eklenir (yalnız BETA-09).
- Migration yalnız görev açıkça söylüyorsa yazılır.

TOKEN KORUMA PROTOKOLÜ:
1. Önce git status --short kontrol et. README veya docs dosyalarını otomatik okuma;
   bu prompt gerekli kararları içeriyor.
2. 400 satırdan büyük bir dosyayı baştan sona okuma.
3. Önce rg -n ile promptta verilen sembolü bul; yalnız eşleşmenin 40–80 satır çevresini oku.
4. Importları yalnız ekleme/değiştirme gerektiğinde ilk 30–50 satırdan kontrol et.
5. Repo genelinde broad grep veya mimari keşif yapma. Yalnız promptta listelenen dosyalar
   ve doğrudan import edilen küçük type/helper dosyaları kapsamda.
6. Önceki görev aynı dosyayı okuduysa tekrar okuma; oturum bağlamını ve git diff'i kullan.
7. Değişiklikten sonra tüm dosyayı yeniden okuma; rg + git diff -- <hedef-dosyalar> yeterli.
8. Her mikro görevde yalnız npm run typecheck ve ilgili dar testi çalıştır.
   Full lint/test/build yalnız faz kapılarında (BETA-02, BETA-05, BETA-08, BETA-11, BETA-14).
9. İlgisiz kodu refactor etme. Kullanıcı istemedikçe commit/push yapma.
```

---

## Görev sırası

| ID | İş | Faz | Bloklayan |
|---|---|---|---|
| BETA-00 | Prod şema snapshot'ı (manuel) | 4a | — (1. gün başlar) |
| BETA-01 | Sessiz redirect hatalarını düzelt | 0a | — |
| BETA-02 | Google OAuth drift'i + **faz kapısı** | 0b | — |
| BETA-03 | `.env.example` drift'i + contract testi | 1a | — |
| BETA-04 | Startup env doğrulaması | 1b | BETA-03 |
| BETA-05 | Security header'ları + Report-Only CSP + **faz kapısı** | 1c | — |
| BETA-06 | `lib/observability/` çekirdeği | 2 | — |
| BETA-07 | Request id'yi proxy + server-errors + API route'lara bağla | 2 | BETA-06 |
| BETA-08 | `app/global-error.tsx` + Sentry seam'i + **faz kapısı** | 2 | BETA-06 |
| BETA-09 | Playwright kurulumu + globalSetup + stub'lar | 3 | BETA-01 |
| BETA-10 | 7 E2E spec'i | 3 | BETA-09 |
| BETA-11 | CI `e2e` job'ı + checklist güncellemesi + **faz kapısı** | 3 | BETA-10 |
| BETA-12 | Şema gerçeği raporu + 005/006 kararı | 4a-4b | BETA-00 |
| BETA-13 | `supabase link` + ledger + runbook | 4c | BETA-12 |
| BETA-14 | CI drift checksum + restore tatbikatı + **faz kapısı** | 4d-4e | BETA-13 |

### Oturum grupları

Aynı dosya bağlamını iki kez okumamak için:

- **Oturum 1:** BETA-01 + BETA-02 — `login/page.tsx` ve dashboard bağlamı bir kez okunur.
- **Oturum 2:** BETA-03 + BETA-04 + BETA-05 — config/env/header üçlüsü.
- **Oturum 3:** BETA-06 + BETA-07 + BETA-08 — observability katmanı tek seferde.
- **Oturum 4:** BETA-09 + BETA-10 — Playwright kurulumu ve spec'ler.
- **Oturum 5:** BETA-11 — CI ve checklist.
- **Oturum 6:** BETA-12 + BETA-13 + BETA-14 — migration pipeline (BETA-00 çıktısı hazır olmalı).

---

## BETA-00 — Prod şema gerçeğini çıkar (manuel, 1. gün)

Bu bir kod görevi değil; **1. günde başlat**, BETA-12'yi bekletme. Çıktısı ledger kararını belirliyor.

1. Supabase SQL Editor'da (read-only) çalıştır:
   - `scripts/schema-snapshot.sql`
   - `scripts/check-pending-migrations.sql`
2. Her sonuç setini `<project-ref>-<YYYY-MM-DD>-<script>.csv` adıyla export et.
3. Settings → Database → Backups'tan PITR/retention değerlerini not al (SQL ile sorgulanamıyor).
4. Authentication → Providers'da **Google provider yapılandırılmış mı** kontrol et (BETA-02 bunu bekliyor).

**Beklenen bulgu:** `005_activities` / `006_activity_order` FALSE dönecek — bu bilinen ve zararsız (`scripts/check-pending-migrations.sql` başlığı açıklıyor; `012` ve `20260716005552` referanslarını `to_regclass` ile guard'lıyor). BETA-12'de karara bağlanacak.

---

## BETA-01 — Sessiz redirect hatalarını düzelt

### Hedef dosyalar

- `lib/auth/redirect-errors.ts` — **yeni**
- `app/dashboard/page.tsx`
- `app/dashboard/DashboardClient.tsx`
- `app/(auth)/login/page.tsx`

### Kopyalanabilir prompt

```text
Bağlam Kartı kurallarını uygula. İki sessiz redirect hatasını kullanıcıya görünür yap.

SORUN:
- app/join/[code]/page.tsx başarısız davette /dashboard?error=invalid_invite veya
  ?error=invite_rate_limited'a redirect ediyor, ama DashboardPage() searchParams parametresi
  bile almıyor — mesaj göstermek yapısal olarak imkânsız.
- app/auth/callback/route.ts /login?error=auth_callback_failed'a redirect ediyor,
  login sayfası hiç okumuyor.

DAR OKUMA:
1. app/dashboard/page.tsx tamamı (küçük dosya).
2. app/dashboard/DashboardClient.tsx içinde yalnız props interface, function signature ve
   ilk useEffect bölgesi. showToast zaten satır 17'de import edili — rg -n "showToast" ile doğrula.
3. app/(auth)/login/page.tsx içinde yalnız useState bölgesi (satır ~20-30) ve
   useSearchParams/searchParams kullanımı. error state ve render'ı zaten var (satır ~137-139).

UYGULAMA:
1. Yeni lib/auth/redirect-errors.ts:
   - REDIRECT_ERROR_MESSAGES sabiti: invalid_invite, invite_rate_limited, auth_callback_failed
     anahtarlarını kullanıcı diline map eder.
   - redirectErrorMessage(code: string | undefined): string | null — bilinmeyen kodda null döner
     (açık redirect / mesaj enjeksiyonu yüzeyi bırakma; asla ham query değerini gösterme).
   - Metinler İngilizce, mevcut UI diliyle uyumlu:
     invalid_invite       -> "That invite link is invalid or has expired."
     invite_rate_limited  -> "Too many invite attempts. Please wait a few minutes and try again."
     auth_callback_failed -> "We couldn't complete that sign-in. Please try again."
2. app/dashboard/page.tsx: Next 16 async API'siyle
   searchParams: Promise<{ error?: string }> al, await et, redirectErrorMessage'dan geçir,
   sonucu DashboardClient'a yeni optional prop olarak ver (ör. initialErrorMessage?: string).
3. app/dashboard/DashboardClient.tsx: prop doluysa mount'ta bir kez showToast(msg, "error")
   çağıran useEffect ekle. Boş dependency array + prop guard; her render'da tekrar etmesin.
   Yeni banner/alert component'i ekleme; mevcut toast yeterli.
4. app/(auth)/login/page.tsx: useSearchParams ile ?error= oku, redirectErrorMessage'dan geçirip
   mevcut error state'ine yaz (mount'ta bir kez). Mevcut render ve role="alert" korunur.
   Sayfa zaten 'use client' ise ek Suspense gerekmiyor; değilse mevcut yapıyı bozma.

KAPSAM DIŞI: Google OAuth butonu (BETA-02), yeni toast varyantı, join RPC davranışı.

DOĞRULAMA:
- npm run typecheck
- rg -n "redirectErrorMessage" ile üç çağrı yerini doğrula
- git diff -- lib/auth/redirect-errors.ts app/dashboard app/\(auth\)/login

KABUL:
- Geçersiz davet kodu dashboard'da görünür toast gösteriyor.
- Rate-limited join ayrı ve daha yumuşak bir mesaj veriyor.
- Başarısız OAuth callback'i /login'de mesaj basıyor.
- Bilinmeyen ?error= değeri hiçbir şey göstermiyor (ham değer ekrana yazılmıyor).
```

---

## BETA-02 — Google OAuth drift'ini kapat *(faz kapısı)*

### Hedef dosyalar

- `app/(auth)/login/page.tsx`
- `lib/auth/google.ts` — yalnız flag yolu seçilirse
- `README.md`, `docs/app-flow-overview.md`

### Ön koşul

BETA-00 adım 4: Supabase'de Google provider yapılandırılmış mı? Cevaba göre A veya B yolu.

### Kopyalanabilir prompt

```text
Bağlam Kartı kurallarını uygula. Google OAuth drift'ini kapat.

SORUN:
app/(auth)/login/page.tsx:158 koşulsuz "Continue with Google" butonu render ediyor
(handleGoogle -> supabase.auth.signInWithOAuth, satır ~71-81). Ama README.md:52 ve
docs/app-flow-overview.md:66 "mevcut UI'da Google OAuth akışı yok" diyor. Provider
yapılandırılmamışsa her beta kullanıcısı bozuk bir primary CTA görüyor.

DAR OKUMA: login/page.tsx içinde yalnız handleGoogle fonksiyonu ve satır ~155-165 JSX'i.
lib/auth/guest.ts tamamı (8 satır, desen kaynağı).

YOL A — provider YAPILANDIRILMIŞ ise:
1. Kod değişikliği yok.
2. README.md:52 ve docs/app-flow-overview.md:66 satırlarını gerçekle uyumlu hale getir:
   Google OAuth akışı mevcut ve /auth/callback üzerinden dönüyor.
3. Başka doküman satırına dokunma.

YOL B — provider YAPILANDIRILMAMIŞ ise:
1. Yeni lib/auth/google.ts — lib/auth/guest.ts desenini BİREBİR taklit et:
   export const GOOGLE_LOGIN_ENABLED = process.env.NEXT_PUBLIC_ENABLE_GOOGLE_LOGIN?.trim() === 'true'
   Trailing-newline yorumunu da taşı (vercel env add newline ekliyor; .trim() bu yüzden var).
2. login/page.tsx: butonu ve varsa "or continue with" ayıracını GOOGLE_LOGIN_ENABLED arkasına al.
   CSS ile gizleme; koşulsuz DOM'a ekleme.
3. .env.example'a NEXT_PUBLIC_ENABLE_GOOGLE_LOGIN=false ekle, guest flag'iyle aynı yorum stilinde.
4. README.md:52 ve docs/app-flow-overview.md:66'yı "flag arkasında, varsayılan kapalı" olarak güncelle.
5. handleGoogle fonksiyonunu SİLME — flag açıldığında çalışmalı.

KAPSAM DIŞI: signInWithOAuth parametrelerini değiştirmek, callback route'u refactor etmek.

FAZ KAPISI (Faz 0 bitişi):
- npm run typecheck && npm run lint && npm test && npm run build
- git diff --check
- Elle: geçersiz kodla /join/XXXXXXXX -> dashboard'da toast görünüyor mu
- Elle: prod URL'inde curl -i /api/auth/guest -> 404 dönüyor mu

KABUL:
- Login sayfasında çalışmayan CTA yok.
- README ve app-flow-overview kodla çelişmiyor.
- Yol B'de flag kapalıyken buton DOM'a hiç eklenmiyor.
```

---

## BETA-03 — `.env.example` drift'i ve contract testi

### Hedef dosyalar

- `.env.example`
- `README.md` (satır 112 ve 132)
- `tests/env-contract.test.mts` — **yeni**

### Kopyalanabilir prompt

```text
Bağlam Kartı kurallarını uygula. Env dokümantasyon drift'ini kapat ve tekrarını test ile engelle.

SORUN:
.env.example üç Supabase değişkeninin hiçbirini içermiyor — temiz bir kurulum bugün çalışmaz.
(README.md:24-37 doğru belgeliyor; drift yalnız .env.example'da.)
Ayrıca README.md:112 ve :132 artık var olmayan 000_full_schema.sql'e atıf yapıyor;
dosya supabase/legacy-full-schema.sql olarak duruyor.

DAR OKUMA: .env.example tamamı (küçük). README.md'de yalnız 108-135 aralığı.
Mevcut test stilini görmek için tests/ altından KISA bir dosyaya bak (ör. tests/request-ip.test.mts).

UYGULAMA:
1. .env.example'a mevcut yorum stiliyle ekle:
   NEXT_PUBLIC_SUPABASE_URL
   NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY  (NEXT_PUBLIC_SUPABASE_ANON_KEY legacy fallback olarak
     kabul ediliyor — yorumda belirt)
   SUPABASE_SERVICE_ROLE_KEY  (server-only; /api/auth/sign-up, /api/auth/guest,
     /api/account/delete kullanıyor. NEXT_PUBLIC_ ile prefixlenmemesi gerektiğini yaz.)
2. README.md:112 ve :132'deki 000_full_schema.sql atıflarını supabase/legacy-full-schema.sql
   olarak düzelt. README'nin başka bölümünü yeniden yazma.
3. Yeni tests/env-contract.test.mts — mevcut node:test + node:assert stilinde, yeni bağımlılık yok:
   - .env.example'ı oku, KEY= satırlarından key setini çıkar.
   - app/, lib/ ve proxy.ts içinde process.env.<NAME> ve process.env['<NAME>'] örüntülerini tara
     (fs.readdirSync ile recursive; node_modules ve .next hariç).
   - Bir IGNORED seti tanımla ve NEDEN muaf olduklarını yorumla:
     VERCEL, NODE_ENV, NEXT_RUNTIME (platform/runtime tarafından set edilir),
     SUPABASE_DB_URL, DATABASE_URL (yalnız scripts/ ve supabase/tests kullanır, app değil).
   - Assert: IGNORED dışındaki her okunan değişken .env.example'da var.
   - Hata mesajı eksik değişken adlarını listelesin.

KAPSAM DIŞI: değişkenlerin değerlerini doğrulamak (BETA-04), .env.local'a dokunmak.

DOĞRULAMA:
- npm run typecheck
- node --experimental-strip-types --test tests/env-contract.test.mts
- Testi kasten kırmak için .env.example'dan bir satırı geçici sil, kırıldığını gör, geri koy.

KABUL:
- Temiz bir kurulum için gereken tüm değişkenler .env.example'da.
- Server-only ve public değişken sınıfları yorumda açıkça ayrılmış.
- README var olmayan dosyaya atıf yapmıyor.
- Yeni bir env okuması eklenip .env.example unutulursa test kırılıyor.
```

---

## BETA-04 — Startup env doğrulaması

### Hedef dosyalar

- `lib/env.ts` — **yeni**
- `instrumentation.ts` — **yeni** (repo kökü)
- `lib/supabase/admin.ts`

### Kopyalanabilir prompt

```text
Bağlam Kartı kurallarını uygula. Eksik env'i sessiz runtime hatası yerine açık startup hatasına çevir.

DAR OKUMA: lib/supabase/admin.ts tamamı (zaten url/serviceRoleKey kontrolü yapıp throw ediyor —
bu mevcut mantık lib/env.ts'e taşınacak). lib/supabase/client.ts ve server.ts'de yalnız
process.env satırlarını rg ile gör.

UYGULAMA:
1. Yeni lib/env.ts:
   - Zorunlu değişken listesi, "server" ve "public" olarak ayrılmış.
   - assertRequiredEnv(scope: 'server' | 'public'): eksikleri TOPLAYIP tek bir hatada listeler
     (ilk eksikte throw etme — kullanıcı hepsini bir kerede görsün).
   - Hata mesajı yalnız DEĞİŞKEN ADLARINI içersin; hiçbir koşulda değer/parça sızdırma.
   - Yalnız varlık kontrolü yap, format/uzunluk doğrulama ekleme.
2. Yeni instrumentation.ts (repo kökü):
   export async function register() {
     if (process.env.NEXT_RUNTIME !== 'nodejs') return
     assertRequiredEnv('server')  // + public
   }
   Edge runtime'da çalışmamalı.
3. lib/supabase/admin.ts: kendi ad-hoc kontrolünü lib/env.ts'i kullanacak şekilde refactor et.
   Export imzasını ve throw davranışını DEĞİŞTİRME.
4. lib/supabase/{client,server,middleware}.ts içindeki ! non-null assertion'larına DOKUNMA —
   startup assert onları doğru kılıyor. Bu dosyaları açma gereği yok.

KRİTİK — build'i kırma:
Bu bir RUNTIME kontrolü, build-time değil. .github/workflows/ci.yml'deki build job'ı (satır ~137-144)
kasıtlı olarak placeholder değerlerle ve SUPABASE_SERVICE_ROLE_KEY OLMADAN build alıyor.
instrumentation.ts register() build sırasında çalışmamalı. npm run build ile mutlaka doğrula.

DOĞRULAMA:
- npm run typecheck
- npm run build  (SUPABASE_SERVICE_ROLE_KEY olmadan da geçmeli — kritik)
- Elle: bir zorunlu değişkeni geçici kaldırıp npm run dev -> tüm eksikleri listeleyen tek hata

KABUL:
- Eksik env, uygulama açılışında tek ve okunabilir bir hata veriyor.
- Hata mesajında hiçbir secret değeri yok.
- CI build job'ı placeholder env ile hâlâ geçiyor.
```

---

## BETA-05 — Security header'ları ve Report-Only CSP *(faz kapısı)*

### Hedef dosyalar

- `next.config.mjs`
- `tests/security-headers.test.mts` — **yeni**

### Kopyalanabilir prompt

```text
Bağlam Kartı kurallarını uygula. Security header baseline'ı ekle (TD-015). CSP yalnız Report-Only.

DAR OKUMA: next.config.mjs tamamı (21 satır).
Origin listesi aşağıda hazır — CSP kaynaklarını bulmak için repo taraması YAPMA.

UYGULAMA — next.config.mjs'e async headers() ekle, source: '/(.*)':

Statik header'lar:
  Strict-Transport-Security: max-age=63072000; includeSubDomains; preload
  X-Content-Type-Options: nosniff
  Referrer-Policy: strict-origin-when-cross-origin
  X-Frame-Options: DENY
  X-DNS-Prefetch-Control: on
  Permissions-Policy: camera=(), microphone=(), payment=(), geolocation=(self)

DİKKAT: geolocation self KALMALI. TripMapDomain.tsx ve mobile-entry-flow.tsx
navigator.geolocation.getCurrentPosition çağırıyor; () yaparsan konum özelliği kırılır.

Content-Security-Policy-Report-Only (tek satır string olarak birleştir):
  default-src 'self';
  script-src 'self' 'unsafe-inline' blob: https://maps.googleapis.com https://va.vercel-scripts.com;
  worker-src 'self' blob:;
  connect-src 'self' https://*.supabase.co wss://*.supabase.co https://api.mapbox.com
    https://events.mapbox.com https://api.open-meteo.com https://maps.googleapis.com
    https://fonts.googleapis.com https://fonts.gstatic.com https://va.vercel-scripts.com;
  img-src 'self' data: blob: https://*.supabase.co https://api.mapbox.com
    https://lh3.googleusercontent.com https://*.googleapis.com https://*.gstatic.com
    https://*.ggpht.com;
  style-src 'self' 'unsafe-inline' https://fonts.googleapis.com;
  font-src 'self' data: https://fonts.gstatic.com;
  frame-ancestors 'none'; object-src 'none'; base-uri 'self'; form-action 'self'

Her direktifin yanına NEDEN'ini kısa yorumla yaz:
- script blob: + worker-src blob: -> mapbox-gl v3 worker'ları
- maps.googleapis -> components/explore/GoogleExploreMap.tsx dinamik script inject ediyor
- va.vercel-scripts -> @vercel/analytics
- wss://*.supabase.co -> Realtime
- fonts.googleapis + fonts.gstatic (connect-src'ta da) -> lib/recap-image.ts tarayıcıdan
  font CSS + woff2 fetch ediyor, yalnız font-src yetmiyor
- Google Place photo'ları same-origin: app/api/places/photo/route.ts proxy'liyor, img-src'a
  ayrı origin gerekmiyor

NONCE tabanlı CSP EKLEME — proxy.ts'i elden geçirmeyi gerektirir, private beta için gereksiz.
Report-Only enforcing'e ÇEVİRME — beta 1. haftasında violation'lar ölçüldükten sonra yapılacak.

TEST — yeni tests/security-headers.test.mts (mevcut node:test stilinde):
- next.config.mjs'i import et, headers()'ı await et.
- Beklenen header adlarının hepsinin döndüğünü assert et.
- CSP'nin Report-Only olduğunu (enforcing DEĞİL) assert et — kazara promote edilmesini engeller.
- Permissions-Policy'de geolocation=(self) olduğunu assert et — kazara kapatılmasını engeller.

FAZ KAPISI (Faz 1 bitişi):
- npm run typecheck && npm run lint && npm test && npm run build
- npm run dev, DevTools konsolu açık, şu yolu yürü ve SIFIR CSP violation doğrula:
  login -> dashboard -> trip mobile 5 sekme (overview/plan/explore/bookings/more)
  -> explore'da her iki map provider -> travel mode -> recap görseli üret
- Violation çıkarsa: origin'i ekle, direktifi gevşetme.

KABUL:
- Tüm statik header'lar mevcut.
- CSP Report-Only ve kritik akışlarda violation üretmiyor.
- Konum özelliği çalışmaya devam ediyor.
```

---

## BETA-06 — `lib/observability/` çekirdeği

### Hedef dosyalar (hepsi **yeni**)

- `lib/observability/correlation.ts`
- `lib/observability/log.ts`
- `lib/observability/errors.ts`
- `lib/observability/report.ts`
- `tests/observability-redaction.test.mts`

### Karar gerekçesi

Kendi ince katmanımız + tek seam arkasında opsiyonel Sentry. `{code, message, retryable}` contract'ı zaten `lib/google-places/errors.ts` ve `lib/rate-limit/response.ts`'te mevcut — bu repo işi, vendor işi değil. Ama client exception'ları (framer-motion/mapbox/offline) hiçbir server log'una düşmüyor ve Vercel runtime log'ları kalıcı değil; bu yüzden vendor sink'i tek fonksiyonun arkasında opsiyonel bırakılıyor.

### Kopyalanabilir prompt

```text
Bağlam Kartı kurallarını uygula. Observability çekirdeğini kur (RM-013). Yeni bağımlılık EKLEME —
Sentry yalnız opsiyonel bir seam olarak hazırlanacak, bu görevde kurulmayacak.

DAR OKUMA (üçü de küçük, tamamını oku — desen kaynağı):
- lib/supabase/server-errors.ts  (mevcut structured log tohumu; satır 30 civarındaki
  "ne loglanmaz" yorumu KURAL kaynağıdır, koru)
- lib/google-places/errors.ts    (mevcut {code, message, retryable} wire contract'ı)
- lib/random-id.ts               (id üretimi için yeniden kullanılabilir mi bak)

UYGULAMA — lib/observability/ altında dört küçük dosya:

1. correlation.ts
   - getRequestId(headers: Headers): string — x-request-id varsa onu döndür, yoksa üret.
   - Üretimde lib/random-id.ts uygunsa kullan; değilse crypto.randomUUID().
   - Gelen değeri sanitize et: yalnız [A-Za-z0-9-]{1,64}; aksi halde yeni üret
     (dışarıdan gelen header'ı log injection vektörü yapma).

2. log.ts
   - type LogLevel = 'info' | 'warn' | 'error'
   - ALLOWED_FIELDS allowlist'i: requestId, route, operation, code, status, userIdHash, durationMs
   - redact(fields): allowlist DIŞINDAKİ her key'i düşürür. Denylist DEĞİL allowlist kullan —
     yeni bir alan eklendiğinde varsayılan davranış "loglanmasın" olsun.
   - logEvent(level, event, fields): tek satır JSON basar (console[level]).
   - Dosya başına yorum: email, invite_code, p_identity_key ve Supabase hata objesinin
     message/details alanları ASLA loglanmaz. Bu kural server-errors.ts'ten geliyor.

3. errors.ts
   - export class AppError extends Error { code: string; status: number; retryable: boolean }
   - GooglePlacesError'ı AppError'dan TÜRET (extend). Onu SİLME veya imzasını değiştirme —
     4 Places route'u ve tests/google-places.test.mts davranışı aynı kalmalı.
   - toWireError(err): mevcut { error: { code, message, retryable } } şeklini üretir.
     Beklenmeyen hatalarda generic mesaj döndür; err.message'ı istemciye sızdırma.

4. report.ts
   - reportError(err: unknown, ctx: { requestId?, route?, operation? }): void
   - logEvent('error', ...) çağırır.
   - TEK vendor seam'i: SENTRY_DSN set ise dinamik import ile Sentry.captureException.
     Bu görevde Sentry paketi KURULMAYACAK — import'u BETA-08'de aktif edilecek şekilde
     yorum + guard olarak hazırla. DSN yoksa katman saf console-JSON logger'dır.

TEST — tests/observability-redaction.test.mts (mevcut node:test stilinde):
- redact() allowlist dışı key'leri düşürüyor.
- email / invite_code / password içeren obje logEvent'ten geçince çıktıda görünmüyor.
- getRequestId geçerli header'ı koruyor, bozuk/uzun/kontrol karakterli header'ı reddedip yeni üretiyor.
- GooglePlacesError instanceof AppError doğru.

KAPSAM DIŞI: Call site'ları bağlamak (BETA-07), global-error.tsx (BETA-08).

DOĞRULAMA:
- npm run typecheck
- node --experimental-strip-types --test tests/observability-redaction.test.mts tests/google-places.test.mts
  (google-places testi DEĞİŞMEDEN geçmeli — regresyon kontrolü)

KABUL:
- Katman dört küçük dosyadan oluşuyor, yeni bağımlılık yok.
- Allowlist yaklaşımı sayesinde yeni alanlar varsayılan olarak loglanmıyor.
- Mevcut Places hata davranışı ve testleri değişmedi.
```

---

## BETA-07 — Request id'yi uygulamaya bağla

### Hedef dosyalar

- `proxy.ts` veya `lib/supabase/middleware.ts`
- `lib/supabase/server-errors.ts`
- 7 API route (`app/api/**/route.ts`)
- `lib/google-places/rate-limit.ts`

### Kopyalanabilir prompt

```text
BETA-06 ile aynı oturumdaysan lib/observability/ dosyalarını yeniden okuma; oturum bağlamını kullan.

Bağlam Kartı kurallarını uygula. Correlation ID'yi uçtan uca bağla ve kalan ham console
çağrılarını structured log'a çevir.

DAR OKUMA:
- proxy.ts tamamı (küçük) ve lib/supabase/middleware.ts'de yalnız response üretilen bölge.
- lib/supabase/server-errors.ts tamamı (küçük, BETA-06'da okundu).
- Her API route'ta yalnız handler signature'ı ve console.* satırlarının çevresi.
  rg -n "console\." app/api lib/google-places ile tam listeyi çıkar (beklenen: 4 yer —
  app/api/auth/sign-up/route.ts, app/api/auth/guest/route.ts x2, lib/google-places/rate-limit.ts).

UYGULAMA:
1. Middleware/proxy katmanı:
   - getRequestId ile id üret/koru.
   - Request header'ına yaz ki RSC'ler next/headers ile okuyabilsin.
   - Response'a x-request-id echo'la — kullanıcı bug report'a yapıştırabilsin.
   - Mevcut Supabase session refresh davranışını BOZMA; yalnız header ekle.
2. lib/supabase/server-errors.ts:
   - İki ham çağrıyı (console.error 'server_data_query_failed',
     console.warn 'optional_server_data_query_failed') logEvent'e çevir, requestId ekle.
   - EXPORT İMZALARINI AYNI TUT (requiredQueryData, optionalQueryData, throwServerDataError,
     logOptionalDataError). Böylece tüm server page'ler sıfır edit'le correlation kazanır —
     app/dashboard/page.tsx ve kardeşlerine dokunma.
   - Mevcut "ne loglanmaz" yorumunu koru.
3. API route'ları: küçük bir withRequestContext helper'ı ile handler'ı sar
   (lib/observability/ altına koy). Route başına en fazla birkaç satır değişsin.
   Kalan 4 ham console.* çağrısını logEvent/reportError'a çevir.
4. Places route'larının mevcut hata gövdesini ({error:{code,message,retryable}}) DEĞİŞTİRME;
   yalnız log tarafını değiştiriyorsun.

KAPSAM DIŞI: Route'ların iş mantığı, rate limit davranışı, Supabase sorguları.

DOĞRULAMA:
- npm run typecheck
- npm test  (özellikle tests/google-places.test.mts ve tests/server-query-failures.test.mts
  DEĞİŞMEDEN geçmeli)
- rg -n "console\.(error|warn|log)" app/ lib/ -> observability katmanı dışında sonuç kalmamalı
- Elle: npm run dev, herhangi bir sayfa -> response header'da x-request-id var mı

KABUL:
- Her istek bir request id taşıyor ve response'ta görünüyor.
- Server sorgu hataları aynı id ile loglanıyor.
- Uygulamada observability katmanı dışında ham console.* kalmadı.
- Mevcut testler değişmeden geçiyor.
```

---

## BETA-08 — Global error boundary ve Sentry seam'i *(faz kapısı)*

### Hedef dosyalar

- `app/global-error.tsx` — **yeni**
- `lib/observability/report.ts`
- `next.config.mjs` — yalnız Sentry açılırsa

### Kopyalanabilir prompt

```text
Bağlam Kartı kurallarını uygula. Eksik top-level error boundary'yi ekle ve vendor seam'ini kapat.

SORUN: app/global-error.tsx yok. Route-level error.tsx'ler yalnız dashboard/explore/profile/
settings/trips/trip-mobile için var. Root layout seviyesinde bir client crash şu an sessiz
beyaz ekran ve senin asla duymadığın bir hata.

DAR OKUMA: mevcut error.tsx'lerden BİRİ (ör. app/dashboard/error.tsx) — görsel dil ve
Dusk token kullanımı için. lib/observability/report.ts (BETA-06'da yazıldı).

UYGULAMA:
1. Yeni app/global-error.tsx:
   - 'use client' ve zorunlu <html><body> sarmalayıcısı (global-error kendi root'unu render eder).
   - useEffect içinde reportError(error, { route: 'global' }) çağır.
   - Mevcut error.tsx'lerin görsel dilini izle: Dusk token'ları, tek amber CTA ("Try again",
     reset() çağırır), kritik metin >= 12px.
   - error.digest varsa küçük ve seçilebilir şekilde göster ("Reference: <digest>") —
     kullanıcı bug report'ta paylaşabilsin. Stack trace veya ham mesaj GÖSTERME.
   - Yeni bağımlılık veya blur ekleme.
2. Sentry kararı — kullanıcı SENTRY_DSN yolunu seçtiyse:
   - @sentry/nextjs kur, report.ts'teki dinamik import guard'ını aktif et.
   - next.config.mjs CSP connect-src'ına https://*.ingest.sentry.io ekle
     (veya tunnelRoute kullanılıyorsa CSP'ye dokunma).
   - .env.example'a SENTRY_DSN ekle (opsiyonel olduğunu yorumda belirt).
   - DSN yokken davranış değişmemeli: konsol-only.
   Kullanıcı bu yolu seçmediyse: BU ADIMI TAMAMEN ATLA, seam yorum olarak kalsın.

FAZ KAPISI (Faz 2 bitişi):
- npm run typecheck && npm run lint && npm test && npm run build
- Geçici bir scratch route'ta kasıtlı throw at; şunları doğrula:
  * client'ta tek bir x-request-id görünüyor
  * aynı id server log satırında var
  * log satırlarında e-posta / invite kodu / secret YOK
  * scratch route'u SİL
- Elle: bir client component'te geçici throw -> global-error render oluyor, Try again çalışıyor

KABUL:
- Root seviyesi crash artık görünür ve raporlanıyor.
- Sentetik 5xx tek id ile client -> route -> Supabase izlenebiliyor.
- SENTRY_DSN kapalıyken kod değişikliği olmadan konsol-only'ye düşüyor.
```

---

## BETA-09 — Playwright kurulumu

### Hedef dosyalar (hepsi **yeni**)

- `playwright.config.ts`
- `e2e/global-setup.ts`
- `e2e/fixtures/` (stub payload'ları)
- `package.json` (script + devDependency)

### Kopyalanabilir prompt

```text
Bağlam Kartı kurallarını uygula. Bu görev YENİ BAĞIMLILIK EKLEMEYE İZİNLİDİR (@playwright/test).

STRATEJİ — guest login'i E2E için KULLANMA. Prod'da kapalı olması gereken bir flag'e ve
service-role key'e bağlı. Bunun yerine CI'ın zaten kanıtladığı yolu kullan: disposable
Supabase stack (supabase start), sabit local key'lerle.

DAR OKUMA:
- .github/workflows/ci.yml içinde yalnız security-functional-tests job'ı (satır ~87-119) —
  Supabase kurulum adımları buradan kopyalanacak.
- supabase/tests/functional/_fixtures.sql tamamı — rol matrisi zaten burada tanımlı:
  owner, editor, viewer, outsider, revoked. Ayrıca tests.create_user / tests.user_id /
  tests.authenticate_as helper'ları var.
- supabase/tests/functional/run.mts — pg ile bağlanma deseni (pg zaten devDependency).
- lib/auth/username.ts — usernameToEmail() E2E kullanıcı e-postalarını üretmek için.

UYGULAMA:
1. npm i -D @playwright/test
2. playwright.config.ts:
   - testDir: 'e2e', yalnız chromium projesi (beta için yeterli, CI süresi kısa kalsın)
   - use: { baseURL: 'http://127.0.0.1:3000', trace: 'on-first-retry',
            screenshot: 'only-on-failure' }
   - webServer: { command: 'npm run build && npm start', url, reuseExistingServer: !process.env.CI }
   - Supabase env'i local disposable stack'e yönlendir (127.0.0.1:54321)
   - globalSetup: './e2e/global-setup.ts'
   - Mobil viewport varsayılanı: 390x844 (spec'ler gerektiğinde override eder)
3. e2e/global-setup.ts:
   - pg ile SUPABASE_DB_URL'e bağlan, supabase/tests/functional/_fixtures.sql'i ÇALIŞTIR.
     Rolleri yeniden tanımlama — TEK fixture kaynağı kalsın.
   - Fixture'ın oluşturduğu kullanıcılara bilinen bir parola set et (Supabase admin API veya
     doğrudan auth.users update; fixture helper'ları ne sunuyorsa onu kullan).
   - Her rol için (owner, editor, viewer) gerçek /login formundan bir kez giriş yap,
     storageState'i e2e/.auth/<role>.json'a kaydet. .gitignore'a e2e/.auth/ ekle.
   - Bir davet kodu üret ve invite spec'i için dosyaya/env'e aktar.
4. e2e/fixtures/ altına dış sağlayıcı stub payload'ları:
   mapbox directions + optimize yanıtı, google places autocomplete/search yanıtı,
   open-meteo forecast yanıtı. Gerçek şekle uygun MİNİMAL objeler yeterli.
5. Ortak bir test fixture'ı (e2e/fixtures/stub-providers.ts) yaz:
   page.route ile https://api.mapbox.com/**, https://maps.googleapis.com/**,
   https://api.open-meteo.com/** isteklerini fulfill etsin. Hermetik olsun, sıfır API maliyeti.
   Failure state'lerini test edebilmek için stub'ın hata döndürme modu da olsun.
6. package.json: "test:e2e": "playwright test"

KAPSAM DIŞI: spec yazmak (BETA-10), CI job'ı (BETA-11).

DOĞRULAMA:
- npm run typecheck
- npx playwright test --list  (0 test, hata yok — kurulum sağlıklı)
- Elle: supabase start; npx playwright test --list ile globalSetup'ın çalıştığını gör

KABUL:
- Rol başına storageState üretiliyor, rol matrisi _fixtures.sql'den geliyor (tek kaynak).
- Dış sağlayıcılar stub'lanabiliyor; test çalışırken gerçek API çağrısı yapılmıyor.
- e2e/.auth/ git'e girmiyor.
```

---

## BETA-10 — E2E spec'leri

### Hedef dosyalar (hepsi **yeni**, `e2e/` altında)

`auth.spec.ts` · `trip-create.spec.ts` · `plan-mutation.spec.ts` · `invite.spec.ts` · `role-gating.spec.ts` · `resilience.spec.ts` · `viewports.spec.ts`

### Kopyalanabilir prompt

```text
BETA-09 ile aynı oturumdaysan config ve globalSetup'ı yeniden okuma.

Bağlam Kartı kurallarını uygula. Yedi kritik akış spec'i yaz. Her spec stub-providers
fixture'ını kullansın; hiçbir test gerçek dış API çağırmasın.

SELECTOR KURALI: Mümkün olan her yerde getByRole / getByLabel / erişilebilir ad kullan.
CSS class veya inline style selector'ı KULLANMA — bu repoda stiller inline ve sık değişiyor.
Erişilebilir ad yoksa component'e data-testid ekle, ama önce accessible name eklenebilir mi bak
(a11y açısından da kazanç olur).

1. auth.spec.ts
   - sign-up -> dashboard'a iniyor
   - login -> dashboard
   - yanlış parola -> "Incorrect username/email or password" görünüyor
   - /login?error=auth_callback_failed -> mesaj görünüyor        [BETA-01 kilidi]
   - /login?error=<bilinmeyen> -> hiçbir mesaj görünmüyor        [BETA-01 kilidi]

2. trip-create.spec.ts
   - owner storageState; wizard ile trip oluştur -> /trip/<id>/mobile
   - beş sekme de render oluyor: overview, plan, explore, bookings, more
   - aktif sekme aria-current taşıyor

3. plan-mutation.spec.ts
   - editor storageState; Plan sekmesinde stop ekle
   - stop'u yeniden adlandır
   - reload sonrası her iki değişiklik de kalıcı
   - (sıralama drag'i kırılgansa atla; ekleme+yeniden adlandırma yeterli)

4. invite.spec.ts
   - geçerli kod ile /join/<code> -> trip'e editor olarak giriyor
   - geçersiz kod -> /dashboard'a düşüyor VE toast mesajı görünüyor   [BETA-01 kilidi]
   Bu, checklist satır 60'taki açık bug'ın regresyon kilidi.

5. role-gating.spec.ts
   - viewer storageState ile: Plan'da add/FAB yok, packing toggle yok, budget add yok,
     journal composer yok
   - editor storageState ile: aynı kontroller VAR (pozitif kontrol; testin gerçekten
     bir şey ölçtüğünü kanıtlar)
   NOT: viewer'ın doğrudan DB mutation'ı zaten supabase/tests/functional/trip_members.spec.sql
   tarafından kapsanıyor — Playwright'ta TEKRAR ETME.

6. resilience.spec.ts
   - Plan sekmesinde context.setOffline(true) -> "Route unavailable" + çalışan Retry
   - stub'ı hata moduna al -> route hatası empty state DEĞİL error state gösteriyor
   - weather stub'ı reddet -> "Weather unavailable"; horizon dışı -> "Forecast not available yet"
     (bu ikisi karışmamalı — UX-05 sözleşmesi)

7. viewports.spec.ts
   - [320, 375, 390, 430] x docs/mobile-regression-checklist.md §1'de listelenen route'lar
   - her kombinasyonda: document.documentElement.scrollWidth <= clientWidth
   - bir tane de emulateMedia({ reducedMotion: 'reduce' }) ile smoke assertion

DOĞRULAMA:
- npx playwright test  (supabase start çalışırken)
- Flaky test bırakma: her spec ardarda 3 kez geçmeli (npx playwright test --repeat-each=3)
- Kırılgan bir spec'i zorlamaktansa kapsamını daralt ve dokümanda manuel olarak işaretle.

KABUL:
- Yedi spec de yerelde tekrarlanabilir şekilde geçiyor.
- Hiçbir test gerçek dış API çağırmıyor.
- BETA-01'de düzeltilen davranışlar test tarafından kilitlendi.
```

---

## BETA-11 — CI entegrasyonu ve checklist güncellemesi *(faz kapısı)*

### Hedef dosyalar

- `.github/workflows/ci.yml`
- `docs/mobile-regression-checklist.md`

### Kopyalanabilir prompt

```text
Bağlam Kartı kurallarını uygula. E2E'yi CI'a bağla ve artık otomatikleşen manuel maddeleri kapat.

DAR OKUMA:
- .github/workflows/ci.yml içinde security-functional-tests job'ı (satır ~87-119) ve
  quality-gate job'ı (satır ~146-166).
- docs/mobile-regression-checklist.md tamamı (küçük, 30 madde).

UYGULAMA:
1. Yeni "e2e" job'ı — security-functional-tests job'ının Supabase adımlarını BİREBİR kopyala:
   checkout -> setup-node (cache: npm) -> npm ci -> supabase/setup-cli@v1 -> supabase start
   -> [yeni] npx playwright install --with-deps chromium
   -> npm run test:e2e (env: SUPABASE_DB_URL + local Supabase URL/anon key)
   -> if: always() supabase stop --no-backup
   timeout-minutes: 20 (build + browser indirme payı).
2. Başarısızlıkta trace/screenshot yüklemek için actions/upload-artifact@v4 adımı ekle
   (if: failure()). Teşhis için kritik.
3. quality-gate job'ının needs: dizisine "e2e" ekle VE echo bloğuna satırını ekle
   (echo bloğu unutulursa gate sessizce eksik raporlar).
4. docs/mobile-regression-checklist.md — SADECE artık otomatik olan maddeleri işaretle ve
   yanına hangi spec'in kapsadığını yaz. Dokümanın tamamını yeniden yazma.
   Otomatikleşenler:
   - §1 madde 1 (4 viewport x route'larda yatay scroll yok) -> viewports.spec.ts
   - §5 madde 2 ve 5 (route unavailable retry, RetryCard/RouteError retry) -> resilience.spec.ts
   - §6 error/empty maddeleri -> resilience.spec.ts
   - §6 satır 60 join flow açık bug'ı -> invite.spec.ts (ARTIK DÜZELDİ, notu güncelle)
   - §7 madde 1-4 ve 6 -> role-gating.spec.ts
   - §7 madde 5 -> supabase/tests/functional/trip_members.spec.sql (zaten kapsanıyordu)
   Manuel KALANLAR (işaretleme, "manuel" olarak etiketle):
   - §2 sanal klavye, §3 orientation, §8 screen reader spot check
   - §4 reduced-motion kısmen otomatik -> notunu düş

FAZ KAPISI (Faz 3 bitişi):
- npm run typecheck && npm run lint && npm test && npm run build
- npm run test:e2e yerelde yeşil
- CI'da tam pipeline yeşil (PR aç veya workflow_dispatch)
- GitHub'da quality-gate'i main için required status check yap (manuel, senin işin)

KABUL:
- CI'da e2e job'ı çalışıyor ve quality-gate'e dahil.
- Başarısızlıkta trace artifact'i yükleniyor.
- Checklist gerçekle çelişmiyor; 30 maddenin ~17'si otomatik olarak işaretli.
```

---

## BETA-12 — Şema gerçeği raporu ve baseline kararı

### Hedef dosyalar

- `docs/schema-truth-2026-08.md` — **yeni**
- `supabase/legacy-full-schema.sql` (yalnız başlık yorumu)

### Ön koşul

BETA-00 çıktıları (export edilmiş CSV'ler + PITR notu) hazır olmalı.

### Kopyalanabilir prompt

```text
Bağlam Kartı kurallarını uygula. BETA-00'ın ham çıktısını karara dönüştür.

GİRDİ: BETA-00'da export edilen schema-snapshot ve check-pending-migrations sonuçları
(kullanıcı paylaşacak) + PITR/retention notu.

UYGULAMA:
1. Yeni docs/schema-truth-2026-08.md — Türkçe, diğer docs dosyalarıyla uyumlu:
   - Tarih, project ref, kimin çalıştırdığı
   - Migration tablosu: her migration için applied / not-applied / belirsiz
     ("belirsiz" gerçek bir sonuç — check-pending-migrations.sql başlığı, bazı migration'ların
     bir sonraki ile aynı tablo/fonksiyonu paylaştığını ve TRUE'nun "zincirden en az biri
     çalıştı" demek olduğunu açıklıyor. Bunu olduğu gibi raporla, uydurma.)
   - Migration dosyalarıyla canlı şema arasındaki farklar
   - Backup/PITR gerçeği: retention penceresi, ölçülen RPO
   - VERİ YOK — yalnız bulgular, yapı ve sayılar. Satır içeriği veya kullanıcı verisi yazma.
2. Baseline kararı — SQUASH YAPMA. Gerekçeyi dokümana yaz:
   .github/workflows/ci.yml 32 migration'ın Postgres 17'de sıfırdan temiz uygulandığını
   kanıtlıyor. Bu zor kazanılmış bir özellik; kozmetik kazanç için riske atılmaz.
3. supabase/legacy-full-schema.sql başına yorum ekle: tarihsel referans, ASLA uygulanmamalı,
   tek gerçek kaynak supabase/migrations/. Dosya içeriğine dokunma.
4. 005_activities / 006_activity_order kararı:
   - Bunlar tamamen additive ve prod'da uygulanmamış ("dead schema-in-waiting"; 012 ve
     20260716005552 referanslarını to_regclass ile guard'lıyor).
   - ÖNERİ: prod'a uygula -> prod ile CI'ın sıfırdan şeması aynı noktada buluşur.
   - Alternatif (migration'ları silmek) CI'ın sıfırdan şemasını değiştirir ve fixture'ları
     gözden geçirmeyi zorunlu kılar — daha pahalı.
   - Bu bir PROD WRITE'ı. Uygulamadan ÖNCE kullanıcıdan açık onay al. Onay yoksa dokümanda
     "karar bekliyor" olarak bırak ve BETA-13'e geç.

DOĞRULAMA:
- Rapor ikinci bir kişi tarafından tekrar üretilebilir mi (script adları ve tarih yazılı mı)
- Dokümanda hiçbir gerçek kullanıcı verisi/secret yok

KABUL:
- Her migration için applied/not-applied/belirsiz kararı var.
- RPO/RTO gerçeği yazılı.
- Baseline kararı ve gerekçesi kayıtlı.
```

---

## BETA-13 — CLI link, ledger ve runbook

### Hedef dosyalar

- `docs/migration-runbook.md` — **yeni**
- `README.md` (migration bölümü)

### Kopyalanabilir prompt

```text
Bağlam Kartı kurallarını uygula. Elle SQL Editor akışını CLI + ledger'a taşı (RM-020).

Bu görevin CLI adımları KULLANICI tarafından çalıştırılır (DB parolası ve admin erişimi gerekir).
Sen runbook'u yaz ve komutları hazırla; sen çalıştırma.

DAR OKUMA: README.md'de yalnız migration bölümü (satır ~105-140).
docs/schema-truth-2026-08.md (BETA-12 çıktısı) — hangi migration'ların applied olduğu buradan gelir.

UYGULAMA:
1. Yeni docs/migration-runbook.md — Türkçe, adım adım:
   a) İlk kurulum: supabase link --project-ref <ref>
   b) Ledger senkronizasyonu: BETA-12'de applied denen HER migration için
      supabase migration repair --status applied <version>
      Uygulanmamışlar için repair ÇALIŞTIRILMAZ — bir sonraki push onları uygular.
      Komut listesini schema-truth dokümanından üretilebilir şekilde açıkla.
   c) Normal deploy akışı: migration yaz -> lokalde supabase start ile sıfırdan test et ->
      PR -> CI yeşil -> supabase db push
   d) Kurallar:
      - Uygulanmış bir migration ASLA düzenlenmez; yeni migration yazılır.
      - Expand-contract: önce ekle, kodu geçir, sonra kaldır. Tek migration'da
        breaking change yapma.
      - Rollback = app rollback + forward-fix migration. DB'yi geriye alma.
   e) Aylık drift kontrolü: supabase migration list --linked (lokalde, prod credential CI'a girmez)
   f) Acil durum: SQL Editor hâlâ kullanılabilir ama SONRASINDA mutlaka migration dosyası
      yazılıp migration repair ile ledger'a işlenmeli. Bu istisna yolu açıkça belgele.
2. README.md migration bölümünü yeni akışa göre güncelle; elle SQL Editor talimatını
   "yalnız acil durum, runbook'a bak" haline getir. README'nin başka bölümüne dokunma.

KAPSAM DIŞI: CI drift checksum (BETA-14), yeni migration yazmak.

KULLANICI TARAFINDAN ÇALIŞTIRILACAK (runbook'ta ayrı bölüm olarak işaretle):
- supabase link --project-ref <ref>
- supabase migration repair --status applied <version>  (liste ile)
- Doğrulama: supabase migration list --linked -> local ve remote sütunları eşleşmeli

KABUL:
- Runbook'u takip eden ikinci bir kişi deploy yapabilir.
- Ledger prod gerçeğiyle eşleşiyor.
- Acil durum yolu kapatılmamış ama ledger'a dönüş zorunlu kılınmış.
```

---

## BETA-14 — CI drift checksum ve restore tatbikatı *(faz kapısı)*

### Hedef dosyalar

- `.github/workflows/ci.yml`
- `supabase/schema.generated.sql` — **yeni**
- `package.json`
- `docs/migration-runbook.md` (restore bölümü)

### Kopyalanabilir prompt

```text
Bağlam Kartı kurallarını uygula. Şema drift'ini CI'da yakala ve restore yolunu bir kez kanıtla.

DAR OKUMA: .github/workflows/ci.yml içinde security-functional-tests job'ı.
docs/migration-runbook.md (BETA-13 çıktısı).

UYGULAMA:
1. package.json'a script:
   "db:snapshot": "supabase db dump --local --schema public,storage > supabase/schema.generated.sql"
2. Bir kez çalıştır, supabase/schema.generated.sql'i commit'le.
3. MEVCUT security-functional-tests job'ını genişlet — İKİNCİ BİR SUPABASE BOOT AÇMA
   (~2 dakikaya mal olur). supabase start'tan sonra, functional testlerden sonra:
   - aynı dump'ı al
   - normalize et (timestamp/sürüm satırları gibi gürültüyü ele; hangi satırların
     elendiğini yorumla)
   - commit'li supabase/schema.generated.sql ile diff'le
   - fark varsa job'ı kırıp diff'i yazdır ve "npm run db:snapshot çalıştırıp commit'le" de
   Bu, uygulanmış bir migration'ın düzenlenmesini veya snapshot'ın unutulmasını yakalar.
4. Prod credential'ını CI'a KOYMA. Canlı karşılaştırma aylık ve lokal
   (supabase migration list --linked) — bu zaten runbook'ta.
5. docs/migration-runbook.md'ye restore tatbikatı bölümü ekle:
   a) supabase db dump --linked   (read-only, prod write erişimi gerektirmez)
   b) lokal supabase start stack'ine restore et
   c) restore edilmiş stack'e karşı: npm run test:security-functional && npm run test:e2e
   d) duvar saati RTO'yu ve backup'ın RPO'sunu (BETA-12'den) yaz
   e) üç ayda bir tekrarla; her tatbikatın tarihini ve süresini tabloya işle

KULLANICI TARAFINDAN ÇALIŞTIRILACAK: ilk restore tatbikatı (adım 5a-5d) ve ölçülen
RTO/RPO'nun runbook'a yazılması.

FAZ KAPISI (Faz 4 ve beta hazırlığı bitişi):
- npm run typecheck && npm run lint && npm test && npm run build && npm run test:e2e
- CI'da tam pipeline yeşil, drift diff'i temiz
- Bir migration'ı kasten düzenle -> CI kırılıyor mu doğrula -> geri al
- Restore tatbikatı tamamlanmış ve RTO/RPO yazılı

KABUL:
- Sıfırdan şema ile commit'li snapshot her PR'da karşılaştırılıyor.
- Bir restore tatbikatı ölçülmüş süreyle belgelenmiş.
- Beta çıkış kriterleri (aşağıdaki tablo) karşılanıyor.
```

---

## Senin yapman gereken manuel işler

| # | Nerede | Ne | Bloklar |
|---|---|---|---|
| 1 | Supabase SQL Editor (read-only) | `schema-snapshot.sql` + `check-pending-migrations.sql` çalıştır, export et | BETA-12 — **1. gün başlat** |
| 2 | Supabase → Auth → Providers | Google provider yapılandırılmış mı? | BETA-02 (A/B yolu) |
| 3 | Supabase → Settings → Database | PITR/backup retention'ı not al | BETA-12 |
| 4 | Supabase SQL Editor (tek write) | `005_activities` + `006_activity_order` uygula — **önce onay** | BETA-12 |
| 5 | Supabase CLI (DB parolası, admin) | `supabase link` + `migration repair` | BETA-13 |
| 6 | Vercel | Production'da `NEXT_PUBLIC_ENABLE_GUEST_LOGIN` yok/false doğrula | BETA-02 kapısı |
| 7 | Vercel | Sentry yolu seçilirse `SENTRY_DSN` ekle | BETA-08 |
| 8 | GitHub | `quality-gate`'i `main` için required status check yap | BETA-11 |
| 9 | Lokal terminal | İlk restore tatbikatı, RTO ölçümü | BETA-14 |

---

## Beta çıkış kriterleri

Hepsi karşılandığında kapı açılabilir:

- [ ] Login sayfasında çalışmayan CTA yok; her redirect hatası kullanıcıya mesaj veriyor
- [ ] Prod'da `/api/auth/guest` 404 dönüyor
- [ ] Security header'ları canlıda mevcut; kritik akışlarda CSP violation yok
- [ ] Bir production hatası tek `x-request-id` ile client → route → Supabase izlenebiliyor
- [ ] Log satırlarında PII/secret yok (test ile korunuyor)
- [ ] Root seviyesi client crash'i raporlanıyor (`app/global-error.tsx`)
- [ ] `npm run test:e2e` CI'da yeşil ve `quality-gate` required check
- [ ] Her migration için applied/not-applied kararı var; ledger prod ile eşleşiyor
- [ ] Bir restore tatbikatı ölçülmüş RTO/RPO ile belgelenmiş
- [ ] Temiz bir makinede `.env.example` ile kurulum çalışıyor

---

## Bu turda **yapılmayacaklar**

- **RM-021 (pagination + indeksleme)** — roadmap bunu RM-013 telemetrisine ve production-benzeri veri hacmine bağlıyor (`docs/project-analysis-roadmap.md:795`). Private beta'da onlarca trip olacak; tek bir p95 ölçümü olmadan optimize etmek tahmin yürütmektir. Ayrıca keyset pagination mevcut realtime full-refetch modeliyle kötü etkileşiyor. **Beta trafiği ölçüldükten sonra ilk sıradaki iş bu.**
- **RM-022 (domain data contract pilotu)** — `TripMobileClient`/`trip-realtime` refactor'ı repodaki en yüksek blast-radius değişikliği (`docs/project-analysis-roadmap.md:601`). BETA-10'un kurduğu E2E ağı gerçek kullanımda oturmadan yapılmaz.
- **RM-023 (account recovery)** — önemli, ama sentetik e-posta modeli (`username@accounts.tripper.app`) parola kurtarmayı koda değil ürün kararına bağlıyor. Bilinen kullanıcı listesi olan bir private beta için runbook'ta bir paragraflık manuel admin reset prosedürü yeterli.
- **RM-030/031/032** (dinamik realtime, offline v2, background job'lar) — orta vade, hacim tetikli.
- **Aşama 14 — AI Trip Copilot** — launch-readiness turunun ortasında yeni feature yüzeyi açmak, üstelik bugün hiç error tracking'i olmayan bir kod tabanına LLM vendor'ı, maliyet yüzeyi ve prompt-injection tehdit modeli eklemek demek. BETA-05/08 oturduktan sonra çok daha ucuz ve güvenli — `lib/rate-limit/` altyapısı zaten hazır bekliyor. **Beta'dan sonraki ilk ürün fazı.**
- **Nonce tabanlı CSP, log drain, uptime SLO, load test** — private beta için over-engineering. Report-Only CSP + opsiyonel Sentry + CI gate doğru tavan.
- **TD-016 / TD-017 / TD-018** (resumable deletion saga, activity cleanup batching, offline conflict matrisi) — gerçek borç, ama hiçbiri 20 bilinen kişiyi kapıdan içeri almayı engellemiyor.

---

## Token bütçesi kontrol listesi

Her görev sonunda "evet" denebilmeli:

- Büyük dosyada yalnız hedef sembol çevresi mi okundu?
- Aynı docs dosyaları tekrar okunmadı mı?
- Repo genelinde gereksiz arama yapılmadı mı?
- Yalnız hedef dosyalar mı değişti?
- Full test/build yalnız faz kapısında mı çalıştırıldı?
- Sonraki göreve handoff, dosyanın tamamı yerine git diff üzerinden verilebilir mi?
