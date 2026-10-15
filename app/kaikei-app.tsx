'use client';

/* oxlint-disable next/no-img-element */

import { Alert, Button, Empty, Layout, Tag, Tooltip } from 'antd';
import { useDeferredFeedback } from './feedback-context';
import { Card, Progress, FlowScope } from './home-primitives';
import { recalculateDemoCards } from '@/lib/demo-cards';
import dayjs from 'dayjs';
import {
  compareTransactions,
  mergeTransactionRows,
  replaceTransaction,
} from '@/lib/transaction-order';
import { defaultLedgerPeriod } from '@/lib/calendar-period';
import { budgetWeekNumber, budgetWeekRange } from '@/lib/budget-weeks';
import {
  weeklyCategoryNumber,
  preserveWeeklyIdentity,
} from '@/lib/category-identity';
import { syncStatus } from '@/lib/sync-status';
import {
  boundedFetch,
  RequestTimeoutError,
  type RequestTiming,
} from '@/lib/request';
import {
  updateOutbox,
  confirmedOutboxRemainder,
  OUTBOX_BATCH_SIZE,
  drainOutbox,
} from '@/lib/outbox';
import {
  deviceOnline,
  getClientRuntime,
  recoveryStorage,
} from '@/lib/client-runtime';
import { wholeYen } from '@/lib/calendar-validation';
import {
  pendingWriteConfirmed,
  validPendingWrite,
  type PendingWrite,
} from '@/lib/save-recovery';
import { mergeMonthSnapshot } from '@/lib/month-snapshot';
import { updateLedgerSummaries } from '@/lib/ledger-summaries';
import { applyBudgetSave, rollbackBudgetSave } from '@/lib/budget-save';
import type { ReconciliationResult } from '@/lib/reconciliation';
import {
  filterTransactions,
  EMPTY_TRANSACTION_FILTERS,
  type TransactionFilters,
} from '@/lib/transaction-filters';
import {
  transactionSaveJson,
  transactionFingerprint,
  validPendingEdit,
  SaveNotConfirmedError,
  type PendingTransactionEdit,
} from '@/lib/transaction-save';
import FixedCostEditor from './fixed-cost-editor';
import DeferredDropdown from './deferred-dropdown';
import {
  lazy,
  Suspense,
  useCallback,
  useDeferredValue,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type ChangeEvent as ReactChangeEvent,
  type KeyboardEvent as ReactKeyboardEvent,
  type PointerEvent as ReactPointerEvent,
  type ReactNode,
} from 'react';
import type { BudgetDialogValues } from './budget-dialog';
import {
  readClientCache,
  readClientCacheEntry,
  readStartupCache,
  scheduleClientCacheWrite,
} from './client-cache';
import { boundedCacheRead, newestSnapshot } from '@/lib/startup-snapshot';
import { startupLedger, cachedMonthLedger } from '@/lib/startup-ledger';
import { flowForScope } from '@/lib/flow-year';
import { matchingShellUrl } from '@/lib/shell-recovery';
import { mergeBackupLedger } from '@/lib/backup';
import { recoveryRecords, type RecoveryRecord } from '@/lib/recovery-storage';
import { afterPaintOpportunity } from '@/lib/startup-timing';
import { csvValue, downloadTextFile } from './client-export';
import type { MonthSetupDialogValues } from './month-setup-dialog';
import { useKaikeiTheme } from './providers';
import {
  formatTokyoDateTime,
  getTokyoClock,
  type TokyoClock,
} from './tokyo-clock';
import { Text, Title } from './ui-text';
import {
  ArrowDownOutlined,
  ArrowUpOutlined,
  BarChartOutlined,
  CheckCircleOutlined,
  ClockCircleOutlined,
  DownloadOutlined,
  EditOutlined,
  MenuOutlined,
  MoonOutlined,
  PlusOutlined,
  ProfileOutlined,
  SunOutlined,
  SwapOutlined,
  SyncOutlined,
  UploadOutlined,
  WalletOutlined,
} from './ui-icons';
import type {
  BatchExpenseDialogValues,
  TransactionDialogDefaults,
  TransactionDialogValues,
  TransactionEntryMode,
} from './transaction-dialog';

const { Sider, Content } = Layout;
type TransactionDialogModule = typeof import('./transaction-dialog');
let transactionDialogPromise: Promise<TransactionDialogModule> | undefined;

function loadTransactionDialog() {
  transactionDialogPromise ??= import('./transaction-dialog').catch((error) => {
    transactionDialogPromise = undefined;
    throw error;
  });
  return transactionDialogPromise;
}

function preloadTransactionDialog() {
  void loadTransactionDialog().catch(() => undefined);
}

const TransactionDialog = lazy(loadTransactionDialog);
const TransactionsView = lazy(() => import('./transactions-view'));
const BudgetsView = lazy(() => import('./budgets-view'));
const BudgetDialog = lazy(() => import('./budget-dialog'));
const MonthSetupDialog = lazy(() => import('./month-setup-dialog'));
const Drawer = lazy(() => import('./app-drawer'));

type LedgerType = 'expense' | 'income';
type ViewKey = 'overview' | 'transactions' | 'budgets';

export interface LedgerTransaction {
  id: string;
  transactionDate: string;
  period: string;
  type: LedgerType;
  amount: number;
  description: string;
  category: string;
  source: string;
  createdAt: number;
}

interface BudgetPlan {
  id: string;
  period: string;
  type: LedgerType;
  category: string;
  plannedAmount: number;
  updatedAt: number;
  recurring?: boolean;
  creditCardGrossAmount?: number | null;
  creditCardFixedCosts?: number;
}

export interface LedgerData {
  transactions: LedgerTransaction[];
  budgets: BudgetPlan[];
  initialBalance: number;
  sourceFile: string;
  seedVersion: string;
  syncMode?: 'database' | 'google-sheets';
  syncedAt?: string;
  periodSyncedAt?: Record<string, string>;
  integrity?: {
    checkedAt?: string;
    repairedCount?: number;
    lastBackupAt?: string;
  };
  compact?: boolean;
  latestPeriod?: string;
  detailPeriod?: string;
  periodSummaries?: Array<{
    period: string;
    income: number;
    expense: number;
    balance: number;
  }>;
}

interface TransactionInput {
  type: LedgerType;
  amount: number;
  transactionDate: string;
  description: string;
  category: string;
  clientMutationId?: string;
}

interface ActivityItem {
  id: string;
  occurredAt: number;
  title: string;
  detail: string;
}

interface PerformanceSample {
  id: string;
  occurredAt: number;
  name: string;
  durationMs: number;
  successful: boolean;
  timing?: RequestTiming & { frameMs?: number };
}

type BudgetEditTarget = 'category' | 'plannedAmount' | 'both';

interface BudgetOrderPreview {
  period: string;
  type: LedgerType;
  items: BudgetPlan[];
  initialIds: string[];
  draggedIds: string[];
}

const LEDGER_CACHE_KEY = 'kaikei-ledger-cache-v1';
const LEDGER_INDEXED_CACHE_KEY = 'ledger-v2';
const LEDGER_COMPACT_CACHE_KEY = 'ledger-compact-v1';
const OUTBOX_KEY = 'kaikei-transaction-outbox-v1';
const EDIT_DRAFT_KEY = 'kaikei-pending-edit-draft-v1';
const WRITE_DRAFT_KEY = 'kaikei-pending-write-v1';
const ACTIVITY_KEY = 'kaikei-activity-v1';
const PERFORMANCE_KEY = 'kaikei-performance-v1';
const MIN_WRITABLE_PERIOD = '2026-09';
const AUTOMATIC_REFRESH_INTERVAL_MS = 5 * 60_000;
const CATEGORY_COLORS = ['#f26a21', '#ff9a5c', '#102542', '#6f9bc7', '#c8d8e8'];

function DeferredMount({ children }: { children: ReactNode }) {
  const [mounted, setMounted] = useState(false);
  const triggerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (mounted) return;
    const trigger = triggerRef.current;
    if (!trigger || !('IntersectionObserver' in window)) {
      setMounted(true);
      return;
    }

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (!entry?.isIntersecting) return;
        setMounted(true);
        observer.disconnect();
      },
      { rootMargin: '400px 0px' },
    );
    observer.observe(trigger);
    return () => observer.disconnect();
  }, [mounted]);

  return (
    <div
      ref={triggerRef}
      className={`overview-deferred-region${mounted ? ' ready' : ''}`}
    >
      {mounted ? children : null}
    </div>
  );
}

function LoadingPlaceholder({ rows = 6 }: { rows?: number }) {
  return (
    <div className="loading-placeholder" aria-hidden="true">
      {Array.from({ length: rows }, (_, index) => (
        <span key={index} />
      ))}
    </div>
  );
}

type NetworkConnection = {
  effectiveType?: string;
  saveData?: boolean;
};

function automaticRefreshDeferred() {
  const networkNavigator = navigator as Navigator & {
    connection?: NetworkConnection;
    mozConnection?: NetworkConnection;
    webkitConnection?: NetworkConnection;
  };
  const connection =
    networkNavigator.connection ||
    networkNavigator.mozConnection ||
    networkNavigator.webkitConnection;
  return Boolean(
    connection?.saveData ||
    connection?.effectiveType === 'slow-2g' ||
    connection?.effectiveType === '2g',
  );
}

function automaticRefreshDue(snapshot: LedgerData | null, period?: string) {
  const syncedAt = Date.parse(
    (snapshot?.periodSyncedAt && period
      ? snapshot.periodSyncedAt[period]
      : snapshot?.syncedAt) || '',
  );
  return (
    !Number.isFinite(syncedAt) ||
    Date.now() - syncedAt >= AUTOMATIC_REFRESH_INTERVAL_MS
  );
}

function readStoredArray<T>(key: string): T[] {
  try {
    const value = JSON.parse(window.localStorage.getItem(key) || '[]');
    if (key === OUTBOX_KEY && !Array.isArray(value))
      throw new Error('Invalid queue');
    return Array.isArray(value) ? value : [];
  } catch {
    if (key === OUTBOX_KEY)
      throw new Error(
        'The offline queue could not be read. Do not clear device storage; download a backup or recover the stored queue first.',
      );
    return [];
  }
}

function writeStoredArray<T>(key: string, value: T[]) {
  try {
    window.localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // Device storage can be unavailable in private browsing.
  }
}

function recordPerformanceSample(
  name: string,
  durationMs: number,
  successful: boolean,
  timing?: PerformanceSample['timing'],
) {
  const next = [
    {
      id: crypto.randomUUID(),
      occurredAt: Date.now(),
      name,
      durationMs: Math.max(0, Math.round(durationMs)),
      successful,
      timing,
    },
    ...readStoredArray<PerformanceSample>(PERFORMANCE_KEY),
  ].slice(0, 30);
  writeStoredArray(PERFORMANCE_KEY, next);
  return next;
}

function validCachedLedger(value: LedgerData | null) {
  return Boolean(
    value &&
    Array.isArray(value.transactions) &&
    Array.isArray(value.budgets) &&
    Number.isFinite(value.initialBalance),
  );
}

async function readCachedLedger() {
  try {
    const keys = [LEDGER_COMPACT_CACHE_KEY, LEDGER_INDEXED_CACHE_KEY];
    const indexed = await readStartupCache<LedgerData>(keys);
    if (indexed) return { ...indexed, source: 'month cache' };
    // One-time migration (or recovery from missing/corrupt metadata). Preserve
    // original freshness; an old full record must never hide a newer save.
    const entries = await Promise.all(
      keys.map((key) => readClientCacheEntry<LedgerData>(key)),
    );
    entries.forEach((entry, index) => {
      if (entry && validCachedLedger(entry.value))
        scheduleClientCacheWrite(
          keys[index],
          entry.value,
          startupLedger(entry.value, getTokyoClock().date),
        );
    });
    const newest = newestSnapshot(entries);
    if (newest)
      return {
        ...newest,
        value: startupLedger(newest.value, getTokyoClock().date),
        source: 'legacy cache migration',
      };
  } catch {
    // Fall through to the previous cache while IndexedDB is unavailable.
  }
  try {
    const saved = window.localStorage.getItem(LEDGER_CACHE_KEY);
    if (!saved) return null;
    const parsed = JSON.parse(saved) as LedgerData;
    if (!validCachedLedger(parsed)) return null;
    scheduleClientCacheWrite(LEDGER_INDEXED_CACHE_KEY, parsed);
    return { value: parsed, cachedAt: 0, source: 'legacy device storage' };
  } catch {
    return null;
  }
}

function cacheLedger(data: LedgerData) {
  scheduleClientCacheWrite(
    data.compact ? LEDGER_COMPACT_CACHE_KEY : LEDGER_INDEXED_CACHE_KEY,
    data,
    startupLedger(data, getTokyoClock().date),
  );
}

function withQueuedTransactions(data: LedgerData) {
  let queued: TransactionInput[];
  try {
    queued = readStoredArray<TransactionInput>(OUTBOX_KEY);
  } catch {
    return data;
  } // Do not hide the saved ledger when device storage fails.
  if (!queued.length) {
    const uniqueIds = new Set(data.transactions.map((item) => item.id));
    return uniqueIds.size === data.transactions.length
      ? data
      : updateLedgerSummaries(data, {
          ...data,
          transactions: mergeTransactionRows(data.transactions, []),
        });
  }
  const existingIds = new Set(data.transactions.map((item) => item.id));
  const createdAt = Date.now();
  const pending = queued
    .map(
      (input, index): LedgerTransaction => ({
        ...input,
        id: `pending-${input.clientMutationId}`,
        period: input.transactionDate.slice(0, 7),
        source: 'queued',
        createdAt: createdAt + index,
      }),
    )
    .filter((item) => !existingIds.has(item.id));
  return pending.length || existingIds.size !== data.transactions.length
    ? updateLedgerSummaries(data, {
        ...data,
        transactions: mergeTransactionRows(data.transactions, pending),
      })
    : data;
}

function calculateSpendingGuide(
  selectedPeriod: string,
  monthBudgets: BudgetPlan[],
  categoryActuals: Map<string, number>,
  todayDate: string,
) {
  const start = dayjs(`${selectedPeriod}-01`);
  const end = start.endOf('month');
  const today = dayjs(todayDate);
  const anchor =
    today.format('YYYY-MM') === selectedPeriod
      ? today
      : today.isBefore(start)
        ? start
        : end;
  const week = budgetWeekNumber(anchor.date());
  const range = budgetWeekRange(selectedPeriod, week);
  const weekStart = start.date(range.startDay);
  const weekEnd = start.date(range.endDay);
  const elapsedDays = Math.max(1, anchor.diff(weekStart, 'day') + 1);
  const weekDays = Math.max(1, weekEnd.diff(weekStart, 'day') + 1);
  const daysRemaining = Math.max(1, weekEnd.diff(anchor, 'day') + 1);
  const plan = monthBudgets.find(
    (item) =>
      item.type === 'expense' && weeklyCategoryNumber(item.category) === week,
  );
  const estimated = plan?.plannedAmount || 0;
  const actual = plan
    ? categoryActuals.get(`expense:${plan.category}`) || 0
    : 0;
  const remaining = estimated - actual;
  const forecast = actual ? Math.round((actual / elapsedDays) * weekDays) : 0;
  return {
    week,
    estimated,
    actual,
    remaining,
    dailyGuide: Math.floor(Math.max(0, remaining) / daysRemaining),
    forecast,
    percent: estimated ? Math.round((actual / estimated) * 100) : 0,
  };
}

const categoryEmojiOptions = [
  { value: '🏠', label: '🏠 Home & rent' },
  { value: '🏢', label: '🏢 Office & workspace' },
  { value: '🛠️', label: '🛠️ Repairs & maintenance' },
  { value: '🧹', label: '🧹 Cleaning & household' },
  { value: '🧺', label: '🧺 Laundry' },
  { value: '💳', label: '💳 Card & payments' },
  { value: '💵', label: '💵 Cash & allowance' },
  { value: '🪙', label: '🪙 Coins & pocket money' },
  { value: '🏦', label: '🏦 Banking & savings' },
  { value: '📈', label: '📈 Investments & growth' },
  { value: '📉', label: '📉 Losses & repayments' },
  { value: '🎯', label: '🎯 Financial goals' },
  { value: '🧮', label: '🧮 Accounting' },
  { value: '🛒', label: '🛒 Groceries' },
  { value: '🍽️', label: '🍽️ Dining & restaurants' },
  { value: '🍱', label: '🍱 Lunch & takeaway' },
  { value: '🍔', label: '🍔 Fast food' },
  { value: '🍕', label: '🍕 Pizza & delivery' },
  { value: '🍜', label: '🍜 Noodles & ramen' },
  { value: '🍣', label: '🍣 Sushi' },
  { value: '☕', label: '☕ Coffee & cafés' },
  { value: '🍺', label: '🍺 Drinks & nightlife' },
  { value: '🥦', label: '🥦 Healthy food' },
  { value: '🚆', label: '🚆 Transport' },
  { value: '🚇', label: '🚇 Subway & metro' },
  { value: '🚌', label: '🚌 Bus' },
  { value: '🚕', label: '🚕 Taxi & rideshare' },
  { value: '🚗', label: '🚗 Car' },
  { value: '⛽', label: '⛽ Fuel & petrol' },
  { value: '🅿️', label: '🅿️ Parking' },
  { value: '🚲', label: '🚲 Bicycle' },
  { value: '✈️', label: '✈️ Flights & travel' },
  { value: '🏨', label: '🏨 Hotels & accommodation' },
  { value: '🧳', label: '🧳 Holidays' },
  { value: '🌐', label: '🌐 Internet' },
  { value: '📱', label: '📱 Phone' },
  { value: '💻', label: '💻 Computer & software' },
  { value: '⚡', label: '⚡ Electricity' },
  { value: '💧', label: '💧 Water' },
  { value: '🔥', label: '🔥 Gas' },
  { value: '📺', label: '📺 TV & subscriptions' },
  { value: '🎬', label: '🎬 Entertainment' },
  { value: '🎮', label: '🎮 Games' },
  { value: '🎧', label: '🎧 Music & audio' },
  { value: '☁️', label: '☁️ Cloud services' },
  { value: '🍎', label: '🍎 Apple services' },
  { value: '🧾', label: '🧾 Bills & tax' },
  { value: '🛍️', label: '🛍️ Shopping' },
  { value: '👕', label: '👕 Clothing' },
  { value: '👟', label: '👟 Shoes & sportswear' },
  { value: '💄', label: '💄 Beauty & cosmetics' },
  { value: '✂️', label: '✂️ Haircuts & grooming' },
  { value: '🎁', label: '🎁 Gifts' },
  { value: '📦', label: '📦 Online orders & deliveries' },
  { value: '🪴', label: '🪴 Garden & plants' },
  { value: '📚', label: '📚 Education' },
  { value: '✏️', label: '✏️ School supplies' },
  { value: '🩺', label: '🩺 Health' },
  { value: '💊', label: '💊 Medicine & pharmacy' },
  { value: '🦷', label: '🦷 Dental' },
  { value: '🏋️', label: '🏋️ Gym & fitness' },
  { value: '🧘', label: '🧘 Wellness' },
  { value: '👶', label: '👶 Children & childcare' },
  { value: '🐾', label: '🐾 Pets' },
  { value: '🐶', label: '🐶 Dog & pet care' },
  { value: '🐱', label: '🐱 Cat & pet care' },
  { value: '🎟️', label: '🎟️ Events & tickets' },
  { value: '🎨', label: '🎨 Hobbies & crafts' },
  { value: '📷', label: '📷 Photography' },
  { value: '🎸', label: '🎸 Music & instruments' },
  { value: '⚽', label: '⚽ Sports' },
  { value: '🎲', label: '🎲 Games & activities' },
  { value: '💰', label: '💰 Income' },
  { value: '💼', label: '💼 Salary & work' },
  { value: '🧑‍💻', label: '🧑‍💻 Freelance income' },
  { value: '🏷️', label: '🏷️ Sales & refunds' },
  { value: '↩️', label: '↩️ Refunds & reimbursements' },
  { value: '❤️', label: '❤️ Family & giving' },
  { value: '✨', label: '✨ Other & personal' },
  { value: '1️⃣', label: '1️⃣ Week 1' },
  { value: '2️⃣', label: '2️⃣ Week 2' },
  { value: '3️⃣', label: '3️⃣ Week 3' },
  { value: '4️⃣', label: '4️⃣ Week 4' },
];

function categoryParts(value: string) {
  const trimmed = value.trim();
  const [first = '', ...rest] = trimmed.split(/\s+/);
  const isEmoji =
    /^(?:[0-9#*]\uFE0F?\u20E3|\p{Extended_Pictographic}|\p{Regional_Indicator})/u.test(
      first,
    );
  return isEmoji && rest.length
    ? { emoji: first, name: rest.join(' ') }
    : { emoji: '', name: trimmed };
}

function categoryIllustration(category: string) {
  const name = categoryParts(category).name.toLowerCase();
  const week = /^week\s*([1-4])(?: · .+)?$/.exec(name);
  if (week)
    return {
      src: '/category-icons/weekly-v2.png',
      week: Number(week[1]),
    };
  if (/rent|home|housing/.test(name))
    return { src: '/category-icons/rent-v2.png', week: null };
  return { src: '/category-icons/other-v2.png', week: null };
}

function transactionWeekNumber(item: LedgerTransaction) {
  const categoryWeek = weeklyCategoryNumber(item.category);
  if (categoryWeek) return categoryWeek;
  return budgetWeekNumber(dayjs(item.transactionDate).date());
}

function defaultTransactionWeek(period: string, todayDate: string) {
  const today = dayjs(todayDate);
  return today.format('YYYY-MM') === period
    ? String(budgetWeekNumber(today.date()))
    : '1';
}

const currency = new Intl.NumberFormat('ja-JP', {
  style: 'currency',
  currency: 'JPY',
  maximumFractionDigits: 0,
});

function formatMoney(value: number) {
  return currency.format(Math.round(value));
}

function formatSignedMoney(value: number) {
  const rounded = Math.round(value);
  if (rounded === 0) return formatMoney(0);
  return `${rounded > 0 ? '+' : '−'}${formatMoney(Math.abs(rounded))}`;
}

function budgetComparison(estimated: number, actual: number, type: LedgerType) {
  if (!estimated && !actual) {
    return {
      variance: '—',
      status: 'Not estimated',
      tone: 'neutral',
      ratioPercent: null,
    };
  }
  if (!estimated && actual) {
    return type === 'expense'
      ? {
          variance: formatSignedMoney(-actual),
          status: 'Unestimated cost',
          tone: 'over',
          ratioPercent: null,
        }
      : {
          variance: formatSignedMoney(actual),
          status: 'Unestimated income',
          tone: 'on',
          ratioPercent: null,
        };
  }
  const delta = type === 'expense' ? estimated - actual : actual - estimated;
  const ratioPercent = Math.max(0, Math.round((actual / estimated) * 100));
  if (delta === 0) {
    return {
      variance: formatSignedMoney(0),
      status: 'On estimate',
      tone: 'on',
      ratioPercent,
    };
  }
  if (type === 'expense') {
    return delta < 0
      ? {
          variance: formatSignedMoney(delta),
          status: 'Over estimate',
          tone: 'over',
          ratioPercent,
        }
      : {
          variance: formatSignedMoney(delta),
          status: 'Under estimate',
          tone: 'under',
          ratioPercent,
        };
  }
  return delta > 0
    ? {
        variance: formatSignedMoney(delta),
        status: 'Above estimate',
        tone: 'on',
        ratioPercent,
      }
    : {
        variance: formatSignedMoney(delta),
        status: 'Below estimate',
        tone: 'over',
        ratioPercent,
      };
}

function monthLabel(period: string) {
  return dayjs(`${period}-01`).format('MMMM YYYY');
}

function compactMonth(period: string) {
  return dayjs(`${period}-01`).format('MMM');
}

function nextPeriod(period: string) {
  return dayjs(`${period}-01`).add(1, 'month').format('YYYY-MM');
}

function defaultRecurringCategory(category: string, type: LedgerType) {
  if (weeklyCategoryNumber(category)) return false;
  const name = categoryParts(category).name.toLowerCase();
  if (type === 'income') return !/surplus|other|refund/.test(name);
  return true;
}

function duplicateKey(input: TransactionInput) {
  return [
    input.type,
    input.transactionDate,
    input.amount,
    input.description.trim().toLowerCase(),
    input.category.trim().toLowerCase(),
  ].join('|');
}

async function readJson<T>(response: Response): Promise<T> {
  const body = (await response.json()) as T & { error?: string };
  if (!response.ok) throw new Error(body.error || 'Something went wrong.');
  return body;
}

function transactionPayload(values: TransactionDialogValues): TransactionInput {
  return {
    type: values.type,
    amount: wholeYen(values.amount, false),
    transactionDate: values.transactionDate.format('YYYY-MM-DD'),
    description: values.description.trim(),
    category: values.category.trim(),
  };
}

export default function KaikeiApp({
  initialLedger,
  initialClock,
}: {
  initialLedger: LedgerData | null;
  initialClock?: TokyoClock;
}) {
  const {
    message,
    modal,
    notification,
    prepare: prepareFeedback,
  } = useDeferredFeedback();
  const { themeMode, toggleTheme } = useKaikeiTheme();
  const [ledger, setLedgerState] = useState<LedgerData | null>(initialLedger);
  const setLedger = useCallback(
    (
      value:
        | LedgerData
        | null
        | ((current: LedgerData | null) => LedgerData | null),
    ) => {
      setLedgerState((current) => {
        const candidate = typeof value === 'function' ? value(current) : value;
        const next = candidate ? recalculateDemoCards(candidate) : candidate;
        return current && next && typeof value === 'function'
          ? updateLedgerSummaries(current, next)
          : next;
      });
    },
    [],
  );
  const bootstrappingRef = useRef(true);
  const [clock, setClock] = useState(() => initialClock ?? getTokyoClock());
  const [loading, setLoading] = useState(!initialLedger);
  const [syncing, setSyncing] = useState(false);
  const [syncDetailsOpen, setSyncDetailsOpen] = useState(false);
  const [refreshError, setRefreshError] = useState('');
  const [outboxError, setOutboxError] = useState('');
  const [pendingWrite, setPendingWrite] = useState<PendingWrite | null>(null);
  const pendingWriteRef = useRef<PendingWrite | null>(null);
  const [checkingWrite, setCheckingWrite] = useState(false);
  const [reconciliationOpen, setReconciliationOpen] = useState(false);
  const [reconciliation, setReconciliation] =
    useState<ReconciliationResult | null>(null);
  const [reconciliationError, setReconciliationError] = useState('');
  const [comparingSheet, setComparingSheet] = useState(false);
  const [activeWrites, setActiveWrites] = useState(0);
  const activeWritesRef = useRef(0);
  const periodSelectionRef = useRef(0);
  const [error, setError] = useState('');
  const [view, setView] = useState<ViewKey>('overview');
  const [flowScope, setFlowScope] = useState<'year' | 'month'>('month');
  const [selectedPeriod, setSelectedPeriod] = useState(() =>
    initialLedger
      ? defaultLedgerPeriod(initialLedger, clock.date)
      : clock.date.slice(0, 7),
  );
  const startupDateRef = useRef(clock.date);
  const selectedPeriodRef = useRef(selectedPeriod);
  useEffect(() => {
    selectedPeriodRef.current = selectedPeriod;
  }, [selectedPeriod]);
  const startupMonthResolvedRef = useRef(false);
  const [transactionOpen, setTransactionOpen] = useState(false);
  const [editingTransaction, setEditingTransaction] =
    useState<LedgerTransaction | null>(null);
  const [transactionEntryMode, setTransactionEntryMode] =
    useState<TransactionEntryMode>('single');
  const [transactionDefaults, setTransactionDefaults] =
    useState<TransactionDialogDefaults>({
      type: 'expense',
      transactionDate: '2026-09-01',
    });
  const [savingTransaction, setSavingTransaction] = useState(false);
  const [pendingEdit, setPendingEdit] = useState<PendingTransactionEdit | null>(
    null,
  );
  const [saveConfirmationMessage, setSaveConfirmationMessage] = useState('');
  const pendingEditRef = useRef<PendingTransactionEdit | null>(null);
  const savingTransactionRef = useRef(false);
  const ledgerMutationEpochRef = useRef(0);
  const [filterType, setFilterType] = useState<'all' | LedgerType>('all');
  const [search, setSearch] = useState('');
  const [transactionFilters, setTransactionFilters] =
    useState<TransactionFilters>(EMPTY_TRANSACTION_FILTERS);
  const [openTransactionWeek, setOpenTransactionWeek] = useState(() =>
    defaultTransactionWeek('2026-09', clock.date),
  );
  const [weekJump, setWeekJump] = useState<number | null>(null);
  const [budgetType, setBudgetType] = useState<LedgerType>('expense');
  const [editingBudget, setEditingBudget] = useState<BudgetPlan | null>(null);
  const [budgetEditTarget, setBudgetEditTarget] =
    useState<BudgetEditTarget>('both');
  const [budgetOpen, setBudgetOpen] = useState(false);
  const [budgetEditorPeriod, setBudgetEditorPeriod] = useState(selectedPeriod);
  const [budgetRestoreValues, setBudgetRestoreValues] =
    useState<BudgetDialogValues | null>(null);
  const [savingBudget, setSavingBudget] = useState(false);
  const [budgetSaveKey, setBudgetSaveKey] = useState('');
  const [deletingBudget, setDeletingBudget] = useState(false);
  const [rearrangingBudgets, setRearrangingBudgets] = useState(false);
  const [budgetOrderPreview, setBudgetOrderPreview] =
    useState<BudgetOrderPreview | null>(null);
  const [selectedBudgetIds, setSelectedBudgetIds] = useState<string[]>([]);
  const [draggingBudgetIds, setDraggingBudgetIds] = useState<string[]>([]);
  const [savingBudgetOrder, setSavingBudgetOrder] = useState(false);
  const [savingInlineActualKey, setSavingInlineActualKey] = useState<
    string | null
  >(null);
  const [closingMonth, setClosingMonth] = useState(false);
  const [monthSetupOpen, setMonthSetupOpen] = useState(false);
  const [activityOpen, setActivityOpen] = useState(false);
  const [biggestPurchasesOpen, setBiggestPurchasesOpen] = useState(false);
  const [activity, setActivity] = useState<ActivityItem[]>([]);
  const [performanceSamples, setPerformanceSamples] = useState<
    PerformanceSample[]
  >([]);
  const [online, setOnline] = useState(true);
  const [queuedCount, setQueuedCount] = useState(0);
  const [updateAvailable, setUpdateAvailable] = useState(false);
  const ledgerRef = useRef(ledger);
  const responseReadyRef = useRef<number | null>(null);
  const budgetOrderPreviewRef = useRef<BudgetOrderPreview | null>(null);
  const draggingBudgetIdsRef = useRef<string[]>([]);
  const flushingOutboxRef = useRef(false);
  const addingOutboxRef = useRef(false);
  const refreshingLedgerRef = useRef(false);
  const lastRefreshAtRef = useRef(0);
  const lastHiddenAtRef = useRef(0);
  const readyRecordedRef = useRef(false);
  const paintedRecordedRef = useRef(false);
  const [startupRestored, setStartupRestored] = useState(false);
  const [homePainted, setHomePainted] = useState(false);
  const startupSamplesRef = useRef<PerformanceSample[]>([]);
  const recordStartupSample = useCallback(
    (name: string, durationMs: number, successful: boolean) => {
      startupSamplesRef.current.push({
        id: crypto.randomUUID(),
        occurredAt: Date.now(),
        name,
        durationMs: Math.max(0, Math.round(durationMs)),
        successful,
      });
    },
    [],
  );
  const [backingUp, setBackingUp] = useState(false);
  const backingUpRef = useRef(false);
  const deletionTimersRef = useRef(new Map<string, number>());
  const deferredSearch = useDeferredValue(search);
  const ledgerReady = Boolean(ledger);
  const historicalReadOnly = selectedPeriod < MIN_WRITABLE_PERIOD;

  useEffect(() => {
    ledgerRef.current = ledger;
  }, [ledger]);

  useLayoutEffect(() => {
    const started = responseReadyRef.current;
    responseReadyRef.current = null;
    if (started !== null && performance.now() - started < 1000)
      recordPerformanceSample(
        'Ledger screen commit',
        performance.now() - started,
        true,
      );
  }, [ledger]);

  useEffect(() => {
    const onTiming = (event: Event) => {
      const { timing, successful } = (
        event as CustomEvent<{ timing: RequestTiming; successful: boolean }>
      ).detail;
      if (successful) responseReadyRef.current = performance.now();
      requestAnimationFrame(() =>
        setPerformanceSamples(
          recordPerformanceSample(
            'Transaction save / confirmation',
            timing.requestMs,
            successful,
            timing,
          ),
        ),
      );
    };
    window.addEventListener('kaikei-request-timing', onTiming);
    return () => window.removeEventListener('kaikei-request-timing', onTiming);
  }, []);

  const recordActivity = useCallback((title: string, detail: string) => {
    const next: ActivityItem = {
      id: crypto.randomUUID(),
      occurredAt: Date.now(),
      title,
      detail,
    };
    setActivity((current) => {
      const items = [next, ...current].slice(0, 30);
      writeStoredArray(ACTIVITY_KEY, items);
      return items;
    });
  }, []);

  const resetBudgetOrderInteraction = useCallback(() => {
    setSelectedBudgetIds([]);
    setDraggingBudgetIds([]);
    draggingBudgetIdsRef.current = [];
    budgetOrderPreviewRef.current = null;
    setBudgetOrderPreview(null);
  }, []);

  const request = useCallback(
    async (
      input: RequestInfo | URL,
      init: RequestInit = {},
      deadlineMs = 20000,
    ) => {
      const url =
        typeof input === 'string'
          ? input
          : input instanceof URL
            ? input.href
            : input.url;
      const writing =
        !['GET', 'HEAD'].includes(init.method || 'GET') &&
        url !== '/api/ledger/reconcile' &&
        url !== '/api/ledger/delete-status';
      const recoverable = writing && url !== '/api/ledger';
      const body = typeof init.body === 'string' ? init.body : undefined;
      const sourcePeriod = body
        ? JSON.parse(body).period || selectedPeriodRef.current
        : ledgerRef.current?.transactions.find((item) =>
            url.endsWith('/' + encodeURIComponent(item.id)),
          )?.period || selectedPeriodRef.current;
      const period =
        url === '/api/month-close' ? nextPeriod(sourcePeriod) : sourcePeriod;
      if (writing && pendingEditRef.current)
        throw new Error('Confirm the previous transaction edit first.');
      const draft: PendingWrite = {
        operationId: recoverable
          ? pendingWriteRef.current
            ? pendingWriteRef.current.operationId
            : crypto.randomUUID()
          : undefined,
        url,
        method: init.method || 'GET',
        body,
        period,
      };
      if (
        writing &&
        pendingWriteRef.current &&
        JSON.stringify(draft) !== JSON.stringify(pendingWriteRef.current)
      )
        throw new Error(
          'Confirm the previous save in Sync status before starting another change.',
        );
      if (recoverable) {
        if (activeWritesRef.current)
          throw new Error(
            'Wait for the current save to finish before starting another change.',
          );
        const encoded = JSON.stringify(draft);
        try {
          recoveryStorage().setItem(WRITE_DRAFT_KEY, encoded);
          if (recoveryStorage().getItem(WRITE_DRAFT_KEY) !== encoded)
            throw new Error('Not persisted');
        } catch {
          throw new Error(
            'Device storage could not preserve this save. Your input is unchanged; enable storage before saving.',
          );
        }
      }
      if (writing) {
        ledgerMutationEpochRef.current += 1;
        activeWritesRef.current += 1;
        setActiveWrites(activeWritesRef.current);
      }
      try {
        const response = await boundedFetch(
          input,
          init,
          deadlineMs,
          (timing, successful) => {
            const parsedAt = performance.now();
            if (successful && url !== '/api/ledger/reconcile')
              responseReadyRef.current = parsedAt;
            requestAnimationFrame(() =>
              setPerformanceSamples(
                recordPerformanceSample(
                  writing ? 'Save request' : 'Read request',
                  timing.requestMs,
                  successful,
                  { ...timing, frameMs: performance.now() - parsedAt },
                ),
              ),
            );
          },
        );
        if (writing) {
          const result = (await response.clone().json()) as {
            error?: string;
            saveUncertain?: boolean;
          };
          if (
            !response.ok &&
            (result.saveUncertain ||
              response.status >= 500 ||
              /not confirmed/i.test(result.error || ''))
          )
            throw new RequestTimeoutError(true);
        }
        if (recoverable && !pendingWriteRef.current) {
          try {
            recoveryStorage().removeItem(WRITE_DRAFT_KEY);
          } catch {
            /* Storage cleanup cannot undo a confirmed response. */
          }
        }
        return response;
      } catch (caught) {
        if (
          recoverable &&
          (caught instanceof RequestTimeoutError ||
            caught instanceof TypeError ||
            caught instanceof SyntaxError)
        ) {
          pendingWriteRef.current = draft;
          setPendingWrite(draft);
          if (
            draft.url === '/api/budgets' &&
            draft.body &&
            draft.method !== 'DELETE'
          ) {
            const input = JSON.parse(draft.body);
            setBudgetSaveKey(`${draft.period}:${input.type}:${input.category}`);
          }
          setSyncDetailsOpen(true);
        } else if (recoverable && !pendingWriteRef.current) {
          try {
            recoveryStorage().removeItem(WRITE_DRAFT_KEY);
          } catch {
            /* Preserve the original request error. */
          }
        }
        throw caught;
      } finally {
        if (writing)
          requestAnimationFrame(() => {
            ledgerMutationEpochRef.current += 1;
            activeWritesRef.current -= 1;
            setActiveWrites(activeWritesRef.current);
          });
      }
    },
    [],
  );

  useEffect(() => {
    const frame = requestAnimationFrame(() => {
      try {
        const raw = recoveryStorage().getItem(WRITE_DRAFT_KEY);
        const draft: unknown = raw ? JSON.parse(raw) : null;
        if (validPendingWrite(draft)) {
          pendingWriteRef.current = draft;
          ledgerMutationEpochRef.current += 1;
          setPendingWrite(draft);
          if (
            draft.url === '/api/budgets' &&
            draft.body &&
            draft.method !== 'DELETE'
          ) {
            const input = JSON.parse(draft.body);
            setBudgetSaveKey(`${draft.period}:${input.type}:${input.category}`);
          }
        }
      } catch {
        /* A missing recovery draft does not hide the ledger. */
      }
    });
    return () => cancelAnimationFrame(frame);
  }, []);

  const hydrateFullLedger = useCallback(async () => {
    const startedAt = performance.now();
    const current = () =>
      pendingEditRef.current ||
      pendingWriteRef.current ||
      activeWritesRef.current
        ? null
        : ledgerRef.current;
    let successful = false;
    try {
      if (!deviceOnline()) throw new Error('Offline');
      const data = await readJson<LedgerData>(
        await request('/api/ledger', { cache: 'no-store' }),
      );
      cacheLedger(data);
      successful = true;
      return {
        ledger: mergeBackupLedger(data, current()),
        historySource: 'network' as const,
        historyAsOf: data.syncedAt,
      };
    } catch {
      const data = await readClientCache<LedgerData>(LEDGER_INDEXED_CACHE_KEY);
      if (!data || !validCachedLedger(data) || data.compact) return null;
      successful = true;
      return {
        ledger: mergeBackupLedger(data, current()),
        historySource: 'device-cache' as const,
        historyAsOf: data.syncedAt,
      };
    } finally {
      setPerformanceSamples(
        recordPerformanceSample(
          'Backup history read',
          performance.now() - startedAt,
          successful,
        ),
      );
    }
  }, [request]);

  const refreshCompactLedger = useCallback(
    async (refreshSource = false) => {
      if (
        pendingEditRef.current ||
        pendingWriteRef.current ||
        activeWritesRef.current ||
        deletionTimersRef.current.size
      )
        return;
      const startedAt = performance.now();
      const mutationEpoch = ledgerMutationEpochRef.current;
      let successful = false;
      if (refreshSource) {
        if (refreshingLedgerRef.current) return;
        refreshingLedgerRef.current = true;
        setSyncing(true);
      }
      try {
        const endpoint = refreshSource
          ? `/api/ledger?refresh=1&compact=1&period=${selectedPeriodRef.current}`
          : '/api/ledger?compact=1';
        const data = await readJson<LedgerData>(
          refreshSource
            ? await request(endpoint, { cache: 'no-store' })
            : await request(endpoint, { cache: 'no-store' }, 3000),
        );
        successful = true;
        if (refreshSource) setRefreshError('');
        if (
          mutationEpoch === ledgerMutationEpochRef.current &&
          !pendingEditRef.current &&
          !pendingWriteRef.current &&
          !activeWritesRef.current &&
          !deletionTimersRef.current.size &&
          (!data.compact || data.detailPeriod === selectedPeriodRef.current)
        )
          setLedger(withQueuedTransactions(data));
        setError('');
        lastRefreshAtRef.current = Date.now();
      } catch (caught) {
        if (refreshSource)
          setRefreshError(
            caught instanceof Error
              ? caught.message
              : 'Could not check this month.',
          );
        // A cached compact snapshot is still useful when the network is slow.
      } finally {
        if (refreshSource) {
          refreshingLedgerRef.current = false;
          setSyncing(false);
        }
        setPerformanceSamples(
          recordPerformanceSample(
            refreshSource
              ? 'Google Sheet compact refresh'
              : 'Compact ledger refresh',
            performance.now() - startedAt,
            successful,
          ),
        );
      }
    },
    [request, setLedger],
  );

  const hydrateMonthLedger = useCallback(
    async (period: string) => {
      const epoch = ledgerMutationEpochRef.current;
      const maySwitch = () =>
        epoch === ledgerMutationEpochRef.current &&
        !activeWritesRef.current &&
        !pendingWriteRef.current &&
        !pendingEditRef.current &&
        !deletionTimersRef.current.size;
      const cachedMonth = async () => {
        const full = await readClientCache<LedgerData>(
          LEDGER_INDEXED_CACHE_KEY,
        );
        const base = ledgerRef.current;
        if (!maySwitch() || !base || !full || !validCachedLedger(full))
          return null;
        const month = cachedMonthLedger(base, full, period);
        if (month)
          message.info(
            'Showing this month from device storage. It will be checked when you reconnect.',
          );
        return month ? withQueuedTransactions(month) : null;
      };
      try {
        if (!deviceOnline()) {
          const cached = await cachedMonth();
          if (cached) return cached;
          throw new Error(
            'This month is not saved on this device yet. Reconnect to open it.',
          );
        }
        const data = await readJson<LedgerData>(
          await request(`/api/ledger?compact=1&period=${period}`, {
            cache: 'no-store',
          }),
        );
        if (data.detailPeriod !== period)
          throw new Error('This month is not available yet.');
        if (
          epoch !== ledgerMutationEpochRef.current ||
          activeWritesRef.current ||
          pendingWriteRef.current ||
          pendingEditRef.current ||
          deletionTimersRef.current.size
        )
          throw new Error(
            'Finish or confirm the current change before switching months.',
          );
        return withQueuedTransactions(data);
      } catch (caught) {
        if (deviceOnline() && maySwitch()) {
          const cached = await cachedMonth();
          if (cached) return cached;
        }
        message.info(
          caught instanceof Error
            ? caught.message
            : 'Could not open this month. Your current data is unchanged.',
        );
        return null;
      }
    },
    [message, request],
  );

  const selectPeriod = useCallback(
    async (period: string) => {
      const selection = ++periodSelectionRef.current;
      const currentLedger = ledgerRef.current;
      if (
        currentLedger?.compact &&
        period !== (currentLedger.detailPeriod ?? currentLedger.latestPeriod)
      ) {
        const data = await hydrateMonthLedger(period);
        if (!data || selection !== periodSelectionRef.current) return;
        setLedger(data);
        resetBudgetOrderInteraction();
        setSelectedPeriod(period);
        setOpenTransactionWeek(defaultTransactionWeek(period, clock.date));
        return;
      }
      resetBudgetOrderInteraction();
      setSelectedPeriod(period);
      setOpenTransactionWeek(defaultTransactionWeek(period, clock.date));
    },
    [clock.date, hydrateMonthLedger, resetBudgetOrderInteraction, setLedger],
  );

  const selectBudgetType = useCallback(
    (type: LedgerType) => {
      resetBudgetOrderInteraction();
      setBudgetType(type);
    },
    [resetBudgetOrderInteraction],
  );

  const openWeekTransactions = useCallback(
    (week: number) => {
      resetBudgetOrderInteraction();
      setFilterType('expense');
      setSearch('');
      setTransactionFilters(EMPTY_TRANSACTION_FILTERS);
      setOpenTransactionWeek(String(week));
      setWeekJump(week);
      setView('transactions');
    },
    [resetBudgetOrderInteraction],
  );

  const loadLedger = useCallback(
    async (background = false, notify = background, monthOnly = !notify) => {
      if (
        background &&
        (pendingEditRef.current ||
          pendingWriteRef.current ||
          activeWritesRef.current ||
          deletionTimersRef.current.size)
      )
        return;
      const startedAt = performance.now();
      const mutationEpoch = ledgerMutationEpochRef.current;
      let successful = false;
      if (background && refreshingLedgerRef.current) return;
      if (background) {
        refreshingLedgerRef.current = true;
        setSyncing(true);
      } else setLoading(true);
      if (!background) setError('');
      try {
        const endpoint = background
          ? `/api/ledger?refresh=1&compact=1&period=${selectedPeriodRef.current}${monthOnly ? '' : '&verify=1'}`
          : '/api/ledger?compact=1';
        const response = background
          ? await request(endpoint, { cache: 'no-store' })
          : await request(endpoint, { cache: 'no-store' }, 4500);
        const data = await readJson<LedgerData>(response);
        successful = true;
        if (background) setRefreshError('');
        if (
          mutationEpoch === ledgerMutationEpochRef.current &&
          !activeWritesRef.current &&
          !deletionTimersRef.current.size
        )
          setLedger(withQueuedTransactions(data));
        setError('');
        if (!background) {
          void selectPeriod(defaultLedgerPeriod(data, startupDateRef.current));
        }
        if (
          background &&
          notify &&
          !monthOnly &&
          data.syncMode === 'google-sheets'
        ) {
          message.success('Synced with Google Sheets');
          recordActivity(
            'Google Sheet checked',
            data.integrity?.repairedCount
              ? `${data.integrity.repairedCount} spreadsheet issue${data.integrity.repairedCount === 1 ? '' : 's'} repaired.`
              : 'Formulas, visible rows, and backups are healthy.',
          );
        }
      } catch (caught) {
        const detail =
          caught instanceof Error
            ? caught.message
            : 'Kaikei could not load your ledger.';
        if (background) {
          setRefreshError(detail);
          if (notify) message.error(detail);
        } else {
          setError(detail);
        }
      } finally {
        setPerformanceSamples(
          recordPerformanceSample(
            background ? 'Background refresh' : 'Ledger load',
            performance.now() - startedAt,
            successful,
          ),
        );
        if (background) {
          refreshingLedgerRef.current = false;
          lastRefreshAtRef.current = Date.now();
          setSyncing(false);
        } else setLoading(false);
      }
      return successful;
    },
    [message, recordActivity, selectPeriod, request, setLedger],
  );

  const lastViewedPeriodRef = useRef(selectedPeriod);
  useEffect(() => {
    if (lastViewedPeriodRef.current === selectedPeriod) return;
    if (syncing) return;
    lastViewedPeriodRef.current = selectedPeriod;
    if (ledger?.syncMode !== 'google-sheets' || !online) return;
    const frame = requestAnimationFrame(() => void loadLedger(true, false));
    return () => cancelAnimationFrame(frame);
  }, [selectedPeriod, ledger?.syncMode, online, syncing, loadLedger]);

  const flushQueuedTransactions = useCallback(async () => {
    if (
      flushingOutboxRef.current ||
      addingOutboxRef.current ||
      pendingEditRef.current ||
      pendingWriteRef.current ||
      !deviceOnline()
    )
      return;
    flushingOutboxRef.current = true;
    setOutboxError('');
    try {
      // Re-read between batches: additions made while syncing must not be lost.
      let savedCount = 0;
      await drainOutbox(async () => {
        while (deviceOnline() && !addingOutboxRef.current) {
          const queued = readStoredArray<TransactionInput>(OUTBOX_KEY).slice(
            0,
            OUTBOX_BATCH_SIZE,
          );
          if (!queued.length) break;
          const result = await readJson<LedgerTransaction[]>(
            await request('/api/ledger', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ transactions: queued }),
            }),
          );
          const remaining = await updateOutbox<TransactionInput>(
            window.localStorage,
            OUTBOX_KEY,
            (current) =>
              confirmedOutboxRemainder(current, queued, result.length),
          );
          const optimisticIds = new Set(
            queued.map((item) => 'pending-' + item.clientMutationId),
          );
          ledgerMutationEpochRef.current += 1;
          setLedger((current) =>
            current
              ? {
                  ...current,
                  transactions: mergeTransactionRows(
                    current.transactions,
                    result,
                    optimisticIds,
                  ),
                }
              : current,
          );
          setQueuedCount(remaining.length);
          recordActivity(
            'Transactions saved',
            result.length + ' changes confirmed by Google Sheets.',
          );
          savedCount += result.length;
        }
      });
      if (savedCount) message.success('Queued changes saved');
    } catch (caught) {
      const detail =
        caught instanceof Error
          ? caught.message
          : 'Could not confirm the queued saves.';
      setOutboxError(
        detail +
          ' Entries are retained. Use Retry queued saves in Sync status; it reuses the original identifiers.',
      );
      setLedger((current) =>
        current
          ? {
              ...current,
              transactions: current.transactions.map((item) =>
                item.source === 'pending'
                  ? { ...item, source: 'queued' }
                  : item,
              ),
            }
          : current,
      );
    } finally {
      flushingOutboxRef.current = false;
      try {
        setQueuedCount(readStoredArray<TransactionInput>(OUTBOX_KEY).length);
      } catch {
        setOutboxError(
          'The offline queue could not be read. Do not clear device storage; recover it before adding transactions.',
        );
      }
    }
  }, [message, recordActivity, request, setLedger]);

  useEffect(() => {
    const updateQueue = (event: Event) => {
      if (event instanceof StorageEvent && event.key !== OUTBOX_KEY) return;
      try {
        setQueuedCount(readStoredArray<TransactionInput>(OUTBOX_KEY).length);
        const queued = readStoredArray<TransactionInput>(OUTBOX_KEY);
        const ids = new Set(
          queued.map((item) => 'pending-' + item.clientMutationId),
        );
        setLedger((current) =>
          current
            ? withQueuedTransactions({
                ...current,
                transactions: current.transactions.filter(
                  (item) =>
                    !['queued', 'pending'].includes(item.source) ||
                    ids.has(item.id),
                ),
              })
            : current,
        );
        if (event instanceof StorageEvent && deviceOnline())
          void loadLedger(true, false);
      } catch {
        setOutboxError(
          'The queue could not be read. Do not clear device storage.',
        );
      }
    };
    window.addEventListener('storage', updateQueue);
    window.addEventListener('kaikei-queue-changed', updateQueue);
    return () => {
      window.removeEventListener('storage', updateQueue);
      window.removeEventListener('kaikei-queue-changed', updateQueue);
    };
  }, [setLedger, loadLedger]);

  useEffect(() => {
    if (startupMonthResolvedRef.current) return;
    startupMonthResolvedRef.current = true;
    // Installed launches can reuse yesterday's cached server-rendered clock.
    startupDateRef.current = getTokyoClock().date;
    if (initialLedger)
      void selectPeriod(
        defaultLedgerPeriod(initialLedger, startupDateRef.current),
      );
  }, [initialLedger, selectPeriod]);

  useEffect(() => {
    const refreshClock = () => {
      const next = getTokyoClock();
      setClock((current) =>
        current.date === next.date && current.hour === next.hour
          ? current
          : next,
      );
    };
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') refreshClock();
    };
    const timer = window.setInterval(refreshClock, 60_000);
    document.addEventListener('visibilitychange', handleVisibilityChange);
    const nativeClock = () => refreshClock();
    window.addEventListener('kaikei-app-state', nativeClock);
    refreshClock();
    return () => {
      window.clearInterval(timer);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      window.removeEventListener('kaikei-app-state', nativeClock);
    };
  }, []);

  useEffect(() => {
    const frame = window.requestAnimationFrame(() => {
      setActivity(readStoredArray<ActivityItem>(ACTIVITY_KEY));
      setPerformanceSamples(
        readStoredArray<PerformanceSample>(PERFORMANCE_KEY),
      );
      try {
        setQueuedCount(readStoredArray<TransactionInput>(OUTBOX_KEY).length);
      } catch {
        setOutboxError(
          'Device storage is unavailable. Saved data is still visible, but new changes cannot be queued safely.',
        );
      }
      setOnline(deviceOnline());
    });
    const handleOnline = () => {
      setOnline(true);
      void flushQueuedTransactions();
    };
    const handleOffline = () => setOnline(false);
    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    let serviceWorkerIdleId: number | undefined;
    let serviceWorkerTimer: ReturnType<typeof setTimeout> | undefined;
    const shellMessage = (event: MessageEvent) => {
      if (event.data?.type === 'KAIKEI_ASSET_MISSING') setUpdateAvailable(true);
    };
    navigator.serviceWorker?.addEventListener('message', shellMessage);
    const registerServiceWorker = () => {
      if (
        !('serviceWorker' in navigator) ||
        getClientRuntime() ||
        ['localhost', '127.0.0.1'].includes(window.location.hostname)
      )
        return;
      void navigator.serviceWorker
        .register('/sw.js?v=25', { updateViaCache: 'none' })
        .then((registration) => {
          if (registration.waiting) setUpdateAvailable(true);
          registration.addEventListener('updatefound', () => {
            const worker = registration.installing;
            worker?.addEventListener('statechange', () => {
              if (
                worker.state === 'installed' &&
                navigator.serviceWorker.controller
              )
                setUpdateAvailable(true);
            });
          });
        })
        .catch(() => {
          // The app still works without installation support.
        });
    };
    const scheduleServiceWorkerRegistration = () => {
      if ('requestIdleCallback' in window) {
        serviceWorkerIdleId = window.requestIdleCallback(
          registerServiceWorker,
          { timeout: 5000 },
        );
      } else {
        serviceWorkerTimer = setTimeout(registerServiceWorker, 3000);
      }
    };
    // Home Screen caches are useful only if the OS keeps them. This is a
    // best-effort browser request, never a prerequisite for rendering or saving.
    let persistenceRequested = false;
    const requestPersistentStorage = () => {
      const standalone =
        window.matchMedia('(display-mode: standalone)').matches ||
        (navigator as Navigator & { standalone?: boolean }).standalone;
      if (
        persistenceRequested ||
        getClientRuntime() ||
        !standalone ||
        !navigator.storage?.persist ||
        !navigator.storage.persisted
      )
        return;
      persistenceRequested = true;
      void navigator.storage
        .persisted()
        .then((persisted) => (persisted ? true : navigator.storage.persist()))
        .catch(() => undefined);
    };
    window.addEventListener('pointerdown', requestPersistentStorage, {
      once: true,
    });
    window.addEventListener('keydown', requestPersistentStorage, {
      once: true,
    });
    if (document.readyState === 'complete') scheduleServiceWorkerRegistration();
    else
      window.addEventListener('load', scheduleServiceWorkerRegistration, {
        once: true,
      });

    return () => {
      window.cancelAnimationFrame(frame);
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
      window.removeEventListener('load', scheduleServiceWorkerRegistration);
      navigator.serviceWorker?.removeEventListener('message', shellMessage);
      window.removeEventListener('pointerdown', requestPersistentStorage);
      window.removeEventListener('keydown', requestPersistentStorage);
      if (serviceWorkerIdleId !== undefined)
        window.cancelIdleCallback(serviceWorkerIdleId);
      if (serviceWorkerTimer !== undefined) clearTimeout(serviceWorkerTimer);
    };
  }, [flushQueuedTransactions]);

  useEffect(() => {
    if (!ledgerReady || view !== 'overview' || paintedRecordedRef.current)
      return;
    return afterPaintOpportunity(
      () => {
        paintedRecordedRef.current = true;
        setHomePainted(true);
        performance.mark('kaikei:home-paint-opportunity');
        recordStartupSample(
          'Startup · Home paint opportunity',
          performance.now(),
          true,
        );
      },
      window.requestAnimationFrame.bind(window),
      window.cancelAnimationFrame.bind(window),
    );
  }, [ledgerReady, view, recordStartupSample]);

  useEffect(() => {
    if (
      !ledgerReady ||
      !homePainted ||
      !startupRestored ||
      view !== 'overview' ||
      readyRecordedRef.current
    )
      return;
    let idleId: number | undefined;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const frame = requestAnimationFrame(() => {
      readyRecordedRef.current = true;
      window.dispatchEvent(new Event('kaikei-ready'));
      performance.mark('kaikei:home-interactive');
      recordStartupSample(
        'Startup · Home interactive',
        performance.now(),
        true,
      );
      // Instrumentation must not add synchronous storage writes to first paint.
      const persist = () => {
        const samples = [...startupSamplesRef.current].reverse();
        startupSamplesRef.current = [];
        const next = [
          ...samples,
          ...readStoredArray<PerformanceSample>(PERFORMANCE_KEY),
        ].slice(0, 30);
        writeStoredArray(PERFORMANCE_KEY, next);
        setPerformanceSamples(next);
      };
      if ('requestIdleCallback' in window)
        idleId = window.requestIdleCallback(persist, { timeout: 2000 });
      else timer = setTimeout(persist, 200);
    });
    return () => {
      cancelAnimationFrame(frame);
      // Persisting a completed measurement is optional and contains no ledger
      // data; leave the scheduled batch intact on ordinary view navigation.
      if (!readyRecordedRef.current) {
        if (idleId !== undefined) window.cancelIdleCallback(idleId);
        if (timer !== undefined) clearTimeout(timer);
      }
    };
  }, [ledgerReady, homePainted, startupRestored, view, recordStartupSample]);

  useEffect(() => {
    let idleId: number | undefined;
    let refreshTimer: ReturnType<typeof setTimeout> | undefined;
    let cancelled = false;
    const refreshAfterFirstPaint = (snapshot: LedgerData) => {
      if (
        cancelled ||
        automaticRefreshDeferred() ||
        !automaticRefreshDue(snapshot, selectedPeriodRef.current)
      )
        return;
      const refresh = () => {
        if (cancelled) return;
        if (snapshot.compact) void refreshCompactLedger(true);
        else void loadLedger(true, false);
      };
      if ('requestIdleCallback' in window) {
        idleId = window.requestIdleCallback(refresh, { timeout: 2500 });
      } else {
        refreshTimer = setTimeout(refresh, 1200);
      }
    };
    const frame = window.requestAnimationFrame(() => {
      const epoch = ledgerMutationEpochRef.current;
      const selection = periodSelectionRef.current;
      void (async () => {
        const cacheStarted = performance.now();
        const cached =
          getClientRuntime() && initialLedger
            ? null
            : await boundedCacheRead(readCachedLedger);
        bootstrappingRef.current = false;
        if (cancelled) return;
        recordStartupSample(
          'Startup · cache read',
          performance.now() - cacheStarted,
          true,
        );
        if (
          cancelled ||
          epoch !== ledgerMutationEpochRef.current ||
          activeWritesRef.current
        ) {
          setStartupRestored(true);
          return;
        }
        const selected = newestSnapshot([
          cached,
          initialLedger ? { value: initialLedger, cachedAt: 0 } : null,
        ]);
        const snapshot = selected?.value;
        if (snapshot) {
          performance.mark('kaikei:snapshot-restored');
          recordStartupSample(
            `Startup · snapshot (${selected === cached ? cached?.source : getClientRuntime() ? 'browser-local demo snapshot' : 'server shell'})`,
            performance.now(),
            true,
          );
          setStartupRestored(true);
          // Only persist the selected snapshot after examining existing device
          // snapshots; cached SSR HTML must not overwrite a newer local save.
          cacheLedger(snapshot);
          setLedger(withQueuedTransactions(snapshot));
          setLoading(false);
          if (selection === periodSelectionRef.current)
            void selectPeriod(
              defaultLedgerPeriod(snapshot, startupDateRef.current),
            );
          refreshAfterFirstPaint(snapshot);
          return;
        }
        const loaded = await loadLedger(false, false);
        if (!cancelled) {
          setStartupRestored(true);
          recordStartupSample(
            'Startup · snapshot (network)',
            performance.now(),
            Boolean(loaded),
          );
        }
      })();
    });
    return () => {
      cancelled = true;
      window.cancelAnimationFrame(frame);
      if (idleId !== undefined) window.cancelIdleCallback(idleId);
      if (refreshTimer !== undefined) clearTimeout(refreshTimer);
    };
  }, [
    initialLedger,
    loadLedger,
    refreshCompactLedger,
    selectPeriod,
    setLedger,
    recordStartupSample,
  ]);

  // The launch snapshot already contains this month's complete details. Opening
  // Budget or Transactions must not download all historical transaction rows.

  useEffect(() => {
    let cancelResumePaint: (() => void) | undefined;
    const handleVisibilityChange = (
      active = document.visibilityState !== 'hidden',
    ) => {
      if (!active) {
        lastHiddenAtRef.current = Date.now();
        return;
      }
      if (!ledgerReady) return;
      void flushQueuedTransactions();
      const hiddenAt = lastHiddenAtRef.current;
      if (hiddenAt) {
        lastHiddenAtRef.current = 0;
        const resumedAt = performance.now();
        cancelResumePaint?.();
        cancelResumePaint = afterPaintOpportunity(
          () => {
            setPerformanceSamples(
              recordPerformanceSample(
                'Foreground · paint opportunity',
                performance.now() - resumedAt,
                true,
              ),
            );
          },
          window.requestAnimationFrame.bind(window),
          window.cancelAnimationFrame.bind(window),
        );
      }
      if (
        online &&
        !automaticRefreshDeferred() &&
        hiddenAt &&
        Date.now() - hiddenAt > 30_000 &&
        automaticRefreshDue(ledger, selectedPeriodRef.current) &&
        Date.now() - lastRefreshAtRef.current >= AUTOMATIC_REFRESH_INTERVAL_MS
      ) {
        if (ledger?.compact) void refreshCompactLedger(true);
        else void loadLedger(true, false);
      }
    };
    const handlePageShow = () => {
      if (document.visibilityState === 'visible') handleVisibilityChange();
    };
    const browserVisibility = () => handleVisibilityChange();
    const nativeVisibility = (event: Event) =>
      handleVisibilityChange(
        (event as CustomEvent<{ isActive: boolean }>).detail.isActive,
      );
    document.addEventListener('visibilitychange', browserVisibility);
    window.addEventListener('kaikei-app-state', nativeVisibility);
    window.addEventListener('pageshow', handlePageShow);
    return () => {
      cancelResumePaint?.();
      document.removeEventListener('visibilitychange', browserVisibility);
      window.removeEventListener('kaikei-app-state', nativeVisibility);
      window.removeEventListener('pageshow', handlePageShow);
    };
  }, [
    flushQueuedTransactions,
    ledger,
    ledgerReady,
    loadLedger,
    online,
    refreshCompactLedger,
  ]);

  useEffect(() => {
    if (ledger && (!bootstrappingRef.current || ledger !== initialLedger))
      cacheLedger(ledger);
  }, [ledger, initialLedger]);

  useEffect(() => {
    if (!ledgerReady || !online) return;
    const frame = window.requestAnimationFrame(() => {
      void flushQueuedTransactions();
    });
    return () => window.cancelAnimationFrame(frame);
  }, [flushQueuedTransactions, ledgerReady, online, queuedCount]);

  useEffect(() => {
    const context = document.modelContext;
    if (!context?.registerTool) return;
    const lifecycle = new AbortController();
    void Promise.resolve(
      context.registerTool(
        {
          name: 'add_transaction',
          title: 'Add a Kaikei transaction',
          description:
            'Create one income or expense entry and update the visible Kaikei ledger.',
          inputSchema: {
            type: 'object',
            properties: {
              transactionDate: {
                type: 'string',
                description: 'Date in YYYY-MM-DD format.',
              },
              type: { type: 'string', enum: ['expense', 'income'] },
              amount: { type: 'number', exclusiveMinimum: 0 },
              description: { type: 'string', minLength: 1, maxLength: 120 },
              category: { type: 'string', minLength: 1, maxLength: 80 },
            },
            required: [
              'transactionDate',
              'type',
              'amount',
              'description',
              'category',
            ],
            additionalProperties: false,
          },
          annotations: { readOnlyHint: false, untrustedContentHint: false },
          async execute(input) {
            const item = await readJson<LedgerTransaction>(
              await request('/api/ledger', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(input),
              }),
            );
            setLedger((current) =>
              current
                ? { ...current, transactions: [item, ...current.transactions] }
                : current,
            );
            void selectPeriod(item.period);
            return { id: item.id, status: 'created', period: item.period };
          },
        },
        { signal: lifecycle.signal },
      ),
    ).catch(() => undefined);
    return () => lifecycle.abort();
  }, [selectPeriod, request, setLedger]);

  const periods = useMemo(() => {
    if (!ledger) return [];
    if (ledger.periodSummaries?.length)
      return ledger.periodSummaries.map((item) => item.period);
    return [
      ...new Set([
        ...ledger.budgets.map((item) => item.period),
        ...ledger.transactions.map((item) => item.period),
      ]),
    ].sort();
  }, [ledger]);

  const monthTransactions = useMemo(
    () =>
      ledger?.transactions
        .filter((item) => item.period === selectedPeriod)
        .sort(compareTransactions) || [],
    [ledger, selectedPeriod],
  );

  const monthBudgets = useMemo(
    () =>
      ledger?.budgets.filter((item) => item.period === selectedPeriod) || [],
    [ledger, selectedPeriod],
  );

  const monthExpense = useMemo(
    () =>
      monthTransactions
        .filter((item) => item.type === 'expense')
        .reduce((sum, item) => sum + item.amount, 0),
    [monthTransactions],
  );

  const monthIncome = useMemo(
    () =>
      monthTransactions
        .filter((item) => item.type === 'income')
        .reduce((sum, item) => sum + item.amount, 0),
    [monthTransactions],
  );

  const biggestPurchases = useMemo(
    () =>
      monthTransactions
        .filter(
          (item) =>
            item.type === 'expense' &&
            item.amount > 0 &&
            item.source !== 'google-sheet-summary',
        )
        .sort(
          (a, b) =>
            b.amount - a.amount ||
            b.transactionDate.localeCompare(a.transactionDate) ||
            b.createdAt - a.createdAt,
        )
        .slice(0, 5),
    [monthTransactions],
  );

  const plannedExpense = useMemo(
    () =>
      monthBudgets
        .filter((item) => item.type === 'expense')
        .reduce((sum, item) => sum + item.plannedAmount, 0),
    [monthBudgets],
  );

  const plannedIncome = useMemo(
    () =>
      monthBudgets
        .filter((item) => item.type === 'income')
        .reduce((sum, item) => sum + item.plannedAmount, 0),
    [monthBudgets],
  );

  const currentBalance = useMemo(() => {
    if (!ledger) return 0;
    const summary = ledger.periodSummaries?.find(
      (item) => item.period === selectedPeriod,
    );
    if (summary) return summary.balance;
    return (
      ledger.initialBalance +
      ledger.transactions
        .filter((item) => item.period <= selectedPeriod)
        .reduce(
          (sum, item) =>
            sum + (item.type === 'income' ? item.amount : -item.amount),
          0,
        )
    );
  }, [ledger, selectedPeriod]);

  const flowData = useMemo(() => {
    if (!ledger) return [];
    if (ledger.periodSummaries?.length)
      return ledger.periodSummaries.map((item) => ({
        period: item.period,
        label: compactMonth(item.period),
        income: item.income,
        expense: item.expense,
      }));
    return periods.map((period) => {
      const items = ledger.transactions.filter(
        (item) => item.period === period,
      );
      return {
        period,
        label: compactMonth(period),
        income: items
          .filter((item) => item.type === 'income')
          .reduce((sum, item) => sum + item.amount, 0),
        expense: items
          .filter((item) => item.type === 'expense')
          .reduce((sum, item) => sum + item.amount, 0),
      };
    });
  }, [ledger, periods]);

  const categoryActuals = useMemo(() => {
    const result = new Map<string, number>();
    for (const item of monthTransactions) {
      const key = `${item.type}:${item.category}`;
      result.set(key, (result.get(key) || 0) + item.amount);
    }
    return result;
  }, [monthTransactions]);

  const budgetRows = useMemo(() => {
    if (view !== 'budgets') return [];
    const plans =
      budgetOrderPreview?.period === selectedPeriod &&
      budgetOrderPreview.type === budgetType
        ? budgetOrderPreview.items
        : monthBudgets.filter((item) => item.type === budgetType);
    const byCategory = new Map(plans.map((item) => [item.category, item]));
    for (const item of monthTransactions.filter(
      (entry) => entry.type === budgetType,
    )) {
      if (!byCategory.has(item.category)) {
        byCategory.set(item.category, {
          id: `new-${selectedPeriod}-${budgetType}-${item.category}`,
          period: selectedPeriod,
          type: budgetType,
          category: item.category,
          plannedAmount: 0,
          updatedAt: 0,
        });
      }
    }
    return [...byCategory.values()].map((item) => ({
      ...item,
      actual: categoryActuals.get(`${budgetType}:${item.category}`) || 0,
    }));
  }, [
    view,
    budgetType,
    budgetOrderPreview,
    categoryActuals,
    monthBudgets,
    monthTransactions,
    selectedPeriod,
  ]);

  const orderableBudgets = useMemo(
    () => monthBudgets.filter((item) => item.type === budgetType),
    [budgetType, monthBudgets],
  );

  const budgetPulse = useMemo(
    () =>
      monthBudgets
        .filter(
          (item) =>
            item.type === 'expense' &&
            weeklyCategoryNumber(item.category) !== null,
        )
        .map((item) => ({
          ...item,
          actual: categoryActuals.get(`expense:${item.category}`) || 0,
        }))
        .sort(
          (a, b) =>
            (weeklyCategoryNumber(a.category) || 0) -
            (weeklyCategoryNumber(b.category) || 0),
        ),
    [categoryActuals, monthBudgets],
  );

  const fixedCosts = useMemo(
    () =>
      monthBudgets
        .filter(
          (item) =>
            item.type === 'expense' &&
            weeklyCategoryNumber(item.category) === null &&
            item.plannedAmount > 0,
        )
        .map((item) => {
          const actual = categoryActuals.get(`expense:${item.category}`) || 0;
          return {
            ...item,
            actual,
            remaining: Math.max(0, item.plannedAmount - actual),
            covered: actual >= item.plannedAmount,
          };
        }),
    [categoryActuals, monthBudgets],
  );

  const fixedCostsCovered = fixedCosts.filter((item) => item.covered).length;

  const monthlyReview = useMemo(() => {
    const expenseCategories = [...categoryActuals.entries()]
      .filter(([key, amount]) => key.startsWith('expense:') && amount > 0)
      .map(([key, amount]) => ({ category: key.slice(8), amount }))
      .sort((a, b) => b.amount - a.amount);
    const previousPeriod = dayjs(`${selectedPeriod}-01`)
      .subtract(1, 'month')
      .format('YYYY-MM');
    const previousSummary = ledger?.periodSummaries?.find(
      (item) => item.period === previousPeriod,
    );
    const previousExpense =
      previousSummary?.expense ??
      ledger?.transactions
        .filter(
          (item) => item.period === previousPeriod && item.type === 'expense',
        )
        .reduce((sum, item) => sum + item.amount, 0) ??
      0;
    return {
      net: monthIncome - monthExpense,
      savingsRate: monthIncome
        ? Math.round(((monthIncome - monthExpense) / monthIncome) * 100)
        : null,
      topCategory: expenseCategories[0] || null,
      expenseChange: previousExpense
        ? Math.round(((monthExpense - previousExpense) / previousExpense) * 100)
        : null,
      previousPeriod,
    };
  }, [categoryActuals, ledger, monthExpense, monthIncome, selectedPeriod]);

  const categoryBreakdown = useMemo(() => {
    const categories = [...categoryActuals.entries()]
      .filter(([key, amount]) => key.startsWith('expense:') && amount > 0)
      .map(([key, amount]) => ({
        category: key.slice(8),
        amount,
      }))
      .sort((a, b) => b.amount - a.amount);
    const leading = categories.slice(0, 4);
    const otherAmount = categories
      .slice(4)
      .reduce((sum, item) => sum + item.amount, 0);
    const items = otherAmount
      ? [...leading, { category: 'Other', amount: otherAmount }]
      : leading;
    const stops = items.map((item, index) => {
      const start = monthExpense
        ? (items
            .slice(0, index)
            .reduce((sum, previous) => sum + previous.amount, 0) /
            monthExpense) *
          100
        : 0;
      const end = monthExpense ? start + (item.amount / monthExpense) * 100 : 0;
      return `${CATEGORY_COLORS[index]} ${start}% ${end}%`;
    });
    return {
      items: items.map((item, index) => ({
        ...item,
        color: CATEGORY_COLORS[index],
        percent: monthExpense
          ? Math.round((item.amount / monthExpense) * 100)
          : 0,
      })),
      background: stops.length
        ? `conic-gradient(${stops.join(', ')})`
        : 'var(--neutral-soft)',
    };
  }, [categoryActuals, monthExpense]);

  const spendingGuide = useMemo(
    () =>
      calculateSpendingGuide(
        selectedPeriod,
        monthBudgets,
        categoryActuals,
        clock.date,
      ),
    [selectedPeriod, monthBudgets, categoryActuals, clock.date],
  );

  const transactionLedgerItems = useMemo(
    () =>
      view !== 'transactions'
        ? []
        : monthTransactions.filter(
            (item) =>
              item.type === 'income' ||
              weeklyCategoryNumber(item.category) !== null ||
              item.source !== 'google-sheet-summary',
          ),
    [monthTransactions, view],
  );

  const weeklyExpenseTotal = useMemo(
    () =>
      transactionLedgerItems
        .filter((item) => item.type === 'expense')
        .reduce((sum, item) => sum + item.amount, 0),
    [transactionLedgerItems],
  );

  const filteredTransactions = useMemo(() => {
    return filterTransactions(
      transactionLedgerItems,
      deferredSearch,
      filterType,
      transactionFilters,
    );
  }, [deferredSearch, filterType, transactionLedgerItems, transactionFilters]);

  const splitTransactions = useMemo(() => {
    return {
      expenses: filteredTransactions.filter((item) => item.type === 'expense'),
      income: filteredTransactions.filter((item) => item.type === 'income'),
    };
  }, [filteredTransactions]);

  const filterCategories = useMemo(
    () =>
      [...new Set(transactionLedgerItems.map((item) => item.category))].sort(),
    [transactionLedgerItems],
  );
  const recentPurchases = useMemo(() => {
    if (view !== 'transactions') return [];
    const seen = new Set<string>();
    return [...(ledger?.transactions || [])]
      .sort(compareTransactions)
      .filter((item) => {
        if (
          item.type !== 'expense' ||
          ['pending', 'queued', 'google-sheet-summary'].includes(item.source)
        )
          return false;
        const key = item.description.toLocaleLowerCase() + ':' + item.category;
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
      })
      .slice(0, 8);
  }, [ledger?.transactions, view]);

  const transactionWeekGroups = useMemo(
    () =>
      view !== 'transactions'
        ? []
        : [1, 2, 3, 4].map((week) => {
            const items = filteredTransactions.filter(
              (item) => transactionWeekNumber(item) === week,
            );
            return {
              week,
              items,
              expenseTotal: items
                .filter((item) => item.type === 'expense')
                .reduce((sum, item) => sum + item.amount, 0),
              incomeTotal: items
                .filter((item) => item.type === 'income')
                .reduce((sum, item) => sum + item.amount, 0),
            };
          }),
    [filteredTransactions, view],
  );

  const transactionDayPresentation = useMemo(() => {
    const bands = new Map<string, 'warm' | 'cool'>();
    const starts = new Set<string>();
    for (const group of transactionWeekGroups) {
      let previousDate = '';
      let band: 'warm' | 'cool' = 'cool';
      for (const item of group.items) {
        if (item.transactionDate !== previousDate) {
          if (previousDate) band = band === 'cool' ? 'warm' : 'cool';
          previousDate = item.transactionDate;
          starts.add(item.id);
        }
        bands.set(item.id, band);
      }
    }
    return { bands, starts };
  }, [transactionWeekGroups]);

  const transactionDayClassName = (item: LedgerTransaction) =>
    `transaction-day-${transactionDayPresentation.bands.get(item.id) || 'cool'}${
      transactionDayPresentation.starts.has(item.id)
        ? ' transaction-day-start'
        : ''
    }`;

  const transactionCategories = useMemo(() => {
    if (!transactionOpen && view !== 'transactions')
      return { expense: [], income: [] };
    const incomeCategories = [
      ...new Set([
        ...(ledger?.transactions || [])
          .filter((item) => item.type === 'income')
          .map((item) => item.category),
        ...(ledger?.budgets || [])
          .filter((item) => item.type === 'income')
          .map((item) => item.category),
      ]),
    ]
      .sort()
      .map((value) => ({ label: value, value }));
    return {
      expense: [1, 2, 3, 4].map((week) => {
        const category =
          monthBudgets.find(
            (item) =>
              item.type === 'expense' &&
              weeklyCategoryNumber(item.category) === week,
          )?.category || `Week ${week}`;
        return { label: category, value: category };
      }),
      income: incomeCategories,
    };
  }, [ledger, monthBudgets, transactionOpen, view]);

  const exportSelectedMonth = async () => {
    const rows = [
      ['Date', 'Description', 'Category', 'Type', 'Amount', 'Source'],
      ...monthTransactions.map((item) => [
        item.transactionDate,
        item.description,
        item.category,
        item.type,
        item.amount,
        item.source,
      ]),
    ];
    try {
      await downloadTextFile(
        `kaikei-${selectedPeriod}.csv`,
        rows.map((row) => row.map(csvValue).join(',')).join('\n'),
        'text/csv;charset=utf-8',
      );
      message.success(`${monthLabel(selectedPeriod)} exported`);
    } catch {
      message.error(
        'The export could not be completed. Your data is unchanged.',
      );
    }
  };

  const exportRecoveryRecords = (): RecoveryRecord[] => {
    const drafts = recoveryRecords(window.localStorage);
    if (getClientRuntime()?.recoveryStorage)
      for (const key of [EDIT_DRAFT_KEY, WRITE_DRAFT_KEY]) {
        const value = recoveryStorage().getItem(key);
        if (value) {
          const parsed = JSON.parse(value);
          drafts.push({
            key,
            value,
            id: parsed.input?.clientMutationId || parsed.operationId || key,
            at: Date.now(),
          });
        }
      }
    return drafts;
  };
  const downloadLedgerBackup = async () => {
    if (backingUpRef.current) return;
    backingUpRef.current = true;
    setBackingUp(true);
    try {
      const snapshot = await hydrateFullLedger();
      if (!snapshot)
        throw new Error(
          'Complete history is not available on this device. Reconnect or export recovery data.',
        );
      const file = {
        ...snapshot,
        exportedAt: new Date().toISOString(),
        version: '3.10.4',
        queuedTransactions: readStoredArray<TransactionInput>(OUTBOX_KEY),
        recoveryDrafts: exportRecoveryRecords(),
      };
      const { validateBackup } = await import('@/lib/backup');
      validateBackup(file);
      await downloadTextFile(
        'kaikei-backup-' + clock.date + '.json',
        JSON.stringify(file, null, 2),
        'application/json;charset=utf-8',
      );
      if (snapshot.historySource === 'device-cache')
        message.warning(
          'Backup downloaded from cached history. Its freshness is recorded in the file; your screen is unchanged.',
        );
      else
        message.success('Private backup downloaded — your screen is unchanged');
    } catch (caught) {
      message.error(
        caught instanceof Error
          ? caught.message
          : 'The backup could not be completed. Your data is unchanged.',
      );
    } finally {
      backingUpRef.current = false;
      setBackingUp(false);
    }
  };
  const downloadRecoveryData = async () => {
    try {
      await downloadTextFile(
        'kaikei-recovery-' + clock.date + '.json',
        JSON.stringify(
          {
            kind: 'kaikei-recovery-only',
            exportedAt: new Date().toISOString(),
            version: '3.10.4',
            queuedTransactions: readStoredArray<TransactionInput>(OUTBOX_KEY),
            recoveryDrafts: exportRecoveryRecords(),
          },
          null,
          2,
        ),
        'application/json;charset=utf-8',
      );
      message.info(
        'Recovery data exported. This is not a complete ledger backup; no operation was resubmitted.',
      );
    } catch {
      message.error(
        'Recovery data could not be exported. Do not clear website storage.',
      );
    }
  };
  const previewBackupFile = async (
    event: ReactChangeEvent<HTMLInputElement>,
  ) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;
    try {
      if (file.size > 32 * 1024 * 1024)
        throw new Error(
          'This file is too large for a safe in-browser recovery rehearsal.',
        );
      const { rehearseBackup } = await import('@/lib/backup');
      const report = rehearseBackup(JSON.parse(await file.text()));
      modal.info({
        title: 'Recovery rehearsal passed',
        content: (
          <div className="backup-preview-summary">
            <Text>
              {report.transactions} transactions · {report.budgets} estimates
              restored into an isolated test ledger.
            </Text>
            <Text>
              {report.queued} queued entries · {report.recovery} retained
              recovery operations verified.
            </Text>
            <Text>
              Calculated closing balance: {formatMoney(report.balance)}
            </Text>
            <Text>
              {report.periods.length
                ? monthLabel(report.periods[0]) +
                  '–' +
                  monthLabel(report.periods.at(-1)!)
                : 'No dated records'}
            </Text>
            <Text type="secondary">
              Dates, amounts, duplicate identities and receipt identifiers were
              checked. Your live app, queue and Google Sheet were not changed.
              Restoration to the live Sheet is deliberately not automatic.
            </Text>
          </div>
        ),
      });
    } catch (caught) {
      message.error(
        caught instanceof Error
          ? caught.message
          : 'This backup could not be verified.',
      );
    }
  };

  const openNewTransaction = (
    type: LedgerType = 'expense',
    defaults: Partial<
      Pick<TransactionDialogDefaults, 'amount' | 'description' | 'category'>
    > = {},
  ) => {
    if (pendingEditRef.current) {
      message.info(
        'Please confirm the previous edit before starting another transaction.',
      );
      return;
    }
    preloadTransactionDialog();
    if (historicalReadOnly) {
      message.info('Months before September 2026 are read-only in Kaikei.');
      return;
    }
    setEditingTransaction(null);
    setTransactionEntryMode('single');
    setTransactionDefaults({
      type,
      transactionDate:
        selectedPeriod === clock.date.slice(0, 7)
          ? clock.date
          : `${selectedPeriod}-01`,
      ...defaults,
    });
    setTransactionOpen(true);
  };

  const openEditTransaction = (item: LedgerTransaction) => {
    if (pendingEditRef.current) {
      message.info('Please confirm the previous edit first.');
      setEditingTransaction({
        ...pendingEditRef.current.original,
        ...pendingEditRef.current.input,
      });
      setTransactionOpen(true);
      return;
    }
    preloadTransactionDialog();
    if (item.period < MIN_WRITABLE_PERIOD) {
      message.info('Months before September 2026 are read-only in Kaikei.');
      return;
    }
    if (item.source === 'pending' || item.source === 'queued') {
      message.info(
        item.source === 'queued'
          ? 'This transaction is waiting for a connection.'
          : 'This transaction is still saving.',
      );
      return;
    }
    if (item.source === 'google-sheet-summary') {
      message.info(
        'This calculated total can be changed from its source rows in Google Sheets.',
      );
      return;
    }
    setEditingTransaction(item);
    setTransactionEntryMode('single');
    setTransactionOpen(true);
  };

  const repeatRecentPurchase = (item: LedgerTransaction) => {
    if (pendingEditRef.current || pendingWriteRef.current) {
      message.info('Confirm the previous save before repeating a purchase.');
      return;
    }
    preloadTransactionDialog();
    setEditingTransaction(null);
    setTransactionEntryMode('single');
    setTransactionDefaults({
      type: 'expense',
      amount: item.amount,
      description: item.description,
      category: item.category,
      transactionDate: getTokyoClock().date,
    });
    setTransactionOpen(true);
  };

  const confirmPossibleDuplicates = async (inputs: TransactionInput[]) => {
    const existing = new Set(
      (ledger?.transactions || [])
        .filter((item) => item.source !== 'google-sheet-summary')
        .map(duplicateKey),
    );
    let duplicateCount = 0;
    for (const item of inputs) {
      const key = duplicateKey(item);
      if (existing.has(key)) duplicateCount += 1;
      existing.add(key);
    }
    if (!duplicateCount) return Promise.resolve(true);
    if (!(await prepareFeedback())) return false;
    return new Promise<boolean>((resolve) => {
      modal.confirm({
        title:
          duplicateCount === 1
            ? 'Possible duplicate transaction'
            : `${duplicateCount} possible duplicates`,
        content:
          'The date, amount, description, and category match an existing entry. Add anyway?',
        okText: 'Add anyway',
        cancelText: 'Review',
        onOk: () => resolve(true),
        onCancel: () => resolve(false),
      });
    });
  };

  const addOptimisticTransactions = async (inputs: TransactionInput[]) => {
    if (addingOutboxRef.current)
      throw new Error(
        'Please wait for device storage to confirm this addition.',
      );
    if (pendingWriteRef.current)
      throw new Error('Confirm the previous save in Sync status first.');
    // This helper runs only on submission, never during render; model callbacks obscure that from the compiler lint.
    // oxlint-disable-next-line react/react-compiler
    const startedAt = Date.now();
    const queuedInputs = inputs.map((input) => ({
      ...input,
      clientMutationId: input.clientMutationId || crypto.randomUUID(),
    }));
    const optimisticItems: LedgerTransaction[] = queuedInputs.map(
      (input, index) => ({
        ...input,
        id: `pending-${input.clientMutationId}`,
        period: input.transactionDate.slice(0, 7),
        source: deviceOnline() ? 'pending' : 'queued',
        createdAt: startedAt + index,
      }),
    );

    addingOutboxRef.current = true;
    let nextOutbox: TransactionInput[];
    try {
      nextOutbox = await updateOutbox<TransactionInput>(
        window.localStorage,
        OUTBOX_KEY,
        (current) => {
          const knownMutations = new Set(
            current.map((item) => item.clientMutationId),
          );
          return [
            ...current,
            ...queuedInputs.filter(
              (item) => !knownMutations.has(item.clientMutationId),
            ),
          ];
        },
      );
    } catch {
      addingOutboxRef.current = false;
      setOutboxError(
        'Device storage is unavailable. Your form is still open and nothing was submitted. Enable storage before trying again.',
      );
      throw new Error(
        'Could not keep this change safely on your device. The form has been preserved.',
      );
    }
    try {
      ledgerMutationEpochRef.current += 1;
      setOutboxError('');
      setQueuedCount(nextOutbox.length);

      setLedger((current) =>
        current
          ? {
              ...current,
              transactions: mergeTransactionRows(
                current.transactions,
                optimisticItems,
              ),
            }
          : current,
      );
      const monthSelection = selectPeriod(optimisticItems[0].period);
      setOpenTransactionWeek(String(transactionWeekNumber(optimisticItems[0])));
      setTransactionOpen(false);
      setTransactionEntryMode('single');
      recordActivity(
        queuedInputs.length === 1 ? 'Transaction added' : 'Expenses added',
        queuedInputs.length === 1
          ? `${queuedInputs[0].description} · ${formatMoney(queuedInputs[0].amount)}`
          : `${queuedInputs.length} expenses queued for Google Sheets.`,
      );
      message.success(
        deviceOnline()
          ? 'Added — syncing in the background'
          : 'Added offline — it will sync automatically',
      );
      // Keep automatic queue flushing paused until the destination month's
      // read has settled; a concurrent write would invalidate that read.
      await monthSelection;
    } finally {
      addingOutboxRef.current = false;
    }
    void flushQueuedTransactions();
  };

  const retainEditDraft = (draft: PendingTransactionEdit | null) => {
    if (draft) {
      try {
        const encoded = JSON.stringify(draft);
        recoveryStorage().setItem(EDIT_DRAFT_KEY, encoded);
        if (recoveryStorage().getItem(EDIT_DRAFT_KEY) !== encoded)
          throw new Error('Storage verification failed.');
      } catch {
        throw new Error(
          'Your browser could not preserve the edit safely. The form is still open; enable device storage before saving.',
        );
      }
    } else {
      try {
        recoveryStorage().removeItem(EDIT_DRAFT_KEY);
      } catch {
        /* No new save was sent. */
      }
    }
    ledgerMutationEpochRef.current += 1;
    pendingEditRef.current = draft;
    setPendingEdit(draft);
  };

  const completeTransactionEdit = (
    draft: PendingTransactionEdit,
    item: LedgerTransaction,
  ) => {
    setLedger((current) =>
      current
        ? {
            ...current,
            transactions: replaceTransaction(
              current.transactions,
              draft.original.id,
              item,
            ),
          }
        : current,
    );
    retainEditDraft(null);
    setSaveConfirmationMessage('');
    // Let the request's completion bookkeeping finish before loading another
    // month's detail snapshot; our own completed write must not invalidate it.
    requestAnimationFrame(() => selectPeriod(item.period));
    setOpenTransactionWeek(String(transactionWeekNumber(item)));
    setTransactionOpen(false);
    message.success('Transaction updated');
    recordActivity(
      'Transaction updated',
      `${item.description} · ${formatMoney(item.amount)}`,
    );
  };

  const confirmPendingTransactionEdit = async () => {
    const draft = pendingEditRef.current;
    if (!draft || savingTransactionRef.current) return;
    savingTransactionRef.current = true;
    setSavingTransaction(true);
    try {
      const result = await transactionSaveJson<{
        saved: boolean;
        item?: LedgerTransaction;
      }>(
        `/api/ledger/${encodeURIComponent(draft.original.id)}?mutationId=${encodeURIComponent(draft.input.clientMutationId || '')}`,
        { cache: 'no-store' },
        10000,
      );
      if (result.saved && result.item)
        completeTransactionEdit(draft, result.item);
      else
        setSaveConfirmationMessage(
          'No completed save was found yet. Check again in a moment, or retry this same save safely. Your original input is preserved.',
        );
    } catch {
      setSaveConfirmationMessage(
        'Google Sheets is not responding to the confirmation check. Your input is preserved; use Check save status again when connected.',
      );
    } finally {
      savingTransactionRef.current = false;
      setSavingTransaction(false);
    }
  };

  const retryPendingTransactionEdit = async () => {
    const draft = pendingEditRef.current;
    if (!draft || savingTransactionRef.current) return;
    savingTransactionRef.current = true;
    setSavingTransaction(true);
    try {
      const item = await transactionSaveJson<LedgerTransaction>(
        `/api/ledger/${encodeURIComponent(draft.original.id)}`,
        {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          // Reuse the exact receipt identifier, destination and input. Never allocate a new save.
          body: JSON.stringify(draft.input),
        },
      );
      completeTransactionEdit(draft, item);
    } catch (caught) {
      if (caught instanceof SaveNotConfirmedError) {
        setSaveConfirmationMessage(
          'This save is still awaiting confirmation. Use Check save status; a retry uses the same save identifier.',
        );
      } else {
        retainEditDraft(null);
        setSaveConfirmationMessage('');
        if (caught instanceof Error) message.error(caught.message);
      }
    } finally {
      savingTransactionRef.current = false;
      setSavingTransaction(false);
    }
  };

  useEffect(() => {
    const frame = requestAnimationFrame(() => {
      try {
        const raw = recoveryStorage().getItem(EDIT_DRAFT_KEY);
        const draft: unknown = raw ? JSON.parse(raw) : null;
        if (!validPendingEdit(draft)) return;
        pendingEditRef.current = draft;
        setPendingEdit(draft);
        setEditingTransaction({ ...draft.original, ...draft.input });
        setSaveConfirmationMessage(
          'A previous edit is awaiting confirmation. Check save status to recover it without sending the edit again.',
        );
        preloadTransactionDialog();
        setTransactionOpen(true);
      } catch {
        /* Keep the existing ledger usable if a temporary draft cannot be read. */
      }
    });
    return () => cancelAnimationFrame(frame);
  }, []);

  const saveTransaction = async (values: TransactionDialogValues) => {
    if (savingTransactionRef.current || pendingEditRef.current) return;
    if (pendingWriteRef.current || activeWritesRef.current) {
      message.info('Please finish or confirm the previous save first.');
      return;
    }
    let uncertain = false;
    try {
      if (!editingTransaction) {
        const input = transactionPayload(values);
        if (await confirmPossibleDuplicates([input]))
          await addOptimisticTransactions([input]);
        return;
      }
      savingTransactionRef.current = true;
      setSavingTransaction(true);
      const draft = {
        original: editingTransaction,
        input: {
          ...transactionPayload(values),
          clientMutationId: crypto.randomUUID(),
          originalFingerprint: transactionFingerprint(editingTransaction),
        },
      };
      retainEditDraft(draft);
      const item = await transactionSaveJson<LedgerTransaction>(
        `/api/ledger/${encodeURIComponent(editingTransaction.id)}`,
        {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(draft.input),
        },
      );
      completeTransactionEdit(draft, item);
    } catch (caught) {
      if (caught instanceof SaveNotConfirmedError) {
        uncertain = true;
        setSaveConfirmationMessage(
          'Google Sheets is taking longer than usual. Checking whether the edit has already saved…',
        );
      } else {
        retainEditDraft(null);
        setSaveConfirmationMessage('');
        if (caught instanceof Error) message.error(caught.message);
      }
    } finally {
      savingTransactionRef.current = false;
      setSavingTransaction(false);
    }
    if (uncertain) await confirmPendingTransactionEdit();
  };

  const saveMultipleExpenses = async (values: BatchExpenseDialogValues) => {
    try {
      const inputs = values.expenses.map((expense) =>
        transactionPayload({ ...expense, type: 'expense' }),
      );
      if (await confirmPossibleDuplicates(inputs))
        await addOptimisticTransactions(inputs);
    } catch (caught) {
      if (caught instanceof Error) message.error(caught.message);
    }
  };

  const commitDeleteTransaction = async (item: LedgerTransaction) => {
    try {
      const result = await readJson<{ deleted: boolean }>(
        await request(`/api/ledger/${encodeURIComponent(item.id)}`, {
          method: 'DELETE',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            period: item.period,
            clientMutationId: crypto.randomUUID(),
            originalFingerprint: transactionFingerprint(item),
          }),
        }),
      );
      if (!result.deleted)
        throw new Error(
          'The deletion was not confirmed. Sync and review the transaction.',
        );
      recordActivity(
        'Transaction deleted',
        `${item.description} · ${formatMoney(item.amount)}`,
      );
    } catch (caught) {
      setLedger((current) =>
        current
          ? { ...current, transactions: [item, ...current.transactions] }
          : current,
      );
      message.error(
        caught instanceof Error
          ? caught.message
          : 'Could not delete the transaction.',
      );
    }
  };

  const preparingDeleteRef = useRef(false);
  const stageDeleteTransaction = async (item: LedgerTransaction) => {
    if (preparingDeleteRef.current) return;
    preparingDeleteRef.current = true;
    try {
      // Start the Undo window only once its notification UI can actually show.
      if (!(await prepareFeedback())) return;
    } finally {
      preparingDeleteRef.current = false;
    }
    if (
      activeWritesRef.current ||
      pendingEditRef.current ||
      pendingWriteRef.current ||
      deletionTimersRef.current.size
    ) {
      message.info(
        'Finish or confirm the current change before deleting another transaction.',
      );
      return;
    }
    if (item.period < MIN_WRITABLE_PERIOD) {
      message.info('Months before September 2026 are read-only in Kaikei.');
      return;
    }
    const currentItem = ledgerRef.current?.transactions.find(
      (entry) => entry.id === item.id,
    );
    if (
      !currentItem ||
      transactionFingerprint(currentItem) !== transactionFingerprint(item)
    ) {
      message.info('This transaction changed. Review it before deleting.');
      return;
    }
    ledgerMutationEpochRef.current += 1;
    setLedger((current) =>
      current
        ? {
            ...current,
            transactions: current.transactions.filter(
              (entry) => entry.id !== item.id,
            ),
          }
        : current,
    );
    const notificationKey = `delete-${item.id}`;
    const undo = () => {
      const timer = deletionTimersRef.current.get(item.id);
      if (timer) window.clearTimeout(timer);
      deletionTimersRef.current.delete(item.id);
      notification.destroy(notificationKey);
      ledgerMutationEpochRef.current += 1;
      setLedger((current) =>
        current
          ? { ...current, transactions: [item, ...current.transactions] }
          : current,
      );
      recordActivity('Deletion undone', item.description);
    };
    const timer = window.setTimeout(() => {
      deletionTimersRef.current.delete(item.id);
      notification.destroy(notificationKey);
      void commitDeleteTransaction(item);
    }, 8000);
    deletionTimersRef.current.set(item.id, timer);
    notification.open({
      key: notificationKey,
      title: 'Transaction moved to trash',
      description: 'It will be deleted from Google Sheets in 8 seconds.',
      duration: 8,
      actions: (
        <Button type="primary" size="small" onClick={undo}>
          Undo
        </Button>
      ),
    });
  };

  const openBudgetEditor = (
    item: BudgetPlan,
    target: BudgetEditTarget = 'both',
  ) => {
    if (
      activeWritesRef.current ||
      pendingWriteRef.current ||
      pendingEditRef.current
    ) {
      message.info(
        'Wait for the current save or check its status before editing another estimate.',
      );
      return;
    }
    if (item.period < MIN_WRITABLE_PERIOD) {
      message.info('Months before September 2026 are read-only in Kaikei.');
      return;
    }
    setEditingBudget(item);
    setBudgetEditorPeriod(item.period);
    setBudgetRestoreValues(null);
    setBudgetEditTarget(target);
    setBudgetOpen(true);
  };

  const openNewBudget = () => {
    if (
      activeWritesRef.current ||
      pendingWriteRef.current ||
      pendingEditRef.current
    ) {
      message.info(
        'Wait for the current save or check its status before adding a category.',
      );
      return;
    }
    if (historicalReadOnly) {
      message.info('Months before September 2026 are read-only in Kaikei.');
      return;
    }
    setEditingBudget(null);
    setBudgetEditorPeriod(selectedPeriod);
    setBudgetRestoreValues(null);
    setBudgetEditTarget('both');
    setBudgetOpen(true);
  };

  const updateBudgetOrderPreview = (preview: BudgetOrderPreview | null) => {
    budgetOrderPreviewRef.current = preview;
    setBudgetOrderPreview(preview);
  };

  const saveBudgetOrder = async (preview: BudgetOrderPreview) => {
    if (preview.period < MIN_WRITABLE_PERIOD) {
      message.info('Months before September 2026 are read-only in Kaikei.');
      updateBudgetOrderPreview(null);
      return;
    }
    try {
      setSavingBudgetOrder(true);
      const items = await readJson<BudgetPlan[]>(
        await request('/api/budgets', {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            period: preview.period,
            type: preview.type,
            categories: preview.items.map((item) => item.category),
          }),
        }),
      );
      setLedger((current) => {
        if (!current) return current;
        let orderedIndex = 0;
        return {
          ...current,
          budgets: current.budgets.map((entry) =>
            entry.period === preview.period && entry.type === preview.type
              ? items[orderedIndex++] || entry
              : entry,
          ),
        };
      });
      setSelectedBudgetIds([]);
      message.success('Category order saved to Google Sheets');
      recordActivity(
        'Categories rearranged',
        `${monthLabel(preview.period)} ${preview.type} order updated.`,
      );
    } catch (caught) {
      message.error(
        caught instanceof Error
          ? caught.message
          : 'Could not save the category order.',
      );
    } finally {
      setSavingBudgetOrder(false);
      updateBudgetOrderPreview(null);
    }
  };

  const startBudgetDrag = (
    event: ReactPointerEvent<HTMLElement>,
    item: BudgetPlan,
  ) => {
    if (savingBudgetOrder || event.button !== 0 || orderableBudgets.length < 2)
      return;
    const selectedIds = selectedBudgetIds.includes(item.id)
      ? selectedBudgetIds
      : [item.id];
    const draggedIds = orderableBudgets
      .filter((entry) => selectedIds.includes(entry.id))
      .map((entry) => entry.id);
    const preview: BudgetOrderPreview = {
      period: selectedPeriod,
      type: budgetType,
      items: [...orderableBudgets],
      initialIds: orderableBudgets.map((entry) => entry.id),
      draggedIds,
    };
    setSelectedBudgetIds(draggedIds);
    updateBudgetOrderPreview(preview);
    draggingBudgetIdsRef.current = draggedIds;
    setDraggingBudgetIds(draggedIds);
    event.currentTarget.setPointerCapture(event.pointerId);
    event.preventDefault();
  };

  const moveBudgetDrag = (event: ReactPointerEvent<HTMLElement>) => {
    const draggedIds = draggingBudgetIdsRef.current;
    const preview = budgetOrderPreviewRef.current;
    if (!draggedIds.length || !preview) return;
    event.preventDefault();

    const target = document
      .elementFromPoint(event.clientX, event.clientY)
      ?.closest<HTMLElement>('[data-budget-order-id]');
    const targetId = target?.dataset.budgetOrderId;
    if (target && targetId && !draggedIds.includes(targetId)) {
      const draggedSet = new Set(draggedIds);
      const group = preview.items.filter((entry) => draggedSet.has(entry.id));
      const items = preview.items.filter((entry) => !draggedSet.has(entry.id));
      const targetIndex = items.findIndex((entry) => entry.id === targetId);
      if (group.length && targetIndex >= 0) {
        const targetBox = target.getBoundingClientRect();
        const placeAfter = event.clientY > targetBox.top + targetBox.height / 2;
        items.splice(targetIndex + (placeAfter ? 1 : 0), 0, ...group);
        updateBudgetOrderPreview({ ...preview, items });
      }
    }

    const scrollEdge = 90;
    if (event.clientY < scrollEdge) window.scrollBy(0, -12);
    else if (event.clientY > window.innerHeight - scrollEdge)
      window.scrollBy(0, 12);
  };

  const finishBudgetDrag = (event: ReactPointerEvent<HTMLElement>) => {
    const preview = budgetOrderPreviewRef.current;
    draggingBudgetIdsRef.current = [];
    setDraggingBudgetIds([]);
    if (event.currentTarget.hasPointerCapture(event.pointerId))
      event.currentTarget.releasePointerCapture(event.pointerId);
    if (!preview) return;
    const changed = preview.items.some(
      (item, index) => item.id !== preview.initialIds[index],
    );
    if (changed) void saveBudgetOrder(preview);
    else updateBudgetOrderPreview(null);
  };

  const cancelBudgetDrag = (event: ReactPointerEvent<HTMLElement>) => {
    draggingBudgetIdsRef.current = [];
    setDraggingBudgetIds([]);
    if (event.currentTarget.hasPointerCapture(event.pointerId))
      event.currentTarget.releasePointerCapture(event.pointerId);
    updateBudgetOrderPreview(null);
  };

  const moveBudgetWithKeyboard = (
    event: ReactKeyboardEvent<HTMLElement>,
    item: BudgetPlan,
  ) => {
    if (
      savingBudgetOrder ||
      (event.key !== 'ArrowUp' && event.key !== 'ArrowDown')
    )
      return;
    const selectedIds = selectedBudgetIds.includes(item.id)
      ? selectedBudgetIds
      : [item.id];
    const selectedSet = new Set(selectedIds);
    const draggedIds = orderableBudgets
      .filter((entry) => selectedSet.has(entry.id))
      .map((entry) => entry.id);
    const draggedSet = new Set(draggedIds);
    const selectedIndexes = orderableBudgets
      .map((entry, index) => (draggedSet.has(entry.id) ? index : -1))
      .filter((index) => index >= 0);
    const firstIndex = Math.min(...selectedIndexes);
    const lastIndex = Math.max(...selectedIndexes);
    const target =
      event.key === 'ArrowUp'
        ? orderableBudgets
            .slice(0, firstIndex)
            .findLast((entry) => !draggedSet.has(entry.id))
        : orderableBudgets
            .slice(lastIndex + 1)
            .find((entry) => !draggedSet.has(entry.id));
    if (!draggedIds.length || !target) return;
    event.preventDefault();
    const group = orderableBudgets.filter((entry) => draggedSet.has(entry.id));
    const items = orderableBudgets.filter((entry) => !draggedSet.has(entry.id));
    const targetIndex = items.findIndex((entry) => entry.id === target.id);
    items.splice(
      targetIndex + (event.key === 'ArrowDown' ? 1 : 0),
      0,
      ...group,
    );
    const preview: BudgetOrderPreview = {
      period: selectedPeriod,
      type: budgetType,
      items,
      initialIds: orderableBudgets.map((entry) => entry.id),
      draggedIds,
    };
    setSelectedBudgetIds(draggedIds);
    updateBudgetOrderPreview(preview);
    void saveBudgetOrder(preview);
  };

  const saveBudget = async (values: BudgetDialogValues) => {
    if (
      activeWritesRef.current ||
      pendingWriteRef.current ||
      pendingEditRef.current
    ) {
      message.info(
        'Wait for the current save or check its status before starting another change.',
      );
      return;
    }
    const original = editingBudget;
    const period = editingBudget?.period || budgetEditorPeriod;
    const type = editingBudget?.type || budgetType;
    let preview: BudgetPlan | null = null;
    try {
      const emoji = values.emoji?.[0]?.trim() || '';
      const categoryName = (values.category || '').trim();
      const requestedCategory =
        editingBudget && budgetEditTarget === 'plannedAmount'
          ? editingBudget.category
          : `${emoji ? `${emoji} ` : ''}${categoryName}`;
      const category = original
        ? preserveWeeklyIdentity(original.category, requestedCategory)
        : requestedCategory;
      const plannedAmount =
        editingBudget && budgetEditTarget === 'category'
          ? editingBudget.plannedAmount
          : wholeYen(values.plannedAmount || 0, true);
      const recurring =
        editingBudget && budgetEditTarget !== 'both'
          ? (editingBudget.recurring ??
            defaultRecurringCategory(
              editingBudget.category,
              editingBudget.type,
            ))
          : Boolean(values.recurring);
      if (period < MIN_WRITABLE_PERIOD)
        throw new Error('This month is read-only.');
      if (!category || category.length > 80)
        throw new Error('Enter a category name of 80 characters or fewer.');
      if (
        ledgerRef.current?.budgets.some(
          (entry) =>
            entry.period === period &&
            entry.type === type &&
            entry.category === category &&
            entry.category !== original?.category,
        )
      )
        throw new Error('That category name is already in use this month.');
      if (
        original &&
        category === original.category &&
        plannedAmount === original.plannedAmount &&
        recurring ===
          (original.recurring ??
            defaultRecurringCategory(original.category, original.type))
      ) {
        setBudgetOpen(false);
        return;
      }
      preview = {
        ...original,
        id: original?.id || `pending-budget-${crypto.randomUUID()}`,
        period,
        type,
        category,
        plannedAmount,
        recurring,
        updatedAt: Date.now(),
      };
      setSavingBudget(true);
      setBudgetSaveKey(`${period}:${type}:${category}`);
      // request() preserves a recovery draft before starting the remote write.
      const confirmation = request('/api/budgets', {
        method: editingBudget ? 'PUT' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          period,
          type,
          originalCategory: editingBudget?.category,
          category,
          plannedAmount,
          recurring,
        }),
      });
      const optimistic = preview;
      ledgerMutationEpochRef.current += 1;
      setLedger((current) =>
        current
          ? applyBudgetSave(current, optimistic, original?.category)
          : current,
      );
      setBudgetOpen(false);
      const item = await readJson<BudgetPlan>(await confirmation);
      ledgerMutationEpochRef.current += 1;
      setLedger((current) =>
        current ? applyBudgetSave(current, item, optimistic.category) : current,
      );
      message.success(editingBudget ? 'Estimate updated' : 'Category added');
      recordActivity(
        editingBudget ? 'Estimate updated' : 'Category added',
        `${categoryParts(item.category).name} · ${formatMoney(item.plannedAmount)}`,
      );
    } catch (caught) {
      if (preview && !pendingWriteRef.current) {
        const rejected = preview;
        ledgerMutationEpochRef.current += 1;
        setLedger((current) =>
          current ? rollbackBudgetSave(current, rejected, original) : current,
        );
        setBudgetEditorPeriod(period);
        if (!original) setBudgetType(type);
        setBudgetRestoreValues(values);
        setBudgetOpen(true);
      }
      if (caught instanceof Error) message.error(caught.message);
    } finally {
      setSavingBudget(false);
      if (!pendingWriteRef.current) setBudgetSaveKey('');
    }
  };

  const deleteBudgetCategory = async (item: BudgetPlan) => {
    try {
      setDeletingBudget(true);
      const result = await readJson<{ deleted: boolean }>(
        await request('/api/budgets', {
          method: 'DELETE',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            period: item.period,
            type: item.type,
            category: item.category,
          }),
        }),
      );
      if (!result.deleted) throw new Error('That category could not be found.');
      const hasTransactions = monthTransactions.some(
        (entry) => entry.type === item.type && entry.category === item.category,
      );
      setLedger((current) =>
        current
          ? {
              ...current,
              budgets: current.budgets.filter(
                (entry) =>
                  !(
                    entry.period === item.period &&
                    entry.type === item.type &&
                    entry.category === item.category
                  ),
              ),
            }
          : current,
      );
      setSelectedBudgetIds((current) => current.filter((id) => id !== item.id));
      setBudgetOpen(false);
      setEditingBudget(null);
      message.success(
        hasTransactions
          ? 'Estimate deleted. Existing transactions remain as an unestimated cost.'
          : 'Category deleted',
      );
      recordActivity(
        'Category deleted',
        `${categoryParts(item.category).name} estimate removed.`,
      );
    } catch (caught) {
      message.error(
        caught instanceof Error
          ? caught.message
          : 'Could not delete the category.',
      );
    } finally {
      setDeletingBudget(false);
    }
  };

  const saveInlineActual = async (
    item: BudgetPlan & { actual: number },
    desiredActual: number,
  ) => {
    if (
      pendingWriteRef.current ||
      pendingEditRef.current ||
      activeWritesRef.current
    ) {
      message.info('Confirm the previous save in Sync status first.');
      return false;
    }
    const actualKey = `${item.type}:${item.category}`;
    const categoryName = categoryParts(item.category).name;
    if (!online) {
      message.info('Connect to the internet to edit an Actual amount.');
      return false;
    }
    if (
      !Number.isSafeInteger(desiredActual) ||
      desiredActual < 0 ||
      !Number.isInteger(desiredActual)
    ) {
      message.error('Enter a whole-yen amount of ¥0 or more.');
      return false;
    }
    if (
      item.type === 'expense' &&
      categoryName.toLowerCase() === 'credit card'
    ) {
      setSavingInlineActualKey(actualKey);
      try {
        const data = await readJson<LedgerData>(
          await request('/api/budgets/credit-card', {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              period: item.period,
              grossAmount: desiredActual,
            }),
          }),
        );
        const isCard = (entry: {
          period: string;
          type: string;
          category: string;
        }) =>
          entry.period === item.period &&
          entry.type === 'expense' &&
          categoryParts(entry.category).name.toLowerCase() === 'credit card';
        setLedger((current) =>
          current
            ? {
                ...current,
                budgets: current.budgets.map((entry) =>
                  isCard(entry) ? data.budgets.find(isCard) || entry : entry,
                ),
                transactions: [
                  ...current.transactions.filter((entry) => !isCard(entry)),
                  ...data.transactions.filter(isCard),
                ].sort(compareTransactions),
              }
            : data,
        );
        message.success('Credit-card bill saved; fixed costs deducted.');
        recordActivity('Credit-card bill updated', formatMoney(desiredActual));
        return true;
      } catch (caught) {
        message.error(
          caught instanceof Error
            ? caught.message
            : 'Could not save the credit-card bill.',
        );
        return false;
      } finally {
        setSavingInlineActualKey(null);
      }
    }
    if (desiredActual === item.actual) return true;

    const matches = monthTransactions.filter(
      (entry) => entry.type === item.type && entry.category === item.category,
    );
    if (
      matches.some(
        (entry) => entry.source === 'pending' || entry.source === 'queued',
      )
    ) {
      message.info('Wait for this amount to finish syncing, then try again.');
      return false;
    }
    if (
      matches.length > 1 ||
      matches.some((entry) => entry.source === 'google-sheet-summary')
    ) {
      message.info(
        'This total combines multiple entries. Edit those entries from Transactions.',
      );
      return false;
    }

    setSavingInlineActualKey(actualKey);
    try {
      const existing = matches[0];
      ledgerMutationEpochRef.current += 1;
      if (existing && desiredActual === 0) {
        const result = await readJson<{ deleted: boolean }>(
          await request(`/api/ledger/${encodeURIComponent(existing.id)}`, {
            method: 'DELETE',
          }),
        );
        if (!result.deleted) throw new Error('That transaction was not found.');
        setLedger((current) =>
          current
            ? {
                ...current,
                transactions: current.transactions.filter(
                  (entry) => entry.id !== existing.id,
                ),
              }
            : current,
        );
      } else if (existing) {
        if (pendingEditRef.current) {
          message.info(
            'Confirm the previous edit before changing another Actual amount.',
          );
          return false;
        }
        const draft: PendingTransactionEdit = {
          original: existing,
          input: {
            ...existing,
            amount: desiredActual,
            clientMutationId: crypto.randomUUID(),
            originalFingerprint: transactionFingerprint(existing),
          },
        };
        retainEditDraft(draft);
        try {
          const updated = await transactionSaveJson<LedgerTransaction>(
            '/api/ledger/' + encodeURIComponent(existing.id),
            {
              method: 'PATCH',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify(draft.input),
            },
          );
          setLedger((current) =>
            current
              ? {
                  ...current,
                  transactions: replaceTransaction(
                    current.transactions,
                    existing.id,
                    updated,
                  ),
                }
              : current,
          );
          retainEditDraft(null);
        } catch (caught) {
          if (caught instanceof SaveNotConfirmedError) {
            setSaveConfirmationMessage(
              'This Actual edit needs confirmation. Your input is preserved; check its save status.',
            );
            setEditingTransaction({ ...existing, ...draft.input });
            preloadTransactionDialog();
            setTransactionOpen(true);
          } else retainEditDraft(null);
          throw caught;
        }
      } else if (desiredActual > 0) {
        await addOptimisticTransactions([
          {
            type: item.type,
            amount: desiredActual,
            transactionDate:
              selectedPeriod === clock.date.slice(0, 7)
                ? clock.date
                : selectedPeriod + '-01',
            description: categoryName,
            category: item.category,
          },
        ]);
      }
      message.success(`${categoryName} actual updated`);
      recordActivity(
        'Actual amount updated',
        `${categoryName} · ${formatMoney(desiredActual)}`,
      );
      return true;
    } catch (caught) {
      message.error(
        caught instanceof Error
          ? caught.message
          : 'Could not update the Actual amount.',
      );
      return false;
    } finally {
      setSavingInlineActualKey(null);
    }
  };

  const saveMonthSetup = async (values: MonthSetupDialogValues) => {
    if (historicalReadOnly) {
      message.info('Months before September 2026 are read-only in Kaikei.');
      return;
    }
    const destination = nextPeriod(selectedPeriod);
    try {
      setClosingMonth(true);
      const data = await readJson<LedgerData>(
        await request('/api/month-close', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            period: selectedPeriod,
            plans: values.plans,
          }),
        }),
      );
      setLedger((current) =>
        current
          ? withQueuedTransactions(
              mergeMonthSnapshot(
                current,
                {
                  ...data,
                  transactions: data.transactions.filter(
                    (entry) =>
                      entry.period === destination &&
                      !deletionTimersRef.current.has(entry.id),
                  ),
                  budgets: data.budgets.filter(
                    (entry) => entry.period === destination,
                  ),
                },
                destination,
              ),
            )
          : data,
      );
      setMonthSetupOpen(false);
      // Preparing estimates is not an explicit request to leave the viewed month.
      recordActivity(
        `${monthLabel(destination)} set up`,
        `Copied from ${monthLabel(selectedPeriod)} with ${values.plans.length} estimates.`,
      );
      message.success(`${monthLabel(destination)} is ready`);
    } catch (caught) {
      message.error(
        caught instanceof Error
          ? caught.message
          : 'Could not set up the next month.',
      );
      throw caught;
    } finally {
      setClosingMonth(false);
    }
  };

  if (loading) {
    return (
      <div className="loading-shell">
        <img
          src="/icons/icon-wallet-v21-128.png"
          alt="Kaikei"
          width={64}
          height={64}
        />
        <LoadingPlaceholder />
      </div>
    );
  }

  if (error || !ledger) {
    return (
      <div className="loading-shell">
        <Alert
          type="error"
          showIcon
          title="Kaikei could not load"
          description={error}
          action={<Button onClick={() => void loadLedger()}>Try again</Button>}
        />
      </div>
    );
  }

  const cashFlow = monthIncome - monthExpense;
  const spendPercent = plannedExpense
    ? Math.round((monthExpense / plannedExpense) * 100)
    : 0;
  const incomePercent = plannedIncome
    ? Math.round((monthIncome / plannedIncome) * 100)
    : 0;
  const visibleFlowData = flowForScope(flowData, selectedPeriod, flowScope);
  const focusedFlow = visibleFlowData[0] || {
    period: selectedPeriod,
    label: compactMonth(selectedPeriod),
    income: monthIncome,
    expense: monthExpense,
  };
  const maxFlow = Math.max(
    ...visibleFlowData.flatMap((item) => [item.income, item.expense]),
    1,
  );
  const selectedEstimate =
    budgetType === 'expense' ? plannedExpense : plannedIncome;
  const selectedActual = budgetType === 'expense' ? monthExpense : monthIncome;
  const selectedComparison = budgetComparison(
    selectedEstimate,
    selectedActual,
    budgetType,
  );
  const selectedBudgetCount = orderableBudgets.filter((item) =>
    selectedBudgetIds.includes(item.id),
  ).length;
  const canDeleteEditingBudget = Boolean(
    editingBudget &&
    editingBudget.period >= MIN_WRITABLE_PERIOD &&
    monthBudgets.some(
      (item) =>
        item.period === editingBudget.period &&
        item.type === editingBudget.type &&
        item.category === editingBudget.category,
    ),
  );

  const checkPendingWrite = async (retry = false, useLatest = false) => {
    const draft = pendingWriteRef.current;
    if (!draft || checkingWrite) return;
    setCheckingWrite(true);
    try {
      const transactionDelete =
        draft.url.startsWith('/api/ledger/') && draft.method === 'DELETE';
      let deletionConfirmed = false;
      if (transactionDelete && draft.body) {
        const input = JSON.parse(draft.body);
        if (input.clientMutationId && input.originalFingerprint) {
          const status = await readJson<{ deleted: boolean }>(
            await request('/api/ledger/delete-status', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                ...input,
                resolve: useLatest,
                id: decodeURIComponent(draft.url.split('/').at(-1)!),
              }),
            }),
          );
          deletionConfirmed = status.deleted;
          if (retry && !deletionConfirmed) {
            const result = await readJson<{ deleted: boolean }>(
              await request(draft.url, {
                method: 'DELETE',
                headers: { 'Content-Type': 'application/json' },
                body: draft.body,
              }),
            );
            deletionConfirmed = result.deleted === true;
          }
        }
      }
      let snapshot = await readJson<LedgerData>(
        await request('/api/ledger/reconcile?period=' + draft.period, {
          cache: 'no-store',
        }),
      );
      if (
        retry &&
        !useLatest &&
        !pendingWriteConfirmed(draft, snapshot) &&
        draft.method !== 'DELETE'
      ) {
        await readJson(
          await request(draft.url, {
            method: draft.method,
            headers: { 'Content-Type': 'application/json' },
            body: draft.body,
          }),
        );
        snapshot = await readJson<LedgerData>(
          await request('/api/ledger/reconcile?period=' + draft.period, {
            cache: 'no-store',
          }),
        );
      }
      if (
        !useLatest &&
        !(transactionDelete
          ? deletionConfirmed
          : pendingWriteConfirmed(draft, snapshot))
      ) {
        message.info(
          'The intended change is not confirmed yet. Your original input is preserved.',
        );
        return;
      }
      ledgerMutationEpochRef.current += 1;
      setLedger((current) =>
        current
          ? withQueuedTransactions(
              mergeMonthSnapshot(current, snapshot, draft.period),
            )
          : current,
      );
      pendingWriteRef.current = null;
      setPendingWrite(null);
      setBudgetSaveKey('');
      try {
        recoveryStorage().removeItem(WRITE_DRAFT_KEY);
      } catch {
        /* The confirmed ledger remains usable if storage permissions changed. */
      }
      message.success(
        useLatest
          ? 'Latest Sheet values loaded. Review them before making another change.'
          : 'Save confirmed',
      );
      if (draft.url === '/api/month-close') setMonthSetupOpen(false);
      if (draft.url === '/api/budgets') setBudgetOpen(false);
    } catch (caught) {
      message.error(
        caught instanceof Error ? caught.message : 'Could not check this save.',
      );
    } finally {
      setCheckingWrite(false);
    }
  };

  const compareWithSheet = async () => {
    setReconciliationOpen(true);
    setReconciliation(null);
    setReconciliationError('');
    if (
      !online ||
      pendingEditRef.current ||
      pendingWriteRef.current ||
      activeWritesRef.current ||
      queuedCount
    ) {
      setReconciliationError(
        'Connect and confirm queued or pending changes before comparing this month.',
      );
      return;
    }
    const base = ledgerRef.current;
    if (!base) return;
    const epoch = ledgerMutationEpochRef.current;
    const period = selectedPeriodRef.current;
    setComparingSheet(true);
    try {
      const result = await readJson<ReconciliationResult>(
        await request('/api/ledger/reconcile', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            period,
            transactions: base.transactions.filter(
              (item) => item.period === period,
            ),
            budgets: base.budgets.filter((item) => item.period === period),
          }),
        }),
      );
      if (
        epoch !== ledgerMutationEpochRef.current ||
        period !== selectedPeriodRef.current
      ) {
        setReconciliationError(
          'The app changed during this comparison. Run it again for a current result.',
        );
      } else setReconciliation(result);
    } catch (caught) {
      setReconciliationError(
        caught instanceof Error
          ? caught.message
          : 'Could not compare this month.',
      );
    } finally {
      setComparingSheet(false);
    }
  };

  const currentSyncStatus = syncStatus({
    saving:
      activeWrites > 0 ||
      savingTransaction ||
      savingBudget ||
      deletingBudget ||
      savingBudgetOrder ||
      Boolean(savingInlineActualKey) ||
      closingMonth ||
      (!pendingEdit &&
        ledger.transactions.some((item) => item.source === 'pending')),
    pendingConfirmation: Boolean(pendingEdit || pendingWrite),
    refreshing: syncing,
    online,
    queued: queuedCount,
    refreshError: outboxError || refreshError,
  });

  const applyAppUpdate = async () => {
    if (
      transactionOpen ||
      budgetOpen ||
      monthSetupOpen ||
      activeWritesRef.current ||
      pendingEditRef.current ||
      pendingWriteRef.current
    ) {
      message.info(
        'Finish or confirm the open form/save before updating. Your input is preserved.',
      );
      return;
    }
    const registration = await navigator.serviceWorker?.getRegistration();
    if (!registration?.waiting) {
      window.location.assign(matchingShellUrl());
      return;
    }
    navigator.serviceWorker.addEventListener(
      'controllerchange',
      () => window.location.assign(matchingShellUrl()),
      { once: true },
    );
    registration.waiting.postMessage({ type: 'SKIP_WAITING' });
  };

  return (
    <Layout className="app-shell seasonal-ledger-theme">
      <Sider className="desktop-sider" width={216} theme="dark">
        <div className="brand-lockup">
          <img
            src="/icons/icon-wallet-v21-128.png"
            alt=""
            width={44}
            height={44}
            className="brand-icon"
          />
          <div>
            <div className="brand-name-row">
              <strong>Kaikei</strong>
              <span className="version-badge">V3.10.4</span>
            </div>
            <span className="brand-subtitle">Personal finance</span>
          </div>
        </div>
        <nav className="desktop-primary-nav" aria-label="Primary navigation">
          {[
            { key: 'overview', icon: <BarChartOutlined />, label: 'Home' },
            {
              key: 'budgets',
              icon: <ProfileOutlined />,
              label: 'Budget',
            },
            {
              key: 'transactions',
              icon: <SwapOutlined />,
              label: 'Transactions',
            },
          ].map((item) => (
            <button
              key={item.key}
              type="button"
              className={view === item.key ? 'active' : ''}
              aria-current={view === item.key ? 'page' : undefined}
              onClick={() => setView(item.key as ViewKey)}
            >
              {item.icon}
              <span>{item.label}</span>
            </button>
          ))}
        </nav>
        <div className="sidebar-footer">
          <div className="sidebar-tools">
            <Button
              block
              type="text"
              icon={<ClockCircleOutlined />}
              onClick={() => setActivityOpen(true)}
            >
              History
            </Button>
            {ledger.syncMode === 'google-sheets' && (
              <Button
                block
                className="sidebar-sync-button"
                icon={<SyncOutlined spin={syncing} />}
                loading={syncing}
                onClick={() => void loadLedger(true)}
              >
                Sync Sheet
              </Button>
            )}
          </div>
          <div className="sidebar-note">
            <WalletOutlined />
            <div>
              <Text strong>
                {ledger.syncMode === 'google-sheets'
                  ? 'Google Sheet connected'
                  : 'Demo data on this device'}
              </Text>
              <Text type="secondary">
                {ledger.syncMode === 'google-sheets' && ledger.syncedAt
                  ? `Synced ${formatTokyoDateTime(ledger.syncedAt)}`
                  : 'Fictional finances · browser only'}
              </Text>
            </div>
          </div>
        </div>
      </Sider>

      <Layout>
        <header className="topbar">
          <button className="mobile-brand" onClick={() => setView('overview')}>
            <img
              src="/icons/icon-wallet-v21-128.png"
              alt=""
              width={36}
              height={36}
            />
            <strong>Kaikei</strong>
            <span className="version-badge">V3.10.4</span>
          </button>
          <div className="topbar-copy">
            <Text type="secondary">Your money, in one calm place</Text>
          </div>
          <div className="topbar-actions">
            <Button
              type="text"
              className={`save-state ${currentSyncStatus.key}`}
              aria-label={`Sync status: ${currentSyncStatus.label}. Open details`}
              onClick={() => setSyncDetailsOpen(true)}
            >
              {currentSyncStatus.label}
            </Button>
            <Tooltip
              title={themeMode === 'dark' ? 'Use light mode' : 'Use dark mode'}
            >
              <Button
                className="topbar-theme-tool"
                type="text"
                icon={themeMode === 'dark' ? <SunOutlined /> : <MoonOutlined />}
                aria-label={
                  themeMode === 'dark' ? 'Use light mode' : 'Use dark mode'
                }
                onClick={toggleTheme}
              />
            </Tooltip>
            <DeferredDropdown
              trigger={['click']}
              placement="bottomRight"
              menu={{
                items: [
                  {
                    key: 'theme',
                    icon:
                      themeMode === 'dark' ? <SunOutlined /> : <MoonOutlined />,
                    label:
                      themeMode === 'dark' ? 'Use light mode' : 'Use dark mode',
                  },
                  {
                    key: 'history',
                    icon: <ClockCircleOutlined />,
                    label: 'History',
                  },
                  ...(ledger.syncMode === 'google-sheets'
                    ? [
                        {
                          key: 'sync',
                          icon: <SyncOutlined spin={syncing} />,
                          label: syncing ? 'Syncing…' : 'Sync Sheet',
                          disabled: syncing,
                        },
                      ]
                    : []),
                ],
                onClick: ({ key }) => {
                  if (key === 'theme') toggleTheme();
                  if (key === 'history') setActivityOpen(true);
                  if (key === 'sync') void loadLedger(true);
                },
              }}
            >
              <Button
                className="mobile-actions-menu"
                type="text"
                icon={<MenuOutlined />}
                aria-label="Open app menu"
                aria-haspopup="menu"
              />
            </DeferredDropdown>
            <select
              className="month-picker month-select"
              aria-label="Displayed month"
              value={selectedPeriod}
              onChange={(event) => selectPeriod(event.currentTarget.value)}
            >
              {[...periods].reverse().map((period) => (
                <option key={period} value={period}>
                  {monthLabel(period)}
                </option>
              ))}
            </select>
            <Button
              className="topbar-add-transaction orange-action-button"
              type="primary"
              icon={<PlusOutlined />}
              disabled={historicalReadOnly}
              aria-label="Add transaction"
              onPointerDown={preloadTransactionDialog}
              onPointerEnter={preloadTransactionDialog}
              onFocus={preloadTransactionDialog}
              onClick={() => openNewTransaction()}
            >
              <span className="add-button-label">Add transaction</span>
            </Button>
          </div>
          <div className="mobile-month-control">
            <label htmlFor="mobile-month-select">Month</label>
            <select
              className="month-picker"
              id="mobile-month-select"
              aria-label="Displayed month on mobile"
              value={selectedPeriod}
              onChange={(event) => selectPeriod(event.currentTarget.value)}
            >
              {[...periods].reverse().map((period) => (
                <option key={period} value={period}>
                  {monthLabel(period)}
                </option>
              ))}
            </select>
          </div>
        </header>

        <Content className="content-wrap">
          {pendingEdit && !transactionOpen && (
            <Alert
              className="app-update-alert"
              type="warning"
              showIcon
              title="An edit is awaiting confirmation"
              description="Your input is preserved. Confirm its status before making another edit."
              action={
                <Button
                  onClick={() => {
                    setEditingTransaction({
                      ...pendingEdit.original,
                      ...pendingEdit.input,
                    });
                    preloadTransactionDialog();
                    setTransactionOpen(true);
                  }}
                >
                  Review save
                </Button>
              }
            />
          )}
          {updateAvailable && (
            <Alert
              className="app-update-alert"
              type="info"
              showIcon
              title="A Kaikei update is ready"
              action={
                <Button size="small" onClick={() => void applyAppUpdate()}>
                  Update now
                </Button>
              }
            />
          )}
          {historicalReadOnly && (
            <Alert
              className="historical-readonly-alert"
              type="info"
              showIcon
              title="Read-only archive"
              description="Kaikei will not write to months before September 2026. You can still review and export this month."
            />
          )}
          {view === 'overview' && (
            <div className="overview-home">
              <section className="metric-grid">
                <Card
                  className="balance-card seasonal-balance-card"
                  variant="borderless"
                >
                  <Text>Balance through {monthLabel(selectedPeriod)}</Text>
                  <div className="balance-value">
                    {formatMoney(currentBalance)}
                  </div>
                  <Tag className="balance-tag">
                    {cashFlow >= 0 ? '↑' : '↓'}{' '}
                    {formatMoney(Math.abs(cashFlow))} this month
                  </Tag>
                </Card>
                <Card className="metric-card seasonal-metric-card expense-metric">
                  <div className="metric-icon expense">
                    <ArrowUpOutlined />
                  </div>
                  <Text type="secondary">Spent this month</Text>
                  <Title level={2}>{formatMoney(monthExpense)}</Title>
                  <Text type="secondary">
                    {spendPercent}% of {formatMoney(plannedExpense)} estimated
                  </Text>
                  <Progress
                    aria-label="Monthly spending against estimate"
                    aria-valuetext={`${spendPercent}% of ${formatMoney(plannedExpense)} estimated`}
                    percent={Math.min(spendPercent, 100)}
                    showInfo={false}
                    strokeColor="#f26a21"
                  />
                </Card>
                <Card className="metric-card seasonal-metric-card income-metric">
                  <div className="metric-icon income">
                    <ArrowDownOutlined />
                  </div>
                  <Text type="secondary">Income this month</Text>
                  <Title level={2}>{formatMoney(monthIncome)}</Title>
                  <Text type="secondary">
                    {incomePercent}% of {formatMoney(plannedIncome)} estimated
                  </Text>
                  <Progress
                    aria-label="Monthly income against estimate"
                    aria-valuetext={`${incomePercent}% of ${formatMoney(plannedIncome)} estimated`}
                    percent={Math.min(incomePercent, 100)}
                    showInfo={false}
                    strokeColor="var(--income-progress)"
                  />
                </Card>
              </section>

              <Card
                className="spending-guide-card seasonal-card"
                title={`Week ${spendingGuide.week} spending guide`}
                extra={
                  <Tag
                    className={
                      spendingGuide.remaining < 0
                        ? 'guide-status over'
                        : 'guide-status on'
                    }
                  >
                    {spendingGuide.remaining < 0 ? 'Over estimate' : 'On track'}
                  </Tag>
                }
              >
                <div className="spending-guide-grid">
                  <div>
                    <Text type="secondary">Remaining</Text>
                    <strong
                      className={
                        spendingGuide.remaining < 0 ? 'guide-negative' : ''
                      }
                    >
                      {formatSignedMoney(spendingGuide.remaining)}
                    </strong>
                  </div>
                  <div>
                    <Text type="secondary">Daily guide</Text>
                    <strong>{formatMoney(spendingGuide.dailyGuide)}</strong>
                  </div>
                  <div>
                    <Text type="secondary">Forecast</Text>
                    <strong>{formatMoney(spendingGuide.forecast)}</strong>
                  </div>
                </div>
                <Progress
                  aria-label={`Week ${spendingGuide.week} spending against estimate`}
                  aria-valuetext={`${spendingGuide.percent}% of ${formatMoney(spendingGuide.estimated)} estimated`}
                  percent={Math.min(spendingGuide.percent, 100)}
                  showInfo={false}
                  strokeColor={
                    spendingGuide.remaining < 0 ? '#c83c34' : '#f26a21'
                  }
                />
                <Text type="secondary" className="spending-guide-caption">
                  {spendingGuide.estimated
                    ? `${formatMoney(spendingGuide.actual)} spent of ${formatMoney(spendingGuide.estimated)} estimated`
                    : 'Add a weekly estimate to enable a spending forecast.'}
                </Text>
              </Card>

              <DeferredMount>
                <Card
                  className="budget-pulse-card home-card-with-action"
                  title="Estimate check"
                  extra={
                    <Button type="link" onClick={() => setView('budgets')}>
                      View monthly expenses
                    </Button>
                  }
                >
                  <div className="budget-pulse-grid">
                    {budgetPulse.map((item) => {
                      const range = budgetWeekRange(
                        item.period,
                        weeklyCategoryNumber(item.category)!,
                      );
                      const percent = item.plannedAmount
                        ? Math.round((item.actual / item.plannedAmount) * 100)
                        : 0;
                      return (
                        <article
                          className="pulse-item pulse-week-link"
                          key={item.id}
                        >
                          <button
                            type="button"
                            className="pulse-week-surface"
                            aria-label={`View ${item.category} transactions`}
                            aria-describedby={`${item.id}-week-range`}
                            onClick={() =>
                              openWeekTransactions(
                                weeklyCategoryNumber(item.category)!,
                              )
                            }
                          />
                          <div className="budget-label">
                            <Text strong>{item.category}</Text>
                            <Text>{formatMoney(item.actual)}</Text>
                          </div>
                          <Text
                            type="secondary"
                            className="pulse-week-range"
                            id={`${item.id}-week-range`}
                          >
                            {range.label}
                          </Text>
                          {budgetSaveKey ===
                            `${item.period}:${item.type}:${item.category}` && (
                            <output className="budget-pending-label">
                              {pendingWrite ? 'Check save' : 'Saving…'}
                            </output>
                          )}
                          <Progress
                            aria-label={`${item.category} spending against estimate`}
                            aria-valuetext={`${percent}% of ${formatMoney(item.plannedAmount)} estimated`}
                            percent={Math.min(percent, 100)}
                            showInfo={false}
                            strokeColor={percent > 100 ? '#d94841' : '#f26a21'}
                          />
                          <div className="pulse-item-action">
                            <Text type="secondary">
                              {percent}% of {formatMoney(item.plannedAmount)}{' '}
                              estimated
                            </Text>
                            <Button
                              type="link"
                              size="small"
                              icon={<EditOutlined />}
                              disabled={historicalReadOnly}
                              onClick={() => openBudgetEditor(item)}
                            >
                              Edit estimate
                            </Button>
                          </div>
                        </article>
                      );
                    })}
                  </div>
                </Card>

                <Card
                  className="recent-activity-card home-card-with-action"
                  title="Recent activity"
                  extra={
                    <Button type="link" onClick={() => setView('transactions')}>
                      See all
                    </Button>
                  }
                >
                  {monthTransactions.length ? (
                    <div className="recent-list">
                      {monthTransactions.slice(0, 5).map((item) => (
                        <button
                          className="activity-row"
                          key={item.id}
                          disabled={historicalReadOnly}
                          onClick={() => openEditTransaction(item)}
                        >
                          <span className={`activity-icon ${item.type}`}>
                            {item.description.slice(0, 1).toUpperCase()}
                          </span>
                          <span>
                            <Text strong>{item.description}</Text>
                            <Text type="secondary">
                              {dayjs(item.transactionDate).format('MMM D')} ·{' '}
                              {item.category}
                            </Text>
                          </span>
                          <Text
                            strong
                            className={
                              item.type === 'income' ? 'amount-income' : ''
                            }
                          >
                            {item.type === 'income' ? '+' : '−'}
                            {formatMoney(item.amount)}
                          </Text>
                        </button>
                      ))}
                    </div>
                  ) : (
                    <Empty
                      image={Empty.PRESENTED_IMAGE_SIMPLE}
                      description="No activity this month"
                    />
                  )}
                </Card>
                <Card
                  className="monthly-review-card"
                  title={`${monthLabel(selectedPeriod)} review`}
                  extra={<Text type="secondary">At a glance</Text>}
                >
                  <div className="monthly-review-grid">
                    <div>
                      <Text type="secondary">Net cash flow</Text>
                      <strong
                        className={
                          monthlyReview.net < 0 ? 'guide-negative' : ''
                        }
                      >
                        {formatSignedMoney(monthlyReview.net)}
                      </strong>
                    </div>
                    <div>
                      <Text type="secondary">Savings rate</Text>
                      <strong>
                        {monthlyReview.savingsRate === null
                          ? '—'
                          : `${monthlyReview.savingsRate}%`}
                      </strong>
                    </div>
                    <div>
                      <Text type="secondary">Largest expense category</Text>
                      <strong>
                        {monthlyReview.topCategory
                          ? categoryParts(monthlyReview.topCategory.category)
                              .name
                          : '—'}
                      </strong>
                      {monthlyReview.topCategory && (
                        <Text type="secondary">
                          {formatMoney(monthlyReview.topCategory.amount)}
                        </Text>
                      )}
                    </div>
                    <div>
                      <Text type="secondary">
                        Compared with{' '}
                        {compactMonth(monthlyReview.previousPeriod)}
                      </Text>
                      <strong>
                        {monthlyReview.expenseChange === null
                          ? 'No prior data'
                          : `${monthlyReview.expenseChange > 0 ? '+' : ''}${monthlyReview.expenseChange}% spent`}
                      </strong>
                    </div>
                  </div>
                </Card>

                {fixedCosts.length > 0 && (
                  <Card
                    className="fixed-cost-card"
                    title="Fixed costs"
                    extra={
                      <Text type="secondary">
                        {fixedCostsCovered} of {fixedCosts.length} covered
                      </Text>
                    }
                  >
                    <div className="fixed-cost-list">
                      {fixedCosts.map((item) => {
                        const category = categoryParts(item.category);
                        return (
                          <article className="fixed-cost-row" key={item.id}>
                            <span
                              className={`fixed-cost-check${item.covered ? ' covered' : ''}`}
                              aria-hidden="true"
                            >
                              <CheckCircleOutlined />
                            </span>
                            <span className="fixed-cost-copy">
                              <Text strong>{category.name}</Text>
                              <Text type="secondary">
                                {item.covered
                                  ? `${formatMoney(item.actual)} recorded`
                                  : `${formatMoney(item.remaining)} remaining`}
                              </Text>
                            </span>
                            {item.actual !== 0 ||
                            item.creditCardGrossAmount != null ? (
                              <FixedCostEditor
                                name={category.name}
                                amount={
                                  category.name.toLowerCase() === 'credit card'
                                    ? (item.creditCardGrossAmount ??
                                      item.actual +
                                        (item.creditCardFixedCosts || 0))
                                    : item.actual
                                }
                                fixedCosts={
                                  category.name.toLowerCase() === 'credit card'
                                    ? item.creditCardFixedCosts || 0
                                    : undefined
                                }
                                disabled={historicalReadOnly || !online}
                                saving={
                                  savingInlineActualKey ===
                                  `expense:${item.category}`
                                }
                                onSave={(amount) =>
                                  saveInlineActual(item, amount)
                                }
                              />
                            ) : (
                              <Button
                                size="small"
                                disabled={historicalReadOnly}
                                onClick={() =>
                                  openNewTransaction('expense', {
                                    amount: item.remaining,
                                    description: category.name,
                                    category: item.category,
                                  })
                                }
                              >
                                Add payment
                              </Button>
                            )}
                          </article>
                        );
                      })}
                    </div>
                  </Card>
                )}
              </DeferredMount>
              <Card
                className="money-flow-card seasonal-card seasonal-flow-card"
                title="Money flow"
                extra={
                  <div className="money-flow-controls">
                    <Text type="secondary">Income vs spending</Text>
                    {flowScope === 'year' && (
                      <Text>{selectedPeriod.slice(0, 4)}</Text>
                    )}
                    <FlowScope value={flowScope} onChange={setFlowScope} />
                  </div>
                }
              >
                <figure
                  className="chart-wrap"
                  aria-label={`Income and spending ${
                    flowScope === 'year'
                      ? `by month for ${selectedPeriod.slice(0, 4)}`
                      : `for ${monthLabel(selectedPeriod)}`
                  }. ${visibleFlowData
                    .map(
                      (item) =>
                        `${item.label}: income ${formatMoney(item.income)}, spending ${formatMoney(item.expense)}`,
                    )
                    .join('; ')}`}
                >
                  {flowScope === 'year' ? (
                    <div className="flow-grid" aria-hidden="true">
                      {visibleFlowData.map((item) => (
                        <div className="flow-month" key={item.period}>
                          <div className="flow-bars">
                            <Tooltip
                              title={`Income ${formatMoney(item.income)}`}
                            >
                              <span
                                className="flow-bar income"
                                style={{
                                  height: `${Math.max((item.income / maxFlow) * 100, item.income ? 2 : 0)}%`,
                                }}
                              />
                            </Tooltip>
                            <Tooltip
                              title={`Expense ${formatMoney(item.expense)}`}
                            >
                              <span
                                className="flow-bar expense"
                                style={{
                                  height: `${Math.max((item.expense / maxFlow) * 100, item.expense ? 2 : 0)}%`,
                                }}
                              />
                            </Tooltip>
                          </div>
                          <Text type="secondary">{item.label}</Text>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="month-flow-focus" aria-hidden="true">
                      {(['income', 'expense'] as const).map((type) => (
                        <div className="month-flow-item" key={type}>
                          <Text type="secondary">
                            {type === 'income' ? 'Income' : 'Expense'}
                          </Text>
                          <strong>{formatMoney(focusedFlow[type])}</strong>
                          <div className="month-flow-bar-track">
                            <span
                              className={`month-flow-bar ${type}`}
                              style={{
                                height: `${Math.max((focusedFlow[type] / maxFlow) * 100, focusedFlow[type] ? 3 : 0)}%`,
                              }}
                            />
                          </div>
                        </div>
                      ))}
                      <Text type="secondary" className="month-flow-label">
                        {monthLabel(selectedPeriod)}
                      </Text>
                    </div>
                  )}
                </figure>
                <div className="chart-legend">
                  <span className="income-dot" />
                  Income
                  <span className="expense-dot" />
                  Expense
                </div>
                <section className="biggest-purchases-callout">
                  <div className="biggest-purchases-preview">
                    <Text type="secondary">Biggest purchase this month</Text>
                    {biggestPurchases[0] ? (
                      <>
                        <strong>{biggestPurchases[0].description}</strong>
                        <Text type="secondary">
                          {dayjs(biggestPurchases[0].transactionDate).format(
                            'MMM D',
                          )}{' '}
                          · {categoryParts(biggestPurchases[0].category).name}
                        </Text>
                      </>
                    ) : (
                      <strong>No purchases recorded</strong>
                    )}
                  </div>
                  <div className="biggest-purchases-action">
                    {biggestPurchases[0] && (
                      <strong>
                        −{formatMoney(biggestPurchases[0].amount)}
                      </strong>
                    )}
                    <Button
                      icon={<BarChartOutlined />}
                      disabled={!biggestPurchases.length}
                      onClick={() => setBiggestPurchasesOpen(true)}
                    >
                      View top 5
                    </Button>
                  </div>
                </section>
              </Card>

              <Card
                id="top-categories"
                className="category-breakdown-card seasonal-card seasonal-category-card"
                title="Top categories"
                extra={<Text type="secondary">This month</Text>}
              >
                {categoryBreakdown.items.length ? (
                  <div className="category-breakdown">
                    <figure
                      className="category-donut"
                      style={{ background: categoryBreakdown.background }}
                      aria-label={categoryBreakdown.items
                        .map(
                          (item) =>
                            `${categoryParts(item.category).name} ${item.percent}%`,
                        )
                        .join(', ')}
                    >
                      <div>
                        <strong>{formatMoney(monthExpense)}</strong>
                        <span>this month</span>
                      </div>
                    </figure>
                    <div className="category-legend">
                      {categoryBreakdown.items.map((item) => {
                        const illustration = categoryIllustration(
                          item.category,
                        );
                        return (
                          <div key={item.category}>
                            <span
                              className="category-legend-art"
                              aria-hidden="true"
                            >
                              <img
                                src={illustration.src}
                                alt=""
                                width={44}
                                height={44}
                                loading="lazy"
                                decoding="async"
                              />
                              {illustration.week && <b>{illustration.week}</b>}
                            </span>
                            <span className="category-legend-label">
                              <span
                                className="category-legend-dot"
                                style={{ backgroundColor: item.color }}
                                aria-hidden="true"
                              />
                              <Text>{categoryParts(item.category).name}</Text>
                            </span>
                            <Text type="secondary">{item.percent}%</Text>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                ) : (
                  <Empty
                    image={Empty.PRESENTED_IMAGE_SIMPLE}
                    description="No spending this month"
                  />
                )}
              </Card>
            </div>
          )}

          {view === 'transactions' && (
            <Suspense fallback={<LoadingPlaceholder rows={8} />}>
              <TransactionsView
                model={{
                  exportSelectedMonth,
                  filterType,
                  formatMoney,
                  historicalReadOnly,
                  monthLabel,
                  openEditTransaction,
                  openNewTransaction,
                  openTransactionWeek,
                  weekJump,
                  setWeekJump,
                  search,
                  selectedPeriod,
                  setFilterType,
                  setOpenTransactionWeek,
                  setSearch,
                  splitTransactions,
                  stageDeleteTransaction,
                  transactionDayClassName,
                  transactionWeekGroups,
                  weeklyExpenseTotal,
                  syncMode: ledger.syncMode,
                  transactionFilters,
                  setTransactionFilters,
                  filterCategories,
                  recentPurchases,
                  repeatRecentPurchase,
                  compareWithSheet,
                  comparingSheet,
                }}
              />
            </Suspense>
          )}

          {view === 'budgets' && (
            <Suspense fallback={<LoadingPlaceholder rows={8} />}>
              <BudgetsView
                model={{
                  budgetComparison,
                  budgetRows,
                  budgetSaveKey,
                  pendingWrite,
                  budgetType,
                  cancelBudgetDrag,
                  categoryParts,
                  closingMonth,
                  defaultRecurringCategory,
                  draggingBudgetIds,
                  finishBudgetDrag,
                  formatMoney,
                  historicalReadOnly,
                  monthBudgets,
                  moveBudgetDrag,
                  moveBudgetWithKeyboard,
                  openBudgetEditor,
                  openNewBudget,
                  openWeekTransactions,
                  orderableBudgets,
                  rearrangingBudgets,
                  resetBudgetOrderInteraction,
                  saveInlineActual,
                  savingInlineActualKey,
                  savingBudgetOrder,
                  selectedActual,
                  selectedBudgetCount,
                  selectedBudgetIds,
                  selectedComparison,
                  selectedEstimate,
                  selectBudgetType,
                  setMonthSetupOpen,
                  setRearrangingBudgets,
                  setSelectedBudgetIds,
                  startBudgetDrag,
                  weeklyCategoryNumber,
                }}
              />
            </Suspense>
          )}
        </Content>

        <nav className="mobile-nav" aria-label="Primary navigation">
          <button
            className={view === 'overview' ? 'active' : ''}
            aria-current={view === 'overview' ? 'page' : undefined}
            onClick={() => setView('overview')}
          >
            <BarChartOutlined />
            <span className="mobile-nav-label">Home</span>
          </button>
          <button
            className={view === 'budgets' ? 'active' : ''}
            aria-current={view === 'budgets' ? 'page' : undefined}
            onClick={() => setView('budgets')}
          >
            <ProfileOutlined />
            <span className="mobile-nav-label">Budget</span>
          </button>
          <button
            className={view === 'transactions' ? 'active' : ''}
            aria-current={view === 'transactions' ? 'page' : undefined}
            onClick={() => setView('transactions')}
          >
            <SwapOutlined />
            <span className="mobile-nav-label">Transactions</span>
          </button>
        </nav>
      </Layout>

      {/* Dialog implementation lives in lazy-loaded modules so the main screen can
          become interactive before Ant Design's form controls are downloaded.
      <Modal
        title={
          editingTransaction
            ? 'Edit transaction'
            : transactionEntryMode === 'multiple'
              ? 'Add multiple expenses'
              : 'Add transaction'
        }
        open={transactionOpen}
        onCancel={() => {
          setTransactionOpen(false);
          setTransactionEntryMode('single');
        }}
        onOk={() =>
          void (!editingTransaction && transactionEntryMode === 'multiple'
            ? saveMultipleExpenses()
            : saveTransaction())
        }
        okText={
          editingTransaction
            ? 'Save changes'
            : transactionEntryMode === 'multiple'
              ? `Add ${batchExpenseRows.length || 1} expense${
                  batchExpenseRows.length === 1 ? '' : 's'
                }`
              : 'Add transaction'
        }
        confirmLoading={savingTransaction}
        destroyOnHidden
      >
        {!editingTransaction && (
          <Segmented
            block
            className="transaction-entry-mode"
            value={transactionEntryMode}
            onChange={(value) => {
              if (value === 'multiple') openMultipleExpenseEntry();
              else setTransactionEntryMode('single');
            }}
            options={[
              { label: 'Single transaction', value: 'single' },
              { label: 'Multiple expenses', value: 'multiple' },
            ]}
          />
        )}

        {(editingTransaction || transactionEntryMode === 'single') && (
          <Form
            form={transactionForm}
            layout="vertical"
            className="transaction-form"
          >
            <Form.Item name="type" label="Type" rules={[{ required: true }]}>
              <Segmented
                block
                options={[
                  {
                    label: 'Expense',
                    value: 'expense',
                    icon: <ArrowUpOutlined />,
                  },
                  {
                    label: 'Income',
                    value: 'income',
                    icon: <ArrowDownOutlined />,
                  },
                ]}
              />
            </Form.Item>
            <div className="form-grid">
              <Form.Item
                name="amount"
                label="Amount"
                rules={[{ required: true, message: 'Enter an amount' }]}
              >
                <InputNumber
                  min={1}
                  precision={0}
                  controls={false}
                  prefix="¥"
                  placeholder="0"
                />
              </Form.Item>
              <Form.Item
                name="transactionDate"
                label="Date"
                rules={[{ required: true, message: 'Choose a date' }]}
              >
                <DatePicker format="MMM D, YYYY" />
              </Form.Item>
            </div>
            <Form.Item
              name="description"
              label="Description"
              rules={[
                { required: true, message: 'Add a description' },
                { max: 120 },
              ]}
            >
              <Input placeholder="e.g. Groceries at Seiyu" maxLength={120} />
            </Form.Item>
            <Form.Item
              name="category"
              label="Category"
              rules={[
                { required: true, message: 'Choose or enter a category' },
              ]}
              extra="Choose an existing category or type a new one."
            >
              <Select
                mode="tags"
                maxCount={1}
                tokenSeparators={[',']}
                showSearch
                options={allCategories}
                placeholder="Choose a category"
              />
            </Form.Item>
          </Form>
        )}

        {!editingTransaction && transactionEntryMode === 'multiple' && (
          <Form
            form={batchExpenseForm}
            layout="vertical"
            className="batch-expense-form"
          >
            <Form.List name="expenses">
              {(fields, { add, remove }) => (
                <>
                  <div className="batch-expense-list">
                    {fields.map((field, index) => (
                      <section className="batch-expense-entry" key={field.key}>
                        <div className="batch-expense-heading">
                          <Text strong>Expense {index + 1}</Text>
                          {fields.length > 1 && (
                            <Button
                              type="text"
                              danger
                              size="small"
                              icon={<DeleteOutlined />}
                              aria-label={`Remove expense ${index + 1}`}
                              onClick={() => remove(field.name)}
                            />
                          )}
                        </div>
                        <div className="form-grid">
                          <Form.Item
                            name={[field.name, 'amount']}
                            label="Amount"
                            rules={[
                              { required: true, message: 'Enter an amount' },
                            ]}
                          >
                            <InputNumber
                              min={1}
                              precision={0}
                              controls={false}
                              prefix="¥"
                              placeholder="0"
                            />
                          </Form.Item>
                          <Form.Item
                            name={[field.name, 'transactionDate']}
                            label="Date"
                            rules={[
                              { required: true, message: 'Choose a date' },
                            ]}
                          >
                            <DatePicker format="MMM D, YYYY" />
                          </Form.Item>
                        </div>
                        <Form.Item
                          name={[field.name, 'description']}
                          label="Description"
                          rules={[
                            {
                              required: true,
                              message: 'Add a description',
                            },
                            { max: 120 },
                          ]}
                        >
                          <Input
                            placeholder="e.g. Groceries at Seiyu"
                            maxLength={120}
                          />
                        </Form.Item>
                        <Form.Item
                          name={[field.name, 'category']}
                          label="Category"
                          rules={[
                            {
                              required: true,
                              message: 'Choose or enter a category',
                            },
                          ]}
                        >
                          <Select
                            mode="tags"
                            maxCount={1}
                            tokenSeparators={[',']}
                            showSearch
                            options={allCategories}
                            placeholder="Choose a category"
                          />
                        </Form.Item>
                      </section>
                    ))}
                  </div>
                  <Button
                    type="dashed"
                    className="batch-add-expense-button"
                    block
                    icon={<PlusOutlined />}
                    disabled={fields.length >= 20}
                    onClick={() => {
                      const expenses =
                        batchExpenseForm.getFieldValue('expenses') || [];
                      const previous = expenses.at(-1);
                      add({
                        transactionDate:
                          previous?.transactionDate ||
                          dayjs(`${selectedPeriod}-01`),
                        category: [],
                      });
                    }}
                  >
                    Add another expense
                  </Button>
                </>
              )}
            </Form.List>
          </Form>
        )}
      </Modal>

      <Modal
        title={
          !editingBudget
            ? `Add ${budgetType} category`
            : budgetEditTarget === 'category'
              ? `Rename ${editingBudget?.category || ''}`
              : budgetEditTarget === 'plannedAmount'
                ? `Edit ${editingBudget?.category || ''} estimated amount`
                : `Edit ${editingBudget?.category || ''} estimate`
        }
        open={budgetOpen}
        onCancel={() => setBudgetOpen(false)}
        onOk={() => void saveBudget()}
        okText={
          !editingBudget
            ? 'Add category'
            : budgetEditTarget === 'category'
              ? 'Save category'
              : budgetEditTarget === 'plannedAmount'
                ? 'Save amount'
                : 'Save estimate'
        }
        confirmLoading={savingBudget}
        cancelButtonProps={{ disabled: deletingBudget }}
        okButtonProps={{ disabled: deletingBudget }}
        destroyOnHidden
      >
        <Text type="secondary">
          {monthLabel(selectedPeriod)} · {editingBudget?.type || budgetType}
        </Text>
        <Form form={budgetForm} layout="vertical" className="budget-form">
          {budgetEditTarget !== 'plannedAmount' && (
            <>
              <Form.Item
                name="emoji"
                label="Category emoji"
                extra="Choose from the list, or paste your own emoji and press Enter."
                rules={[
                  {
                    validator: (_, value?: string[]) =>
                      !value?.[0] ||
                      /^(?:[0-9#*]\uFE0F?\u20E3|\p{Extended_Pictographic}|\p{Regional_Indicator})/u.test(
                        value[0],
                      )
                        ? Promise.resolve()
                        : Promise.reject(
                            new Error('Choose or paste an emoji.'),
                          ),
                  },
                ]}
              >
                <Select
                  mode="tags"
                  maxCount={1}
                  showSearch={{ optionFilterProp: 'label' }}
                  allowClear
                  options={categoryEmojiOptions}
                  placeholder="Choose or paste an emoji"
                />
              </Form.Item>
              <Form.Item
                name="category"
                label="Category name"
                rules={[
                  { required: true, message: 'Enter a category name' },
                  { max: 68, message: 'Use 68 characters or fewer' },
                ]}
              >
                <Input placeholder="Category name" maxLength={68} />
              </Form.Item>
            </>
          )}
          {budgetEditTarget !== 'category' && (
            <Form.Item
              name="plannedAmount"
              label="Estimated amount"
              rules={[{ required: true, message: 'Enter an estimated amount' }]}
            >
              <InputNumber min={0} precision={0} controls={false} prefix="¥" />
            </Form.Item>
          )}
          {budgetEditTarget !== 'plannedAmount' &&
            (!editingBudget ||
              !weeklyCategoryNumber(editingBudget.category)) && (
              <Form.Item name="recurring" valuePropName="checked">
                <Checkbox>Repeat this estimate next month</Checkbox>
              </Form.Item>
            )}
        </Form>
        {editingBudget && canDeleteEditingBudget && (
          <div className="budget-delete-zone">
            <div>
              <Text strong>Delete category</Text>
              <Text type="secondary">Existing transactions will be kept.</Text>
            </div>
            <Popconfirm
              title={`Delete ${categoryParts(editingBudget.category).name}?`}
              description="The estimate will be removed. Existing transactions will be kept."
              okText="Delete category"
              okButtonProps={{ danger: true }}
              onConfirm={() => deleteBudgetCategory(editingBudget)}
            >
              <Button danger icon={<DeleteOutlined />} loading={deletingBudget}>
                Delete
              </Button>
            </Popconfirm>
          </div>
        )}
      </Modal>
      */}

      {transactionOpen && (
        <Suspense fallback={null}>
          <TransactionDialog
            open={transactionOpen}
            editing={editingTransaction}
            defaults={transactionDefaults}
            entryMode={transactionEntryMode}
            saving={savingTransaction}
            awaitingConfirmation={Boolean(pendingEdit)}
            confirmationMessage={saveConfirmationMessage}
            onCheckSaveStatus={confirmPendingTransactionEdit}
            onRetrySave={retryPendingTransactionEdit}
            categories={transactionCategories}
            history={ledger.transactions}
            onEntryModeChange={setTransactionEntryMode}
            onCancel={() => {
              setTransactionOpen(false);
              setTransactionEntryMode('single');
            }}
            onSubmitSingle={saveTransaction}
            onSubmitMultiple={saveMultipleExpenses}
            onDelete={
              editingTransaction &&
              !historicalReadOnly &&
              !pendingEdit &&
              !pendingWrite
                ? () => {
                    void stageDeleteTransaction(editingTransaction);
                    setTransactionOpen(false);
                  }
                : undefined
            }
          />
        </Suspense>
      )}

      {budgetOpen && (
        <Suspense fallback={null}>
          <BudgetDialog
            open={budgetOpen}
            editing={editingBudget}
            editTarget={budgetEditTarget}
            budgetType={budgetType}
            periodLabel={monthLabel(budgetEditorPeriod)}
            saving={savingBudget}
            restoreValues={budgetRestoreValues}
            deleting={deletingBudget}
            canDelete={canDeleteEditingBudget}
            emojiOptions={categoryEmojiOptions}
            initialName={
              editingBudget ? categoryParts(editingBudget.category).name : ''
            }
            initialEmoji={
              editingBudget ? categoryParts(editingBudget.category).emoji : ''
            }
            initialRecurring={
              editingBudget
                ? (editingBudget.recurring ??
                  defaultRecurringCategory(
                    editingBudget.category,
                    editingBudget.type,
                  ))
                : true
            }
            onCancel={() => setBudgetOpen(false)}
            onSubmit={saveBudget}
            onDelete={() =>
              editingBudget
                ? deleteBudgetCategory(editingBudget)
                : Promise.resolve()
            }
          />
        </Suspense>
      )}

      {monthSetupOpen && (
        <Suspense fallback={null}>
          <MonthSetupDialog
            open={monthSetupOpen}
            sourceLabel={monthLabel(selectedPeriod)}
            destinationLabel={monthLabel(nextPeriod(selectedPeriod))}
            destinationExists={Boolean(
              ledger.budgets.some(
                (item) => item.period === nextPeriod(selectedPeriod),
              ) ||
              ledger.transactions.some(
                (item) => item.period === nextPeriod(selectedPeriod),
              ),
            )}
            plans={monthBudgets.map((item) => ({
              type: item.type,
              category: item.category,
              plannedAmount: item.plannedAmount,
              recurring: item.recurring,
            }))}
            saving={closingMonth}
            onCancel={() => setMonthSetupOpen(false)}
            onSubmit={saveMonthSetup}
          />
        </Suspense>
      )}

      {(syncDetailsOpen ||
        reconciliationOpen ||
        biggestPurchasesOpen ||
        activityOpen) && (
        <Suspense fallback={null}>
          <Drawer
            title="Sync status"
            open={syncDetailsOpen}
            onClose={() => setSyncDetailsOpen(false)}
            size="min(420px, 100vw)"
          >
            <div className="sync-details">
              <Text strong>{currentSyncStatus.label}</Text>
              <Text type="secondary">
                {pendingEdit || pendingWrite
                  ? 'A save still needs confirmation. Check its result before trying again.'
                  : queuedCount
                    ? `${queuedCount} new transaction${queuedCount === 1 ? '' : 's'} will sync when connected.`
                    : !online
                      ? 'You are offline. Previously loaded data is still available.'
                      : syncing
                        ? 'Checking Google Sheets. Your current data stays visible.'
                        : ledger.syncMode === 'google-sheets'
                          ? 'Changes are saved. Refresh checks for edits made directly in Google Sheets.'
                          : 'Changes are saved in the app database.'}
              </Text>
              {pendingWrite && (
                <>
                  <Alert
                    type="warning"
                    showIcon
                    title="Save awaiting confirmation"
                    description={
                      'The submitted values for ' +
                      monthLabel(pendingWrite.period) +
                      (pendingWrite.method === 'DELETE'
                        ? ' are preserved. Check save status first; retries verify the original transaction before deleting.'
                        : ' are preserved. Check save status before making another change.')
                    }
                  />
                  <Button
                    loading={checkingWrite}
                    disabled={!online}
                    onClick={() => void checkPendingWrite()}
                  >
                    Check save status
                  </Button>
                  {(pendingWrite.method !== 'DELETE' ||
                    Boolean(
                      pendingWrite.body &&
                      JSON.parse(pendingWrite.body).originalFingerprint,
                    )) && (
                    <Button
                      disabled={!online || checkingWrite}
                      onClick={() => void checkPendingWrite(true)}
                    >
                      Retry preserved save
                    </Button>
                  )}
                  {pendingWrite.method === 'DELETE' &&
                    pendingWrite.url.startsWith('/api/ledger/') &&
                    pendingWrite.body && (
                      <Button
                        disabled={!online || checkingWrite}
                        onClick={() => void checkPendingWrite(false, true)}
                      >
                        Use latest Sheet values
                      </Button>
                    )}
                </>
              )}
              {outboxError && (
                <Alert
                  type="warning"
                  showIcon
                  title="Queued changes need attention"
                  description={outboxError}
                />
              )}
              {queuedCount > 0 && (
                <Button
                  disabled={!online || activeWrites > 0}
                  onClick={() => void flushQueuedTransactions()}
                >
                  Retry queued saves
                </Button>
              )}
              {refreshError && (
                <Alert
                  type="warning"
                  showIcon
                  title="Last refresh failed"
                  description={refreshError}
                />
              )}
              {ledger.syncMode === 'google-sheets' && (
                <>
                  <Text type="secondary">
                    {monthLabel(selectedPeriod)} checked:{' '}
                    {ledger.periodSyncedAt?.[selectedPeriod]
                      ? formatTokyoDateTime(
                          ledger.periodSyncedAt[selectedPeriod],
                        )
                      : 'Not checked separately yet'}
                  </Text>
                  <Text type="secondary">
                    Full workbook check:{' '}
                    {ledger.integrity?.checkedAt
                      ? formatTokyoDateTime(ledger.integrity.checkedAt)
                      : 'Not checked yet'}
                  </Text>
                </>
              )}
              {pendingEdit && (
                <Button
                  onClick={() => {
                    setSyncDetailsOpen(false);
                    openEditTransaction({
                      ...pendingEdit.original,
                      ...pendingEdit.input,
                    });
                  }}
                >
                  Review save
                </Button>
              )}
              {ledger.syncMode === 'google-sheets' && (
                <>
                  <Button
                    disabled={
                      !online ||
                      syncing ||
                      Boolean(pendingEdit || pendingWrite) ||
                      currentSyncStatus.key === 'saving'
                    }
                    icon={<SyncOutlined spin={syncing} />}
                    onClick={() => void loadLedger(true, true, true)}
                  >
                    Refresh {monthLabel(selectedPeriod)}
                  </Button>
                  <Button
                    disabled={
                      !online ||
                      syncing ||
                      Boolean(pendingEdit) ||
                      currentSyncStatus.key === 'saving'
                    }
                    onClick={() => void loadLedger(true)}
                  >
                    Check entire workbook
                  </Button>
                  <Button
                    disabled={!online || comparingSheet}
                    onClick={() => void compareWithSheet()}
                  >
                    Compare app with Google Sheets
                  </Button>
                  <Text type="secondary">
                    Month refreshes leave other months intact. A full check also
                    verifies formulas and backups.
                  </Text>
                </>
              )}
            </div>
          </Drawer>

          <Drawer
            title={'Reconciliation · ' + monthLabel(selectedPeriod)}
            open={reconciliationOpen}
            onClose={() => setReconciliationOpen(false)}
            size="min(640px, 100vw)"
          >
            <p>
              This is a read-only comparison. It never changes either the app or
              Google Sheets.
            </p>
            <Button
              loading={comparingSheet}
              disabled={!online}
              onClick={() => void compareWithSheet()}
            >
              Compare again
            </Button>
            {reconciliationError && (
              <Alert type="warning" showIcon title={reconciliationError} />
            )}
            {reconciliation && (
              <>
                <p>Checked {formatTokyoDateTime(reconciliation.checkedAt)}</p>
                <table className="reconciliation-totals">
                  <thead>
                    <tr>
                      <th>Current month</th>
                      <th>App</th>
                      <th>Google Sheets</th>
                    </tr>
                  </thead>
                  <tbody>
                    <tr>
                      <th>Entries</th>
                      <td>{reconciliation.app.count}</td>
                      <td>{reconciliation.sheet.count}</td>
                    </tr>
                    <tr>
                      <th>Expenses</th>
                      <td>{formatMoney(reconciliation.app.expense)}</td>
                      <td>{formatMoney(reconciliation.sheet.expense)}</td>
                    </tr>
                    <tr>
                      <th>Income</th>
                      <td>{formatMoney(reconciliation.app.income)}</td>
                      <td>{formatMoney(reconciliation.sheet.income)}</td>
                    </tr>
                  </tbody>
                </table>
                {!reconciliation.differences.length ? (
                  <Alert
                    type="success"
                    showIcon
                    title="This month matches Google Sheets"
                  />
                ) : (
                  <>
                    <Alert
                      type="warning"
                      showIcon
                      title={
                        reconciliation.differences.length + ' differences found'
                      }
                      description="Review these differences. To use the Sheet values, close this view and refresh this month from Sync status."
                    />
                    <div className="reconciliation-differences">
                      {reconciliation.differences.map((item, index) => (
                        <article key={index}>
                          <Text strong>
                            {item.kind} · {item.label}
                          </Text>
                          <Text>App: {item.app}</Text>
                          <Text>Sheet: {item.sheet}</Text>
                        </article>
                      ))}
                    </div>
                  </>
                )}
              </>
            )}
          </Drawer>

          <Drawer
            title={`Top purchases · ${monthLabel(selectedPeriod)}`}
            open={biggestPurchasesOpen}
            onClose={() => setBiggestPurchasesOpen(false)}
            size="min(420px, 100vw)"
          >
            <div className="biggest-purchases-drawer-intro">
              <Text type="secondary">
                The five highest individual expense transactions recorded this
                month.
              </Text>
              {biggestPurchases.length > 0 && (
                <Text strong>
                  {formatMoney(
                    biggestPurchases.reduce(
                      (sum, item) => sum + item.amount,
                      0,
                    ),
                  )}{' '}
                  combined
                </Text>
              )}
            </div>
            {biggestPurchases.length ? (
              <div className="biggest-purchases-list">
                {biggestPurchases.map((item, index) => (
                  <article key={item.id}>
                    <span
                      className="purchase-rank"
                      aria-label={`Rank ${index + 1}`}
                    >
                      {index + 1}
                    </span>
                    <div className="purchase-copy">
                      <Text strong>{item.description}</Text>
                      <Text type="secondary">
                        {dayjs(item.transactionDate).format('MMM D')} ·{' '}
                        {categoryParts(item.category).name}
                      </Text>
                    </div>
                    <Text strong>−{formatMoney(item.amount)}</Text>
                  </article>
                ))}
              </div>
            ) : (
              <Empty
                image={Empty.PRESENTED_IMAGE_SIMPLE}
                description="No purchases this month"
              />
            )}
          </Drawer>

          <Drawer
            title="Recent changes"
            open={activityOpen}
            onClose={() => setActivityOpen(false)}
            size="default"
          >
            {activity.length ? (
              <div className="activity-history-list">
                {activity.map((item) => (
                  <article key={item.id}>
                    <span className="activity-history-icon" aria-hidden="true">
                      <CheckCircleOutlined />
                    </span>
                    <div>
                      <Text strong>{item.title}</Text>
                      <Text type="secondary">{item.detail}</Text>
                      <Text type="secondary" className="activity-history-time">
                        {formatTokyoDateTime(item.occurredAt)}
                      </Text>
                    </div>
                  </article>
                ))}
              </div>
            ) : (
              <Empty
                image={Empty.PRESENTED_IMAGE_SIMPLE}
                description="Changes you make will appear here"
              />
            )}
            <div className="backup-actions">
              <Text type="secondary">
                Download a private copy of every ledger entry and any queued
                offline changes.
              </Text>
              <div className="backup-action-buttons">
                <Button
                  icon={<DownloadOutlined />}
                  onClick={downloadLedgerBackup}
                  loading={backingUp}
                >
                  Download full backup
                </Button>
                <Button onClick={() => void downloadRecoveryData()}>
                  Export recovery data
                </Button>
                <Button icon={<UploadOutlined />} htmlType="button">
                  <label className="backup-file-label">
                    Rehearse a backup
                    <input
                      type="file"
                      accept="application/json,.json"
                      onChange={(event) => void previewBackupFile(event)}
                    />
                  </label>
                </Button>
              </div>
            </div>
            <div className="performance-history">
              <Text strong>Private performance log</Text>
              <Text type="secondary">
                Stored only on this device. Sheet bridge includes the Google
                round trip; network / transfer is an estimate, and next frame is
                not a paint guarantee. Startup milestones are measured from
                document navigation, except cache read (its own duration). Home
                interactive follows snapshot restoration and a Home paint
                opportunity. iOS icon-tap / process-launch time is not included.
              </Text>
              {performanceSamples.slice(0, 5).map((sample) => (
                <div className="performance-history-row" key={sample.id}>
                  <span>
                    <Text>{sample.name}</Text>
                    <Text type="secondary">
                      {formatTokyoDateTime(sample.occurredAt)}
                    </Text>
                    {sample.timing && (
                      <Text type="secondary">
                        {sample.timing.transportMs !== undefined &&
                          'Network / transfer ≈ ' +
                            Math.round(sample.timing.transportMs) +
                            ' ms · '}
                        {sample.timing.serverMs !== undefined &&
                          'Server ' +
                            Math.round(sample.timing.serverMs) +
                            ' ms · '}
                        {sample.timing.sheetMs !== undefined &&
                          'Sheet bridge ' +
                            Math.round(sample.timing.sheetMs) +
                            ' ms · '}
                        {sample.timing.frameMs !== undefined &&
                          'Next frame ' +
                            Math.round(sample.timing.frameMs) +
                            ' ms'}
                      </Text>
                    )}
                  </span>
                  <Tag color={sample.successful ? 'green' : 'red'}>
                    {sample.durationMs} ms
                  </Tag>
                </div>
              ))}
            </div>
          </Drawer>
        </Suspense>
      )}
    </Layout>
  );
}
