# 📦 OnegoPost Telegram Support Bot & Decoupled Backend Service

Enterprise-darajadagi, TypeScript va Node.js asosida qurilgan **OnegoPost** xalqaro logistika/kargo xizmati uchun qo'llab-quvvatlash boti va mustaqil backend xizmatlari moduli.

---

## 🏛️ Arxitektura va Imkoniyatlar

Loyiha qat'iy ajratilgan (decoupled) arxitekturaga ega. Biznes-mantiq Telegram botiga bog'lanmagan, kelajakda mobil ilova (iOS/Android) yoki veb-portal bevosita barcha metodlardan foydalana oladi:

- **Mustaqil Xizmatlar (`src/services/`)**:
  - `package.service.ts`: AWB orqali posilkani kuzatish, holatlarini o'zbek/rus tillariga tarjima qilish.
  - `ticket.service.ts`: Xitoy logistika tizimiga (`https://vop.51jiyun.com`) operator murojaatini yuborish va xavfsiz mobil deep link generatsiya qilish.
- **Tashqi API Klient (`src/api/client.ts`)**:
  - Axios asosida, avtomatik eksponentsial qayta urinish (`axios-retry`), timeout nazorati va strukturaviy Pino logging.
- **Telegram Bot qatlami (`src/bot/`)**:
  - Telegraf + Scenes (Wizard/BaseScene) asosida bosqichma-bosqich muloqot.
  - To'liq 2 tilli (O'zbek va Rus) tizim (`uz.ts` va `ru.ts` 100% paritet).
  - Menyular: AWB qidiruv, Kechikish, To'lov/balans, Vazn masalasi, Ombor/ID, Interaktiv FAQ, Operatorga ulanish.
- **Universal Deep Link (`src/utils/deeplink.ts`)**:
  - Botda hal bo'lmagan masalalar bo'yicha mijozni OnegoPost mobil ilovasidagi kerakli chatga aniq kontekst bilan yo'naltirish.

---

## 📋 Mobil ilova jamoasi uchun Deep Link formati

Bot operatorga murojaat yaratganda quyidagi formatda Universal Link generatsiya qiladi:

```text
https://onegopost.uz/support/chat?order_id={AWB}&issue={Delay}&ticket_id={#OP-XXXXX}&tg_id={123456}&user_name={Akmal}
```

| Parametr | Tavsif | Misol |
| :--- | :--- | :--- |
| `order_id` | AWB yoki Buyurtma raqami | `AWB123456789` |
| `issue` | Muammo mavzusi | `Delay`, `Weight`, `Payment`, `Warehouse`, `Operator` |
| `ticket_id` | Yagona murojaat raqami | `#OP-8EMYN` |
| `tg_id` | Telegram User ID | `987654321` |
| `user_name` | Foydalanuvchi ismi / username | `Akmal Karimov` |

---

## ⚙️ Sozlamalar (`.env`)

Loyihani ishga tushirish uchun `.env` faylini to'ldiring:

```env
# Telegram Bot Token (@BotFather orqali olinadi)
BOT_TOKEN=1234567890:ABCdefGhIJKlmNoPQRsTUVwxyZ

# OnegoPost API (Xitoy tizimi)
ONEGOPOST_API_BASE_URL=https://vop.51jiyun.com
ONEGOPOST_API_TOKEN=sizning_haqiqiy_bearer_tokeningiz

# Mobil ilovaga o'tuvchi Deep Link manzili
DEEPLINK_BASE_URL=https://onegopost.uz

# Tizim muhiti
NODE_ENV=production
LOG_LEVEL=info
```

---

## 🚀 Ishga tushirish yo'riqnomasi

### 1. Mahalliy (Lokal) ishlab chiqish rejimida:
```bash
npm install
npm run dev
```

### 2. Testlarni ishga tushirish:
```bash
npm test
```

### 3. Ishlab chiqarish (Production) uchun kompilyatsiya:
```bash
npm run build
npm start
```

### 4. PM2 orqali fonda (Background) ishga tushirish:
```bash
npm install -g pm2
npm run build
pm2 start dist/index.js --name onegopost-bot
pm2 save
pm2 startup
```

### 5. Docker va Docker Compose orqali ishga tushirish:
```bash
docker compose up -d --build
```
Loglarni kuzatish:
```bash
docker compose logs -f
```

---

## 📁 Loyiha Strukturasi (v2.0)

```text
OneGoPost/
├── src/
│   ├── api/
│   │   ├── onego-client.ts    # Rasmiy OnegoPost Swagger API klienti (Axios + Retry)
│   │   └── types.ts           # Swagger API tiplari, statuslar lug'ati
│   ├── bot/
│   │   ├── handlers.ts        # Telegram botning barcha komandalari, tinglovchilari va FSM
│   │   ├── keyboards.ts       # Reply va Inline klaviaturalar (Deep link va til tugmalari)
│   │   └── messages.ts        # 2 tilli (UZ + RU) xabarlar, shablonlar va kartochkalar
│   ├── config/
│   │   └── env.ts             # .env konfiguratsiyasi va tekshiruvlari
│   ├── db/
│   │   └── database.ts        # SQLite (better-sqlite3) baza: users, tickets, analytics
│   ├── utils/
│   │   ├── analytics.ts       # Analitika yordamchilari
│   │   ├── deeplink.ts        # Universal Deep Link generator
│   │   ├── logger.ts          # Pino logger
│   │   ├── ticket.ts          # #OP-XXXXX unikal raqamlash tizimi
│   │   └── translator.ts      # Xitoycha logistika xabarlarini tozalash va tarjima
│   ├── index.ts               # Telegram bot va Express serverni ishga tushirish (Bootstrap)
│   └── server.ts              # Mustaqil Express REST API & Smart Web Bridge
├── tests/
│   └── smoke.test.ts          # Integratsion va birlik testlar
├── database.sqlite            # SQLite ma'lumotlar bazasi fayli
├── API_DOCUMENTATION.md       # REST API va integratsiya to'liq hujjati
├── Dockerfile                 # Multi-stage production container
├── docker-compose.yml         # Container orchestrator
├── package.json
└── tsconfig.json
```
