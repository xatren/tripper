# Tripper Teknik Yol Haritası Uygulama Promptları

Bu dosya, `docs/project-analysis-roadmap.md` içindeki Aşama 0–4 geliştirmelerini ayrı görevler olarak uygulatmak için hazırlanmıştır. Promptlar önerilen sırayla verilmiştir.

Her prompt için genel kural: Önce `AGENTS.md`, `README.md` ve `docs/project-analysis-roadmap.md` dosyalarını oku. Çalışma ağacındaki mevcut değişiklikleri kullanıcıya ait kabul et; üzerine yazma veya geri alma. İlgili kodu ve testleri incelemeden çözüm üretme. Gereksiz yeniden yazım ve teknoloji değişikliğinden kaçın. Değişiklikleri uygun testlerle doğrula ve sonunda değişen dosyaları, test sonuçlarını, riskleri ve kalan işleri özetle.

## Aşama 0 — Acil Riskler

### RM-000 — Secret olay müdahalesi

```text
Projede Git tarafından izlenen TestLogin.md dosyasındaki düz metin kimlik bilgisi için güvenli olay müdahalesi yap. Hassas değeri hiçbir çıktıda tekrar etme. Önce mevcut Git durumunu ve dosyanın geçmişini incele. Kod deposunda yapılabilecek güvenli temizliği, secret scanning kontrolünü ve SECURITY.md güncellemesini hazırla. Harici hesap parolası değiştirme, oturum iptali veya Git geçmişini yeniden yazma gibi geri dönüşü zor işlemleri açık kullanıcı onayı olmadan yapma; bunlar için net ve sıralı bir uygulama planı sun. Sonuçta eski secret’ın depoda ve geçmişte nasıl doğrulanacağını belirt.
```

### RM-001 — Settlement ve finans invariant’ları

```text
Settlement ve expense veri bütünlüğü açıklarını düzelt. record_settlement_payment ve ilgili RPC’lerde çağıranın aktif gezi üyesi olduğunu, ödeme taraflarının aynı geziye ait olduğunu ve tutarın geçerli borç sınırları içinde kaldığını doğrula. Negatif giderleri veritabanı seviyesinde engelle; SECURITY DEFINER fonksiyonlarında güvenli search_path ve tam nitelikli nesneler kullan. Mevcut migration’ları değiştirmek yerine ileri migration oluştur. Owner, editor, viewer, outsider, revoked ve cross-trip senaryolarını işlevsel SQL testleriyle doğrula.
```

### RM-002 — Güvenli davet token’ı ve abuse koruması

```text
Gezi davet sistemini kaba kuvvet saldırılarına karşı güçlendir. En az 128 bit kriptografik entropiye sahip davet token’ı tasarla, rotation sonrası eski kodu geçersiz kıl ve join denemeleri için kullanıcı/IP tabanlı, yatay ölçekte tutarlı rate limiting ile güvenlik audit kaydı ekle. Mevcut davet linkleri için güvenli geçiş stratejisi oluştur. Başarılı katılım rolünü mevcut ürün davranışıyla uyumlu tut. Entropi, rotation, limit aşımı, outsider ve eşzamanlı deneme testlerini ekle.
```

### RM-003 — Canlı şema gerçeğini çıkarma

```text
Depodaki migration’larla canlı Supabase şeması arasındaki farkı güvenli ve salt okunur biçimde belirleyecek bir şema denetim akışı hazırla. Tablo ve kolonların yanında policy, grant, function body/signature, trigger, constraint, index, extension ve Storage bucket durumunu da kapsa. scripts/check-pending-migrations.sql dosyasını yanıltıcı olmayacak şekilde geliştir ve tekrar üretilebilir bir schema snapshot/diff prosedürü belgele. Canlı sisteme migration veya veri değişikliği uygulama; erişim yoksa çalıştırılacak komutları ve beklenen çıktıyı hazırla.
```

## Aşama 1 — İlk İki Haftalık Sprint

### RM-010 — Yeşil ve zorunlu CI

```text
Proje için temiz ve zorunlu bir CI kalite kapısı kur. Temiz npm ci, secret scan, lint, TypeScript no-emit kontrolü, tüm testler ve production build adımlarını ekle. Mevcut iki kırık testi kök nedenine göre düzelt: erişilebilirlik testini dosya metnine bağımlı olmaktan çıkar ve service-worker/offline cache sürümünü tek contract altında tut. CI çıktıları anlaşılır olsun, cache kullanımı güvenli olsun ve başarısız kalite adımı merge’i engelleyebilsin. Yerelde mümkün olan tüm adımları doğrula.
```

### RM-011 — İşlevsel Supabase güvenlik testleri

```text
Disposable bir Supabase/Postgres ortamında çalışacak işlevsel güvenlik test altyapısı oluştur. Migration’ları sıfırdan uygula ve owner, editor, viewer, outsider ve revoked kullanıcı fixture’larıyla RLS, SECURITY DEFINER RPC ve private Storage davranışlarını test et. Öncelikle settlement, invite, expense, trip member ve hassas dosya erişimini kapsa. Testler canlı veritabanına yazmamalı, transaction veya disposable ortam ile izole olmalı ve CI içinde otomatik çalışabilmeli.
```

### RM-012 — Signup ve Places abuse limiti

```text
Signup ve Google Places uçları için yatay ölçekte çalışan ortak abuse/rate-limit katmanı geliştir. Güvenilir proxy/IP bilgisini kullan, authenticated kullanıcılarda user-first kota uygula, instance-local belleğe bağımlılığı kaldır ve stabil 429 hata modeli oluştur. Signup parola politikasını Supabase ayarlarıyla uyumlu hâle getir; kullanıcı adı enumeration kararını güvenlik ve UX açısından ele al. Shadow mode, ölçüm ve alarm ekleyerek NAT kullanıcılarını yanlış engelleme riskini azalt. Çok instance ve spoofed-header testleri yaz.
```

### RM-013 — Minimum operasyon ve gözlemlenebilirlik

```text
Uygulamaya minimum üretim gözlemlenebilirlik katmanı ekle. İstekler için correlation ID, deploy commit bilgisi, stabil hata kodları, route/RPC/provider süreleri ve client/server error tracking oluştur. PII, token, parola veya provider secret’larını loglama. Signup/join abuse, 5xx, provider timeout/429, Supabase sorgu hatası ve account deletion kısmi hatası için temel metrik ve alarm noktaları tanımla. Sentetik hata üreterek log–metrik–alarm zincirini doğrula.
```

### RM-014 — Config ve güvenlik baseline’ı

```text
Ortam yapılandırması ve web güvenlik baseline’ını düzelt. .env.example, README ve gerçek kod kullanımını aynı contract altında güncelle; public ve server-only değişkenleri açıkça ayır ve startup sırasında eksik env’leri secret sızdırmadan doğrula. Google OAuth ve hesap kurtarma dokümantasyonunu gerçek davranışla uyumlu hâle getir. Üretim header’larını incele; CSP’yi önce Report-Only olarak Mapbox, Google ve Supabase akışlarını bozmayacak şekilde ekle. HSTS, Referrer-Policy ve Permissions-Policy kontrollerini test et.
```

## Aşama 2 — Kısa Vade

### RM-020 — Migration pipeline ve restore tatbikatı

```text
Supabase migration sürecini tekrar üretilebilir ve güvenli bir pipeline’a dönüştür. Tek baseline ve migration ledger yaklaşımını belirle; disposable/preview ortamında sıfırdan kurulum, upgrade ve schema drift checksum kontrollerini CI’a ekle. Production migration’larında expand–backfill–contract yaklaşımı, onay kapısı ve forward-fix/rollback runbook’ı oluştur. Backup/PITR ayarlarını doğrula ve gerçek veriye zarar vermeyen bir restore tatbikatını belgele. Canlı migration çalıştırmadan önce açık kullanıcı onayı al.
```

### RM-021 — Ölçümlü pagination ve indeksleme

```text
Dashboard, trips ve gezi domain’lerindeki sınırsız sorguları ölç ve en yüksek maliyetli listelere keyset pagination ekle. Önce query süresi, satır sayısı, payload ve EXPLAIN çıktısıyla baseline oluştur; ardından trips, comments, journal, expenses ve reservations akışlarını önceliklendir. trip_members(user_id, trip_id), stops ve expenses gibi indeks adaylarını yalnız ölçüm doğruluyorsa ileri migration ile ekle. Realtime güncellemeleri ile sayfalama tutarlılığını büyük fixture ve E2E testleriyle doğrula.
```

### RM-022 — Domain data contract pilotu

```text
Budget veya Bookings domain’lerinden birini pilot seçerek UI, sorgu, command/use-case, optimistic state ve realtime sorumluluklarını küçük ve tipli katmanlara ayır. Yeni bir global state kütüphanesi ekleme ve tüm domain’leri aynı anda refactor etme. Mevcut davranışı koruyan adapter kullan; hata modelini ve pagination/cache key contract’ını merkezileştir. Pilotun test edilebilirlik, dosya karmaşıklığı ve değişiklik maliyeti üzerindeki etkisini ölç; olumluysa diğer domain’lere uygulanacak kısa bir rehber yaz.
```

### RM-023 — Account recovery ve deletion dayanıklılığı

```text
Kullanıcı adı ve sentetik e-posta modeline uygun güvenli hesap kurtarma akışı tasarla ve uygula. Hesap sahipliği kanıtı, re-authentication, session revoke ve enumeration risklerini ele al. Account deletion işlemini tekrar çağrıldığında güvenli çalışan, kısmi Storage/DB/Auth hatalarından devam edebilen ve audit edilen bir sürece dönüştür veya güvenilir recovery job/runbook oluştur. Lost-password, kısmi silme, retry ve hesap değiştirme senaryolarını E2E test et.
```

## Aşama 3 — Orta Vade

### RM-030 — Dinamik Realtime ve tutarlılık modeli

```text
Merkezi Realtime provider’ı yalnız aktif domain tablolarına refcount ile abone olacak şekilde geliştir. Event delta’larını küçük reducer’larla uygula; event gap, reconnect veya yetki değişiminde sayfalı canonical resync çalıştır. Membership revoke penceresini ve private channel güvenliğini koru. Eski tüm-tablo abonelik modunu geçici feature flag/fallback olarak tut. Çok istemcili reconnect, event sırası ve yük testleriyle veri kaybı veya kalıcı tutarsızlık olmadığını doğrula.
```

### RM-031 — Offline v2 contract’ı

```text
Offline veri katmanı için tek schema/cache sürüm kaynağı oluştur. Her offline entity/action için idempotency, base-version ve conflict politikasını tanımla; snapshot expiry, medya bütçesi ve eski cache temizliğini ekle. Logout ve hesap değişiminde private verinin tamamen silindiğini koru. Eski snapshot’lar için versioned migration veya açık kullanıcı mesajı kullan. Offline/online yarışları, conflict, retry, schema upgrade ve privacy senaryolarını E2E test et.
```

### RM-032 — Arka plan işlerini ayırma

```text
Kullanıcı transaction’ında çalışan uzun veya tekrar denenebilir işleri arka plan işlerine ayır. Öncelikle trip_activity retention temizliğini batch scheduled job’a, account deletion/Storage cleanup sürecini idempotent ve gözlemlenebilir bir job’a taşı. Retry, backoff, dead-letter veya manuel müdahale durumu ve alarm tanımla. Yeni altyapıyı yalnız bu kanıtlı iki kullanım alanıyla sınırla. Failure injection ve aynı işi tekrar çalıştırma testleriyle veri bütünlüğünü doğrula.
```

## Aşama 4 — Uzun Vade

### RM-040 — Ölçüme bağlı platformlaşma

```text
En az 3–6 aylık trafik, maliyet, latency, Realtime ve veri büyüklüğü metriklerini inceleyerek platformlaşma ihtiyacını değerlendir. Postgres Changes sınırları ölçülmüşse Supabase Broadcast/outbox, provider quota abstraction, bölgesel latency/DR ve veri export seçenekleri için ADR hazırla. Her öneriyi mevcut sistemle maliyet, karmaşıklık, güvenlik ve geri dönüş açısından karşılaştır. Ölçülmüş bir eşik ve kanıtlanmış fayda yoksa uygulama yapma; microservice veya büyük yeniden yazım önermeme gerekçesini kaydet.
```

## Önerilen Uygulama Sırası

1. `RM-000`
2. `RM-003`
3. `RM-001`
4. `RM-002`
5. `RM-010`
6. `RM-011`
7. `RM-012`, `RM-013`, `RM-014`
8. `RM-020`
9. `RM-021`, `RM-023`
10. `RM-022`
11. `RM-030`, `RM-031`, `RM-032`
12. `RM-040` — yalnız ölçümler gerektiriyorsa

