import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

export const dynamic = 'force-dynamic';

// Unlink a derivative from its parent runner
export async function POST(request: Request) {
  try {
    const { tokenId } = await request.json();
    
    if (!tokenId) {
      return NextResponse.json({ error: 'tokenId required' }, { status: 400 });
    }
    
    const token = await prisma.token.findUnique({
      where: { id: tokenId }
    });
    
    if (!token) {
      return NextResponse.json({ error: 'Token not found' }, { status: 404 });
    }
    
    if (!token.parentRunnerId) {
      return NextResponse.json({ error: 'Token is not a derivative' }, { status: 400 });
    }
    
    await prisma.token.update({
      where: { id: tokenId },
      data: { 
        parentRunnerId: null,
        matchReason: null
      }
    });
    
    return NextResponse.json({ 
      success: true, 
      message: `Unlinked ${token.symbol} from parent runner` 
    });
    
  } catch (error) {
    console.error('Unlink error:', error);
    return NextResponse.json({ error: 'Unlink failed', details: String(error) }, { status: 500 });
  }
}
