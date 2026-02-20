import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const settings = await prisma.settings.findUnique({ where: { id: 'global' } }) ||
      await prisma.settings.create({ data: { id: 'global' } });
    
    return NextResponse.json({
      minVolume5m: settings.minVolume5m,
      mainRunnerMinMc: settings.mainRunnerMinMc,
      telegramConfigured: !!(settings.telegramBotToken && settings.telegramChatId)
    });
  } catch (error) {
    return NextResponse.json({ error: String(error) }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    
    const updateData: any = {};
    
    if (body.minVolume5m !== undefined) {
      updateData.minVolume5m = parseFloat(body.minVolume5m);
    }
    if (body.mainRunnerMinMc !== undefined) {
      updateData.mainRunnerMinMc = parseFloat(body.mainRunnerMinMc);
    }
    if (body.telegramBotToken !== undefined) {
      updateData.telegramBotToken = body.telegramBotToken || null;
    }
    if (body.telegramChatId !== undefined) {
      updateData.telegramChatId = body.telegramChatId || null;
    }
    
    // Ensure settings exist
    await prisma.settings.upsert({
      where: { id: 'global' },
      create: { id: 'global', ...updateData },
      update: updateData
    });
    
    // Test Telegram if both are provided
    if (body.telegramBotToken && body.telegramChatId) {
      try {
        const res = await fetch(`https://api.telegram.org/bot${body.telegramBotToken}/sendMessage`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            chat_id: body.telegramChatId,
            text: '🌳 Metatree alerts configured! You will receive notifications when new derivatives are detected.',
            parse_mode: 'HTML'
          })
        });
        const data = await res.json();
        if (!data.ok) {
          return NextResponse.json({ 
            success: true, 
            warning: `Telegram test failed: ${data.description}` 
          });
        }
      } catch (e) {
        return NextResponse.json({ 
          success: true, 
          warning: `Telegram test failed: ${e}` 
        });
      }
    }
    
    return NextResponse.json({ success: true });
  } catch (error) {
    return NextResponse.json({ error: String(error) }, { status: 500 });
  }
}
