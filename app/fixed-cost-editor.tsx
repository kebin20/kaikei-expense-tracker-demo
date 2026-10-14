'use client';

import { useEffect, useId, useRef, useState } from 'react';
import { Button } from 'antd';
import { CheckOutlined, CloseOutlined, EditOutlined } from './ui-icons';

export default function FixedCostEditor({
  name,
  amount,
  fixedCosts,
  disabled,
  saving,
  onSave,
}: {
  name: string;
  amount: number;
  fixedCosts?: number;
  disabled: boolean;
  saving: boolean;
  onSave: (amount: number) => Promise<boolean>;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(String(amount));
  const inputRef = useRef<HTMLInputElement>(null);
  const helpId = useId();
  useEffect(() => {
    if (editing) {
      inputRef.current?.focus();
      inputRef.current?.select();
    }
  }, [editing]);
  if (!editing)
    return (
      <Button
        size="small"
        icon={<EditOutlined />}
        disabled={disabled || saving}
        aria-label={`Edit ${name} actual amount`}
        onClick={() => {
          setDraft(String(amount));
          setEditing(true);
        }}
      >
        Edit
      </Button>
    );
  return (
    <form
      className="fixed-cost-editor"
      onSubmit={async (event) => {
        event.preventDefault();
        const value = Number(draft);
        if (
          !draft.trim() ||
          !Number.isInteger(value) ||
          value < 0 ||
          disabled ||
          saving
        )
          return;
        if (await onSave(value)) setEditing(false);
      }}
    >
      <label className="fixed-cost-input">
        <span aria-hidden="true">¥</span>
        <input
          ref={inputRef}
          aria-label={`${name} ${fixedCosts === undefined ? 'actual amount' : 'full bill'}`}
          aria-describedby={fixedCosts === undefined ? undefined : helpId}
          type="text"
          inputMode="numeric"
          pattern="[0-9]+"
          required
          value={draft}
          disabled={disabled || saving}
          onChange={(event) => setDraft(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === 'Escape' && !saving) setEditing(false);
          }}
        />
      </label>
      <Button
        htmlType="submit"
        size="small"
        icon={<CheckOutlined />}
        loading={saving}
        disabled={disabled}
        aria-label={`Save ${name} actual amount`}
      />
      <Button
        htmlType="button"
        size="small"
        icon={<CloseOutlined />}
        disabled={saving}
        aria-label={`Cancel editing ${name}`}
        onClick={() => setEditing(false)}
      />
      {fixedCosts !== undefined && (
        <small id={helpId} className="credit-card-edit-help">
          Enter the full bill. Actual deducts ¥
          {fixedCosts.toLocaleString('ja-JP')} in fixed costs, excluding Rent.
        </small>
      )}
    </form>
  );
}
