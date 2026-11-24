import { Prisma } from '@prisma/client';

export interface OwnedBusinessInput {
  businessId: number;
  quantity: number;
  baseIncome: Prisma.Decimal;
}

export interface OwnedUpgradeInput {
  businessId: number | null;
  multiplier: Prisma.Decimal;
}

export interface RebirthPreview {
  canRebirth: boolean;
  multiplierGained: Prisma.Decimal;
  newTotalMultiplier: Prisma.Decimal;
  nextThresholdEarnings: Prisma.Decimal;
}

const REBIRTH_BASE_DIVISOR = new Prisma.Decimal('10000');
const REBIRTH_STEP_BONUS = new Prisma.Decimal('0.50');
const MIN_REBIRTH_GAIN = new Prisma.Decimal('0.50');

export function calculateOfflineEarnings(
  incomePerSecond: Prisma.Decimal,
  lastSyncedAt: Date,
  now: Date = new Date()
): Prisma.Decimal {
  if (incomePerSecond.lessThanOrEqualTo(0)) {
    return new Prisma.Decimal(0);
  }

  const elapsedMs = Math.max(0, now.getTime() - lastSyncedAt.getTime());
  const elapsedSeconds = new Prisma.Decimal(elapsedMs).div(1000);

  return incomePerSecond
    .times(elapsedSeconds)
    .toDecimalPlaces(2, Prisma.Decimal.ROUND_DOWN);
}

export function calculateBusinessPurchaseCost(
  baseCost: Prisma.Decimal,
  costMultiplier: Prisma.Decimal,
  currentQuantity: number,
  amount: number
): Prisma.Decimal {
  if (!Number.isInteger(amount) || amount < 1) {
    throw new Error('A quantidade de compra deve ser um número inteiro positivo.');
  }

  if (costMultiplier.equals(1)) {
    return baseCost.times(amount).toDecimalPlaces(2, Prisma.Decimal.ROUND_UP);
  }

  const firstUnitCost = baseCost.times(costMultiplier.pow(currentQuantity));
  const numerator = costMultiplier.pow(amount).minus(1);
  const denominator = costMultiplier.minus(1);

  return firstUnitCost
    .times(numerator)
    .div(denominator)
    .toDecimalPlaces(2, Prisma.Decimal.ROUND_UP);
}

export function calculateTotalIncomePerSecond(
  ownedBusinesses: OwnedBusinessInput[],
  ownedUpgrades: OwnedUpgradeInput[],
  prestigeMultiplier: Prisma.Decimal
): Prisma.Decimal {
  const globalMultiplier = ownedUpgrades
    .filter((upgrade) => upgrade.businessId === null)
    .reduce((acc, upgrade) => acc.times(upgrade.multiplier), new Prisma.Decimal(1));

  let baseTotalIncome = new Prisma.Decimal(0);

  for (const item of ownedBusinesses) {
    if (item.quantity <= 0) continue;

    const businessSpecificMultiplier = ownedUpgrades
      .filter((upgrade) => upgrade.businessId === item.businessId)
      .reduce((acc, upgrade) => acc.times(upgrade.multiplier), new Prisma.Decimal(1));

    const businessIncome = item.baseIncome
      .times(item.quantity)
      .times(businessSpecificMultiplier);

    baseTotalIncome = baseTotalIncome.plus(businessIncome);
  }

  return baseTotalIncome
    .times(globalMultiplier)
    .times(prestigeMultiplier)
    .toDecimalPlaces(2, Prisma.Decimal.ROUND_DOWN);
}

/**
 * Calcula quanto de multiplicador permanente o jogador ganha ao dar Rebirth agora
 * e qual o próximo marco de ganhos acumulados necessário para liberar um novo ciclo.
 */
export function calculateRebirthPreview(
  lifetimeEarnings: Prisma.Decimal,
  currentPrestigeMultiplier: Prisma.Decimal
): RebirthPreview {
  const safeEarnings = lifetimeEarnings.greaterThan(0)
    ? lifetimeEarnings
    : new Prisma.Decimal(0);

  const rawBonus = safeEarnings
    .div(REBIRTH_BASE_DIVISOR)
    .sqrt()
    .times(REBIRTH_STEP_BONUS);

  const targetTotalMultiplier = new Prisma.Decimal(1)
    .plus(rawBonus)
    .toDecimalPlaces(2, Prisma.Decimal.ROUND_DOWN);

  const rawGain = targetTotalMultiplier.minus(currentPrestigeMultiplier);
  const multiplierGained = rawGain.greaterThan(0)
    ? rawGain.toDecimalPlaces(2, Prisma.Decimal.ROUND_DOWN)
    : new Prisma.Decimal(0);

  const canRebirth = multiplierGained.greaterThanOrEqualTo(MIN_REBIRTH_GAIN);

  const newTotalMultiplier = canRebirth
    ? currentPrestigeMultiplier.plus(multiplierGained).toDecimalPlaces(4)
    : currentPrestigeMultiplier;

  // Calcula o lifetimeEarnings exato para destravar +0.50x acima do multiplicador atual
  const neededTotal = currentPrestigeMultiplier.plus(MIN_REBIRTH_GAIN);
  const neededRatio = neededTotal.minus(1).div(REBIRTH_STEP_BONUS);
  const nextThresholdEarnings = neededRatio
    .pow(2)
    .times(REBIRTH_BASE_DIVISOR)
    .toDecimalPlaces(2, Prisma.Decimal.ROUND_UP);

  return {
    canRebirth,
    multiplierGained,
    newTotalMultiplier,
    nextThresholdEarnings,
  };
}