'use client';

import { Form, InputNumber, Modal, Typography } from 'antd';
import type { BudgetPlan } from '@/lib/ledger-types';

const { Text } = Typography;

interface BudgetFormValues {
  plannedAmount: number;
}

interface BudgetModalProps {
  budget: BudgetPlan;
  month: string;
  saving: boolean;
  onClose: () => void;
  onSave: (plannedAmount: number) => Promise<void>;
}

export default function BudgetModal({
  budget,
  month,
  saving,
  onClose,
  onSave,
}: BudgetModalProps) {
  const [form] = Form.useForm<BudgetFormValues>();

  const save = async () => {
    try {
      const values = await form.validateFields();
      await onSave(Math.round(values.plannedAmount));
    } catch {
      // Ant Design displays validation feedback beside the affected field.
    }
  };

  return (
    <Modal
      title={`Edit ${budget.category} budget`}
      open
      onCancel={onClose}
      onOk={() => void save()}
      okText="Save budget"
      confirmLoading={saving}
      destroyOnHidden
    >
      <Text type="secondary">
        {month} · {budget.type}
      </Text>
      <Form
        form={form}
        initialValues={{ plannedAmount: budget.plannedAmount }}
        layout="vertical"
        className="budget-form"
      >
        <Form.Item
          name="plannedAmount"
          label="Planned amount"
          rules={[{ required: true, message: 'Enter a planned amount' }]}
        >
          <InputNumber min={0} precision={0} controls={false} prefix="¥" />
        </Form.Item>
      </Form>
    </Modal>
  );
}
