-- CreateTable
CREATE TABLE "users" (
    "id" TEXT NOT NULL,
    "username" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "balance" DECIMAL(38,2) NOT NULL DEFAULT 0,
    "lifetimeEarnings" DECIMAL(38,2) NOT NULL DEFAULT 0,
    "incomePerSecond" DECIMAL(38,2) NOT NULL DEFAULT 0,
    "prestigeMultiplier" DECIMAL(18,4) NOT NULL DEFAULT 1,
    "rebirthCount" INTEGER NOT NULL DEFAULT 0,
    "lastSyncedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "businesses" (
    "id" SERIAL NOT NULL,
    "slug" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "baseCost" DECIMAL(38,2) NOT NULL,
    "costMultiplier" DECIMAL(10,4) NOT NULL,
    "baseIncome" DECIMAL(38,2) NOT NULL,
    "sortOrder" INTEGER NOT NULL,

    CONSTRAINT "businesses_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "user_businesses" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "businessId" INTEGER NOT NULL,
    "quantity" INTEGER NOT NULL DEFAULT 0,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "user_businesses_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "upgrades" (
    "id" SERIAL NOT NULL,
    "slug" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "cost" DECIMAL(38,2) NOT NULL,
    "multiplier" DECIMAL(10,2) NOT NULL,
    "businessId" INTEGER,

    CONSTRAINT "upgrades_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "user_upgrades" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "upgradeId" INTEGER NOT NULL,
    "purchasedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "user_upgrades_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "rebirth_histories" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "rebirthNumber" INTEGER NOT NULL,
    "earningsAtRebirth" DECIMAL(38,2) NOT NULL,
    "multiplierGained" DECIMAL(18,4) NOT NULL,
    "newTotalMultiplier" DECIMAL(18,4) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "rebirth_histories_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "users_username_key" ON "users"("username");

-- CreateIndex
CREATE UNIQUE INDEX "users_email_key" ON "users"("email");

-- CreateIndex
CREATE UNIQUE INDEX "businesses_slug_key" ON "businesses"("slug");

-- CreateIndex
CREATE UNIQUE INDEX "user_businesses_userId_businessId_key" ON "user_businesses"("userId", "businessId");

-- CreateIndex
CREATE UNIQUE INDEX "upgrades_slug_key" ON "upgrades"("slug");

-- CreateIndex
CREATE UNIQUE INDEX "user_upgrades_userId_upgradeId_key" ON "user_upgrades"("userId", "upgradeId");

-- CreateIndex
CREATE INDEX "rebirth_histories_userId_rebirthNumber_idx" ON "rebirth_histories"("userId", "rebirthNumber");

-- AddForeignKey
ALTER TABLE "user_businesses" ADD CONSTRAINT "user_businesses_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_businesses" ADD CONSTRAINT "user_businesses_businessId_fkey" FOREIGN KEY ("businessId") REFERENCES "businesses"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "upgrades" ADD CONSTRAINT "upgrades_businessId_fkey" FOREIGN KEY ("businessId") REFERENCES "businesses"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_upgrades" ADD CONSTRAINT "user_upgrades_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_upgrades" ADD CONSTRAINT "user_upgrades_upgradeId_fkey" FOREIGN KEY ("upgradeId") REFERENCES "upgrades"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "rebirth_histories" ADD CONSTRAINT "rebirth_histories_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
