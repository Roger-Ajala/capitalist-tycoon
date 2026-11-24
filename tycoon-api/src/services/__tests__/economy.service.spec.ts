import { describe, expect, it } from 'vitest';
import { Prisma } from '@prisma/client';
import {
  calculateBusinessPurchaseCost,
  calculateOfflineEarnings,
  calculateRebirthPreview,
  calculateTotalIncomePerSecond,
} from '../economy.service';

describe('economy.service (Testes Unitários)', () => {
  describe('calculateOfflineEarnings (Lazy Evaluation)', () => {
    it('calcula ganhos offline exatos com base na diferença de timestamps', () => {
      const income = new Prisma.Decimal('15.50');
      const lastSyncedAt = new Date('2026-11-24T10:00:00.000Z');
      const now = new Date('2026-11-24T10:01:00.000Z'); // 60 segundos depois

      const earned = calculateOfflineEarnings(income, lastSyncedAt, now);

      expect(earned.toFixed(2)).toBe('930.00');
    });

    it('arredonda ganhos para baixo (ROUND_DOWN) para impedir exploit de centavos', () => {
      const income = new Prisma.Decimal('1.00');
      const lastSyncedAt = new Date('2026-11-24T10:00:00.000Z');
      const now = new Date('2026-11-24T10:00:00.339Z'); // 0.339 segundos

      const earned = calculateOfflineEarnings(income, lastSyncedAt, now);

      expect(earned.toFixed(2)).toBe('0.33');
    });

    it('retorna 0.00 em caso de desvio negativo de relógio (now < lastSyncedAt)', () => {
      const income = new Prisma.Decimal('100.00');
      const lastSyncedAt = new Date('2026-11-24T10:05:00.000Z');
      const now = new Date('2026-11-24T10:00:00.000Z');

      const earned = calculateOfflineEarnings(income, lastSyncedAt, now);

      expect(earned.toFixed(2)).toBe('0.00');
    });
  });

  describe('calculateBusinessPurchaseCost (Progressão Geométrica O(1))', () => {
    const baseCost = new Prisma.Decimal('4.00');
    const multiplier = new Prisma.Decimal('1.0700');

    it('calcula corretamente o custo de 1, 2, 5 e 10 unidades com ROUND_UP', () => {
      const cost1 = calculateBusinessPurchaseCost(baseCost, multiplier, 0, 1);
      const cost2 = calculateBusinessPurchaseCost(baseCost, multiplier, 0, 2);
      const cost5 = calculateBusinessPurchaseCost(baseCost, multiplier, 0, 5);
      const cost10 = calculateBusinessPurchaseCost(baseCost, multiplier, 0, 10);

      expect(cost1.toFixed(2)).toBe('4.00');
      expect(cost2.toFixed(2)).toBe('8.28');
      expect(cost5.toFixed(2)).toBe('23.01');
      expect(cost10.toFixed(2)).toBe('55.27');
    });

    it('rejeita quantidades inválidas (zero, negativo ou decimal)', () => {
      expect(() =>
        calculateBusinessPurchaseCost(baseCost, multiplier, 0, 0)
      ).toThrow();
      expect(() =>
        calculateBusinessPurchaseCost(baseCost, multiplier, 0, -5)
      ).toThrow();
      expect(() =>
        calculateBusinessPurchaseCost(baseCost, multiplier, 0, 1.5)
      ).toThrow();
    });
  });

  describe('calculateTotalIncomePerSecond', () => {
    it('combina negócios, upgrades específicos, upgrades globais e prestígio', () => {
      const ownedBusinesses = [
        { businessId: 1, quantity: 10, baseIncome: new Prisma.Decimal('1.00') }, // 10
        { businessId: 2, quantity: 2, baseIncome: new Prisma.Decimal('15.00') }, // 30
      ];

      const ownedUpgrades = [
        { businessId: 1, multiplier: new Prisma.Decimal('3.00') }, // 10 * 3 = 30
        { businessId: null, multiplier: new Prisma.Decimal('2.00') }, // global 2x
      ];

      const prestige = new Prisma.Decimal('1.5000');

      // ((10 * 3) + 30) * 2 * 1.5 = 60 * 3 = 180.00
      const total = calculateTotalIncomePerSecond(
        ownedBusinesses,
        ownedUpgrades,
        prestige
      );

      expect(total.toFixed(2)).toBe('180.00');
    });
  });

  describe('calculateRebirthPreview', () => {
    it('mantém o Rebirth bloqueado abaixo de $10.000 acumulados', () => {
      const preview = calculateRebirthPreview(
        new Prisma.Decimal('9999.99'),
        new Prisma.Decimal('1.0000')
      );

      expect(preview.canRebirth).toBe(false);
      expect(preview.nextThresholdEarnings.toFixed(2)).toBe('10000.00');
    });

    it('libera +0.50x ao atingir exatamente $10.000 no primeiro ciclo', () => {
      const preview = calculateRebirthPreview(
        new Prisma.Decimal('10000.00'),
        new Prisma.Decimal('1.0000')
      );

      expect(preview.canRebirth).toBe(true);
      expect(preview.multiplierGained.toFixed(2)).toBe('0.50');
      expect(preview.newTotalMultiplier.toFixed(4)).toBe('1.5000');
    });

    it('bloqueia reset infinito logo após o primeiro Rebirth e exige $40.000 para o próximo', () => {
      const preview = calculateRebirthPreview(
        new Prisma.Decimal('10000.00'),
        new Prisma.Decimal('1.5000')
      );

      expect(preview.canRebirth).toBe(false);
      expect(preview.multiplierGained.toFixed(2)).toBe('0.00');
      expect(preview.nextThresholdEarnings.toFixed(2)).toBe('40000.00');
    });
  });
});