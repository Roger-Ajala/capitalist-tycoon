import { useEffect, useRef, useState } from 'react';
import axios from 'axios';
import {
  api,
  bootstrapSession,
  resetSessionBoot,
  SESSION_TOKEN_KEY,
} from './services/api';
import type {
  BusinessItem,
  BuyAmount,
  BuyBusinessResponse,
  BuyUpgradeResponse,
  GameStateResponse,
  PlayerState,
  RebirthResponse,
  RebirthState,
  UpgradeItem,
} from './types/game';
import { formatMoney } from './utils/format';

type ActiveTab = 'businesses' | 'upgrades' | 'rebirth';
const BUY_AMOUNTS: BuyAmount[] = [1, 5, 10];

export function App() {
  const [activeTab, setActiveTab] = useState<ActiveTab>('businesses');
  const [player, setPlayer] = useState<PlayerState | null>(null);
  const [businesses, setBusinesses] = useState<BusinessItem[]>([]);
  const [upgrades, setUpgrades] = useState<UpgradeItem[]>([]);
  const [rebirth, setRebirth] = useState<RebirthState | null>(null);

  const [displayBalance, setDisplayBalance] = useState<number>(0);
  const [displayLifetime, setDisplayLifetime] = useState<number>(0);
  const [buyAmount, setBuyAmount] = useState<BuyAmount>(1);

  const [statusBanner, setStatusBanner] = useState<string | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [syncing, setSyncing] = useState<boolean>(false);
  const [buyingSlug, setBuyingSlug] = useState<string | null>(null);
  const [buyingUpgradeSlug, setBuyingUpgradeSlug] = useState<string | null>(null);
  const [rebirthing, setRebirthing] = useState<boolean>(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const syncedAtClientMsRef = useRef<number>(performance.now());
  const serverBalanceRef = useRef<number>(0);
  const serverLifetimeRef = useRef<number>(0);
  const incomePerSecondRef = useRef<number>(0);

  function applyAuthoritativeSnapshot(
    balanceStr: string,
    lifetimeStr: string,
    incomePerSecondStr: string
  ) {
    const parsedBalance = Number(balanceStr);
    const parsedLifetime = Number(lifetimeStr);
    const parsedIncome = Number(incomePerSecondStr);

    serverBalanceRef.current = parsedBalance;
    serverLifetimeRef.current = parsedLifetime;
    incomePerSecondRef.current = parsedIncome;
    syncedAtClientMsRef.current = performance.now();

    setDisplayBalance(parsedBalance);
    setDisplayLifetime(parsedLifetime);
  }

  function applyFullState(data: GameStateResponse) {
    setPlayer(data.player);
    setBusinesses(data.businesses);
    setUpgrades(data.upgrades);
    setRebirth(data.rebirth);
    applyAuthoritativeSnapshot(
      data.player.balance,
      data.player.lifetimeEarnings,
      data.player.incomePerSecond
    );
  }

  useEffect(() => {
    let active = true;

    async function loadGame() {
      try {
        setLoading(true);
        setErrorMessage(null);

        const data = await bootstrapSession();
        if (!active) return;

        applyFullState(data);

        const offlineValue = Number(data.player.offlineEarned);
        if (!data.isNewSession && offlineValue > 0) {
          setStatusBanner(
            `GANHOS OFFLINE CREDITADOS PELO SERVIDOR: +${formatMoney(data.player.offlineEarned)}`
          );
        }
      } catch (err) {
        if (!active) return;
        setErrorMessage(
          'Não foi possível conectar na tycoon-api em http://localhost:3333. Verifique se o back-end está rodando.'
        );
        console.error(err);
      } finally {
        if (active) setLoading(false);
      }
    }

    loadGame();

    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    let frameId = 0;

    function tick(now: number) {
      const rate = incomePerSecondRef.current;

      if (rate > 0) {
        const elapsedSeconds = Math.max(
          0,
          (now - syncedAtClientMsRef.current) / 1000
        );
        const earned = rate * elapsedSeconds;
        setDisplayBalance(serverBalanceRef.current + earned);
        setDisplayLifetime(serverLifetimeRef.current + earned);
      }

      frameId = requestAnimationFrame(tick);
    }

    frameId = requestAnimationFrame(tick);

    return () => cancelAnimationFrame(frameId);
  }, []);

  async function handleBuyBusiness(slug: string) {
    if (buyingSlug) return;

    try {
      setBuyingSlug(slug);
      setErrorMessage(null);

      const { data } = await api.post<BuyBusinessResponse>(
        '/game/businesses/buy',
        {
          businessSlug: slug,
          amount: buyAmount,
        }
      );

      applyAuthoritativeSnapshot(
        data.economy.balance,
        data.economy.lifetimeEarnings,
        data.economy.incomePerSecond
      );

      setPlayer((prev) =>
        prev
          ? {
              ...prev,
              balance: data.economy.balance,
              lifetimeEarnings: data.economy.lifetimeEarnings,
              incomePerSecond: data.economy.incomePerSecond,
              lastSyncedAt: data.economy.lastSyncedAt,
            }
          : prev
      );

      setBusinesses((prev) =>
        prev.map((item) =>
          item.slug === data.purchased.businessSlug
            ? {
                ...item,
                quantity: data.purchased.newQuantity,
                nextUnitCost: data.purchased.nextUnitCost,
                costs: data.purchased.costs,
              }
            : item
        )
      );

      setRebirth((prev) =>
        prev ? { ...prev, ...data.rebirthPreview } : prev
      );
    } catch (err) {
      if (axios.isAxiosError(err) && err.response?.data?.error) {
        setErrorMessage(err.response.data.error);
      } else {
        setErrorMessage('Falha ao processar a compra no servidor.');
      }
    } finally {
      setBuyingSlug(null);
    }
  }

  async function handleBuyUpgrade(slug: string) {
    if (buyingUpgradeSlug) return;

    try {
      setBuyingUpgradeSlug(slug);
      setErrorMessage(null);

      const { data } = await api.post<BuyUpgradeResponse>(
        '/game/upgrades/buy',
        { upgradeSlug: slug }
      );

      applyAuthoritativeSnapshot(
        data.economy.balance,
        data.economy.lifetimeEarnings,
        data.economy.incomePerSecond
      );

      setPlayer((prev) =>
        prev
          ? {
              ...prev,
              balance: data.economy.balance,
              lifetimeEarnings: data.economy.lifetimeEarnings,
              incomePerSecond: data.economy.incomePerSecond,
              lastSyncedAt: data.economy.lastSyncedAt,
            }
          : prev
      );

      setUpgrades((prev) =>
        prev.map((item) =>
          item.slug === data.purchased.upgradeSlug
            ? { ...item, purchased: true }
            : item
        )
      );

      setRebirth((prev) =>
        prev ? { ...prev, ...data.rebirthPreview } : prev
      );
    } catch (err) {
      if (axios.isAxiosError(err) && err.response?.data?.error) {
        setErrorMessage(err.response.data.error);
      } else {
        setErrorMessage('Falha ao comprar upgrade no servidor.');
      }
    } finally {
      setBuyingUpgradeSlug(null);
    }
  }

  async function handleRebirth() {
    if (rebirthing) return;

    try {
      setRebirthing(true);
      setErrorMessage(null);

      const { data } = await api.post<RebirthResponse>('/game/rebirth');
      applyFullState(data.state);
      setActiveTab('businesses');
      setStatusBanner(
        `REBIRTH #${data.rebirthRecord.rebirthNumber} CONCLUÍDO: +${data.rebirthRecord.multiplierGained}x PERMANENTE (TOTAL ${data.rebirthRecord.newTotalMultiplier}x)`
      );
    } catch (err) {
      if (axios.isAxiosError(err) && err.response?.data?.error) {
        setErrorMessage(err.response.data.error);
      } else {
        setErrorMessage('Falha ao executar o Rebirth no servidor.');
      }
    } finally {
      setRebirthing(false);
    }
  }

  async function handleManualSync() {
    if (syncing) return;

    try {
      setSyncing(true);
      setErrorMessage(null);

      const { data } = await api.get<GameStateResponse>('/game/state');
      applyFullState(data);
    } catch {
      setErrorMessage('Erro ao sincronizar estado com a API.');
    } finally {
      setSyncing(false);
    }
  }

  function handleResetLocalSave() {
    localStorage.removeItem(SESSION_TOKEN_KEY);
    resetSessionBoot();
    window.location.reload();
  }

  // Indicadores visuais em tempo real (validação final sempre no servidor)
  const affordableUpgradesCount = upgrades.filter(
    (u) => !u.purchased && displayBalance >= Number(u.cost)
  ).length;

  const currentPrestige = Number(player?.prestigeMultiplier ?? 1);
  const nextThreshold = Number(rebirth?.nextThresholdEarnings ?? 10000);
  const liveCanRebirth =
    Boolean(rebirth?.canRebirth) || displayLifetime >= nextThreshold;
  const rebirthProgressPct = Math.min(
    100,
    nextThreshold > 0 ? (displayLifetime / nextThreshold) * 100 : 0
  );

  // Preview instantâneo do ganho de prestígio para o botão acompanhar o displayLifetime
  const liveTargetMult =
    Math.floor((1 + Math.sqrt(Math.max(0, displayLifetime) / 10000) * 0.5) * 100) /
    100;
  const liveGainPreview = Math.max(0, liveTargetMult - currentPrestige);

  if (loading) {
    return (
      <main className="min-h-screen flex items-center justify-center p-6">
        <p className="text-sm text-zinc-400 tracking-widest uppercase">
          [ Conectando ao servidor e carregando save... ]
        </p>
      </main>
    );
  }

  return (
    <main className="min-h-screen max-w-3xl mx-auto px-4 py-8 space-y-6">
      {/* Cabeçalho Minimalista */}
      <header className="border border-zinc-800 bg-zinc-900/60 p-5 flex flex-col sm:flex-row sm:items-end sm:justify-between gap-4">
        <div>
          <p className="text-xs uppercase tracking-widest text-zinc-500">
            CAPITALIST TYCOON // {player?.username ?? 'OFFLINE'}
          </p>
          <h1 className="text-4xl font-bold text-emerald-400 tabular-nums mt-1">
            {formatMoney(displayBalance)}
          </h1>
          <div className="flex flex-wrap gap-x-5 gap-y-1 mt-2 text-xs text-zinc-400 tabular-nums">
            <span>
              RENDA:{' '}
              <strong className="text-zinc-100">
                +{formatMoney(player?.incomePerSecond ?? '0')}/s
              </strong>
            </span>
            <span>
              PRESTÍGIO:{' '}
              <strong className="text-amber-400">
                {currentPrestige.toFixed(2)}x
              </strong>
            </span>
            <span>
              REBIRTHS:{' '}
              <strong className="text-zinc-100">
                {player?.rebirthCount ?? 0}
              </strong>
            </span>
          </div>
        </div>

        <div className="flex gap-2">
          <button
            type="button"
            onClick={handleManualSync}
            disabled={syncing}
            className="px-3 py-1.5 text-xs uppercase tracking-wider border border-zinc-700 hover:border-zinc-500 text-zinc-200 cursor-pointer disabled:opacity-50"
          >
            {syncing ? 'Sincronizando...' : 'Sincronizar'}
          </button>
          <button
            type="button"
            onClick={handleResetLocalSave}
            className="px-3 py-1.5 text-xs uppercase tracking-wider border border-zinc-800 hover:border-red-500/60 text-zinc-400 hover:text-red-400 cursor-pointer"
          >
            Novo Save
          </button>
        </div>
      </header>

      {/* Banner de Status (Offline / Rebirth) */}
      {statusBanner && (
        <section className="border border-emerald-500/40 bg-emerald-950/30 px-4 py-3 flex items-center justify-between text-xs gap-4">
          <span className="text-emerald-300 tabular-nums">{statusBanner}</span>
          <button
            type="button"
            onClick={() => setStatusBanner(null)}
            className="text-emerald-400 hover:text-emerald-200 uppercase cursor-pointer shrink-0"
          >
            [OK]
          </button>
        </section>
      )}

      {errorMessage && (
        <section className="border border-red-500/50 bg-red-950/30 px-4 py-3 text-xs text-red-300">
          ERRO: {errorMessage}
        </section>
      )}

      {/* Navegação por Abas */}
      <nav className="grid grid-cols-3 border border-zinc-800 bg-zinc-900/40 text-xs uppercase tracking-widest">
        <button
          type="button"
          onClick={() => setActiveTab('businesses')}
          className={`py-3 font-bold cursor-pointer border-r border-zinc-800 transition-colors ${
            activeTab === 'businesses'
              ? 'bg-zinc-100 text-zinc-950'
              : 'text-zinc-400 hover:text-zinc-100'
          }`}
        >
          Negócios
        </button>

        <button
          type="button"
          onClick={() => setActiveTab('upgrades')}
          className={`py-3 font-bold cursor-pointer border-r border-zinc-800 transition-colors flex items-center justify-center gap-2 ${
            activeTab === 'upgrades'
              ? 'bg-zinc-100 text-zinc-950'
              : 'text-zinc-400 hover:text-zinc-100'
          }`}
        >
          <span>Upgrades</span>
          {affordableUpgradesCount > 0 && (
            <span className="px-1.5 py-0.5 text-[10px] bg-emerald-500 text-zinc-950 tabular-nums">
              {affordableUpgradesCount}
            </span>
          )}
        </button>

        <button
          type="button"
          onClick={() => setActiveTab('rebirth')}
          className={`py-3 font-bold cursor-pointer transition-colors flex items-center justify-center gap-2 ${
            activeTab === 'rebirth'
              ? 'bg-amber-400 text-zinc-950'
              : liveCanRebirth
                ? 'text-amber-400 hover:bg-amber-500/10'
                : 'text-zinc-400 hover:text-zinc-100'
          }`}
        >
          <span>Rebirth</span>
          {liveCanRebirth && (
            <span className="px-1.5 py-0.5 text-[10px] bg-amber-400 text-zinc-950">
              PRONTO
            </span>
          )}
        </button>
      </nav>

      {/* ABA 1: NEGÓCIOS */}
      {activeTab === 'businesses' && (
        <section className="space-y-2">
          <div className="flex items-center justify-between text-xs uppercase tracking-widest text-zinc-500 px-1">
            <span>Operações Disponíveis</span>

            <div className="flex items-center gap-1">
              <span className="mr-2 text-[11px] text-zinc-500">LOTE:</span>
              {BUY_AMOUNTS.map((amount) => {
                const isSelected = buyAmount === amount;
                return (
                  <button
                    key={amount}
                    type="button"
                    onClick={() => setBuyAmount(amount)}
                    className={`px-2.5 py-1 text-xs font-bold border tabular-nums cursor-pointer transition-colors ${
                      isSelected
                        ? 'border-emerald-500 bg-emerald-500 text-zinc-950'
                        : 'border-zinc-800 bg-zinc-900 text-zinc-400 hover:border-zinc-600 hover:text-zinc-200'
                    }`}
                  >
                    {amount}x
                  </button>
                );
              })}
            </div>
          </div>

          <div className="divide-y divide-zinc-800 border border-zinc-800 bg-zinc-900/30">
            {businesses.map((business) => {
              const currentCostStr = business.costs[buyAmount];
              const cost = Number(currentCostStr);
              const canAfford = displayBalance >= cost;
              const isBuying = buyingSlug === business.slug;
              const totalBaseOutput =
                Number(business.baseIncome) * business.quantity;

              return (
                <div
                  key={business.slug}
                  className="p-4 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3"
                >
                  <div className="space-y-1">
                    <div className="flex items-center gap-3">
                      <span className="text-xs px-2 py-0.5 bg-zinc-800 text-zinc-200 tabular-nums">
                        x{business.quantity}
                      </span>
                      <h2 className="font-semibold text-zinc-100">
                        {business.name}
                      </h2>
                    </div>

                    <p className="text-xs text-zinc-400 tabular-nums">
                      Base: +{formatMoney(business.baseIncome)}/s por unidade
                      {business.quantity > 0 && (
                        <span className="text-zinc-500">
                          {' '}
                          • Subtotal base: +{formatMoney(totalBaseOutput)}/s
                        </span>
                      )}
                    </p>
                  </div>

                  <button
                    type="button"
                    onClick={() => handleBuyBusiness(business.slug)}
                    disabled={!canAfford || isBuying}
                    className={`min-w-[195px] px-4 py-2 text-xs font-bold uppercase tracking-wider border tabular-nums transition-colors ${
                      canAfford
                        ? 'border-emerald-500 bg-emerald-500/15 text-emerald-300 hover:bg-emerald-500 hover:text-zinc-950 cursor-pointer'
                        : 'border-zinc-800 bg-zinc-900 text-zinc-600 cursor-not-allowed'
                    }`}
                  >
                    {isBuying
                      ? 'Processando...'
                      : `Comprar ${buyAmount}x • ${formatMoney(currentCostStr)}`}
                  </button>
                </div>
              );
            })}
          </div>
        </section>
      )}

      {/* ABA 2: UPGRADES */}
      {activeTab === 'upgrades' && (
        <section className="space-y-2">
          <div className="flex items-center justify-between text-xs uppercase tracking-widest text-zinc-500 px-1">
            <span>Multiplicadores do Ciclo Atual</span>
            <span className="tabular-nums">
              {upgrades.filter((u) => u.purchased).length}/{upgrades.length}{' '}
              ATIVOS
            </span>
          </div>

          <div className="divide-y divide-zinc-800 border border-zinc-800 bg-zinc-900/30">
            {upgrades.map((upgrade) => {
              const cost = Number(upgrade.cost);
              const canAfford = !upgrade.purchased && displayBalance >= cost;
              const isBuying = buyingUpgradeSlug === upgrade.slug;

              return (
                <div
                  key={upgrade.slug}
                  className={`p-4 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 ${
                    upgrade.purchased ? 'opacity-60' : ''
                  }`}
                >
                  <div className="space-y-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-xs px-2 py-0.5 bg-zinc-800 text-amber-300 font-bold tabular-nums">
                        {Number(upgrade.multiplier).toFixed(0)}x
                      </span>
                      <h2 className="font-semibold text-zinc-100">
                        {upgrade.name}
                      </h2>
                      <span className="text-[11px] uppercase px-1.5 py-0.5 border border-zinc-800 text-zinc-400">
                        {upgrade.businessName}
                      </span>
                    </div>
                    <p className="text-xs text-zinc-400">
                      {upgrade.description}
                    </p>
                  </div>

                  {upgrade.purchased ? (
                    <span className="min-w-[180px] text-center px-4 py-2 text-xs font-bold uppercase tracking-wider border border-zinc-800 text-emerald-400">
                      [ COMPRADO ]
                    </span>
                  ) : (
                    <button
                      type="button"
                      onClick={() => handleBuyUpgrade(upgrade.slug)}
                      disabled={!canAfford || isBuying}
                      className={`min-w-[180px] px-4 py-2 text-xs font-bold uppercase tracking-wider border tabular-nums transition-colors ${
                        canAfford
                          ? 'border-emerald-500 bg-emerald-500/15 text-emerald-300 hover:bg-emerald-500 hover:text-zinc-950 cursor-pointer'
                          : 'border-zinc-800 bg-zinc-900 text-zinc-600 cursor-not-allowed'
                      }`}
                    >
                      {isBuying
                        ? 'Processando...'
                        : `Ativar • ${formatMoney(upgrade.cost)}`}
                    </button>
                  )}
                </div>
              );
            })}
          </div>
        </section>
      )}

      {/* ABA 3: REBIRTH E HISTÓRICO DE AUDITORIA */}
      {activeTab === 'rebirth' && (
        <section className="space-y-4">
          <div className="border border-amber-500/40 bg-zinc-900/50 p-5 space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
              <div>
                <p className="text-xs uppercase tracking-widest text-amber-400">
                  Sistema de Prestígio (Transação Atômica)
                </p>
                <h2 className="text-lg font-bold text-zinc-100 mt-1">
                  Reiniciar império por multiplicador permanente
                </h2>
              </div>
              <div className="text-right tabular-nums">
                <p className="text-xs text-zinc-400">ATUAL</p>
                <p className="text-xl font-bold text-amber-400">
                  {currentPrestige.toFixed(2)}x
                </p>
              </div>
            </div>

            <p className="text-xs text-zinc-400 leading-relaxed">
              Ao executar o Rebirth, seus negócios e upgrades do ciclo atual são
              zerados e seu saldo volta para <strong>$ 10.00</strong>. Em troca,
              você ganha um multiplicador permanente aplicado a toda a sua renda
              futura e o evento é registrado no log de auditoria do banco.
            </p>

            {/* Barra de progresso até o próximo marco */}
            <div className="space-y-1.5">
              <div className="flex justify-between text-xs tabular-nums">
                <span className="text-zinc-400">
                  ACUMULADO: {formatMoney(displayLifetime)}
                </span>
                <span className="text-zinc-300">
                  META: {formatMoney(nextThreshold)} (
                  {rebirthProgressPct.toFixed(0)}%)
                </span>
              </div>
              <div className="h-2 w-full bg-zinc-800 overflow-hidden">
                <div
                  className="h-full bg-amber-400 transition-all duration-150"
                  style={{ width: `${rebirthProgressPct}%` }}
                />
              </div>
            </div>

            <div className="pt-2 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 border-t border-zinc-800">
              <div className="text-xs tabular-nums">
                {liveCanRebirth ? (
                  <span className="text-amber-300">
                    GANHO IMEDIATO:{' '}
                    <strong>+{liveGainPreview.toFixed(2)}x</strong> (novo total:{' '}
                    <strong>{liveTargetMult.toFixed(2)}x</strong>)
                  </span>
                ) : (
                  <span className="text-zinc-500">
                    Faltam{' '}
                    {formatMoney(Math.max(0, nextThreshold - displayLifetime))}{' '}
                    em ganhos acumulados para liberar +0.50x.
                  </span>
                )}
              </div>

              <button
                type="button"
                onClick={handleRebirth}
                disabled={!liveCanRebirth || rebirthing}
                className={`px-5 py-2.5 text-xs font-bold uppercase tracking-wider border tabular-nums transition-colors ${
                  liveCanRebirth
                    ? 'border-amber-400 bg-amber-400 text-zinc-950 hover:bg-amber-300 cursor-pointer'
                    : 'border-zinc-800 bg-zinc-900 text-zinc-600 cursor-not-allowed'
                }`}
              >
                {rebirthing
                  ? 'Executando Rebirth...'
                  : liveCanRebirth
                    ? `Executar Rebirth (+${liveGainPreview.toFixed(2)}x)`
                    : 'Rebirth Bloqueado'}
              </button>
            </div>
          </div>

          {/* Tabela de Auditoria (rebirth_histories) */}
          <div className="space-y-2">
            <p className="text-xs uppercase tracking-widest text-zinc-500 px-1">
              Histórico de Rebirths (Auditoria PostgreSQL)
            </p>

            {!rebirth?.history.length ? (
              <div className="border border-zinc-800 bg-zinc-900/20 p-4 text-xs text-zinc-500">
                Nenhum Rebirth registrado ainda.
              </div>
            ) : (
              <div className="border border-zinc-800 bg-zinc-900/30 overflow-x-auto">
                <table className="w-full text-left text-xs tabular-nums">
                  <thead className="border-b border-zinc-800 text-zinc-500 uppercase">
                    <tr>
                      <th className="py-2.5 px-3">#</th>
                      <th className="py-2.5 px-3">Ganhos no Reset</th>
                      <th className="py-2.5 px-3">Bônus</th>
                      <th className="py-2.5 px-3">Total</th>
                      <th className="py-2.5 px-3">Data</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-zinc-800/70 text-zinc-300">
                    {rebirth.history.map((entry) => (
                      <tr key={entry.id}>
                        <td className="py-2.5 px-3 font-bold text-amber-400">
                          #{entry.rebirthNumber}
                        </td>
                        <td className="py-2.5 px-3">
                          {formatMoney(entry.earningsAtRebirth)}
                        </td>
                        <td className="py-2.5 px-3 text-emerald-400">
                          +{entry.multiplierGained}x
                        </td>
                        <td className="py-2.5 px-3 font-semibold">
                          {entry.newTotalMultiplier}x
                        </td>
                        <td className="py-2.5 px-3 text-zinc-500">
                          {new Date(entry.createdAt).toLocaleString('pt-BR')}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </section>
      )}

      <footer className="text-[11px] text-zinc-600 flex justify-between pt-2 tabular-nums">
        <span>SAVE PERSISTIDO NO POSTGRESQL VIA SESSION TOKEN</span>
        <span>TOTAL ACUMULADO: {formatMoney(displayLifetime)}</span>
      </footer>
    </main>
  );
}

export default App;