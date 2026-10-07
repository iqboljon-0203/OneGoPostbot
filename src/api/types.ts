// ─── Live Swagger / OnegoPost API Types ─────────────────────────

export interface PackageProduct {
  Id?: string;
  URL?: string;
  categoryName?: string;
  CompanyName?: string;
  Channel?: string;
  offerId?: string;
  SpecId?: string;
  Picture?: string;
  cnTitle?: string;
  cnSku?: string;
  cnPrice?: number;
  cnTotalAmount?: number;
  cnFreight?: number;
  Price?: number;
  Title?: string;
  Sku?: string;
  Freight?: number;
  TotalAmount?: number;
  Skuid?: string;
  ShipeType?: number; // 0 = Air, 1 = Land
  Quantity?: number;
}

export interface PackageVolume {
  Length?: number;
  Width?: number;
  Height?: number;
  Weight?: number;
}

export interface PackageBody {
  AccountId?: string;
  ShipeType?: number;
  cnName?: string;
  Name?: string;
  ThirdName?: string;
  Volume?: PackageVolume;
  Qty?: number;
  Mark?: number;
}

export interface PackageBatch {
  ID?: string;
}

export interface PackageBox {
  ID?: string;
}

export interface PackageData {
  ID: string;
  Status: number;
  Product?: PackageProduct;
  Body?: PackageBody;
  Batch?: PackageBatch;
  Box?: PackageBox;
  Location?: string;
  CNLocation?: string;
  TotalAmount?: number;
  IsPay?: boolean;
  PaymentTime?: string | null;
  PayTradeNo?: string | null;
  CreatedOn?: string;
  ModifiedOn?: string;
  Remarks?: string;
}

export interface ApiResponse<T> {
  State: number;
  Message: string;
  Data: T;
}

// ─── Tracking API Types (GET /api/t_Package/Tracking/{awb}) ─────

export interface TrackingCheckpoint {
  Time: string;
  Content: string;
}

export interface TrackingResult {
  currentLocation: string;
  currentTime: string;
  history: TrackingCheckpoint[];
}

// ─── Support Message Types (PUT /api/t_Message/userMessage/{FkId}) ───

export enum MessageType {
  Package = 0,  // Package issue
  Order = 1,    // Order issue
  Payment = 2,  // Payment / Recharge issue
  Customer = 3, // General customer / warehouse / operator help
}

export type IssueTopic =
  | 'Tracking'
  | 'Delay'
  | 'Payment'
  | 'Weight'
  | 'Warehouse'
  | 'OperatorHelp'
  | 'General';

export interface SupportMessagePayload {
  MessageId: string;
  isDelete: boolean;
  AdminId: string;
  Name: string;
  UserType: number; // 0 = customer / user
  Content: string;
  Addtime: string;
}

// ─── Ticket Status ──────────────────────────────────────────────

export type TicketStatus = 'new' | 'in_review' | 'transferred' | 'resolved';

export interface TicketRow {
  ticket_number: string;
  telegram_id: number;
  awb: string | null;
  issue_type: IssueTopic;
  description: string;
  status: TicketStatus;
  created_at: string;
  updated_at: string;
}

// ─── Official Package Status Lifecycle Dictionary ───────────────────

export interface StatusDefinition {
  cn: string;
  uz: string;
  ru: string;
}

export const PACKAGE_STATUSES: Record<number, StatusDefinition> = {
  0: { cn: '已创建', uz: 'Qabul qilingan / Yaratilgan', ru: 'Создан / Принят' },
  10: { cn: '已称重', uz: 'Vazni o\'lchangan (tortilgan)', ru: 'Взвешен' },
  11: { cn: '已登记', uz: 'Tovar nomi ro\'yxatga olingan', ru: 'Зарегистрирован' },
  12: { cn: '已入库中国仓', uz: 'Xitoy omboriga kirim qilingan', ru: 'Поступил на склад в Китае' },
  13: { cn: '已装箱', uz: 'Qutiga joylangan (upakovka)', ru: 'Упакован в коробку' },
  14: { cn: '已批次', uz: 'Reysga / Partiyaga biriktirilgan', ru: 'Сформирован в рейс' },
  15: { cn: '已发货', uz: 'Yo\'lga chiqqan (jo\'natilgan)', ru: 'Отправлен / В пути' },
  16: { cn: '已达中转仓', uz: 'Tranzit omborga yetib kelgan', ru: 'Прибыл на транзитный склад' },
  17: { cn: '待入库乌兹别克仓', uz: 'O\'zbekiston omboriga qabul kutilmoqda', ru: 'Ожидает поступления на склад в Узбекистане' },
  18: { cn: '已入库乌兹别克仓', uz: 'O\'zbekiston omboriga yetib kelgan', ru: 'Поступил на склад в Узбекистане' },
  19: { cn: '已贴面单乌兹别克仓', uz: 'O\'zbekistonda nakladnaya yopishtirilgan', ru: 'Наклеена накладная (Узбекистан)' },
  20: { cn: '待取件', uz: 'Olib ketishga tayyor', ru: 'Готов к выдаче' },
  21: { cn: '已取件', uz: 'Olib ketildi / Yetkazilmoqda', ru: 'Выдан / Передан курьеру' },
  22: { cn: '已签收', uz: 'Yetkazildi va qabul qilindi', ru: 'Доставлен и вручен' },
  [-1]: { cn: '已取消', uz: 'Bekor qilingan', ru: 'Отменен' },
  [-2]: { cn: '已拆单', uz: 'Buyurtma qismlarga bo\'lingan', ru: 'Заказ разделен' },
};

/**
 * Returns the human-readable package status text with fallback handling.
 */
export function getStatusText(status: number | undefined | null, lang: 'uz' | 'ru'): string {
  if (status === undefined || status === null) {
    return lang === 'uz' ? 'Qabul qilingan (Ishlov berilmoqda)' : 'В обработке';
  }
  const item = PACKAGE_STATUSES[status];
  if (item) {
    return item[lang];
  }
  return lang === 'uz'
    ? `Qabul qilingan (Holat kodi: ${status})`
    : `В обработке (Статус: ${status})`;
}

// Backward compatibility alias
export const getStatusLabel = getStatusText;
