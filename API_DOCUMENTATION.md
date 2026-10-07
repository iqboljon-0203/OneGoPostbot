# 📘 OnegoPost Backend & Bot — API Dokumentatsiyasi

Ushbu hujjat OnegoPost Telegram Support Bot va uning Decoupled Backend REST API servisi uchun to'liq texnik qo'llanma hisoblanadi.

---

## 🌐 1. Umumiy Ma'lumot va Arxitektura

Tizim ikki mustaqil qismdan iborat:
1. **Telegram Support Bot:** Mijozlar bilan muloqot qiluvchi avtomatlashtirilgan interfeys (Telegraf polling/webhook).
2. **REST API & Smart Web Bridge Server:** Port `3000` da ishlovchi mustaqil Express backend. Kelajakda OnegoPost mobil ilovasi (iOS/Android) yoki veb-sayti to'g'ridan-to'g'ri ushbu API bilan ishlay oladi.

* **Base URL (Lokal):** `http://localhost:3000`
* **Base URL (Production):** `https://bot.onegopost.uz` (yoki sozlangan domen)
* **Format:** `application/json`

---

## 📡 2. REST API Endpointlar Ro'yxati

### 2.1. Server salomatligi (Health Check)
Tizim va servislar holatini tekshirish uchun.

* **Method:** `GET`
* **URL:** `/health`
* **Response (200 OK):**
```json
{
  "status": "ok",
  "service": "onegopost-bot",
  "version": "2.0.0",
  "timestamp": "2026-10-07T08:21:53.030Z",
  "uptime": 143.08
}
```

---

### 2.2. Posilka holatini tekshirish (Tracking API)
AWB trek-kod orqali posilkaning real vaqt rejimidagi joylashuvi, xronologiyasi va rasmiy holatini olish.

* **Method:** `GET`
* **URL:** `/api/v1/tracking/:awb?lang=uz|ru`
* **Parametrlar:**
  * `awb` (Path): Posilka trek-kodi (masalan, `773437914450735`)
  * `lang` (Query, ixtiyoriy): `uz` yoki `ru` (default: `uz`)
* **Response (200 OK):**
```json
{
  "success": true,
  "awb": "773437914450735",
  "lang": "uz",
  "currentLocation": "Posilka OneGo ombori tomonidan qabul qilindi",
  "currentTime": "2026-09-09 13:24:15",
  "totalCheckpoints": 10,
  "history": [
    {
      "Time": "2026-09-09 13:24:15",
      "Content": "Posilka OneGo ombori tomonidan qabul qilindi"
    }
  ]
}
```
* **Xatolik (404 Not Found):**
```json
{
  "success": false,
  "error": "Package not found",
  "awb": "NOT_FOUND_CODE"
}
```

---

### 2.3. Yangi Ticket yaratish (Create Ticket)
Mijoz muammosi bo'yicha yangi ticket yaratish.

* **Method:** `POST`
* **URL:** `/api/v1/tickets`
* **Request Body:**
```json
{
  "telegram_id": 987654321,
  "awb": "773437914450735",
  "issue_type": "Delay",
  "description": "Buyurtmam 10 kundan beri tranzit omborda turibdi",
  "user_name": "Aziz Karimov"
}
```
* **Ruxsat etilgan `issue_type` qiymatlari:**
  * `Tracking` — Trek-kod topilmadi
  * `Delay` — Buyurtma kechikdi
  * `Payment` — To'lov / balans muammosi
  * `Weight` — Vazn bo'yicha e'tiroz
  * `Warehouse` — Ombor / Mijoz ID muammosi
  * `OperatorHelp` — Umumiy operator yordami
* **Response (201 Created):**
```json
{
  "success": true,
  "ticket": {
    "ticket_number": "#OP-8VS6F",
    "telegram_id": 987654321,
    "awb": "773437914450735",
    "issue_type": "Delay",
    "description": "Buyurtmam 10 kundan beri tranzit omborda turibdi",
    "status": "new",
    "created_at": "2026-10-07 08:53:15",
    "updated_at": "2026-10-07 08:53:15"
  },
  "deepLink": "https://www.onegopost.com/support/chat?order_id=773437914450735&issue=Delay&ticket_id=%23OP-8VS6F&tg_id=987654321&user_name=Aziz+Karimov"
}
```

---

### 2.4. Ticket holatini olish (Get Ticket)
Ticket raqami bo'yicha joriy holatni tekshirish.

* **Method:** `GET`
* **URL:** `/api/v1/tickets/:ticketId`
* **Parametr:** `ticketId` (masalan, `OP-8VS6F` yoki `#OP-8VS6F`)
* **Response (200 OK):**
```json
{
  "success": true,
  "ticket": {
    "ticket_number": "#OP-8VS6F",
    "telegram_id": 987654321,
    "awb": "773437914450735",
    "issue_type": "Delay",
    "description": "Buyurtmam 10 kundan beri tranzit omborda turibdi",
    "status": "in_review",
    "created_at": "2026-10-07 08:53:15",
    "updated_at": "2026-10-07 09:10:00"
  }
}
```

---

### 2.5. Tizim Analitikasi (Analytics Stats)
Bot va xizmatlar bo'yicha umumiy statistik ma'lumotlar.

* **Method:** `GET`
* **URL:** `/api/v1/analytics/stats`
* **Response (200 OK):**
```json
{
  "success": true,
  "totalUsers": 125,
  "totalTickets": 48,
  "ticketsByStatus": {
    "new": 12,
    "in_review": 15,
    "transferred": 5,
    "resolved": 16
  },
  "ticketsByCategory": {
    "Delay": 20,
    "Payment": 14,
    "Tracking": 8,
    "Weight": 6
  },
  "popularFaqTopics": [
    { "topic": "faq_track", "count": 85 },
    { "topic": "faq_time", "count": 62 }
  ],
  "recentEvents": [
    {
      "id": 210,
      "telegram_id": 987654321,
      "event_type": "deeplink_clicked",
      "metadata": "{\"orderId\":\"773437914450735\",\"issue\":\"Delay\"}",
      "created_at": "2026-10-07 08:55:00"
    }
  ]
}
```

---

## 📲 3. Deep Link & Universal Link Texnik Xususiyati

Mijoz Telegram'dan OnegoPost mobil ilovasiga yo'naltirilganda quyidagi havola generatsiya qilinadi:

```http
https://onegopost.uz/support/chat?order_id=458211&issue=Delay&ticket_id=%23OP-24851&tg_id=987654321&user_name=Aziz
```

### Parametrlar jadvali:

| Parametr | Turi | Tavsif | Misol |
| :--- | :--- | :--- | :--- |
| `order_id` | string | Posilka AWB kodi yoki mijoz buyurtma raqami | `458211` yoki `773437914450735` |
| `issue` | string | Muammo turi / mavzusi | `Delay`, `Payment`, `Weight`, `Warehouse` |
| `ticket_id` | string | Tizimdagi yagona ticket raqami | `#OP-24851` |
| `tg_id` | number | Mijozning Telegram unikal ID raqami | `987654321` |
| `user_name` | string | Mijozning Telegramdagi ismi | `Aziz Karimov` |

### Mobil dasturchilar (iOS / Android) uchun vazifa:
1. **Universal Link / App Link sozlash:**
   - Domen: `onegopost.uz` (yoki sozlangan domen)
   - Path: `/support/chat`
   - Custom Scheme muqobili: `onegopost://help/chat`
2. **Parametrlarni o'qish:**
   - Ilova ochilganda `order_id`, `issue`, `ticket_id`, `user_name` parametrlari o'qiladi.
   - Operator bilan chat ekranida avtomatik context card yaratiladi (operator mijozdan nima bo'lganini qayta so'ramaydi).

---

## 🗄️ 4. SQLite Ma'lumotlar Bazasi Strukturasi

Ma'lumotlar bazasi: `database.sqlite` (WAL rejimida, yuqori tezlikda ishlaydi).

### 1. `users` jadvali
Foydalanuvchilar profili va tanlangan til.
* `telegram_id` (INTEGER, PRIMARY KEY)
* `username` (TEXT)
* `first_name` (TEXT)
* `lang` (TEXT, 'uz' | 'ru')
* `created_at` (TEXT)
* `updated_at` (TEXT)

### 2. `tickets` jadvali
Murojaatlar va ularning 4 ta rasmiy holati.
* `ticket_number` (TEXT, PRIMARY KEY, `#OP-XXXXX`)
* `telegram_id` (INTEGER, FOREIGN KEY -> users)
* `awb` (TEXT, posilka kodi)
* `issue_type` (TEXT, mavzu)
* `description` (TEXT, tafsilotlar)
* `status` (TEXT, CHECK: `'new'`, `'in_review'`, `'transferred'`, `'resolved'`)
* `created_at` (TEXT)
* `updated_at` (TEXT)

### 3. `analytics_events` jadvali
Foydalanuvchilar harakatlari logi.
* `id` (INTEGER, PRIMARY KEY AUTOINCREMENT)
* `telegram_id` (INTEGER)
* `event_type` (TEXT)
* `metadata` (TEXT, JSON)
* `created_at` (TEXT)

---

## 🔐 5. Tashqi OnegoPost API Integratsiyasi

Bot OnegoPost rasmiy Swagger API'si (`https://vop.onegopost.com`) bilan bevosita ishlaydi:
* `GET /api/t_Package/{awb}` — Posilka haqida batafsil ma'lumot (og'irlik, tovar, status).
* `GET /api/t_Package/Tracking/{awb}?targetLanguageCode=UZ|RU` — Jonli xronologiya va tarjima qilingan lokatsiyalar.
* `PUT /api/t_Message/userMessage/{fkId}?TYPE={type}&topic={topic}` — Operator tizimiga xabar yuborish.
* **Autentifikatsiya:** `Authorization: Bearer <JWT_TOKEN>` (token `.env` orqali beriladi).
