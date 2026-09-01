import { NextResponse } from 'next/server';
import { deleteLedgerTransaction, updateLedgerTransaction } from '@/db/ledger';
import { validateTransactionBody } from '@/lib/validation';

export async function PATCH(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await context.params;
    const input = validateTransactionBody(await request.json());
    const item = await updateLedgerTransaction(id, input);
    if (!item) return NextResponse.json({ error: 'Transaction not found.' }, { status: 404 });
    return NextResponse.json(item);
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Could not update the transaction.' },
      { status: 400 },
    );
  }
}

export async function DELETE(_request: Request, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  const deleted = await deleteLedgerTransaction(id);
  if (!deleted) return NextResponse.json({ error: 'Transaction not found.' }, { status: 404 });
  return NextResponse.json({ id, deleted: true });
}
