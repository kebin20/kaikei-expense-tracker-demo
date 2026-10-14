'use client';
/* oxlint-disable typescript/no-explicit-any */
import ArrowDownOutlined from '@ant-design/icons/ArrowDownOutlined';
import ArrowUpOutlined from '@ant-design/icons/ArrowUpOutlined';
import DeleteOutlined from '@ant-design/icons/DeleteOutlined';
import DownloadOutlined from '@ant-design/icons/DownloadOutlined';
import EditOutlined from '@ant-design/icons/EditOutlined';
import PlusOutlined from '@ant-design/icons/PlusOutlined';
import SearchOutlined from '@ant-design/icons/SearchOutlined';
import {
  Button,
  Card,
  Collapse,
  DatePicker,
  Dropdown,
  Empty,
  Input,
  InputNumber,
  Segmented,
  Select,
  Table,
} from 'antd';
import dayjs from 'dayjs';
import {
  useEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
  type ReactNode,
} from 'react';
import { groupTransactionDays } from '@/lib/transaction-order';
import { EMPTY_TRANSACTION_FILTERS } from '@/lib/transaction-filters';
import { Text, Title } from './ui-text';
import { transactionColumns } from './transaction-columns';

const MOBILE_QUERY =
  '(max-width: 760px), (orientation: landscape) and (max-width: 960px) and (pointer: coarse)';
const DAY_PREFS_KEY = 'kaikei-day-expansion-v1';
function layoutSnapshot() {
  return window.matchMedia(MOBILE_QUERY).matches
    ? 'mobile'
    : window.matchMedia('(min-width: 1021px)').matches
      ? 'split'
      : 'table';
}
function subscribeLayout(callback: () => void) {
  const queries = [
    window.matchMedia(MOBILE_QUERY),
    window.matchMedia('(min-width: 1021px)'),
  ];
  queries.forEach((query) => query.addEventListener('change', callback));
  return () =>
    queries.forEach((query) => query.removeEventListener('change', callback));
}
const serverLayout = () => 'table';
function TransactionDay({
  date,
  open,
  onChange,
  heading,
  children,
}: {
  date: string;
  open: boolean;
  onChange: (open: boolean) => void;
  heading: ReactNode;
  children: ReactNode;
}) {
  return (
    <Collapse
      className={
        'transaction-day-group transaction-day-tone-' +
        new Date(date + 'T00:00:00Z').getUTCDay()
      }
      activeKey={open ? [date] : []}
      onChange={(keys) => onChange(keys.length > 0)}
      destroyOnHidden
      items={[{ key: date, label: heading, children }]}
    />
  );
}

export default function TransactionsView({ model }: { model: any }) {
  const {
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
    setSearch,
    splitTransactions,
    stageDeleteTransaction,
    transactionDayClassName,
    transactionWeekGroups,
    weeklyExpenseTotal,
    syncMode,
    transactionFilters,
    setTransactionFilters,
    filterCategories,
    recentPurchases,
    repeatRecentPurchase,
    compareWithSheet,
    comparingSheet,
  } = model;
  const columns = useMemo(
    () =>
      transactionColumns({
        formatMoney,
        historicalReadOnly,
        openEditTransaction,
        stageDeleteTransaction,
      }),
    [
      formatMoney,
      historicalReadOnly,
      openEditTransaction,
      stageDeleteTransaction,
    ],
  );
  const layout = useSyncExternalStore(
    subscribeLayout,
    layoutSnapshot,
    serverLayout,
  );
  const isSplit = layout === 'split' && filterType === 'all';
  const weekHeadingRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (weekJump === null || isSplit) return;
    const frame = requestAnimationFrame(() => {
      const heading = weekHeadingRef.current?.closest<HTMLElement>(
        '.ant-collapse-header',
      );
      if (!heading) return;
      const topbarHeight =
        document.querySelector('.topbar')?.getBoundingClientRect().height ?? 0;
      heading.focus({ preventScroll: true });
      window.scrollTo({
        top: Math.max(
          0,
          window.scrollY +
            heading.getBoundingClientRect().top -
            topbarHeight -
            16,
        ),
        behavior: 'instant',
      });
      setWeekJump(null);
    });
    return () => cancelAnimationFrame(frame);
  }, [weekJump, isSplit, setWeekJump]);
  const [expandedDays, setExpandedDays] = useState<Record<string, boolean>>({});
  const [weekKeys, setWeekKeys] = useState<string[]>([openTransactionWeek]);
  const [prefsLoaded, setPrefsLoaded] = useState(false);
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [actionsOpen, setActionsOpen] = useState(false);
  const [actionsPanel, setActionsPanel] = useState<'main' | 'repeat'>('main');
  const filterKey = JSON.stringify([search, transactionFilters]);
  const filtering = Boolean(
    search.trim() ||
    transactionFilters.from ||
    transactionFilters.to ||
    transactionFilters.category ||
    transactionFilters.min !== null ||
    transactionFilters.max !== null,
  );
  useEffect(() => {
    const frame = requestAnimationFrame(() => {
      try {
        const raw = JSON.parse(localStorage.getItem(DAY_PREFS_KEY) || '{}');
        if (raw && typeof raw === 'object' && !Array.isArray(raw))
          setExpandedDays(raw);
      } catch {
        /* Optional device-local preferences. */
      }
      setPrefsLoaded(true);
    });
    return () => cancelAnimationFrame(frame);
  }, []);
  useEffect(() => {
    if (!prefsLoaded) return;
    try {
      localStorage.setItem(DAY_PREFS_KEY, JSON.stringify(expandedDays));
    } catch {
      /* Retain preferences in memory. */
    }
  }, [expandedDays, prefsLoaded]);
  useEffect(() => {
    const frame = requestAnimationFrame(() =>
      setWeekKeys(openTransactionWeek ? [openTransactionWeek] : []),
    );
    return () => cancelAnimationFrame(frame);
  }, [openTransactionWeek, selectedPeriod]);
  const weekDays = useMemo(
    () =>
      new Map<number, any[]>(
        isSplit
          ? []
          : transactionWeekGroups.map((group: any) => [
              group.week,
              groupTransactionDays(group.items),
            ]),
      ),
    [transactionWeekGroups, isSplit],
  );
  const allDates = useMemo(
    () => [
      ...new Set<string>(
        transactionWeekGroups.flatMap((group: any) =>
          group.items.map((item: any) => item.transactionDate),
        ),
      ),
    ],
    [transactionWeekGroups],
  );
  useEffect(() => {
    if (!filtering || !prefsLoaded) return;
    const frame = requestAnimationFrame(() => {
      setExpandedDays((current) => ({
        ...current,
        ...Object.fromEntries(allDates.map((date) => [date, true])),
      }));
      setWeekKeys(
        transactionWeekGroups
          .filter((group: any) => group.items.length)
          .map((group: any) => String(group.week)),
      );
    });
    return () => cancelAnimationFrame(frame);
  }, [filterKey, allDates, filtering, prefsLoaded, transactionWeekGroups]);
  const setDayOpen = (date: string, open: boolean) =>
    setExpandedDays((current) => ({ ...current, [date]: open }));
  const expandAll = (open: boolean) => {
    setExpandedDays((current) => ({
      ...current,
      ...Object.fromEntries(allDates.map((date) => [date, open])),
    }));
    setWeekKeys(
      open
        ? transactionWeekGroups
            .filter((group: any) => group.items.length)
            .map((group: any) => String(group.week))
        : [],
    );
  };
  const splitColumns = useMemo(
    () =>
      [
        {
          key: 'expenses',
          label: 'Expenses',
          items: splitTransactions.expenses,
          icon: <ArrowUpOutlined />,
          sign: '−',
        },
        {
          key: 'income',
          label: 'Income',
          items: splitTransactions.income,
          icon: <ArrowDownOutlined />,
          sign: '+',
        },
      ].map((column) => ({
        ...column,
        total: column.items.reduce(
          (sum: number, item: any) => sum + item.amount,
          0,
        ),
        days: isSplit ? groupTransactionDays(column.items) : [],
      })),
    [splitTransactions, isSplit],
  );
  const tableColumns = useMemo(
    () =>
      columns.filter((column: any) => column.dataIndex !== 'transactionDate'),
    [columns],
  );
  const sourceLabel = (item: any) =>
    item.source === 'google-sheet-summary'
      ? 'Calculated in Google Sheets'
      : item.source === 'pending'
        ? 'Saving to Google Sheets…'
        : item.source === 'queued'
          ? 'Waiting for a connection…'
          : !['manual', 'google-sheet'].includes(item.source)
            ? 'Imported from workbook'
            : '';
  const dayHeading = (day: any) => (
    <header className="transaction-day-heading">
      <h3>
        <time dateTime={day.date}>{dayjs(day.date).format('ddd, MMM D')}</time>
      </h3>
      <span className="transaction-day-totals">
        {day.items.some((item: any) => item.type === 'expense') && (
          <span>Spent {formatMoney(day.expense)}</span>
        )}
        {day.items.some((item: any) => item.type === 'income') && (
          <span className="amount-income">
            Income {formatMoney(day.income)}
          </span>
        )}
      </span>
    </header>
  );
  const mobileRows = (day: any) =>
    day.items.map((item: any) => (
      <button
        className={'mobile-transaction ' + transactionDayClassName(item)}
        key={item.id}
        disabled={
          historicalReadOnly ||
          ['pending', 'queued', 'google-sheet-summary'].includes(item.source)
        }
        onClick={() => openEditTransaction(item)}
      >
        <span className={'activity-icon ' + item.type}>
          {item.description.slice(0, 1).toUpperCase()}
        </span>
        <span>
          <Text strong>{item.description}</Text>
          <Text type="secondary">
            {item.category}
            {item.source === 'pending'
              ? ' · Saving…'
              : item.source === 'queued'
                ? ' · Queued'
                : ''}
          </Text>
        </span>
        <Text strong className={item.type === 'income' ? 'amount-income' : ''}>
          {item.type === 'income' ? '+' : '−'}
          {formatMoney(item.amount)}
        </Text>
      </button>
    ));
  const splitRows = (day: any) => (
    <ul className="transaction-ledger-list">
      {day.items.map((item: any) => (
        <li className="transaction-ledger-row" key={item.id}>
          <div className="transaction-ledger-copy">
            <Text strong>{item.description}</Text>
            <Text type="secondary">{item.category}</Text>
            {sourceLabel(item) && (
              <Text className="transaction-ledger-source" type="secondary">
                {sourceLabel(item)}
              </Text>
            )}
          </div>
          <div className="transaction-ledger-value">
            <Text
              strong
              className={item.type === 'income' ? 'amount-income' : ''}
            >
              {item.type === 'income' ? '+' : '−'}
              {formatMoney(item.amount)}
            </Text>
            {!['pending', 'queued', 'google-sheet-summary'].includes(
              item.source,
            ) && (
              <span className="transaction-ledger-actions">
                <Button
                  type="text"
                  size="small"
                  icon={<EditOutlined />}
                  disabled={historicalReadOnly}
                  aria-label={'Edit ' + item.description}
                  onClick={() => openEditTransaction(item)}
                />
                <Button
                  type="text"
                  size="small"
                  danger
                  icon={<DeleteOutlined />}
                  disabled={historicalReadOnly}
                  aria-label={'Delete ' + item.description}
                  onClick={() => stageDeleteTransaction(item)}
                />
              </span>
            )}
          </div>
        </li>
      ))}
    </ul>
  );
  const renderDays = (days: any[], split = false) =>
    days.map((day, index) => (
      <TransactionDay
        key={day.date}
        date={day.date}
        open={expandedDays[day.date] ?? index === 0}
        onChange={(open) => setDayOpen(day.date, open)}
        heading={dayHeading(day)}
      >
        {split ? (
          splitRows(day)
        ) : layout === 'mobile' ? (
          mobileRows(day)
        ) : (
          <Table
            rowKey="id"
            rowClassName={transactionDayClassName}
            columns={tableColumns}
            dataSource={day.items}
            pagination={false}
            locale={{ emptyText: 'No matching transactions' }}
            scroll={{ x: 720 }}
          />
        )}
      </TransactionDay>
    ));

  return (
    <>
      <section className="page-heading transactions-heading">
        <div>
          <Text className="eyebrow">LEDGER</Text>
          <Title level={1}>Transactions</Title>
          <Text type="secondary">
            Search, review, and adjust weekly spending and income.
          </Text>
        </div>
        <div className="transaction-heading-actions">
          <Button
            className="export-month-button"
            icon={<DownloadOutlined />}
            onClick={exportSelectedMonth}
          >
            Export month
          </Button>
          <Button
            icon={<ArrowDownOutlined />}
            disabled={historicalReadOnly}
            onClick={() => openNewTransaction('income')}
          >
            Add income
          </Button>
          <Button
            type="primary"
            className="orange-action-button"
            icon={<PlusOutlined />}
            disabled={historicalReadOnly}
            onClick={() => openNewTransaction('expense')}
          >
            Add expense
          </Button>
        </div>
      </section>
      <Card className="transactions-card">
        <div className="transaction-total-strip">
          <div>
            <span>Weekly expenses this month</span>
            <strong>{formatMoney(weeklyExpenseTotal)}</strong>
          </div>
          <span>{monthLabel(selectedPeriod)}</span>
        </div>
        <div className="transaction-toolbar">
          <Segmented
            aria-label="Transaction type filter"
            value={filterType}
            onChange={setFilterType}
            options={[
              { label: 'All', value: 'all' },
              { label: 'Expenses', value: 'expense' },
              { label: 'Income', value: 'income' },
            ]}
          />
          <Input
            aria-label="Search transactions"
            allowClear
            prefix={<SearchOutlined />}
            placeholder="Search description or category"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
          />
          <Button
            aria-expanded={filtersOpen}
            onClick={() => setFiltersOpen((open) => !open)}
          >
            {filtering ? 'Filters active' : 'Filters'}
          </Button>
        </div>
        {filtersOpen && (
          <div className="transaction-filters">
            <DatePicker.RangePicker
              aria-label="Transaction date range"
              allowClear
              value={
                transactionFilters.from && transactionFilters.to
                  ? [
                      dayjs(transactionFilters.from),
                      dayjs(transactionFilters.to),
                    ]
                  : null
              }
              onChange={(dates) =>
                setTransactionFilters((current: any) => ({
                  ...current,
                  from: dates?.[0]?.format('YYYY-MM-DD') || '',
                  to: dates?.[1]?.format('YYYY-MM-DD') || '',
                }))
              }
            />
            <InputNumber
              aria-label="Minimum transaction amount"
              placeholder="Min ¥"
              min={0}
              precision={0}
              value={transactionFilters.min}
              onChange={(min) =>
                setTransactionFilters((current: any) => ({ ...current, min }))
              }
            />
            <InputNumber
              aria-label="Maximum transaction amount"
              placeholder="Max ¥"
              min={0}
              precision={0}
              value={transactionFilters.max}
              onChange={(max) =>
                setTransactionFilters((current: any) => ({ ...current, max }))
              }
            />
            <Select
              aria-label="Category filter"
              placeholder="All categories"
              allowClear
              showSearch
              value={transactionFilters.category || undefined}
              options={filterCategories.map((category: string) => ({
                label: category,
                value: category,
              }))}
              onChange={(category) =>
                setTransactionFilters((current: any) => ({
                  ...current,
                  category: category || '',
                }))
              }
            />
            {filtering && (
              <Button
                onClick={() => {
                  setSearch('');
                  setTransactionFilters(EMPTY_TRANSACTION_FILTERS);
                }}
              >
                Clear filters
              </Button>
            )}
          </div>
        )}
        <div className="transaction-day-controls">
          <Dropdown
            classNames={{ root: 'secondary-actions-menu' }}
            trigger={['click']}
            open={actionsOpen}
            onOpenChange={(open, info) => {
              if (info.source === 'trigger') {
                setActionsOpen(open);
                if (open) setActionsPanel('main');
              }
            }}
            menu={{
              onClick: ({ key }) => {
                if (key !== 'repeat' && key !== 'back') setActionsOpen(false);
              },
              items:
                actionsPanel === 'repeat'
                  ? [
                      {
                        key: 'back',
                        label: 'Back to actions',
                        onClick: () => setActionsPanel('main'),
                      },
                      { type: 'divider' },
                      ...recentPurchases.map((item: any) => ({
                        key: item.id,
                        label:
                          item.description + ' · ' + formatMoney(item.amount),
                        onClick: () => repeatRecentPurchase(item),
                      })),
                    ]
                  : [
                      {
                        key: 'expand',
                        label: 'Expand all days',
                        disabled: !allDates.length,
                        onClick: () => expandAll(true),
                      },
                      {
                        key: 'collapse',
                        label: 'Collapse all days',
                        disabled: !allDates.length,
                        onClick: () => expandAll(false),
                      },
                      { type: 'divider' },
                      {
                        key: 'repeat',
                        label: 'Repeat recent purchase',
                        disabled: historicalReadOnly || !recentPurchases.length,
                        onClick: () => setActionsPanel('repeat'),
                      },
                      ...(syncMode === 'google-sheets'
                        ? [
                            {
                              key: 'compare',
                              label: comparingSheet
                                ? 'Comparing with Sheet…'
                                : 'Compare with Sheet',
                              disabled: comparingSheet,
                              onClick: () => void compareWithSheet(),
                            },
                          ]
                        : []),
                    ],
            }}
          >
            <Button loading={comparingSheet}>More actions</Button>
          </Dropdown>
        </div>
        {syncMode === 'google-sheets' && (
          <p className="transaction-shared-source">
            Connected to Google Sheets · day and list subtotals reflect filters;
            the monthly total above does not
          </p>
        )}
        {isSplit ? (
          <div className="desktop-all-ledger">
            {splitColumns.map((column) => (
              <section
                className={'transaction-ledger-column ' + column.key}
                key={column.key}
                aria-label={column.label + ' this month'}
              >
                <header className="transaction-ledger-heading">
                  <div className="transaction-ledger-title">
                    <span className="transaction-ledger-icon">
                      {column.icon}
                    </span>
                    <span>
                      <Text strong>{column.label}</Text>
                      <Text type="secondary">
                        {column.items.length}{' '}
                        {column.items.length === 1
                          ? 'transaction'
                          : 'transactions'}
                      </Text>
                    </span>
                  </div>
                  <Text
                    strong
                    className={column.key === 'income' ? 'amount-income' : ''}
                  >
                    {column.sign}
                    {formatMoney(column.total)}
                  </Text>
                </header>
                {column.items.length ? (
                  <div className="transaction-day-groups">
                    {renderDays(column.days, true)}
                  </div>
                ) : (
                  <Empty
                    className="transaction-ledger-empty"
                    image={Empty.PRESENTED_IMAGE_SIMPLE}
                    description={'No matching ' + column.label.toLowerCase()}
                  />
                )}
              </section>
            ))}
          </div>
        ) : (
          <Collapse
            className="transaction-week-groups"
            activeKey={weekKeys}
            onChange={(keys) =>
              setWeekKeys(Array.isArray(keys) ? keys : [keys])
            }
            destroyOnHidden
            items={transactionWeekGroups.map((group: any) => ({
              key: String(group.week),
              label: (
                <div
                  className="transaction-week-header"
                  data-transaction-week={group.week}
                  ref={group.week === weekJump ? weekHeadingRef : undefined}
                >
                  <div>
                    <Text strong>Week {group.week}</Text>
                    <Text type="secondary">
                      {group.items.length}{' '}
                      {group.items.length === 1
                        ? 'transaction'
                        : 'transactions'}
                    </Text>
                  </div>
                  <div className="transaction-week-total">
                    <Text type="secondary">
                      {filterType === 'income' ? 'Income' : 'Spent'}
                    </Text>
                    <Text
                      strong
                      className={filterType === 'income' ? 'amount-income' : ''}
                    >
                      {filterType === 'income' ? '+' : '−'}
                      {formatMoney(
                        filterType === 'income'
                          ? group.incomeTotal
                          : group.expenseTotal,
                      )}
                    </Text>
                  </div>
                </div>
              ),
              children: (
                <div
                  className={
                    layout === 'mobile'
                      ? 'mobile-transaction-list'
                      : 'desktop-table'
                  }
                >
                  {group.items.length ? (
                    renderDays(weekDays.get(group.week)!)
                  ) : (
                    <Empty
                      image={Empty.PRESENTED_IMAGE_SIMPLE}
                      description="No matching transactions"
                    />
                  )}
                </div>
              ),
            }))}
          />
        )}
      </Card>
    </>
  );
}
