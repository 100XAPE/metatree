import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

export const dynamic = 'force-dynamic';

// Reset all derivative links (clear parentRunnerId)
export async function GET() {
  try {
    const result = await prisma.token.updateMany({
      where: { parentRunnerId: { not: null } },
      data: { parentRunnerId: null }
    });
    
    return NextResponse.json({
      success: true,
      cleared: result.count
    });
  } catch (error) {
    return NextResponse.json({ error: String(error) }, { status: 500 });
  }
}
