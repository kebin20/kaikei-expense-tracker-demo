import { NextResponse } from 'next/server';
import { upsertBudget } from '@/db/ledger';
import { validateBudgetBody } from '@/lib/validation';

export async function PUT(request: Request) {
  try {
    const input = validateBudgetBody(await request.json());
    return NextResponse.json(await upsertBudget(input));
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Could not update the budget.' },
      { status: 400 },
    );
  }
}
