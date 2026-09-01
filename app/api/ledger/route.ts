import { NextResponse } from 'next/server';
import { createLedgerTransaction, getLedgerData } from '@/db/ledger';
import { validateTransactionBody } from '@/lib/validation';

export async function GET() {
  try {
    return NextResponse.json(await getLedgerData());
  } catch (error) {
    console.error(error);
    return NextResponse.json({ error: 'Kaikei could not load your ledger.' }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const input = validateTransactionBody(await request.json());
    return NextResponse.json(await createLedgerTransaction(input), { status: 201 });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Could not save the transaction.' },
      { status: 400 },
    );
  }
}
