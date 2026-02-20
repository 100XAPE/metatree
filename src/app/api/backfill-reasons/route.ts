import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

export const dynamic = 'force-dynamic';

// Backfill matchReason for derivatives that were linked before reasons were tracked
export async function GET() {
  try {
    // Find all derivatives with a parent but no reason
    const derivatives = await prisma.token.findMany({
      where: {
        parentRunnerId: { not: null },
        matchReason: null
      },
      include: {
        parentRunner: { select: { symbol: true, name: true } }
      }
    });
    
    if (derivatives.length === 0) {
      return NextResponse.json({ success: true, message: 'All derivatives have reasons', updated: 0 });
    }
    
    let updated = 0;
    const results: { symbol: string; reason: string }[] = [];
    
    for (const d of derivatives) {
      // Generate a reason based on what we can infer
      let reason = 'manual link';
      
      const dName = d.name.toLowerCase();
      const dSym = d.symbol.toLowerCase();
      const rName = d.parentRunner?.name?.toLowerCase() || '';
      const rSym = d.parentRunner?.symbol?.toLowerCase() || '';
      
      // Check for name containment
      if (rSym.length >= 3 && dName.includes(rSym)) {
        reason = `name contains "${rSym}"`;
      } else if (rSym.length >= 3 && dSym.includes(rSym)) {
        reason = `symbol contains "${rSym}"`;
      } else if (rName.length >= 4 && dName.includes(rName.split(' ')[0])) {
        reason = `name contains "${rName.split(' ')[0]}"`;
      } else {
        reason = 'visual/semantic similarity';
      }
      
      await prisma.token.update({
        where: { id: d.id },
        data: { matchReason: reason }
      });
      
      updated++;
      results.push({ symbol: d.symbol, reason });
    }
    
    return NextResponse.json({ success: true, updated, results });
    
  } catch (error) {
    console.error('Backfill error:', error);
    return NextResponse.json({ error: 'Failed', details: String(error) }, { status: 500 });
  }
}
