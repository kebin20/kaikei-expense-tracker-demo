'use client';

import ArrowDownOutlined from '@ant-design/icons/ArrowDownOutlined';
import ArrowUpOutlined from '@ant-design/icons/ArrowUpOutlined';
import {
  DatePicker,
  Form,
  Input,
  InputNumber,
  Modal,
  Segmented,
  Select,
} from 'antd';
import dayjs, { type Dayjs } from 'dayjs';
import type {
  DemoTransactionInput,
  LedgerTransaction,
  LedgerType,
} from '@/lib/ledger-types';

interface TransactionFormValues {
  type: LedgerType;
  amount: number;
  transactionDate: Dayjs;
  description: string;
  category: string[];
}

interface TransactionModalProps {
  categories: Array<{ label: string; value: string }>;
  defaultType: LedgerType;
  editingTransaction: LedgerTransaction | null;
  saving: boolean;
  selectedPeriod: string;
  onClose: () => void;
  onSave: (input: DemoTransactionInput) => Promise<void>;
}

export default function TransactionModal({
  categories,
  defaultType,
  editingTransaction,
  saving,
  selectedPeriod,
  onClose,
  onSave,
}: TransactionModalProps) {
  const [form] = Form.useForm<TransactionFormValues>();
  const initialValues: Partial<TransactionFormValues> = editingTransaction
    ? {
        type: editingTransaction.type,
        amount: editingTransaction.amount,
        transactionDate: dayjs(editingTransaction.transactionDate),
        description: editingTransaction.description,
        category: [editingTransaction.category],
      }
    : {
        type: defaultType,
        transactionDate: dayjs(`${selectedPeriod}-01`),
        description: '',
        category: [],
      };

  const save = async () => {
    try {
      const values = await form.validateFields();
      await onSave({
        type: values.type,
        amount: Math.round(values.amount),
        transactionDate: values.transactionDate.format('YYYY-MM-DD'),
        description: values.description.trim(),
        category: values.category[0]?.trim() || '',
      });
    } catch {
      // Ant Design displays validation feedback beside the affected field.
    }
  };

  return (
    <Modal
      title={editingTransaction ? 'Edit transaction' : 'Add transaction'}
      open
      onCancel={onClose}
      onOk={() => void save()}
      okText={editingTransaction ? 'Save changes' : 'Add transaction'}
      confirmLoading={saving}
      destroyOnHidden
    >
      <Form
        form={form}
        initialValues={initialValues}
        layout="vertical"
        className="transaction-form"
      >
        <Form.Item name="type" label="Type" rules={[{ required: true }]}>
          <Segmented
            block
            options={[
              { label: 'Expense', value: 'expense', icon: <ArrowUpOutlined /> },
              { label: 'Income', value: 'income', icon: <ArrowDownOutlined /> },
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
          rules={[{ required: true, message: 'Choose or enter a category' }]}
          extra="Choose an existing category or type a new one."
        >
          <Select
            mode="tags"
            maxCount={1}
            tokenSeparators={[',']}
            showSearch
            options={categories}
            placeholder="Choose a category"
          />
        </Form.Item>
      </Form>
    </Modal>
  );
}
