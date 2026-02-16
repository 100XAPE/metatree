import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

export const dynamic = 'force-dynamic';

// POST /api/link - Manually link a derivative to a runner
// Body: { runnerMint: "...", derivativeMint: "..." }
// Or: { runnerSymbol: "PUNCH", derivativeSymbol: "TEDDY" }

export async function POST(request: Request) {
  try {
    const body = await request.json();
    
    let runner, derivative;
    
    if (body.runnerMint && body.derivativeMint) {
      runner = await prisma.token.findUnique({ where: { mint: body.runnerMint } });
      derivative = await prisma.token.findUnique({ where: { mint: body.derivativeMint } });
    } else if (body.runnerSymbol && body.derivativeSymbol) {
      runner = await prisma.token.findFirst({ 
        where: { symbol: { equals: body.runnerSymbol, mode: 'insensitive' } },
        orderBy: { marketCap: 'desc' }
      });
      derivative = await prisma.token.findFirst({ 
        where: { symbol: { equals: body.derivativeSymbol, mode: 'insensitive' } },
        orderBy: { marketCap: 'desc' }
      });
    } else {
      return NextResponse.json({ 
        error: 'Provide runnerMint+derivativeMint or runnerSymbol+derivativeSymbol' 
      }, { status: 400 });
    }
    
    if (!runner) {
      return NextResponse.json({ error: 'Runner token not found' }, { status: 404 });
    }
    if (!derivative) {
      return NextResponse.json({ error: 'Derivative token not found' }, { status: 404 });
    }
    if (runner.id === derivative.id) {
      return NextResponse.json({ error: 'Cannot link token to itself' }, { status: 400 });
    }
    
    // Link derivative to runner
    await prisma.token.update({
      where: { id: derivative.id },
      data: { parentRunnerId: runner.id }
    });
    
    return NextResponse.json({ 
      success: true,
      runner: { symbol: runner.symbol, name: runner.name },
      derivative: { symbol: derivative.symbol, name: derivative.name },
      message: `Linked ${derivative.symbol} as derivative of ${runner.symbol}`
    });
    
  } catch (error) {
    console.error('Link error:', error);
    return NextResponse.json({ error: 'Failed to link', details: String(error) }, { status: 500 });
  }
}

// DELETE /api/link - Remove a link
export async function DELETE(request: Request) {
  try {
    const body = await request.json();
    
    let derivative;
    if (body.mint) {
      derivative = await prisma.token.findUnique({ where: { mint: body.mint } });
    } else if (body.symbol) {
      derivative = await prisma.token.findFirst({ 
        where: { symbol: { equals: body.symbol, mode: 'insensitive' } }
      });
    }
    
    if (!derivative) {
      return NextResponse.json({ error: 'Token not found' }, { status: 404 });
    }
    
    await prisma.token.update({
      where: { id: derivative.id },
      data: { parentRunnerId: null }
    });
    
    return NextResponse.json({ success: true, message: `Unlinked ${derivative.symbol}` });
  } catch (error) {
    return NextResponse.json({ error: 'Failed to unlink' }, { status: 500 });
  }
}

// GET /api/link - List all manual links
export async function GET() {
  try {
    const linked = await prisma.token.findMany({
      where: { parentRunnerId: { not: null } },
      include: { parentRunner: true }
    });
    
    return NextResponse.json({
      count: linked.length,
      links: linked.map(t => ({
        derivative: { symbol: t.symbol, name: t.name, mint: t.mint },
        runner: t.parentRunner ? { 
          symbol: t.parentRunner.symbol, 
          name: t.parentRunner.name,
          mint: t.parentRunner.mint 
        } : null
      }))
    });
  } catch (error) {
    return NextResponse.json({ error: 'Failed to get links' }, { status: 500 });
  }
}
