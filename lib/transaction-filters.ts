export interface TransactionFilters {
  from: string;
  to: string;
  min: number | null;
  max: number | null;
  category: string;
}

export const EMPTY_TRANSACTION_FILTERS: TransactionFilters = {
  from: '',
  to: '',
  min: null,
  max: null,
  category: '',
};

export function filterTransactions<
  T extends {
    type: string;
    transactionDate: string;
    amount: number;
    description: string;
    category: string;
  },
>(items: T[], query: string, type: string, filters: TransactionFilters) {
  const search = query.trim().toLocaleLowerCase();
  return items.filter(
    (item) =>
      (type === 'all' || item.type === type) &&
      (!search ||
        item.description.toLocaleLowerCase().includes(search) ||
        item.category.toLocaleLowerCase().includes(search)) &&
      (!filters.from || item.transactionDate >= filters.from) &&
      (!filters.to || item.transactionDate <= filters.to) &&
      (filters.min === null || item.amount >= filters.min) &&
      (filters.max === null || item.amount <= filters.max) &&
      (!filters.category || item.category === filters.category),
  );
}
