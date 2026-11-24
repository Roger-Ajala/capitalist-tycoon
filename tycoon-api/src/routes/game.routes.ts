import { Router } from 'express';
import { AppError } from '../errors/AppError';
import { ensureSession } from '../middlewares/ensureSession';
import {
  buyBusiness,
  buyUpgrade,
  getGameState,
  performRebirth,
} from '../services/game.service';
import { initOrResumeSession } from '../services/session.service';

export const gameRoutes = Router();

gameRoutes.post('/session', async (req, res, next) => {
  try {
    const authHeader = req.headers.authorization;
    const existingToken = authHeader?.startsWith('Bearer ')
      ? authHeader.slice(7).trim()
      : undefined;

    const sessionData = await initOrResumeSession(existingToken);
    const statusCode = sessionData.isNewSession ? 201 : 200;

    return res.status(statusCode).json(sessionData);
  } catch (error) {
    return next(error);
  }
});

gameRoutes.use(ensureSession);

gameRoutes.get('/state', async (req, res, next) => {
  try {
    const state = await getGameState(req.userId!);
    return res.json(state);
  } catch (error) {
    return next(error);
  }
});

gameRoutes.post('/businesses/buy', async (req, res, next) => {
  try {
    const { businessSlug, amount = 1 } = req.body;

    if (!businessSlug || typeof businessSlug !== 'string') {
      throw new AppError('Informe um businessSlug válido.', 400);
    }

    const result = await buyBusiness({
      userId: req.userId!,
      businessSlug,
      amount: Number(amount),
    });

    return res.status(200).json(result);
  } catch (error) {
    return next(error);
  }
});

gameRoutes.post('/upgrades/buy', async (req, res, next) => {
  try {
    const { upgradeSlug } = req.body;

    if (!upgradeSlug || typeof upgradeSlug !== 'string') {
      throw new AppError('Informe um upgradeSlug válido.', 400);
    }

    const result = await buyUpgrade({
      userId: req.userId!,
      upgradeSlug,
    });

    return res.status(200).json(result);
  } catch (error) {
    return next(error);
  }
});

gameRoutes.post('/rebirth', async (req, res, next) => {
  try {
    const result = await performRebirth(req.userId!);
    return res.status(200).json(result);
  } catch (error) {
    return next(error);
  }
});