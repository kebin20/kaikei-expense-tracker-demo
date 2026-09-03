'use client';

import ArrowDownOutlined from '@ant-design/icons/ArrowDownOutlined';
import DeleteOutlined from '@ant-design/icons/DeleteOutlined';
import EditOutlined from '@ant-design/icons/EditOutlined';
import PlusOutlined from '@ant-design/icons/PlusOutlined';
import SearchOutlined from '@ant-design/icons/SearchOutlined';
import {
  Button,
  Card,
  Empty,
  Input,
  Popconfirm,
  Segmented,
  Space,
  Table,
  Tag,
  Tooltip,
  Typography,
} from 'antd';
import type { TableColumnsType } from 'antd';
import dayjs from 'dayjs';
import type { LedgerTransaction, LedgerType } from '@/lib/ledger-types';

const { Text, Title } = Typography;
const currency = new Intl.NumberFormat('ja-JP', {
  style: 'currency',
  currency: 'JPY',
  maximumFractionDigits: 0,
});

function formatMoney(value: number) {
  return currency.format(Math.round(value));
}

interface TransactionsViewProps {
  transactions: LedgerTransaction[];
  filterType: 'all' | LedgerType;
  search: string;
  onFilterChange: (value: 'all' | LedgerType) => void;
  onSearchChange: (value: string) => void;
  onAdd: (type: LedgerType) => void;
  onEdit: (item: LedgerTransaction) => void;
  onDelete: (id: string) => Promise<void>;
}

export default function TransactionsView({
  transactions,
  filterType,
  search,
  onFilterChange,
  onSearchChange,
  onAdd,
  onEdit,
  onDelete,
}: TransactionsViewProps) {
  const columns: TableColumnsType<LedgerTransaction> = [
    {
      title: 'Date',
      dataIndex: 'transactionDate',
      width: 112,
      render: (value: string) => dayjs(value).format('MMM D'),
    },
    {
      title: 'Description',
      dataIndex: 'description',
      render: (value: string, item) => (
        <div className="table-description">
          <Text strong>{value}</Text>
          {item.source !== 'manual' && (
            <Text type="secondary">Sample transaction</Text>
          )}
        </div>
      ),
    },
    {
      title: 'Category',
      dataIndex: 'category',
      responsive: ['md'],
      render: (value: string) => <Tag>{value}</Tag>,
    },
    {
      title: 'Type',
      dataIndex: 'type',
      width: 108,
      responsive: ['lg'],
      render: (value: LedgerType) => (
        <Tag color={value === 'income' ? 'green' : 'orange'}>{value}</Tag>
      ),
    },
    {
      title: 'Amount',
      dataIndex: 'amount',
      align: 'right',
      width: 140,
      render: (value: number, item) => (
        <Text strong className={item.type === 'income' ? 'amount-income' : ''}>
          {item.type === 'income' ? '+' : '−'}
          {formatMoney(value)}
        </Text>
      ),
    },
    {
      title: '',
      key: 'actions',
      align: 'right',
      width: 84,
      render: (_value, item) => (
        <Space size={2}>
          <Tooltip title="Edit">
            <Button
              type="text"
              icon={<EditOutlined />}
              onClick={() => onEdit(item)}
            />
          </Tooltip>
          <Popconfirm
            title="Delete this transaction?"
            description="This cannot be undone."
            okText="Delete"
            okButtonProps={{ danger: true }}
            onConfirm={() => onDelete(item.id)}
          >
            <Tooltip title="Delete">
              <Button type="text" danger icon={<DeleteOutlined />} />
            </Tooltip>
          </Popconfirm>
        </Space>
      ),
    },
  ];

  return (
    <>
      <section className="page-heading transactions-heading">
        <div>
          <Text className="eyebrow">LEDGER</Text>
          <Title level={1}>Transactions</Title>
          <Text type="secondary">Search, review, and adjust every entry.</Text>
        </div>
        <Space>
          <Button icon={<ArrowDownOutlined />} onClick={() => onAdd('income')}>
            Add income
          </Button>
          <Button
            type="primary"
            icon={<PlusOutlined />}
            onClick={() => onAdd('expense')}
          >
            Add expense
          </Button>
        </Space>
      </section>
      <Card className="transactions-card">
        <div className="transaction-toolbar">
          <Segmented
            value={filterType}
            onChange={(value) => onFilterChange(value as 'all' | LedgerType)}
            options={[
              { label: 'All', value: 'all' },
              { label: 'Expenses', value: 'expense' },
              { label: 'Income', value: 'income' },
            ]}
          />
          <Input
            allowClear
            prefix={<SearchOutlined />}
            placeholder="Search description or category"
            value={search}
            onChange={(event) => onSearchChange(event.target.value)}
          />
        </div>
        <div className="desktop-table">
          <Table
            rowKey="id"
            columns={columns}
            dataSource={transactions}
            pagination={{ pageSize: 20, showSizeChanger: false }}
            scroll={{ x: 720 }}
          />
        </div>
        <div className="mobile-transaction-list">
          {transactions.map((item) => (
            <button
              className="mobile-transaction"
              key={item.id}
              onClick={() => onEdit(item)}
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
                className={item.type === 'income' ? 'amount-income' : ''}
              >
                {item.type === 'income' ? '+' : '−'}
                {formatMoney(item.amount)}
              </Text>
            </button>
          ))}
          {!transactions.length && (
            <Empty
              image={Empty.PRESENTED_IMAGE_SIMPLE}
              description="No matching transactions"
            />
          )}
        </div>
      </Card>
    </>
  );
}
