import { Prisma } from '@prisma/client';
import { prisma } from '../lib/prisma';
import { AppError } from '../errors/AppError';
import {
  calculateBusinessPurchaseCost,
  calculateOfflineEarnings,
  calculateRebirthPreview,
  calculateTotalIncomePerSecond,
} from './economy.service';

interface BuyBusinessParams {
  userId: string;
  businessSlug: string;
  amount: number;
}

interface BuyUpgradeParams {
  userId: string;
  upgradeSlug: string;
}

const INITIAL_BALANCE_AFTER_REBIRTH = '10.00';

function buildCostQuotes(
  baseCost: Prisma.Decimal,
  costMultiplier: Prisma.Decimal,
  currentQuantity: number
) {
  return {
    1: calculateBusinessPurchaseCost(
      baseCost,
      costMultiplier,
      currentQuantity,
      1
    ).toFixed(2),
    5: calculateBusinessPurchaseCost(
      baseCost,
      costMultiplier,
      currentQuantity,
      5
    ).toFixed(2),
    10: calculateBusinessPurchaseCost(
      baseCost,
      costMultiplier,
      currentQuantity,
      10
    ).toFixed(2),
  };
}

export async function getGameState(userId: string) {
  const [user, businessCatalog, upgradeCatalog] = await Promise.all([
    prisma.user.findUnique({
      where: { id: userId },
      include: {
        businesses: true,
        upgrades: true,
        rebirthHistory: {
          orderBy: { rebirthNumber: 'desc' },
          take: 10,
        },
      },
    }),
    prisma.business.findMany({
      orderBy: { sortOrder: 'asc' },
    }),
    prisma.upgrade.findMany({
      include: {
        business: {
          select: { slug: true, name: true },
        },
      },
      orderBy: { cost: 'asc' },
    }),
  ]);

  if (!user) {
    throw new AppError('Jogador não encontrado.', 404);
  }

  const now = new Date();
  const offlineEarned = calculateOfflineEarnings(
    user.incomePerSecond,
    user.lastSyncedAt,
    now
  );

  const liveBalance = user.balance.plus(offlineEarned);
  const liveLifetimeEarnings = user.lifetimeEarnings.plus(offlineEarned);

  const ownedQuantityMap = new Map<number, number>(
    user.businesses.map((ub) => [ub.businessId, ub.quantity])
  );
  const ownedUpgradeSet = new Set<number>(
    user.upgrades.map((uu) => uu.upgradeId)
  );

  const businesses = businessCatalog.map((business) => {
    const quantity = ownedQuantityMap.get(business.id) ?? 0;
    const costs = buildCostQuotes(
      business.baseCost,
      business.costMultiplier,
      quantity
    );

    return {
      slug: business.slug,
      name: business.name,
      quantity,
      baseIncome: business.baseIncome.toFixed(2),
      nextUnitCost: costs[1],
      costs,
    };
  });

  const upgrades = upgradeCatalog.map((upgrade) => ({
    slug: upgrade.slug,
    name: upgrade.name,
    description: upgrade.description,
    cost: upgrade.cost.toFixed(2),
    multiplier: upgrade.multiplier.toFixed(2),
    businessSlug: upgrade.business?.slug ?? null,
    businessName: upgrade.business?.name ?? 'Todos os Negócios',
    purchased: ownedUpgradeSet.has(upgrade.id),
  }));

  const rebirthPreview = calculateRebirthPreview(
    liveLifetimeEarnings,
    user.prestigeMultiplier
  );

  return {
    player: {
      id: user.id,
      username: user.username,
      balance: liveBalance.toFixed(2),
      offlineEarned: offlineEarned.toFixed(2),
      lifetimeEarnings: liveLifetimeEarnings.toFixed(2),
      incomePerSecond: user.incomePerSecond.toFixed(2),
      prestigeMultiplier: user.prestigeMultiplier.toFixed(4),
      rebirthCount: user.rebirthCount,
      lastSyncedAt: user.lastSyncedAt.toISOString(),
      serverTime: now.toISOString(),
    },
    businesses,
    upgrades,
    rebirth: {
      canRebirth: rebirthPreview.canRebirth,
      multiplierGained: rebirthPreview.multiplierGained.toFixed(2),
      newTotalMultiplier: rebirthPreview.newTotalMultiplier.toFixed(2),
      nextThresholdEarnings: rebirthPreview.nextThresholdEarnings.toFixed(2),
      history: user.rebirthHistory.map((item) => ({
        id: item.id,
        rebirthNumber: item.rebirthNumber,
        earningsAtRebirth: item.earningsAtRebirth.toFixed(2),
        multiplierGained: item.multiplierGained.toFixed(2),
        newTotalMultiplier: item.newTotalMultiplier.toFixed(2),
        createdAt: item.createdAt.toISOString(),
      })),
    },
  };
}

export async function buyBusiness({
  userId,
  businessSlug,
  amount,
}: BuyBusinessParams) {
  if (!Number.isInteger(amount) || amount < 1 || amount > 1000) {
    throw new AppError('A quantidade deve ser um inteiro entre 1 e 1000.', 400);
  }

  return prisma.$transaction(async (tx) => {
    const lockedUser = await tx.$queryRaw<Array<{ id: string }>>`
      SELECT id FROM "users" WHERE id = ${userId} FOR UPDATE
    `;

    if (lockedUser.length === 0) {
      throw new AppError('Jogador não encontrado.', 404);
    }

    const [user, business] = await Promise.all([
      tx.user.findUniqueOrThrow({
        where: { id: userId },
        include: {
          businesses: { include: { business: true } },
          upgrades: { include: { upgrade: true } },
        },
      }),
      tx.business.findUnique({
        where: { slug: businessSlug },
      }),
    ]);

    if (!business) {
      throw new AppError(`Negócio "${businessSlug}" não encontrado.`, 404);
    }

    const now = new Date();
    const offlineEarned = calculateOfflineEarnings(
      user.incomePerSecond,
      user.lastSyncedAt,
      now
    );

    const availableBalance = user.balance.plus(offlineEarned);
    const updatedLifetimeEarnings = user.lifetimeEarnings.plus(offlineEarned);

    const existingOwnership = user.businesses.find(
      (ub) => ub.businessId === business.id
    );
    const currentQuantity = existingOwnership?.quantity ?? 0;

    const totalCost = calculateBusinessPurchaseCost(
      business.baseCost,
      business.costMultiplier,
      currentQuantity,
      amount
    );

    if (availableBalance.lessThan(totalCost)) {
      throw new AppError(
        `Saldo insuficiente. Necessário: $${totalCost.toFixed(2)}, disponível: $${availableBalance.toFixed(2)}.`,
        400
      );
    }

    const updatedOwnership = await tx.userBusiness.upsert({
      where: {
        userId_businessId: {
          userId,
          businessId: business.id,
        },
      },
      update: {
        quantity: { increment: amount },
      },
      create: {
        userId,
        businessId: business.id,
        quantity: amount,
      },
    });

    const allOwnedBusinesses = await tx.userBusiness.findMany({
      where: { userId },
      include: { business: true },
    });

    const newIncomePerSecond = calculateTotalIncomePerSecond(
      allOwnedBusinesses.map((ub) => ({
        businessId: ub.businessId,
        quantity: ub.quantity,
        baseIncome: ub.business.baseIncome,
      })),
      user.upgrades.map((uu) => ({
        businessId: uu.upgrade.businessId,
        multiplier: uu.upgrade.multiplier,
      })),
      user.prestigeMultiplier
    );

    const newBalance = availableBalance
      .minus(totalCost)
      .toDecimalPlaces(2, Prisma.Decimal.ROUND_DOWN);

    const updatedUser = await tx.user.update({
      where: { id: userId },
      data: {
        balance: newBalance,
        lifetimeEarnings: updatedLifetimeEarnings,
        incomePerSecond: newIncomePerSecond,
        lastSyncedAt: now,
      },
    });

    const costs = buildCostQuotes(
      business.baseCost,
      business.costMultiplier,
      updatedOwnership.quantity
    );

    const rebirthPreview = calculateRebirthPreview(
      updatedUser.lifetimeEarnings,
      updatedUser.prestigeMultiplier
    );

    return {
      purchased: {
        businessSlug: business.slug,
        businessName: business.name,
        amountBought: amount,
        totalCost: totalCost.toFixed(2),
        newQuantity: updatedOwnership.quantity,
        nextUnitCost: costs[1],
        costs,
      },
      economy: {
        offlineEarned: offlineEarned.toFixed(2),
        balance: updatedUser.balance.toFixed(2),
        lifetimeEarnings: updatedUser.lifetimeEarnings.toFixed(2),
        incomePerSecond: updatedUser.incomePerSecond.toFixed(2),
        lastSyncedAt: updatedUser.lastSyncedAt.toISOString(),
      },
      rebirthPreview: {
        canRebirth: rebirthPreview.canRebirth,
        multiplierGained: rebirthPreview.multiplierGained.toFixed(2),
        newTotalMultiplier: rebirthPreview.newTotalMultiplier.toFixed(2),
        nextThresholdEarnings: rebirthPreview.nextThresholdEarnings.toFixed(2),
      },
    };
  });
}

/**
 * Compra um upgrade dentro de uma transação ACID com Row-Level Lock,
 * barrando compra duplicada com HTTP 409 Conflict e recalculando a renda/seg.
 */
export async function buyUpgrade({ userId, upgradeSlug }: BuyUpgradeParams) {
  return prisma.$transaction(async (tx) => {
    const lockedUser = await tx.$queryRaw<Array<{ id: string }>>`
      SELECT id FROM "users" WHERE id = ${userId} FOR UPDATE
    `;

    if (lockedUser.length === 0) {
      throw new AppError('Jogador não encontrado.', 404);
    }

    const [user, upgrade] = await Promise.all([
      tx.user.findUniqueOrThrow({
        where: { id: userId },
        include: {
          businesses: { include: { business: true } },
          upgrades: { include: { upgrade: true } },
        },
      }),
      tx.upgrade.findUnique({
        where: { slug: upgradeSlug },
      }),
    ]);

    if (!upgrade) {
      throw new AppError(`Upgrade "${upgradeSlug}" não encontrado.`, 404);
    }

    const alreadyOwned = user.upgrades.some((uu) => uu.upgradeId === upgrade.id);
    if (alreadyOwned) {
      throw new AppError('Este upgrade já foi comprado neste ciclo.', 409);
    }

    const now = new Date();
    const offlineEarned = calculateOfflineEarnings(
      user.incomePerSecond,
      user.lastSyncedAt,
      now
    );

    const availableBalance = user.balance.plus(offlineEarned);
    const updatedLifetimeEarnings = user.lifetimeEarnings.plus(offlineEarned);

    if (availableBalance.lessThan(upgrade.cost)) {
      throw new AppError(
        `Saldo insuficiente para o upgrade. Necessário: $${upgrade.cost.toFixed(2)}, disponível: $${availableBalance.toFixed(2)}.`,
        400
      );
    }

    await tx.userUpgrade.create({
      data: {
        userId,
        upgradeId: upgrade.id,
      },
    });

    const updatedUpgradeInputs = [
      ...user.upgrades.map((uu) => ({
        businessId: uu.upgrade.businessId,
        multiplier: uu.upgrade.multiplier,
      })),
      {
        businessId: upgrade.businessId,
        multiplier: upgrade.multiplier,
      },
    ];

    const newIncomePerSecond = calculateTotalIncomePerSecond(
      user.businesses.map((ub) => ({
        businessId: ub.businessId,
        quantity: ub.quantity,
        baseIncome: ub.business.baseIncome,
      })),
      updatedUpgradeInputs,
      user.prestigeMultiplier
    );

    const newBalance = availableBalance
      .minus(upgrade.cost)
      .toDecimalPlaces(2, Prisma.Decimal.ROUND_DOWN);

    const updatedUser = await tx.user.update({
      where: { id: userId },
      data: {
        balance: newBalance,
        lifetimeEarnings: updatedLifetimeEarnings,
        incomePerSecond: newIncomePerSecond,
        lastSyncedAt: now,
      },
    });

    const rebirthPreview = calculateRebirthPreview(
      updatedUser.lifetimeEarnings,
      updatedUser.prestigeMultiplier
    );

    return {
      purchased: {
        upgradeSlug: upgrade.slug,
        upgradeName: upgrade.name,
        cost: upgrade.cost.toFixed(2),
        multiplier: upgrade.multiplier.toFixed(2),
      },
      economy: {
        offlineEarned: offlineEarned.toFixed(2),
        balance: updatedUser.balance.toFixed(2),
        lifetimeEarnings: updatedUser.lifetimeEarnings.toFixed(2),
        incomePerSecond: updatedUser.incomePerSecond.toFixed(2),
        lastSyncedAt: updatedUser.lastSyncedAt.toISOString(),
      },
      rebirthPreview: {
        canRebirth: rebirthPreview.canRebirth,
        multiplierGained: rebirthPreview.multiplierGained.toFixed(2),
        newTotalMultiplier: rebirthPreview.newTotalMultiplier.toFixed(2),
        nextThresholdEarnings: rebirthPreview.nextThresholdEarnings.toFixed(2),
      },
    };
  });
}

/**
 * Executa o Rebirth em uma única transação atômica com Row-Level Lock:
 * - Zera negócios e upgrades do ciclo atual
 * - Reinicia o saldo para $10.00 e renda/seg para $0.00
 * - Aplica o novo prestigeMultiplier permanente
 * - Grava log imutável na tabela rebirth_histories
 */
export async function performRebirth(userId: string) {
  const rebirthRecord = await prisma.$transaction(async (tx) => {
    const lockedUser = await tx.$queryRaw<Array<{ id: string }>>`
      SELECT id FROM "users" WHERE id = ${userId} FOR UPDATE
    `;

    if (lockedUser.length === 0) {
      throw new AppError('Jogador não encontrado.', 404);
    }

    const user = await tx.user.findUniqueOrThrow({
      where: { id: userId },
    });

    const now = new Date();
    const offlineEarned = calculateOfflineEarnings(
      user.incomePerSecond,
      user.lastSyncedAt,
      now
    );

    const finalLifetimeEarnings = user.lifetimeEarnings.plus(offlineEarned);
    const preview = calculateRebirthPreview(
      finalLifetimeEarnings,
      user.prestigeMultiplier
    );

    if (!preview.canRebirth) {
      throw new AppError(
        `Rebirth indisponível. Acumule pelo menos $${preview.nextThresholdEarnings.toFixed(2)} em ganhos totais para desbloquear +0.50x de prestígio.`,
        400
      );
    }

    const nextRebirthNumber = user.rebirthCount + 1;

    await tx.userBusiness.deleteMany({ where: { userId } });
    await tx.userUpgrade.deleteMany({ where: { userId } });

    const historyEntry = await tx.rebirthHistory.create({
      data: {
        userId,
        rebirthNumber: nextRebirthNumber,
        earningsAtRebirth: finalLifetimeEarnings,
        multiplierGained: preview.multiplierGained,
        newTotalMultiplier: preview.newTotalMultiplier,
      },
    });

    await tx.user.update({
      where: { id: userId },
      data: {
        balance: INITIAL_BALANCE_AFTER_REBIRTH,
        lifetimeEarnings: finalLifetimeEarnings,
        incomePerSecond: '0.00',
        prestigeMultiplier: preview.newTotalMultiplier,
        rebirthCount: nextRebirthNumber,
        lastSyncedAt: now,
      },
    });

    return {
      id: historyEntry.id,
      rebirthNumber: historyEntry.rebirthNumber,
      earningsAtRebirth: historyEntry.earningsAtRebirth.toFixed(2),
      multiplierGained: historyEntry.multiplierGained.toFixed(2),
      newTotalMultiplier: historyEntry.newTotalMultiplier.toFixed(2),
      createdAt: historyEntry.createdAt.toISOString(),
    };
  });

  const state = await getGameState(userId);

  return {
    rebirthRecord,
    state,
  };
}