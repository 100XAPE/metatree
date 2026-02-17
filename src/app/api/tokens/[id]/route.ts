import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

export const dynamic = 'force-dynamic';

// DELETE a token by ID or symbol
export async function DELETE(
  request: Request,
  { params }: { params: { id: string } }
) {
  try {
    const { id } = params;
    
    // Try to find by ID first, then by symbol
    let token = await prisma.token.findUnique({ where: { id } });
    
    if (!token) {
      token = await prisma.token.findFirst({ 
        where: { symbol: { equals: id, mode: 'insensitive' } }
      });
    }
    
    if (!token) {
      return NextResponse.json({ error: 'Token not found' }, { status: 404 });
    }
    
    // Clear any derivatives pointing to this token first
    await prisma.token.updateMany({
      where: { parentRunnerId: token.id },
      data: { parentRunnerId: null }
    });
    
    // Delete the token
    await prisma.token.delete({ where: { id: token.id } });
    
    return NextResponse.json({ 
      success: true, 
      deleted: token.symbol 
    });
  } catch (error) {
    return NextResponse.json({ error: String(error) }, { status: 500 });
  }
}
