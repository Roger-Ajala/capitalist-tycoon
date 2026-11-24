import crypto from 'node:crypto';
import { prisma } from '../lib/prisma';
import { getGameState } from './game.service';

export async function initOrResumeSession(existingToken?: string) {
  // 1. Se o navegador já tem um token salvo, tenta carregar o save direto
  if (existingToken) {
    const existingUser = await prisma.user.findUnique({
      where: { sessionToken: existingToken },
      select: { id: true, sessionToken: true },
    });

    if (existingUser) {
      const state = await getGameState(existingUser.id);
      return {
        sessionToken: existingUser.sessionToken,
        isNewSession: false,
        ...state,
      };
    }
  }

  // 2. Primeiro acesso (ou save antigo inválido): cria jogador pronto para jogar
  const sessionToken = crypto.randomBytes(32).toString('hex');
  const randomSuffix = crypto.randomBytes(3).toString('hex').toUpperCase();
  const username = `Tycoon_${randomSuffix}`;

  const newUser = await prisma.user.create({
    data: {
      username,
      sessionToken,
      balance: '10.00',
      lifetimeEarnings: '10.00',
    },
    select: {
      id: true,
      sessionToken: true,
    },
  });

  const state = await getGameState(newUser.id);

  return {
    sessionToken: newUser.sessionToken,
    isNewSession: true,
    ...state,
  };
}