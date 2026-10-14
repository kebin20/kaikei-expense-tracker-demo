'use client';

import { Form, InputNumber, Modal, Tag } from 'antd';
import { useEffect } from 'react';

import { Text } from './ui-text';

type LedgerType = 'expense' | 'income';

export interface MonthSetupPlan {
  type: LedgerType;
  category: string;
  plannedAmount: number;
  recurring?: boolean;
}

export interface MonthSetupDialogValues {
  plans: MonthSetupPlan[];
}

interface MonthSetupDialogProps {
  open: boolean;
  sourceLabel: string;
  destinationLabel: string;
  destinationExists: boolean;
  plans: MonthSetupPlan[];
  saving: boolean;
  onCancel: () => void;
  onSubmit: (values: MonthSetupDialogValues) => void | Promise<void>;
}

interface MonthSetupFormValues {
  amounts: number[];
}

export default function MonthSetupDialog({
  open,
  sourceLabel,
  destinationLabel,
  destinationExists,
  plans,
  saving,
  onCancel,
  onSubmit,
}: MonthSetupDialogProps) {
  const [form] = Form.useForm<MonthSetupFormValues>();

  useEffect(() => {
    if (!open) return;
    form.resetFields();
    form.setFieldsValue({
      amounts: plans.map((plan) => plan.plannedAmount),
    });
  }, [form, open, plans]);

  const submit = async () => {
    const values = await form.validateFields();
    await onSubmit({
      plans: plans.map((plan, index) => ({
        ...plan,
        plannedAmount: Math.round(values.amounts[index] || 0),
      })),
    });
  };

  const renderPlans = (type: LedgerType) => {
    if (!plans.some((plan) => plan.type === type)) return null;
    return (
      <section className="month-setup-section">
        <div className="month-setup-section-heading">
          <Text strong>{type === 'expense' ? 'Expenses' : 'Income'}</Text>
          <Tag color={type === 'expense' ? 'orange' : 'green'}>{type}</Tag>
        </div>
        <div className="month-setup-plan-list">
          {plans.map((plan, index) =>
            plan.type === type ? (
              <div
                className="month-setup-plan"
                key={`${plan.type}-${plan.category}`}
              >
                <Text title={plan.category}>{plan.category}</Text>
                <Form.Item
                  name={['amounts', index]}
                  rules={[
                    { required: true, message: 'Enter an estimate' },
                    {
                      type: 'number',
                      min: 0,
                      message: 'Use zero or a positive amount',
                    },
                  ]}
                >
                  <InputNumber
                    min={0}
                    precision={0}
                    controls={false}
                    prefix="¥"
                    aria-label={`${plan.category} estimate for ${destinationLabel}`}
                  />
                </Form.Item>
              </div>
            ) : null,
          )}
        </div>
      </section>
    );
  };

  return (
    <Modal
      className="ledger-modal month-setup-modal"
      title={`Set up ${destinationLabel}`}
      open={open}
      centered
      onCancel={onCancel}
      onOk={() => void submit()}
      okText={`${destinationExists ? 'Update' : 'Create'} ${destinationLabel}`}
      confirmLoading={saving}
      destroyOnHidden
      width={660}
    >
      <div className="month-setup-intro">
        <Text>
          Estimates start with the figures from {sourceLabel}. Adjust anything
          that will change next month.
        </Text>
        <Text type="secondary">
          Estimates are copied only in this browser. Transactions are not copied
          or moved, and no Google Sheet is connected.
        </Text>
        {destinationExists && (
          <Text className="month-setup-existing-note">
            {destinationLabel} already exists. Its transactions will be kept;
            only these estimates will be updated.
          </Text>
        )}
      </div>
      <Form form={form} layout="vertical" className="month-setup-form">
        {renderPlans('expense')}
        {renderPlans('income')}
      </Form>
    </Modal>
  );
}
