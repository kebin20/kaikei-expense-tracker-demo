'use client';

/* oxlint-disable jsx-a11y/no-noninteractive-tabindex */
// The scrollable expense region must be focusable for keyboard scrolling.

import ArrowDownOutlined from '@ant-design/icons/ArrowDownOutlined';
import ArrowUpOutlined from '@ant-design/icons/ArrowUpOutlined';
import DeleteOutlined from '@ant-design/icons/DeleteOutlined';
import PlusOutlined from '@ant-design/icons/PlusOutlined';
import {
  Alert,
  Button,
  DatePicker,
  Form,
  Input,
  InputNumber,
  Modal,
  Popconfirm,
  Segmented,
  Select,
} from 'antd';
import dayjs, { type Dayjs } from 'dayjs';
import {
  useEffect,
  useMemo,
  useRef,
  type ClipboardEvent as ReactClipboardEvent,
  type KeyboardEvent as ReactKeyboardEvent,
} from 'react';

import { Text } from './ui-text';

export type TransactionDialogType = 'expense' | 'income';
export type TransactionEntryMode = 'single' | 'multiple';

export interface TransactionDialogValues {
  type: TransactionDialogType;
  amount: number;
  transactionDate: Dayjs;
  description: string;
  category: string;
}

export interface BatchExpenseDialogValues {
  expenses: Array<Omit<TransactionDialogValues, 'type'>>;
}

export interface TransactionDialogDefaults {
  type: TransactionDialogType;
  amount?: number;
  transactionDate: string;
  description?: string;
  category?: string;
}

interface TransactionDialogRecord {
  type: TransactionDialogType;
  amount: number;
  transactionDate: string;
  description: string;
  category: string;
}

interface TransactionHistoryItem {
  description: string;
  category: string;
  type: TransactionDialogType;
  source: string;
}

interface TransactionDialogProps {
  open: boolean;
  editing: TransactionDialogRecord | null;
  defaults: TransactionDialogDefaults;
  entryMode: TransactionEntryMode;
  saving: boolean;
  awaitingConfirmation?: boolean;
  confirmationMessage?: string;
  onCheckSaveStatus?: () => void | Promise<void>;
  onRetrySave?: () => void | Promise<void>;
  categories: Record<
    TransactionDialogType,
    Array<{ label: string; value: string }>
  >;
  history: TransactionHistoryItem[];
  onEntryModeChange: (mode: TransactionEntryMode) => void;
  onCancel: () => void;
  onSubmitSingle: (values: TransactionDialogValues) => void | Promise<void>;
  onSubmitMultiple: (values: BatchExpenseDialogValues) => void | Promise<void>;
  onDelete?: () => void;
}

function merchantKey(value: string) {
  return value
    .trim()
    .toLocaleLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim();
}

const amountNavigationKeys = new Set([
  'Backspace',
  'Delete',
  'Tab',
  'Enter',
  'Escape',
  'ArrowLeft',
  'ArrowRight',
  'ArrowUp',
  'ArrowDown',
  'Home',
  'End',
]);

function keepAmountNumeric(event: ReactKeyboardEvent<HTMLInputElement>) {
  if (
    event.ctrlKey ||
    event.metaKey ||
    event.altKey ||
    amountNavigationKeys.has(event.key) ||
    /^\d$/.test(event.key)
  )
    return;
  event.preventDefault();
}

function keepAmountPasteNumeric(event: ReactClipboardEvent<HTMLInputElement>) {
  if (/^\d+$/.test(event.clipboardData.getData('text').trim())) return;
  event.preventDefault();
}

function parseNumericAmount(value: string | undefined) {
  const digits = (value || '').replace(/\D/g, '');
  return digits ? Number(digits) : 0;
}

export default function TransactionDialog({
  open,
  editing,
  defaults,
  entryMode,
  saving,
  awaitingConfirmation = false,
  confirmationMessage = '',
  onCheckSaveStatus,
  onRetrySave,
  categories,
  history,
  onEntryModeChange,
  onCancel,
  onSubmitSingle,
  onSubmitMultiple,
  onDelete,
}: TransactionDialogProps) {
  const [transactionForm] = Form.useForm<TransactionDialogValues>();
  const [batchExpenseForm] = Form.useForm<BatchExpenseDialogValues>();
  const batchExpenseRows = Form.useWatch('expenses', batchExpenseForm) || [];
  const batchListRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open || editing || entryMode !== 'multiple') return;
    const list = batchListRef.current;
    if (list) list.scrollTo({ top: list.scrollHeight });
  }, [batchExpenseRows.length, open, editing, entryMode]);
  const description = Form.useWatch('description', transactionForm) || '';
  const transactionType =
    Form.useWatch('type', transactionForm) || defaults.type;

  const merchantCategories = useMemo(() => {
    const counts = new Map<string, Map<string, number>>();
    for (const item of history) {
      if (item.source === 'google-sheet-summary') continue;
      const merchant = merchantKey(item.description);
      if (!merchant) continue;
      const key = `${item.type}:${merchant}`;
      const categoryCounts = counts.get(key) || new Map<string, number>();
      categoryCounts.set(
        item.category,
        (categoryCounts.get(item.category) || 0) + 1,
      );
      counts.set(key, categoryCounts);
    }
    return new Map(
      [...counts].map(([key, categoryCounts]) => [
        key,
        [...categoryCounts].sort((a, b) => b[1] - a[1])[0]?.[0],
      ]),
    );
  }, [history]);

  const suggestedCategory = merchantCategories.get(
    `${transactionType}:${merchantKey(description)}`,
  );
  const categoryOptions = categories[transactionType];
  const allowedCategories = new Set(categoryOptions.map((item) => item.value));
  const allowedSuggestion =
    suggestedCategory && allowedCategories.has(suggestedCategory)
      ? suggestedCategory
      : undefined;
  useEffect(() => {
    if (!open) return;
    transactionForm.resetFields();
    batchExpenseForm.resetFields();
    if (editing) {
      transactionForm.setFieldsValue({
        type: editing.type,
        amount: editing.amount,
        transactionDate: dayjs(editing.transactionDate),
        description: editing.description,
        category: editing.category,
      });
      return;
    }
    transactionForm.setFieldsValue({
      type: defaults.type,
      amount: defaults.amount,
      transactionDate: dayjs(defaults.transactionDate),
      description: defaults.description,
      category: defaults.category,
    });
  }, [batchExpenseForm, defaults, editing, open, transactionForm]);

  useEffect(() => {
    if (!allowedSuggestion || editing || entryMode !== 'single') return;
    const current = transactionForm.getFieldValue('category');
    if (!current) transactionForm.setFieldValue('category', allowedSuggestion);
  }, [allowedSuggestion, editing, entryMode, transactionForm]);

  const openMultipleEntry = () => {
    onEntryModeChange('multiple');
    if (!batchExpenseForm.getFieldValue('expenses')?.length) {
      const singleDraft = transactionForm.getFieldsValue(true);
      const expenseDraft = singleDraft.type === 'expense' ? singleDraft : {};
      batchExpenseForm.setFieldsValue({
        expenses: [
          {
            amount: expenseDraft.amount,
            transactionDate:
              expenseDraft.transactionDate || dayjs(defaults.transactionDate),
            description: expenseDraft.description,
            category: expenseDraft.category,
          },
        ],
      });
    }
  };

  const submit = async () => {
    if (saving) return;
    if (confirmationMessage && onCheckSaveStatus) {
      await onCheckSaveStatus();
      return;
    }
    if (!editing && entryMode === 'multiple') {
      await onSubmitMultiple(await batchExpenseForm.validateFields());
      return;
    }
    await onSubmitSingle(await transactionForm.validateFields());
  };

  return (
    <Modal
      className={`transaction-modal${
        !editing && entryMode === 'multiple' ? ' batch-transaction-modal' : ''
      }`}
      title={
        editing
          ? 'Edit transaction'
          : entryMode === 'multiple'
            ? 'Add multiple expenses'
            : 'Add transaction'
      }
      open={open}
      centered
      onCancel={onCancel}
      onOk={() => void submit()}
      okText={
        confirmationMessage
          ? 'Check save status'
          : editing
            ? 'Save changes'
            : entryMode === 'multiple'
              ? `Add ${batchExpenseRows.length || 1} expense${
                  batchExpenseRows.length === 1 ? '' : 's'
                }`
              : 'Add transaction'
      }
      confirmLoading={saving}
      cancelText={awaitingConfirmation ? 'Close' : 'Cancel'}
      cancelButtonProps={{ disabled: saving }}
      closable={!saving}
      keyboard={!saving}
      mask={{ closable: !saving }}
      okButtonProps={{ disabled: saving }}
      destroyOnHidden
      width={!editing && entryMode === 'multiple' ? 680 : 520}
    >
      {editing && onDelete && (
        <div className="transaction-delete-action">
          <Popconfirm
            title="Delete this transaction?"
            description="You will have 8 seconds to undo."
            okText="Delete"
            okButtonProps={{ danger: true }}
            onConfirm={onDelete}
          >
            <Button
              danger
              icon={<DeleteOutlined />}
              disabled={saving || awaitingConfirmation}
            >
              Delete transaction
            </Button>
          </Popconfirm>
        </div>
      )}
      {confirmationMessage && (
        <Alert
          type="warning"
          showIcon
          title="Save confirmation"
          description={confirmationMessage}
          action={
            onRetrySave ? (
              <Button disabled={saving} onClick={() => void onRetrySave()}>
                Retry same save
              </Button>
            ) : undefined
          }
        />
      )}
      {!editing && (
        <Segmented
          block
          className="transaction-entry-mode"
          aria-label="Transaction entry mode"
          value={entryMode}
          onChange={(value) => {
            if (value === 'multiple') openMultipleEntry();
            else onEntryModeChange('single');
          }}
          options={[
            { label: 'Single transaction', value: 'single' },
            { label: 'Multiple expenses', value: 'multiple' },
          ]}
        />
      )}

      {(editing || entryMode === 'single') && (
        <Form
          form={transactionForm}
          layout="vertical"
          className="transaction-form"
          disabled={awaitingConfirmation || saving}
        >
          <Form.Item name="type" label="Type" rules={[{ required: true }]}>
            <Segmented
              block
              aria-label="Transaction type"
              onChange={() =>
                transactionForm.setFieldValue('category', undefined)
              }
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
                inputMode="numeric"
                pattern="[0-9]*"
                parser={parseNumericAmount}
                onKeyDown={keepAmountNumeric}
                onPaste={keepAmountPasteNumeric}
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
            rules={[{ required: true, message: 'Choose a category' }]}
            extra={
              allowedSuggestion
                ? `Suggested from past entries: ${allowedSuggestion}`
                : transactionType === 'expense'
                  ? 'Choose one weekly spending category.'
                  : 'Choose one income category.'
            }
          >
            <Select
              options={categoryOptions}
              placeholder={
                transactionType === 'expense'
                  ? 'Choose Week 1–4'
                  : 'Choose an income category'
              }
            />
          </Form.Item>
        </Form>
      )}

      {!editing && entryMode === 'multiple' && (
        <Form
          form={batchExpenseForm}
          layout="vertical"
          className="batch-expense-form"
          onValuesChange={() => {
            const expenses = (batchExpenseForm.getFieldValue('expenses') ||
              []) as BatchExpenseDialogValues['expenses'];
            expenses.forEach((expense, index) => {
              if (!expense?.description || expense.category) return;
              const suggestion = merchantCategories.get(
                `expense:${merchantKey(expense.description)}`,
              );
              if (
                suggestion &&
                categories.expense.some((item) => item.value === suggestion)
              )
                batchExpenseForm.setFieldValue(
                  ['expenses', index, 'category'],
                  suggestion,
                );
            });
          }}
        >
          <Form.List name="expenses">
            {(fields, { add, remove }) => (
              <>
                <section
                  className="batch-expense-list"
                  ref={batchListRef}
                  aria-label="Expense entries"
                  tabIndex={0}
                >
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
                            inputMode="numeric"
                            pattern="[0-9]*"
                            parser={parseNumericAmount}
                            onKeyDown={keepAmountNumeric}
                            onPaste={keepAmountPasteNumeric}
                          />
                        </Form.Item>
                        <Form.Item
                          name={[field.name, 'transactionDate']}
                          label="Date"
                          rules={[{ required: true, message: 'Choose a date' }]}
                        >
                          <DatePicker format="MMM D, YYYY" />
                        </Form.Item>
                      </div>
                      <Form.Item
                        name={[field.name, 'description']}
                        label="Description"
                        rules={[
                          { required: true, message: 'Add a description' },
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
                            message: 'Choose a week',
                          },
                        ]}
                      >
                        <Select
                          options={categories.expense}
                          placeholder="Choose Week 1–4"
                        />
                      </Form.Item>
                    </section>
                  ))}
                </section>
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
                        dayjs(defaults.transactionDate),
                      category: undefined,
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
  );
}
