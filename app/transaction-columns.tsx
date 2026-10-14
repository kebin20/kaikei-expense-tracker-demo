'use client';
import { Button, Tag, Tooltip, type TableColumnsType } from 'antd';
import dayjs from 'dayjs';
import type { LedgerTransaction } from './kaikei-app';
import { Text } from './ui-text';
import {
  ClockCircleOutlined,
  SyncOutlined,
  EditOutlined,
  DeleteOutlined,
} from './ui-icons';

export function transactionColumns({
  formatMoney,
  historicalReadOnly,
  openEditTransaction,
  stageDeleteTransaction,
}: {
  formatMoney: (amount: number) => string;
  historicalReadOnly: boolean;
  openEditTransaction: (item: LedgerTransaction) => void;
  stageDeleteTransaction: (item: LedgerTransaction) => void;
}): TableColumnsType<LedgerTransaction> {
  return [
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
          {item.source === 'google-sheet-summary' && (
            <Text type="secondary">Calculated in Google Sheets</Text>
          )}
          {item.source === 'pending' && (
            <Text type="secondary">Saving to Google Sheets…</Text>
          )}
          {item.source === 'queued' && (
            <Text type="secondary">Waiting for a connection…</Text>
          )}
          {item.source !== 'manual' &&
            item.source !== 'pending' &&
            item.source !== 'queued' &&
            !item.source.startsWith('google-sheet') && (
              <Text type="secondary">Imported from workbook</Text>
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
      render: (value: LedgerTransaction['type']) => (
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
      render: (_value, item) =>
        item.source === 'pending' || item.source === 'queued' ? (
          <Tooltip
            title={
              item.source === 'queued'
                ? 'Waiting for a connection'
                : 'Saving to Google Sheets'
            }
          >
            {item.source === 'queued' ? (
              <ClockCircleOutlined className="summary-sync-icon" />
            ) : (
              <SyncOutlined spin className="summary-sync-icon" />
            )}
          </Tooltip>
        ) : item.source === 'google-sheet-summary' ? (
          <Tooltip title="Calculated from the monthly summary in Google Sheets">
            <SyncOutlined className="summary-sync-icon" />
          </Tooltip>
        ) : (
          <div className="compact-button-group">
            <Tooltip title="Edit">
              <Button
                type="text"
                icon={<EditOutlined />}
                disabled={historicalReadOnly}
                aria-label={`Edit ${item.description}`}
                onClick={() => openEditTransaction(item)}
              />
            </Tooltip>
            <Tooltip title="Delete with 8-second undo">
              <Button
                type="text"
                danger
                icon={<DeleteOutlined />}
                disabled={historicalReadOnly}
                aria-label={`Delete ${item.description}`}
                onClick={() => stageDeleteTransaction(item)}
              />
            </Tooltip>
          </div>
        ),
    },
  ];
}
