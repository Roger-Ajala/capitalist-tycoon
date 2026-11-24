import 'dotenv/config';
import crypto from 'node:crypto';
import { afterAll, afterEach, describe, expect, it } from 'vitest';
import { prisma } from '../../lib/prisma';
import { AppError } from '../../errors/AppError';
import { buyBusiness, buyUpgrade, performRebirth } from '../game.service';

describe('game.service (Integração & Proteção contra Race Conditions)', () => {
  const createdUserIds: string[] = [];

  async function createTestPlayer(data: {
    balance: string;
    lifetimeEarnings?: string;
    prestigeMultiplier?: string;
  }) {
    const suffix = crypto.randomBytes(6).toString('hex');
    const user = await prisma.user.create({
      data: {
        username: `test_player_${suffix}`,
        sessionToken: `test_token_${suffix}`,
        balance: data.balance,
        lifetimeEarnings: data.lifetimeEarnings ?? data.balance,
        prestigeMultiplier: data.prestigeMultiplier ?? '1.0000',
        incomePerSecond: '0.00',
      },
    });

    createdUserIds.push(user.id);
    return user;
  }

  afterEach(async () => {
    if (createdUserIds.length > 0) {
      await prisma.user.deleteMany({
        where: { id: { in: createdUserIds } },
      });
      createdUserIds.length = 0;
    }
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  it('impede gasto duplo quando 5 compras simultâneas disputam saldo para apenas 1 unidade', async () => {
    // Barraca de Limonada custa $4.00. Com $4.50, apenas 1 compra pode passar.
    const user = await createTestPlayer({ balance: '4.50' });

    const attempts = Array.from({ length: 5 }, () =>
      buyBusiness({
        userId: user.id,
        businessSlug: 'lemonade-stand',
        amount: 1,
      })
    );

    const results = await Promise.allSettled(attempts);

    const succeeded = results.filter((r) => r.status === 'fulfilled');
    const rejected = results.filter((r) => r.status === 'rejected');

    expect(succeeded).toHaveLength(1);
    expect(rejected).toHaveLength(4);

    // Verifica consistência final diretamente no PostgreSQL
    const updatedUser = await prisma.user.findUniqueOrThrow({
      where: { id: user.id },
      include: { businesses: true },
    });

    expect(updatedUser.balance.toFixed(2)).toBe('0.50');
    expect(updatedUser.businesses).toHaveLength(1);
    expect(updatedUser.businesses[0].quantity).toBe(1);
  });

  it('impede compra duplicada do mesmo upgrade sob requisições concorrentes (HTTP 409)', async () => {
    // Upgrade 'organic-lemons' custa $250.00. Damos $1000.00 para garantir que a falha não seja por saldo.
    const user = await createTestPlayer({ balance: '1000.00' });

    const attempts = Array.from({ length: 3 }, () =>
      buyUpgrade({
        userId: user.id,
        upgradeSlug: 'organic-lemons',
      })
    );

    const results = await Promise.allSettled(attempts);

    const succeeded = results.filter((r) => r.status === 'fulfilled');
    const rejected = results.filter(
      (r): r is PromiseRejectedResult => r.status === 'rejected'
    );

    expect(succeeded).toHaveLength(1);
    expect(rejected).toHaveLength(2);

    // As duas tentativas bloqueadas precisam retornar HTTP 409 Conflict
    for (const fail of rejected) {
      expect(fail.reason).toBeInstanceOf(AppError);
      expect((fail.reason as AppError).statusCode).toBe(409);
    }

    const updatedUser = await prisma.user.findUniqueOrThrow({
      where: { id: user.id },
      include: { upgrades: true },
    });

    expect(updatedUser.balance.toFixed(2)).toBe('750.00');
    expect(updatedUser.upgrades).toHaveLength(1);
  });

  it('impede Rebirth duplicado sob requisições simultâneas e grava apenas 1 log de auditoria', async () => {
    const user = await createTestPlayer({
      balance: '500.00',
      lifetimeEarnings: '10000.00',
      prestigeMultiplier: '1.0000',
    });

    // Compra 1 negócio e 1 upgrade para validar o reset atômico completo
    await buyBusiness({
      userId: user.id,
      businessSlug: 'lemonade-stand',
      amount: 1,
    });
    await buyUpgrade({
      userId: user.id,
      upgradeSlug: 'organic-lemons',
    });

    // Zera incomePerSecond para isolar o teste de milissegundos de execução
    await prisma.user.update({
      where: { id: user.id },
      data: { incomePerSecond: '0.00', lifetimeEarnings: '10000.00' },
    });

    // Dispara 3 Rebirths simultâneos tentando multiplicar prestígio indevidamente
    const results = await Promise.allSettled([
      performRebirth(user.id),
      performRebirth(user.id),
      performRebirth(user.id),
    ]);

    const succeeded = results.filter((r) => r.status === 'fulfilled');
    const rejected = results.filter((r) => r.status === 'rejected');

    expect(succeeded).toHaveLength(1);
    expect(rejected).toHaveLength(2);

    const finalUser = await prisma.user.findUniqueOrThrow({
      where: { id: user.id },
      include: {
        businesses: true,
        upgrades: true,
        rebirthHistory: true,
      },
    });

    expect(finalUser.rebirthCount).toBe(1);
    expect(finalUser.prestigeMultiplier.toFixed(4)).toBe('1.5000');
    expect(finalUser.balance.toFixed(2)).toBe('10.00');
    expect(finalUser.incomePerSecond.toFixed(2)).toBe('0.00');
    expect(finalUser.businesses).toHaveLength(0);
    expect(finalUser.upgrades).toHaveLength(0);
    expect(finalUser.rebirthHistory).toHaveLength(1);
    expect(finalUser.rebirthHistory[0].multiplierGained.toFixed(2)).toBe('0.50');
  });
});