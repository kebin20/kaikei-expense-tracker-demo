'use client';

/* oxlint-disable typescript/no-explicit-any */

import CalendarOutlined from '@ant-design/icons/CalendarOutlined';
import AppstoreOutlined from '@ant-design/icons/AppstoreOutlined';
import BankOutlined from '@ant-design/icons/BankOutlined';
import BookOutlined from '@ant-design/icons/BookOutlined';
import CheckOutlined from '@ant-design/icons/CheckOutlined';
import CloseOutlined from '@ant-design/icons/CloseOutlined';
import CreditCardOutlined from '@ant-design/icons/CreditCardOutlined';
import EditOutlined from '@ant-design/icons/EditOutlined';
import FileTextOutlined from '@ant-design/icons/FileTextOutlined';
import FireOutlined from '@ant-design/icons/FireOutlined';
import GlobalOutlined from '@ant-design/icons/GlobalOutlined';
import HolderOutlined from '@ant-design/icons/HolderOutlined';
import HomeOutlined from '@ant-design/icons/HomeOutlined';
import InfoCircleOutlined from '@ant-design/icons/InfoCircleOutlined';
import MedicineBoxOutlined from '@ant-design/icons/MedicineBoxOutlined';
import MobileOutlined from '@ant-design/icons/MobileOutlined';
import PlaySquareOutlined from '@ant-design/icons/PlaySquareOutlined';
import PlusOutlined from '@ant-design/icons/PlusOutlined';
import ThunderboltOutlined from '@ant-design/icons/ThunderboltOutlined';
import WalletOutlined from '@ant-design/icons/WalletOutlined';
import {
  Button,
  Card,
  Checkbox,
  Dropdown,
  InputNumber,
  Segmented,
  Tag,
  Tooltip,
} from 'antd';
import { useEffect, useState } from 'react';
import { Text, Title } from './ui-text';

function WaterDropArtwork() {
  return (
    <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path
        d="M12 3.25c-2.9 4.03-5.25 6.63-5.25 9.72a5.25 5.25 0 0 0 10.5 0C17.25 9.88 14.9 7.28 12 3.25Z"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function categoryArtwork(name: string, type: 'expense' | 'income') {
  const normalized = name.toLowerCase();
  const week = /^week\s*([1-4])(?: · .+)?$/.exec(normalized);
  if (week)
    return {
      icon: <CalendarOutlined />,
      week: Number(week[1]),
      tone: 'week',
    };
  if (/rent|home|housing/.test(normalized))
    return { icon: <HomeOutlined />, week: null, tone: 'home' };
  if (/internet|wifi|sonet/.test(normalized))
    return { icon: <GlobalOutlined />, week: null, tone: 'connection' };
  if (/phone|mobile/.test(normalized))
    return { icon: <MobileOutlined />, week: null, tone: 'connection' };
  if (/netflix|movie|stream|entertainment/.test(normalized))
    return { icon: <PlaySquareOutlined />, week: null, tone: 'media' };
  if (/electric/.test(normalized))
    return { icon: <ThunderboltOutlined />, week: null, tone: 'utility' };
  if (/\bgas\b/.test(normalized))
    return { icon: <FireOutlined />, week: null, tone: 'utility' };
  if (/water/.test(normalized))
    return { icon: <WaterDropArtwork />, week: null, tone: 'utility' };
  if (/credit|card|payment/.test(normalized))
    return { icon: <CreditCardOutlined />, week: null, tone: 'finance' };
  if (/apple|computer|software|\bapp\b/.test(normalized))
    return { icon: <AppstoreOutlined />, week: null, tone: 'media' };
  if (/school|education|tutor|lesson|coursera/.test(normalized))
    return { icon: <BookOutlined />, week: null, tone: 'education' };
  if (/health|medical|doctor|pharmacy/.test(normalized))
    return { icon: <MedicineBoxOutlined />, week: null, tone: 'health' };
  if (/tax|bill|insurance/.test(normalized))
    return { icon: <FileTextOutlined />, week: null, tone: 'finance' };
  if (
    /salary|paycheck|income|saving|surplus/.test(normalized) ||
    type === 'income'
  )
    return { icon: <BankOutlined />, week: null, tone: 'income' };
  return { icon: <WalletOutlined />, week: null, tone: 'other' };
}

export default function BudgetsView({ model }: { model: any }) {
  const {
    budgetComparison,
    budgetRows,
    budgetSaveKey,
    pendingWrite,
    budgetType,
    cancelBudgetDrag,
    categoryParts,
    closingMonth,
    defaultRecurringCategory,
    draggingBudgetIds,
    finishBudgetDrag,
    formatMoney,
    historicalReadOnly,
    monthBudgets,
    moveBudgetDrag,
    moveBudgetWithKeyboard,
    openBudgetEditor,
    openNewBudget,
    openWeekTransactions,
    orderableBudgets,
    rearrangingBudgets,
    resetBudgetOrderInteraction,
    saveInlineActual,
    savingInlineActualKey,
    savingBudgetOrder,
    selectedActual,
    selectedBudgetCount,
    selectedBudgetIds,
    selectedComparison,
    selectedEstimate,
    selectBudgetType,
    setMonthSetupOpen,
    setRearrangingBudgets,
    setSelectedBudgetIds,
    startBudgetDrag,
    weeklyCategoryNumber,
  } = model;
  const [editingActualKey, setEditingActualKey] = useState<string | null>(null);
  const [actualDraft, setActualDraft] = useState<number | null>(null);

  useEffect(() => {
    if (!editingActualKey) return;
    const frame = window.requestAnimationFrame(() => {
      document
        .querySelector<HTMLInputElement>('.budget-inline-actual-editor input')
        ?.focus();
    });
    return () => window.cancelAnimationFrame(frame);
  }, [editingActualKey]);

  const cancelActualEdit = () => {
    setEditingActualKey(null);
    setActualDraft(null);
  };

  return (
    <>
      <section className="page-heading budget-page-heading">
        <div>
          <Text className="eyebrow">ESTIMATE & COMPARE</Text>
          <Title level={1}>Monthly expenses</Title>
          <Text type="secondary">
            Compare estimated and actual monthly costs.
          </Text>
        </div>
        <div className="budget-heading-actions">
          <Segmented
            aria-label="Budget type"
            value={budgetType}
            onChange={(value) => selectBudgetType(value)}
            options={[
              { label: 'Expenses', value: 'expense' },
              { label: 'Income', value: 'income' },
            ]}
          />
          <div className="budget-heading-buttons">
            <Dropdown
              classNames={{ root: 'secondary-actions-menu' }}
              trigger={['click']}
              menu={{
                items: [
                  {
                    key: 'next-month',
                    label: 'Set up next month',
                    icon: <CalendarOutlined />,
                    disabled:
                      historicalReadOnly ||
                      closingMonth ||
                      monthBudgets.length === 0,
                    onClick: () => setMonthSetupOpen(true),
                  },
                  ...(orderableBudgets.length > 1
                    ? [
                        {
                          key: 'rearrange',
                          label: 'Rearrange categories',
                          icon: <HolderOutlined />,
                          disabled:
                            savingBudgetOrder ||
                            historicalReadOnly ||
                            rearrangingBudgets,
                          onClick: () => {
                            resetBudgetOrderInteraction();
                            setRearrangingBudgets(true);
                          },
                        },
                      ]
                    : []),
                ],
              }}
            >
              <Button loading={closingMonth} disabled={historicalReadOnly}>
                Manage budget
              </Button>
            </Dropdown>
            {rearrangingBudgets && (
              <Button
                className="budget-rearrange-done"
                type="primary"
                icon={<HolderOutlined />}
                disabled={savingBudgetOrder || historicalReadOnly}
                onClick={() => {
                  resetBudgetOrderInteraction();
                  setRearrangingBudgets(false);
                }}
              >
                Done
              </Button>
            )}
            <Button
              icon={<PlusOutlined />}
              disabled={historicalReadOnly}
              onClick={openNewBudget}
            >
              Add category
            </Button>
          </div>
        </div>
      </section>
      <div className="budget-summary-strip">
        <div>
          <Text type="secondary">Estimated</Text>
          <strong>{formatMoney(selectedEstimate)}</strong>
        </div>
        <div>
          <Text type="secondary">Actual</Text>
          <strong>{formatMoney(selectedActual)}</strong>
        </div>
        <div>
          <span className="variance-label">
            <Text type="secondary">Variance</Text>
            <Tooltip title="Positive is favourable; negative is unfavourable.">
              <InfoCircleOutlined
                className="variance-info"
                tabIndex={0}
                aria-label="Positive is favourable; negative is unfavourable"
              />
            </Tooltip>
          </span>
          <strong className={`variance-${selectedComparison.tone}`}>
            {selectedComparison.variance}
          </strong>
        </div>
      </div>
      {rearrangingBudgets && orderableBudgets.length > 1 && (
        <div className="budget-selection-toolbar">
          <Checkbox
            checked={selectedBudgetCount === orderableBudgets.length}
            indeterminate={
              selectedBudgetCount > 0 &&
              selectedBudgetCount < orderableBudgets.length
            }
            disabled={savingBudgetOrder}
            onChange={(event) =>
              setSelectedBudgetIds(
                event.target.checked
                  ? orderableBudgets.map((item: any) => item.id)
                  : [],
              )
            }
          >
            Select all
          </Checkbox>
          <Text type="secondary">
            {selectedBudgetCount > 1
              ? `${selectedBudgetCount} selected — drag any selected handle to move them together`
              : 'Select multiple categories, then drag a handle to move them together'}
          </Text>
        </div>
      )}
      <Card className="budget-list-card">
        <div className="budget-table">
          <div className="budget-list-header">
            <Text type="secondary">Category</Text>
            <Text type="secondary">Estimated</Text>
            <Text type="secondary">Actual</Text>
            <span className="variance-label variance-table-label">
              <Text type="secondary">Variance</Text>
              <Tooltip title="Positive is favourable; negative is unfavourable.">
                <InfoCircleOutlined
                  className="variance-info"
                  tabIndex={0}
                  aria-label="Positive is favourable; negative is unfavourable"
                />
              </Tooltip>
            </span>
          </div>
          {budgetRows.map((item: any) => {
            const comparison = budgetComparison(
              item.plannedAmount,
              item.actual,
              item.type,
            );
            const hasEstimate = monthBudgets.some(
              (entry: any) =>
                entry.type === item.type && entry.category === item.category,
            );
            const category = categoryParts(item.category);
            const artwork = categoryArtwork(category.name, item.type);
            const weekNumber = weeklyCategoryNumber(item.category);
            const isWeeklyCategory = weekNumber !== null;
            const canOpenWeek = isWeeklyCategory && !rearrangingBudgets;
            const isSelected =
              rearrangingBudgets && selectedBudgetIds.includes(item.id);
            const isDragging = draggingBudgetIds.includes(item.id);
            const actualKey = `${item.type}:${item.category}`;
            const editingActual = editingActualKey === actualKey;
            const savingActual = savingInlineActualKey === actualKey;
            const isCreditCard =
              item.type === 'expense' &&
              category.name.toLowerCase() === 'credit card';
            const creditCardHelpId = `credit-card-help-${item.id}`;
            return (
              <div
                className={`budget-list-row${
                  canOpenWeek ? ' budget-week-link' : ''
                }${isSelected ? ' budget-row-selected' : ''}${
                  isDragging ? ' budget-row-dragging' : ''
                }${editingActual ? ' actual-editing' : ''}`}
                data-budget-order-id={
                  rearrangingBudgets && hasEstimate ? item.id : undefined
                }
                key={`${item.type}-${item.category}`}
              >
                {canOpenWeek && weekNumber ? (
                  <button
                    className="budget-week-surface"
                    type="button"
                    aria-label={`View ${category.name} transactions`}
                    onClick={() => openWeekTransactions(weekNumber)}
                  />
                ) : null}
                <div className="budget-category-cell">
                  {rearrangingBudgets &&
                    hasEstimate &&
                    orderableBudgets.length > 1 && (
                      <Checkbox
                        className="budget-select-checkbox"
                        checked={isSelected}
                        disabled={savingBudgetOrder}
                        aria-label={`Select ${category.name} for group reordering`}
                        onChange={(event) =>
                          setSelectedBudgetIds((current: string[]) =>
                            event.target.checked
                              ? [...new Set([...current, item.id])]
                              : current.filter((id) => id !== item.id),
                          )
                        }
                      />
                    )}
                  {rearrangingBudgets &&
                    hasEstimate &&
                    orderableBudgets.length > 1 && (
                      <Button
                        className="budget-drag-handle"
                        type="text"
                        size="small"
                        icon={<HolderOutlined />}
                        title={
                          isSelected && selectedBudgetCount > 1
                            ? `Drag ${selectedBudgetCount} selected categories`
                            : `Drag ${category.name} to reorder`
                        }
                        aria-label={`Drag ${
                          isSelected && selectedBudgetCount > 1
                            ? `${selectedBudgetCount} selected categories`
                            : category.name
                        } to reorder. Use the up and down arrow keys for keyboard reordering.`}
                        disabled={savingBudgetOrder}
                        onPointerDown={(event) => startBudgetDrag(event, item)}
                        onPointerMove={moveBudgetDrag}
                        onPointerUp={finishBudgetDrag}
                        onPointerCancel={cancelBudgetDrag}
                        onKeyDown={(event) =>
                          moveBudgetWithKeyboard(event, item)
                        }
                      />
                    )}
                  <span
                    className={`budget-category-icon category-tone-${artwork.tone}`}
                    aria-hidden="true"
                  >
                    {artwork.icon}
                    {artwork.week && <b>{artwork.week}</b>}
                  </span>
                  <div className="budget-category-copy">
                    <div className="budget-editable-label">
                      <Text strong title={category.name}>
                        {category.name}
                      </Text>
                      <Button
                        className="budget-inline-edit"
                        type="text"
                        size="small"
                        icon={<EditOutlined />}
                        disabled={historicalReadOnly}
                        aria-label={`Edit ${category.name} category details`}
                        onClick={(event) => {
                          event.stopPropagation();
                          openBudgetEditor(item, 'category');
                        }}
                      />
                    </div>
                    {budgetSaveKey ===
                      `${item.period}:${item.type}:${item.category}` && (
                      <output className="budget-pending-label">
                        {pendingWrite ? 'Check save' : 'Saving…'}
                      </output>
                    )}
                    {(item.recurring ??
                      defaultRecurringCategory(item.category, item.type)) && (
                      <div className="budget-category-tags">
                        <Tag className="recurring-tag">Repeats</Tag>
                      </div>
                    )}
                  </div>
                </div>
                <div className="budget-value-cell planned-cell">
                  <Text type="secondary" className="budget-mobile-label">
                    Estimated
                  </Text>
                  <div className="budget-editable-value">
                    <Text strong>{formatMoney(item.plannedAmount)}</Text>
                    <Button
                      className="budget-inline-edit"
                      type="text"
                      size="small"
                      icon={<EditOutlined />}
                      disabled={historicalReadOnly}
                      aria-label={`Edit ${item.category} estimated amount`}
                      onClick={(event) => {
                        event.stopPropagation();
                        openBudgetEditor(item, 'plannedAmount');
                      }}
                    />
                  </div>
                </div>
                <div className="budget-value-cell actual-cell">
                  <Text type="secondary" className="budget-mobile-label">
                    Actual
                  </Text>
                  <div className="budget-actual-control">
                    {editingActual ? (
                      <form
                        className="budget-inline-actual-editor"
                        onSubmit={async (event) => {
                          event.preventDefault();
                          event.stopPropagation();
                          if (actualDraft === null || actualDraft < 0) return;
                          const saved = await saveInlineActual(
                            item,
                            Math.round(actualDraft),
                          );
                          if (saved) cancelActualEdit();
                        }}
                      >
                        <InputNumber
                          aria-label={`${category.name} ${category.name.toLowerCase() === 'credit card' ? 'full bill' : 'actual amount'}`}
                          aria-describedby={
                            isCreditCard ? creditCardHelpId : undefined
                          }
                          controls={false}
                          min={0}
                          precision={0}
                          prefix="¥"
                          value={actualDraft}
                          onChange={(value) =>
                            setActualDraft(
                              typeof value === 'number' ? value : null,
                            )
                          }
                          onKeyDown={(event) => {
                            if (event.key === 'Escape') cancelActualEdit();
                          }}
                        />
                        <Button
                          aria-label={`Save ${category.name} actual amount`}
                          htmlType="submit"
                          icon={<CheckOutlined />}
                          loading={savingActual}
                          size="small"
                          type="text"
                        />
                        <Button
                          aria-label="Cancel editing actual amount"
                          disabled={savingActual}
                          htmlType="button"
                          icon={<CloseOutlined />}
                          onClick={cancelActualEdit}
                          size="small"
                          type="text"
                        />
                      </form>
                    ) : (
                      <button
                        aria-label={`Edit ${category.name} actual amount`}
                        className="budget-inline-actual-trigger"
                        disabled={historicalReadOnly || savingActual}
                        type="button"
                        onClick={(event) => {
                          event.stopPropagation();
                          setEditingActualKey(actualKey);
                          setActualDraft(
                            category.name.toLowerCase() === 'credit card'
                              ? (item.creditCardGrossAmount ??
                                  item.actual +
                                    (item.creditCardFixedCosts || 0))
                              : item.actual,
                          );
                        }}
                      >
                        <span>{formatMoney(item.actual)}</span>
                        <EditOutlined aria-hidden="true" />
                      </button>
                    )}
                    {item.type === 'expense' &&
                      category.name.toLowerCase() === 'credit card' && (
                        <Tooltip
                          classNames={{
                            root: 'credit-card-calculation-tooltip',
                          }}
                          trigger={['hover', 'focus']}
                          title={
                            <>
                              {editingActual ? 'Full bill' : 'Bill'} −{' '}
                              {formatMoney(item.creditCardFixedCosts || 0)}{' '}
                              fixed costs
                              {editingActual && actualDraft !== null && (
                                <>
                                  {' '}
                                  ={' '}
                                  {formatMoney(
                                    actualDraft -
                                      (item.creditCardFixedCosts || 0),
                                  )}{' '}
                                  Actual
                                </>
                              )}
                            </>
                          }
                        >
                          <Button
                            className="credit-card-calculation-help"
                            type="text"
                            size="small"
                            icon={<InfoCircleOutlined />}
                            aria-label="Credit-card calculation"
                          />
                        </Tooltip>
                      )}
                  </div>
                </div>
                <div className="budget-value-cell variance-cell">
                  <Text type="secondary" className="budget-mobile-label">
                    Variance
                  </Text>
                  <Text className={`variance-${comparison.tone}`} strong>
                    {comparison.variance}
                  </Text>
                </div>
                <div className="budget-row-actions">
                  <Button
                    size="small"
                    icon={<EditOutlined />}
                    disabled={historicalReadOnly}
                    onClick={(event) => {
                      event.stopPropagation();
                      openBudgetEditor(item, 'both');
                    }}
                  >
                    Edit
                  </Button>
                </div>
                {editingActual && isCreditCard && (
                  <div
                    id={creditCardHelpId}
                    className="credit-card-edit-help budget-credit-card-edit-help"
                  >
                    Enter the full bill. Actual deducts{' '}
                    {formatMoney(item.creditCardFixedCosts || 0)} in fixed
                    costs, excluding Rent.
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </Card>
    </>
  );
}
