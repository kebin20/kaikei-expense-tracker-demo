'use client';

/* oxlint-disable next/no-img-element */

import ArrowDownOutlined from '@ant-design/icons/ArrowDownOutlined';
import ArrowUpOutlined from '@ant-design/icons/ArrowUpOutlined';
import BarChartOutlined from '@ant-design/icons/BarChartOutlined';
import EditOutlined from '@ant-design/icons/EditOutlined';
import PlusOutlined from '@ant-design/icons/PlusOutlined';
import ProfileOutlined from '@ant-design/icons/ProfileOutlined';
import SwapOutlined from '@ant-design/icons/SwapOutlined';
import WalletOutlined from '@ant-design/icons/WalletOutlined';
import {
  Alert,
  App,
  Button,
  Card,
  Empty,
  Layout,
  Menu,
  Progress,
  Segmented,
  Select,
  Space,
  Tag,
  Tooltip,
  Typography,
} from 'antd';
import dayjs from 'dayjs';
import { lazy, Suspense, useEffect, useMemo, useState } from 'react';
import demoSeedData from '@/lib/seed-data.json';
import type {
  BudgetPlan,
  DemoTransactionInput,
  LedgerData,
  LedgerTransaction,
  LedgerType,
} from '@/lib/ledger-types';

const TransactionModal = lazy(() => import('@/components/transaction-modal'));
const BudgetModal = lazy(() => import('@/components/budget-modal'));
const TransactionsView = lazy(() => import('@/components/transactions-view'));

const { Sider, Content } = Layout;
const { Text, Title } = Typography;

type ViewKey = 'overview' | 'transactions' | 'budgets';

const DEMO_STORAGE_KEY = 'kaikei-demo-ledger-v1';

const currency = new Intl.NumberFormat('ja-JP', {
  style: 'currency',
  currency: 'JPY',
  maximumFractionDigits: 0,
});

function formatMoney(value: number) {
  return currency.format(Math.round(value));
}

function monthLabel(period: string) {
  return dayjs(`${period}-01`).format('MMMM YYYY');
}

function compactMonth(period: string) {
  return dayjs(`${period}-01`).format('MMM');
}

function greeting() {
  const hour = Number(
    new Intl.DateTimeFormat('en-GB', {
      hour: '2-digit',
      hour12: false,
      timeZone: 'Asia/Tokyo',
    }).format(new Date()),
  );
  if (hour < 12) return 'Good morning';
  if (hour < 18) return 'Good afternoon';
  return 'Good evening';
}

function freshDemoLedger(): LedgerData {
  return JSON.parse(JSON.stringify(demoSeedData)) as LedgerData;
}

function readDemoLedger() {
  const saved = window.localStorage.getItem(DEMO_STORAGE_KEY);
  if (!saved) return freshDemoLedger();
  try {
    return JSON.parse(saved) as LedgerData;
  } catch {
    return freshDemoLedger();
  }
}

function persistDemoLedger(data: LedgerData) {
  window.localStorage.setItem(DEMO_STORAGE_KEY, JSON.stringify(data));
}

function demoText(value: unknown) {
  return typeof value === 'string' ? value : '';
}

function makeDemoTransaction(
  input: DemoTransactionInput,
  id = crypto.randomUUID(),
) {
  return {
    id,
    transactionDate: input.transactionDate,
    period: input.transactionDate.slice(0, 7),
    type: input.type,
    amount: Math.round(input.amount),
    description: input.description.trim(),
    category: input.category.trim(),
    source: 'manual',
    createdAt: Date.now(),
  } satisfies LedgerTransaction;
}

export default function Home() {
  const { message } = App.useApp();
  const [ledger, setLedger] = useState<LedgerData>(freshDemoLedger);
  const [error, setError] = useState('');
  const [view, setView] = useState<ViewKey>('overview');
  const [selectedPeriod, setSelectedPeriod] = useState('2026-09');
  const [transactionOpen, setTransactionOpen] = useState(false);
  const [editingTransaction, setEditingTransaction] =
    useState<LedgerTransaction | null>(null);
  const [savingTransaction, setSavingTransaction] = useState(false);
  const [newTransactionType, setNewTransactionType] =
    useState<LedgerType>('expense');
  const [filterType, setFilterType] = useState<'all' | LedgerType>('all');
  const [search, setSearch] = useState('');
  const [budgetType, setBudgetType] = useState<LedgerType>('expense');
  const [editingBudget, setEditingBudget] = useState<BudgetPlan | null>(null);
  const [budgetOpen, setBudgetOpen] = useState(false);
  const [savingBudget, setSavingBudget] = useState(false);

  const loadLedger = () => {
    setError('');
    try {
      const data = readDemoLedger();
      setLedger(data);
      const latest = [...new Set(data.budgets.map((item) => item.period))]
        .sort()
        .at(-1);
      if (latest) setSelectedPeriod(latest);
    } catch (caught) {
      setError(
        caught instanceof Error
          ? caught.message
          : 'Kaikei could not load your ledger.',
      );
    }
  };

  useEffect(() => {
    const frame = window.requestAnimationFrame(loadLedger);
    return () => window.cancelAnimationFrame(frame);
  }, []);

  const resetDemo = () => {
    const data = freshDemoLedger();
    persistDemoLedger(data);
    setLedger(data);
    setSelectedPeriod('2026-09');
    setView('overview');
    message.success('Demo data reset');
  };

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
            if (!input || typeof input !== 'object')
              throw new Error('Invalid transaction.');
            const value = input as Record<string, unknown>;
            const item = makeDemoTransaction({
              transactionDate: demoText(value.transactionDate),
              type: value.type === 'income' ? 'income' : 'expense',
              amount: Number(value.amount),
              description: demoText(value.description),
              category: demoText(value.category),
            });
            if (
              !/^\d{4}-\d{2}-\d{2}$/.test(item.transactionDate) ||
              item.amount <= 0 ||
              !item.description ||
              !item.category
            ) {
              throw new Error('Invalid transaction.');
            }
            setLedger((current) => {
              if (!current) return current;
              const next = {
                ...current,
                transactions: [item, ...current.transactions],
              };
              persistDemoLedger(next);
              return next;
            });
            setSelectedPeriod(item.period);
            return { id: item.id, status: 'created', period: item.period };
          },
        },
        { signal: lifecycle.signal },
      ),
    ).catch(() => undefined);
    return () => lifecycle.abort();
  }, []);

  const periods = useMemo(() => {
    if (!ledger) return [];
    return [
      ...new Set([
        ...ledger.budgets.map((item) => item.period),
        ...ledger.transactions.map((item) => item.period),
      ]),
    ].sort();
  }, [ledger]);

  const monthTransactions = useMemo(
    () =>
      ledger?.transactions.filter((item) => item.period === selectedPeriod) ||
      [],
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
    const plans = monthBudgets.filter((item) => item.type === budgetType);
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
    return [...byCategory.values()]
      .map((item) => ({
        ...item,
        actual: categoryActuals.get(`${budgetType}:${item.category}`) || 0,
      }))
      .sort((a, b) => b.plannedAmount - a.plannedAmount || b.actual - a.actual);
  }, [
    budgetType,
    categoryActuals,
    monthBudgets,
    monthTransactions,
    selectedPeriod,
  ]);

  const budgetPulse = useMemo(
    () =>
      monthBudgets
        .filter((item) => item.type === 'expense')
        .map((item) => ({
          ...item,
          actual: categoryActuals.get(`expense:${item.category}`) || 0,
        }))
        .sort((a, b) => b.plannedAmount - a.plannedAmount)
        .slice(0, 5),
    [categoryActuals, monthBudgets],
  );

  const filteredTransactions = useMemo(() => {
    const query = search.trim().toLowerCase();
    return monthTransactions.filter(
      (item) =>
        (filterType === 'all' || item.type === filterType) &&
        (!query ||
          item.description.toLowerCase().includes(query) ||
          item.category.toLowerCase().includes(query)),
    );
  }, [filterType, monthTransactions, search]);

  const allCategories = useMemo(() => {
    if (!ledger) return [];
    return [
      ...new Set([
        ...ledger.transactions.map((item) => item.category),
        ...ledger.budgets.map((item) => item.category),
      ]),
    ]
      .sort()
      .map((value) => ({ label: value, value }));
  }, [ledger]);

  const openNewTransaction = (type: LedgerType = 'expense') => {
    setEditingTransaction(null);
    setNewTransactionType(type);
    setTransactionOpen(true);
  };

  const openEditTransaction = (item: LedgerTransaction) => {
    setEditingTransaction(item);
    setTransactionOpen(true);
  };

  const saveTransaction = async (input: DemoTransactionInput) => {
    try {
      setSavingTransaction(true);
      const item = makeDemoTransaction(input, editingTransaction?.id);
      setLedger((current) => {
        if (!current) return current;
        const next = {
          ...current,
          transactions: editingTransaction
            ? current.transactions.map((entry) =>
                entry.id === item.id ? item : entry,
              )
            : [item, ...current.transactions],
        };
        persistDemoLedger(next);
        return next;
      });
      setSelectedPeriod(item.period);
      setTransactionOpen(false);
      message.success(
        editingTransaction ? 'Transaction updated' : 'Transaction added',
      );
    } catch (caught) {
      if (caught instanceof Error) message.error(caught.message);
    } finally {
      setSavingTransaction(false);
    }
  };

  const deleteTransaction = async (id: string) => {
    try {
      setLedger((current) => {
        if (!current) return current;
        const next = {
          ...current,
          transactions: current.transactions.filter((item) => item.id !== id),
        };
        persistDemoLedger(next);
        return next;
      });
      message.success('Transaction deleted');
    } catch (caught) {
      message.error(
        caught instanceof Error
          ? caught.message
          : 'Could not delete the transaction.',
      );
    }
  };

  const openBudgetEditor = (item: BudgetPlan) => {
    setEditingBudget(item);
    setBudgetOpen(true);
  };

  const saveBudget = async (plannedAmount: number) => {
    if (!editingBudget) return;
    try {
      setSavingBudget(true);
      const item: BudgetPlan = {
        ...editingBudget,
        id: editingBudget.id.startsWith('new-')
          ? crypto.randomUUID()
          : editingBudget.id,
        period: selectedPeriod,
        plannedAmount,
        updatedAt: Date.now(),
      };
      setLedger((current) => {
        if (!current) return current;
        const exists = current.budgets.some(
          (entry) =>
            entry.period === item.period &&
            entry.type === item.type &&
            entry.category === item.category,
        );
        const next = {
          ...current,
          budgets: exists
            ? current.budgets.map((entry) =>
                entry.period === item.period &&
                entry.type === item.type &&
                entry.category === item.category
                  ? item
                  : entry,
              )
            : [...current.budgets, item],
        };
        persistDemoLedger(next);
        return next;
      });
      setBudgetOpen(false);
      message.success('Budget updated');
    } catch (caught) {
      if (caught instanceof Error) message.error(caught.message);
    } finally {
      setSavingBudget(false);
    }
  };

  if (error) {
    return (
      <div className="loading-shell">
        <Alert
          type="error"
          showIcon
          title="Kaikei could not load"
          description={error}
          action={<Button onClick={loadLedger}>Try again</Button>}
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
  const maxFlow = Math.max(
    ...flowData.flatMap((item) => [item.income, item.expense]),
    1,
  );

  return (
    <Layout className="app-shell">
      <Sider className="desktop-sider" width={248} theme="light">
        <div className="brand-lockup">
          <img
            src="/icons/icon-192.png"
            alt=""
            width={44}
            height={44}
            className="brand-icon"
          />
          <div>
            <strong>Kaikei</strong>
            <span>Personal finance</span>
          </div>
        </div>
        <Menu
          mode="inline"
          selectedKeys={[view]}
          onClick={({ key }) => setView(key as ViewKey)}
          items={[
            { key: 'overview', icon: <BarChartOutlined />, label: 'Overview' },
            {
              key: 'transactions',
              icon: <SwapOutlined />,
              label: 'Transactions',
            },
            { key: 'budgets', icon: <ProfileOutlined />, label: 'Budgets' },
          ]}
        />
        <div className="sidebar-note">
          <WalletOutlined />
          <div>
            <Text strong>Demo workspace</Text>
            <Text type="secondary">Synthetic data · saved on this device</Text>
          </div>
        </div>
      </Sider>

      <Layout>
        <header className="topbar">
          <button className="mobile-brand" onClick={() => setView('overview')}>
            <img src="/icons/icon-192.png" alt="" width={36} height={36} />
            <strong>Kaikei</strong>
          </button>
          <div className="topbar-copy">
            <Text type="secondary">Your money, in one calm place</Text>
            <Tag color="orange">Demo</Tag>
          </div>
          <Space>
            <Button className="reset-demo-button" onClick={resetDemo}>
              Reset demo
            </Button>
            <Select
              className="month-select"
              value={selectedPeriod}
              onChange={setSelectedPeriod}
              options={[...periods]
                .reverse()
                .map((period) => ({
                  label: monthLabel(period),
                  value: period,
                }))}
            />
            <Button
              type="primary"
              icon={<PlusOutlined />}
              onClick={() => openNewTransaction()}
            >
              <span className="add-button-label">Add transaction</span>
            </Button>
          </Space>
        </header>

        <Content className="content-wrap">
          {view === 'overview' && (
            <>
              <section className="page-heading">
                <div>
                  <Text className="eyebrow">
                    {monthLabel(selectedPeriod).toUpperCase()}
                  </Text>
                  <Title level={1}>{greeting()}</Title>
                  <Text type="secondary">
                    Here’s how your month is taking shape.
                  </Text>
                </div>
                <Button onClick={() => setView('transactions')}>
                  See all activity
                </Button>
              </section>

              <section className="metric-grid">
                <Card className="balance-card" variant="borderless">
                  <Text>Balance through {monthLabel(selectedPeriod)}</Text>
                  <div className="balance-value">
                    {formatMoney(currentBalance)}
                  </div>
                  <Tag className="balance-tag">
                    {cashFlow >= 0 ? '↑' : '↓'}{' '}
                    {formatMoney(Math.abs(cashFlow))} this month
                  </Tag>
                  <div className="balance-orbit" aria-hidden="true" />
                </Card>
                <Card className="metric-card">
                  <div className="metric-icon expense">
                    <ArrowUpOutlined />
                  </div>
                  <Text type="secondary">Spent this month</Text>
                  <Title level={2}>{formatMoney(monthExpense)}</Title>
                  <Text type="secondary">
                    {spendPercent}% of {formatMoney(plannedExpense)} planned
                  </Text>
                  <Progress
                    percent={Math.min(spendPercent, 100)}
                    showInfo={false}
                    strokeColor="#f26a21"
                  />
                </Card>
                <Card className="metric-card">
                  <div className="metric-icon income">
                    <ArrowDownOutlined />
                  </div>
                  <Text type="secondary">Income this month</Text>
                  <Title level={2}>{formatMoney(monthIncome)}</Title>
                  <Text type="secondary">
                    {incomePercent}% of {formatMoney(plannedIncome)} planned
                  </Text>
                  <Progress
                    percent={Math.min(incomePercent, 100)}
                    showInfo={false}
                    strokeColor="#102542"
                  />
                </Card>
              </section>

              <section className="dashboard-grid">
                <Card
                  title="Money flow"
                  extra={<Text type="secondary">Income vs spending</Text>}
                >
                  <div
                    className="chart-wrap"
                    aria-label="Monthly income and expense chart"
                  >
                    <div className="flow-grid" aria-hidden="true">
                      {flowData.map((item) => (
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
                  </div>
                  <div className="chart-legend">
                    <span className="income-dot" />
                    Income
                    <span className="expense-dot" />
                    Expense
                  </div>
                </Card>
                <Card
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
              </section>

              <Card
                className="budget-pulse-card"
                title="Budget pulse"
                extra={
                  <Button type="link" onClick={() => setView('budgets')}>
                    View all budgets
                  </Button>
                }
              >
                <div className="budget-pulse-grid">
                  {budgetPulse.map((item) => {
                    const percent = item.plannedAmount
                      ? Math.round((item.actual / item.plannedAmount) * 100)
                      : 0;
                    return (
                      <button
                        className="pulse-item"
                        key={item.id}
                        onClick={() => {
                          setBudgetType('expense');
                          setView('budgets');
                        }}
                      >
                        <div className="budget-label">
                          <Text strong>{item.category}</Text>
                          <Text>{formatMoney(item.actual)}</Text>
                        </div>
                        <Progress
                          percent={Math.min(percent, 100)}
                          showInfo={false}
                          strokeColor={percent > 100 ? '#d94841' : '#f26a21'}
                        />
                        <Text type="secondary">
                          {percent}% of {formatMoney(item.plannedAmount)}
                        </Text>
                      </button>
                    );
                  })}
                </div>
              </Card>
            </>
          )}

          {view === 'transactions' && (
            <Suspense fallback={<div className="loading-shell" />}>
              <TransactionsView
                transactions={filteredTransactions}
                filterType={filterType}
                search={search}
                onFilterChange={setFilterType}
                onSearchChange={setSearch}
                onAdd={openNewTransaction}
                onEdit={openEditTransaction}
                onDelete={deleteTransaction}
              />
            </Suspense>
          )}

          {view === 'budgets' && (
            <>
              <section className="page-heading">
                <div>
                  <Text className="eyebrow">PLAN & COMPARE</Text>
                  <Title level={1}>Budgets</Title>
                  <Text type="secondary">
                    Keep planned amounts close to what actually happens.
                  </Text>
                </div>
                <Segmented
                  value={budgetType}
                  onChange={(value) => setBudgetType(value as LedgerType)}
                  options={[
                    { label: 'Expenses', value: 'expense' },
                    { label: 'Income', value: 'income' },
                  ]}
                />
              </section>
              <div className="budget-summary-strip">
                <div>
                  <Text type="secondary">Planned</Text>
                  <strong>
                    {formatMoney(
                      budgetType === 'expense' ? plannedExpense : plannedIncome,
                    )}
                  </strong>
                </div>
                <div>
                  <Text type="secondary">Actual</Text>
                  <strong>
                    {formatMoney(
                      budgetType === 'expense' ? monthExpense : monthIncome,
                    )}
                  </strong>
                </div>
                <div>
                  <Text type="secondary">Difference</Text>
                  <strong>
                    {formatMoney(
                      budgetType === 'expense'
                        ? plannedExpense - monthExpense
                        : monthIncome - plannedIncome,
                    )}
                  </strong>
                </div>
              </div>
              <section className="budget-card-grid">
                {budgetRows.map((item) => {
                  const percent = item.plannedAmount
                    ? Math.round((item.actual / item.plannedAmount) * 100)
                    : item.actual
                      ? 100
                      : 0;
                  const difference = item.plannedAmount - item.actual;
                  return (
                    <Card
                      key={`${item.type}-${item.category}`}
                      className="budget-card"
                    >
                      <div className="budget-card-head">
                        <div>
                          <Tag
                            color={item.type === 'income' ? 'green' : 'orange'}
                          >
                            {item.type}
                          </Tag>
                          <Title level={3}>{item.category}</Title>
                        </div>
                        <Button
                          type="text"
                          icon={<EditOutlined />}
                          onClick={() => openBudgetEditor(item)}
                        />
                      </div>
                      <div className="budget-amounts">
                        <div>
                          <Text type="secondary">Actual</Text>
                          <strong>{formatMoney(item.actual)}</strong>
                        </div>
                        <div>
                          <Text type="secondary">Planned</Text>
                          <strong>{formatMoney(item.plannedAmount)}</strong>
                        </div>
                      </div>
                      <Progress
                        percent={Math.min(percent, 100)}
                        showInfo={false}
                        strokeColor={
                          percent > 100 && item.type === 'expense'
                            ? '#d94841'
                            : item.type === 'income'
                              ? '#102542'
                              : '#f26a21'
                        }
                      />
                      <Text
                        className={
                          difference < 0 && item.type === 'expense'
                            ? 'over-budget'
                            : ''
                        }
                      >
                        {item.plannedAmount
                          ? `${formatMoney(Math.abs(difference))} ${difference >= 0 ? 'remaining' : 'over plan'}`
                          : 'No plan set yet'}
                      </Text>
                    </Card>
                  );
                })}
              </section>
            </>
          )}
        </Content>

        <nav className="mobile-nav" aria-label="Primary navigation">
          <button
            className={view === 'overview' ? 'active' : ''}
            onClick={() => setView('overview')}
          >
            <BarChartOutlined />
            <span>Overview</span>
          </button>
          <button
            className={view === 'transactions' ? 'active' : ''}
            onClick={() => setView('transactions')}
          >
            <SwapOutlined />
            <span>Transactions</span>
          </button>
          <button
            className={view === 'budgets' ? 'active' : ''}
            onClick={() => setView('budgets')}
          >
            <ProfileOutlined />
            <span>Budgets</span>
          </button>
        </nav>
      </Layout>

      {transactionOpen && (
        <Suspense fallback={null}>
          <TransactionModal
            categories={allCategories}
            defaultType={newTransactionType}
            editingTransaction={editingTransaction}
            saving={savingTransaction}
            selectedPeriod={selectedPeriod}
            onClose={() => setTransactionOpen(false)}
            onSave={saveTransaction}
          />
        </Suspense>
      )}

      {budgetOpen && editingBudget && (
        <Suspense fallback={null}>
          <BudgetModal
            budget={editingBudget}
            month={monthLabel(selectedPeriod)}
            saving={savingBudget}
            onClose={() => setBudgetOpen(false)}
            onSave={saveBudget}
          />
        </Suspense>
      )}
    </Layout>
  );
}
