# Tripper — Onboarding Design Brief

> **GEÇERSİZ (2026-07-23).** Bu brief'teki Splash → 4 kart carousel → Landing yapısı kaldırıldı.
> Güncel akış tek kesintisiz "Dusk Journey" sahnesidir: [onboarding-dusk-journey-prompts.md](onboarding-dusk-journey-prompts.md).
> Bu dosya yalnızca tarihsel referans olarak duruyor.

Mobil-öncelikli (375×812), tam ekran karanlık bir giriş akışı. Amaç: kullanıcıyı 15 saniyede yola çıkmaya hazır hissettiren, premium ve sinematik bir onboarding. Akış üç aşama: **Splash → Onboarding (4 slayt) → Landing**.

---

## Sanat Yönü (tüm ekranlarda ortak)

- **Malzeme:** Liquid Glass — buzlu cam kartlar (blur, ince ışıklı kenar), derinlik hissi.
- **Palet:** Dusk / gece gökyüzü. Arka plan koyu lacivert→teal degrade (neredeyse siyah). Tek vurgu rengi **amber/altın** (butonlar, aktif nokta, rota pinleri, ikon). Metinler beyaz → soluk lavanta gri.
- **Atmosfer:** Arka planda yumuşak, bulanık **ışık küreleri (orb)** — bir amber, bir mor, bir teal. Yavaşça süzülürler; ekrana canlı, "nefes alan" bir his verir.
- **Tipografi:** Modern grotesk (Inter), sıkı harf aralığı. Başlıklar kalın (800), gövde ince ve rahat okunur.
- **Genel his:** Sakin, lüks, sinematik. Kalabalık değil — bol boşluk, tek odak.
- **İkonografi:** İnce çizgili (line) ikonlar. Emoji **yok** — yerine özel çizilmiş, minimal illüstrasyon sahneleri.
- **Alt bar:** Ekran altında ince "home indicator" çubuğu (iOS hissi).

---

## Ekran 1 — Splash

- Ortada uygulama ikonu: amber degrade, yuvarlak köşeli kare, içinde beyaz konum pini; etrafında yumuşak amber glow.
- Altında **"Tripper"** wordmark (büyük, kalın) ve ince alt metin **"Road trip planner"**.
- Arka planda süzülen orb'lar.
- **Hareket hissi:** İkon yumuşak bir "pop" (hafif zıpla-yerleş) ile belirir; hemen ardından wordmark ve alt metin aşağıdan yukarı kademeli süzülür. İsteğe bağlı: ikonun etrafında tek seferlik genişleyen ışık halkası. ~1.5 sn sonra onboarding'e yumuşak geçer.

---

## Ekran 2 — Onboarding (4 slaytlık carousel)

Ortak düzen: üstte sağda **"Skip"**, ortada büyük **cam illüstrasyon kartı** (nokta-grid dokulu), altında **başlık + kısa açıklama**, en altta **ilerleme noktaları** ve amber **"Continue →"** butonu. Slaytlar arası kaydırma (swipe) veya butonla ilerlenir. İçerik kademeli girer: önce illüstrasyon, sonra başlık, sonra açıklama.

**İlerleme göstergesi:** Yatay noktalar; aktif olan amber ve uzamış hap şekli, glow'lu.

### Slayt 1 — "Draw your route"
Açıklama: *"Set your route, add stops, and get ready for your adventure."*
İllüstrasyon: Cam kart içinde minimal harita hissi. Kesikli bir rota çizgisi başlangıç → orta → bitiş pinleri arasında **kendini çizerek** belirir. Pinler sırayla yukarıdan düşer; başlangıç ve bitiş pinleri hafifçe nabız atar.

### Slayt 2 — "Plan every stop"
Açıklama: *"Organize lodging, activities, and photos for each stop."*
İllüstrasyon: Üç mini "durak kartı" üst üste, hafif kaydırılmış istifte; sırayla aşağıdan kayarak gelir. Her kartta küçük bir ikon (yatak / aktivite / fotoğraf). En öndeki kart hafif amber glow.

### Slayt 3 — "Plan with friends"
Açıklama: *"Share an invite code and edit together in real time."*
İllüstrasyon: 2–3 yuvarlak avatar "pop" ile belirir, aralarında ince bir bağlantı çizgisi çizilir. Cam yüzeyde küçük bir imleç dolaşarak "birlikte, canlı düzenleme" hissi verir.

### Slayt 4 — "Allow your location" (izin slaytı)
Açıklama: *"We need your location to find nearby places and build your route."*
İllüstrasyon: Merkezde konum pini; etrafında dışa doğru genişleyip solan **radar dalgaları**.
Bu slaytta buton düzeni değişir: birincil amber **"📍 Allow Location"**, altında sessiz **"Not now"** bağlantısı.

---

## Ekran 3 — Landing

- Ortada uygulama ikonu + **"Tripper"** başlığı + alt metin **"Plan road trips together"**.
- Altında dört küçük cam "özellik hapı": **Map · Collaborate · Budget · Stops** (her birinde ince ikon). Kademeli olarak belirirler.
- Alt blokta butonlar:
  - Birincil amber **"Log In"**
  - Cam **"Sign Up"**
  - Cam **"Continue with Google"** (Google logolu)
- **Hareket hissi:** Hero (ikon + başlık) aşağıdan yumuşak süzülür; haplar kademeli pop-in; birincil butonda hafif ışık parlaması (shimmer/glow).

---

## Etkileşim & Durumlar
- **Butonlar:** Dokununca hafif küçülür + soluklaşır (tap feedback).
- **Loading:** Google butonu "Signing in..." durumunda soluk + devre dışı.
- **Swipe:** Onboarding slaytları sola/sağa kaydırılabilir; buton navigasyonuyla eşdeğer.
- **Reduced motion:** Kullanıcı hareket azaltma tercih ederse — süzülen orb'lar, loop'lar ve kademeli girişler durur; içerik anında ve sade görünür. Swipe/tap çalışmaya devam eder.

## Teslim edilecek tasarımlar
Splash · Onboarding'in 4 slaytı (illüstrasyonlar dahil) · Landing — hepsi 375×812 karanlık modda, tutarlı Liquid Glass dilinde.
