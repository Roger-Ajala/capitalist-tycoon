import { NextFunction, Request, Response } from 'express';
import { prisma } from '../lib/prisma';
import { AppError } from '../errors/AppError';

export async function ensureSession(
  req: Request,
  res: Response,
  next: NextFunction
) {
  try {
    const authHeader = req.headers.authorization;

    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      throw new AppError('Token de sessão não fornecido.', 401);
    }

    const sessionToken = authHeader.slice(7).trim();

    if (!sessionToken) {
      throw new AppError('Token de sessão inválido.', 401);
    }

    const user = await prisma.user.findUnique({
      where: { sessionToken },
      select: { id: true },
    });

    if (!user) {
      throw new AppError('Save não encontrado para este token.', 401);
    }

    req.userId = user.id;
    return next();
  } catch (error) {
    return next(error);
  }
}