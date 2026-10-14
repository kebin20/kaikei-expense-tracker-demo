'use client';

import DeleteOutlined from '@ant-design/icons/DeleteOutlined';
import {
  Button,
  Checkbox,
  Form,
  Input,
  InputNumber,
  Modal,
  Popconfirm,
  Select,
} from 'antd';
import { useEffect } from 'react';

import { Text } from './ui-text';
import { weeklyCategoryNumber } from '@/lib/category-identity';

type LedgerType = 'expense' | 'income';
type BudgetEditTarget = 'category' | 'plannedAmount' | 'both';

interface BudgetRecord {
  category: string;
  type: LedgerType;
  plannedAmount: number;
  recurring?: boolean;
}

export interface BudgetDialogValues {
  category?: string;
  emoji?: string[];
  plannedAmount?: number;
  recurring?: boolean;
}

interface BudgetDialogProps {
  open: boolean;
  editing: BudgetRecord | null;
  editTarget: BudgetEditTarget;
  budgetType: LedgerType;
  periodLabel: string;
  saving: boolean;
  restoreValues?: BudgetDialogValues | null;
  deleting: boolean;
  canDelete: boolean;
  emojiOptions: Array<{ value: string; label: string }>;
  initialName: string;
  initialEmoji: string;
  initialRecurring: boolean;
  onCancel: () => void;
  onSubmit: (values: BudgetDialogValues) => void | Promise<void>;
  onDelete: () => void | Promise<void>;
}

export default function BudgetDialog({
  open,
  editing,
  editTarget,
  budgetType,
  periodLabel,
  saving,
  restoreValues,
  deleting,
  canDelete,
  emojiOptions,
  initialName,
  initialEmoji,
  initialRecurring,
  onCancel,
  onSubmit,
  onDelete,
}: BudgetDialogProps) {
  const [form] = Form.useForm<BudgetDialogValues>();

  useEffect(() => {
    if (!open) return;
    form.resetFields();
    form.setFieldsValue({
      category: initialName,
      emoji: initialEmoji ? [initialEmoji] : [],
      plannedAmount: editing?.plannedAmount || 0,
      recurring: editing ? initialRecurring : true,
      ...restoreValues,
    });
  }, [
    editing,
    form,
    initialEmoji,
    initialName,
    initialRecurring,
    open,
    restoreValues,
  ]);

  const submit = async () => {
    const fields = !editing
      ? undefined
      : editTarget === 'category'
        ? ['category', 'emoji']
        : editTarget === 'plannedAmount'
          ? ['plannedAmount']
          : undefined;
    await onSubmit(await form.validateFields(fields));
  };

  return (
    <Modal
      className="ledger-modal budget-modal"
      title={
        !editing
          ? `Add ${budgetType} category`
          : editTarget === 'category'
            ? `Rename ${initialName}`
            : editTarget === 'plannedAmount'
              ? `Edit ${initialName} estimated amount`
              : `Edit ${initialName} estimate`
      }
      open={open}
      centered
      onCancel={onCancel}
      onOk={() => void submit()}
      okText={
        !editing
          ? 'Add category'
          : editTarget === 'category'
            ? 'Save category'
            : editTarget === 'plannedAmount'
              ? 'Save amount'
              : 'Save estimate'
      }
      confirmLoading={saving}
      cancelButtonProps={{ disabled: deleting }}
      okButtonProps={{ disabled: deleting }}
      destroyOnHidden
    >
      <Text type="secondary">
        {periodLabel} · {editing?.type || budgetType}
      </Text>
      <Form form={form} layout="vertical" className="budget-form">
        {editTarget !== 'plannedAmount' && (
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
                      : Promise.reject(new Error('Choose or paste an emoji.')),
                },
              ]}
            >
              <Select
                mode="tags"
                maxCount={1}
                showSearch={{ optionFilterProp: 'label' }}
                allowClear
                options={emojiOptions}
                placeholder="Choose or paste an emoji"
              />
            </Form.Item>
            <Form.Item
              name="category"
              label="Category name"
              extra={
                editing && weeklyCategoryNumber(editing.category)
                  ? 'A custom name keeps its Week number so spending stays grouped correctly.'
                  : undefined
              }
              rules={[
                { required: true, message: 'Enter a category name' },
                { max: 68, message: 'Use 68 characters or fewer' },
              ]}
            >
              <Input placeholder="Category name" maxLength={68} />
            </Form.Item>
          </>
        )}
        {editTarget !== 'category' && (
          <Form.Item
            name="plannedAmount"
            label="Estimated amount"
            rules={[{ required: true, message: 'Enter an estimated amount' }]}
          >
            <InputNumber min={0} precision={0} controls={false} prefix="¥" />
          </Form.Item>
        )}
        {editTarget !== 'plannedAmount' &&
          !weeklyCategoryNumber(initialName) && (
            <Form.Item name="recurring" valuePropName="checked">
              <Checkbox>Repeat this estimate next month</Checkbox>
            </Form.Item>
          )}
      </Form>
      {editing && canDelete && (
        <div className="budget-delete-zone">
          <div>
            <Text strong>Delete category</Text>
            <Text type="secondary">Existing transactions will be kept.</Text>
          </div>
          <Popconfirm
            title={`Delete ${initialName}?`}
            description="The estimate will be removed. Existing transactions will be kept."
            okText="Delete category"
            okButtonProps={{ danger: true }}
            onConfirm={() => void onDelete()}
          >
            <Button danger icon={<DeleteOutlined />} loading={deleting}>
              Delete
            </Button>
          </Popconfirm>
        </div>
      )}
    </Modal>
  );
}
