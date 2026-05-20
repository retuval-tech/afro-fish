import { useState, useMemo } from "react";
import {
  useGetAdminPlayers, getGetAdminPlayersQueryKey,
  useCreatePlayer, useReloadPlayerCredits, useCashoutPlayer, useDeletePlayer, useResetPlayerPin,
  useRescuePlayer, useGetAdminSettings, getGetAdminSettingsQueryKey, useUpdateAdminSettings,
  useGetBonusConfig, getGetBonusConfigQueryKey,
} from "@workspace/api-client-react";
import { useAdminAuth } from "@/hooks/use-auth";
import { AdminLayout } from "@/components/AdminLayout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";
import { useToast } from "@/hooks/use-toast";
import { Loader2, Plus, Coins, ArrowUpFromLine, Trash2, Search, Users, TrendingUp, TrendingDown, Wallet, Crown, KeyRound, HeartHandshake, ShieldOff, ShieldCheck } from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";
import { format } from "date-fns";

function Avatar({ name, rank }: { name: string; rank: number }) {
  const colors = [
    ["#FFD60A", "#332500"], ["#C0C0C0", "#1A1A1A"], ["#CD7F32", "#2A1500"],
    ["#60A5FA", "#001533"], ["#34D399", "#003320"], ["#A78BFA", "#1A0033"],
    ["#F472B6", "#330020"], ["#FB923C", "#331500"],
  ];
  const [fg, bg] = colors[rank % colors.length];
  return (
    <div className="w-9 h-9 rounded-full flex items-center justify-center text-sm font-black flex-shrink-0"
      style={{ background: bg, color: fg, border: `2px solid ${fg}33`, boxShadow: rank < 3 ? `0 0 10px ${fg}44` : "none" }}>
      {name.charAt(0).toUpperCase()}
    </div>
  );
}

function WinRateBadge({ won, lost }: { won?: number; lost?: number }) {
  const total = (won ?? 0) + (lost ?? 0);
  if (total === 0) return <span className="text-white/20 text-xs font-mono">—</span>;
  const pct = ((won ?? 0) / total) * 100;
  const col = pct >= 50 ? "#34D399" : pct >= 30 ? "#FBBF24" : "#F87171";
  return (
    <div className="flex items-center gap-1.5">
      <div className="w-16 h-1.5 rounded-full bg-white/10 overflow-hidden">
        <div className="h-full rounded-full" style={{ width: `${pct}%`, background: col }} />
      </div>
      <span className="text-xs font-mono font-bold" style={{ color: col }}>{pct.toFixed(0)}%</span>
    </div>
  );
}

export default function AdminPlayers() {
  const { adminKey } = useAdminAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [search, setSearch] = useState("");

  const { data: players, isLoading } = useGetAdminPlayers(
    { adminKey: adminKey! },
    { query: { enabled: !!adminKey, queryKey: getGetAdminPlayersQueryKey({ adminKey: adminKey! }) } }
  );

  const { data: bonusConfig } = useGetBonusConfig(
    { adminKey: adminKey! },
    { query: { enabled: !!adminKey, queryKey: getGetBonusConfigQueryKey({ adminKey: adminKey! }) } }
  );

  const invalidatePlayers = () =>
    queryClient.invalidateQueries({ queryKey: getGetAdminPlayersQueryKey({ adminKey: adminKey! }) });

  // Withdrawal toggle
  const { data: settings, refetch: refetchSettings } = useGetAdminSettings(
    { adminKey: adminKey! },
    { query: { enabled: !!adminKey, queryKey: getGetAdminSettingsQueryKey({ adminKey: adminKey! }) } }
  );
  const settingsMutation = useUpdateAdminSettings();
  const withdrawalEnabled = settings?.withdrawalEnabled ?? true;
  const toggleWithdrawal = () => {
    settingsMutation.mutate(
      { params: { adminKey: adminKey! }, data: { withdrawalEnabled: !withdrawalEnabled } },
      {
        onSuccess: () => {
          refetchSettings();
          toast({ title: !withdrawalEnabled ? "✅ Withdrawals Enabled" : "🔒 Withdrawals Disabled" });
        },
        onError: (err: any) => toast({ title: "Error", description: err.message, variant: "destructive" }),
      }
    );
  };

  const filtered = useMemo(() =>
    (players ?? []).filter(p => p.name.toLowerCase().includes(search.toLowerCase())),
    [players, search]
  );

  const summaryStats = useMemo(() => ({
    total: players?.length ?? 0,
    totalBalance: (players ?? []).reduce((s, p) => s + p.balance, 0),
    totalWon: (players ?? []).reduce((s, p) => s + (p.totalWon ?? 0), 0),
    totalGames: (players ?? []).reduce((s, p) => s + (p.gamesPlayed ?? 0), 0),
  }), [players]);

  // Create
  const [createOpen, setCreateOpen] = useState(false);
  const [newName, setNewName] = useState("");
  const [newPin, setNewPin] = useState("");
  const [newCredits, setNewCredits] = useState("0");
  const createMutation = useCreatePlayer();

  const handleCreate = () => {
    createMutation.mutate(
      { params: { adminKey: adminKey! }, data: { name: newName, pin: newPin, initialCredits: parseInt(newCredits) || 0 } },
      {
        onSuccess: () => {
          toast({ title: "✅ Player Created", description: `${newName} is ready to play` });
          setCreateOpen(false); setNewName(""); setNewPin(""); setNewCredits("0");
          invalidatePlayers();
        },
        onError: (err: any) => toast({ title: "Error", description: err.message, variant: "destructive" }),
      }
    );
  };

  // Reload
  const [reloadOpen, setReloadOpen] = useState<number | false>(false);
  const [reloadAmount, setReloadAmount] = useState("");
  const reloadMutation = useReloadPlayerCredits();
  const handleReload = (playerId: number) => {
    reloadMutation.mutate(
      { params: { adminKey: adminKey!, playerId }, data: { amount: parseInt(reloadAmount) || 0 } },
      {
        onSuccess: (data) => {
          const bonus = data.bonusApplied > 0 ? ` (+${data.bonusApplied} ${data.bonusType}!)` : "";
          toast({ title: "✅ Credits Reloaded", description: `+${parseInt(reloadAmount).toLocaleString()} pts${bonus}` });
          setReloadOpen(false); setReloadAmount(""); invalidatePlayers();
        },
        onError: (err: any) => toast({ title: "Error", description: err.message, variant: "destructive" }),
      }
    );
  };

  // Cashout
  const [cashoutOpen, setCashoutOpen] = useState<number | false>(false);
  const [cashoutAmount, setCashoutAmount] = useState("");
  const cashoutMutation = useCashoutPlayer();
  const handleCashout = (playerId: number) => {
    cashoutMutation.mutate(
      { params: { adminKey: adminKey!, playerId }, data: { amount: parseInt(cashoutAmount) || 0 } },
      {
        onSuccess: () => {
          toast({ title: "✅ Cashed Out", description: `${parseInt(cashoutAmount).toLocaleString()} pts returned` });
          setCashoutOpen(false); setCashoutAmount(""); invalidatePlayers();
        },
        onError: (err: any) => toast({ title: "Error", description: err.message, variant: "destructive" }),
      }
    );
  };

  // Reset PIN
  const [resetPinOpen, setResetPinOpen] = useState<number | false>(false);
  const [resetPinValue, setResetPinValue] = useState("");
  const resetPinMutation = useResetPlayerPin();
  const handleResetPin = (playerId: number) => {
    resetPinMutation.mutate(
      { params: { adminKey: adminKey!, playerId }, data: { newPin: resetPinValue } },
      {
        onSuccess: () => {
          toast({ title: "✅ PIN Reset", description: `New PIN set successfully` });
          setResetPinOpen(false); setResetPinValue("");
        },
        onError: (err: any) => toast({ title: "Error", description: err.message, variant: "destructive" }),
      }
    );
  };

  // Rescue (Comeback Credits)
  const rescueMutation = useRescuePlayer();
  const handleRescue = (playerId: number, playerName: string) => {
    rescueMutation.mutate(
      { params: { adminKey: adminKey!, playerId } },
      {
        onSuccess: (data) => {
          toast({ title: "💙 Player Rescued!", description: `${playerName} received comeback credits. New balance: ${data.balance.toLocaleString()} pts` });
          invalidatePlayers();
        },
        onError: (err: any) => toast({ title: "Error", description: err.message, variant: "destructive" }),
      }
    );
  };

  // Delete
  const deleteMutation = useDeletePlayer();
  const handleDelete = (playerId: number) => {
    deleteMutation.mutate(
      { params: { adminKey: adminKey!, playerId } },
      {
        onSuccess: () => { toast({ title: "Player Deleted" }); invalidatePlayers(); },
        onError: (err: any) => toast({ title: "Error", description: err.message, variant: "destructive" }),
      }
    );
  };

  const rankMap = useMemo(() => {
    const sorted = [...(players ?? [])].sort((a, b) => b.balance - a.balance);
    return new Map(sorted.map((p, i) => [p.id, i]));
  }, [players]);

  return (
    <AdminLayout>
      {/* Header */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center mb-6 gap-4">
        <div>
          <h1 className="text-3xl font-black tracking-tight mb-1 flex items-center gap-3">
            <Users className="w-8 h-8 text-blue-400" /> Players
          </h1>
          <p className="text-white/40 text-sm font-mono">Manage accounts, balances &amp; cashouts</p>
        </div>
        <div className="flex items-center gap-3">
          {/* Withdrawal on/off toggle */}
          <button
            onClick={toggleWithdrawal}
            disabled={settingsMutation.isPending}
            className={`flex items-center gap-2 px-4 py-2 rounded-xl border font-bold text-sm transition-all duration-200 ${
              withdrawalEnabled
                ? "border-emerald-500/40 bg-emerald-500/10 text-emerald-400 hover:bg-emerald-500/20"
                : "border-rose-500/40 bg-rose-500/10 text-rose-400 hover:bg-rose-500/20"
            }`}
          >
            {settingsMutation.isPending
              ? <Loader2 className="w-4 h-4 animate-spin" />
              : withdrawalEnabled
                ? <ShieldCheck className="w-4 h-4" />
                : <ShieldOff className="w-4 h-4" />
            }
            <span className="font-mono uppercase tracking-widest text-[11px]">
              Withdrawals {withdrawalEnabled ? "ON" : "OFF"}
            </span>
          </button>

          <Dialog open={createOpen} onOpenChange={setCreateOpen}>
          <DialogTrigger asChild>
            <Button className="bg-yellow-400 text-black hover:bg-yellow-300 font-black shadow-[0_0_20px_rgba(255,214,10,0.35)] gap-2">
              <Plus className="w-4 h-4" /> New Player
            </Button>
          </DialogTrigger>
          <DialogContent className="bg-[#111] border-white/10">
            <DialogHeader><DialogTitle className="text-xl font-black">Create New Player</DialogTitle></DialogHeader>
            <div className="space-y-4 py-4">
              <div className="space-y-2">
                <Label className="text-white/60 text-xs uppercase tracking-widest font-mono">Player Name</Label>
                <Input value={newName} onChange={e => setNewName(e.target.value)} placeholder="e.g. JOHN" className="bg-white/5 border-white/10 focus:border-yellow-400/50" />
              </div>
              <div className="space-y-2">
                <Label className="text-white/60 text-xs uppercase tracking-widest font-mono">4-Digit PIN</Label>
                <Input value={newPin} onChange={e => setNewPin(e.target.value.replace(/\D/g, ""))} maxLength={4} placeholder="1234" className="bg-white/5 border-white/10 focus:border-yellow-400/50 font-mono tracking-widest text-lg text-center" />
              </div>
              <div className="space-y-2">
                <Label className="text-white/60 text-xs uppercase tracking-widest font-mono">Starting Credits</Label>
                <Input type="number" value={newCredits} onChange={e => setNewCredits(e.target.value)} className="bg-white/5 border-white/10 focus:border-yellow-400/50 font-mono" />
              </div>
            </div>
            <DialogFooter>
              <Button onClick={handleCreate} disabled={createMutation.isPending || !newName || newPin.length !== 4}
                className="bg-yellow-400 text-black hover:bg-yellow-300 font-bold w-full">
                {createMutation.isPending && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
                Create Player
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
        </div>
      </div>

      {/* Summary strip */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-5">
        {[
          { label: "Total Players", val: summaryStats.total, icon: Users, col: "#60A5FA" },
          { label: "Credits in Play", val: summaryStats.totalBalance.toLocaleString(), icon: Wallet, col: "#FBBF24" },
          { label: "Total Paid Out", val: summaryStats.totalWon.toLocaleString(), icon: TrendingUp, col: "#34D399" },
          { label: "Games Played", val: summaryStats.totalGames.toLocaleString(), icon: TrendingDown, col: "#A78BFA" },
        ].map(({ label, val, icon: Ic, col }) => (
          <div key={label} className="rounded-xl border border-white/8 p-4 flex items-center gap-3" style={{ background: "rgba(255,255,255,0.02)" }}>
            <div className="p-2 rounded-lg" style={{ background: `${col}18` }}>
              <Ic className="w-4 h-4" style={{ color: col }} />
            </div>
            <div>
              <div className="font-black font-mono text-lg leading-none" style={{ color: col }}>{val}</div>
              <div className="text-[10px] text-white/35 uppercase tracking-wider font-mono mt-0.5">{label}</div>
            </div>
          </div>
        ))}
      </div>

      {/* Search */}
      <div className="relative mb-4">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-white/30" />
        <Input
          placeholder="Search players…"
          value={search} onChange={e => setSearch(e.target.value)}
          className="pl-10 bg-white/4 border-white/8 focus:border-white/20 font-mono"
        />
      </div>

      {/* Players table */}
      <div className="rounded-xl border border-white/8 overflow-hidden" style={{ background: "rgba(255,255,255,0.02)" }}>
        <div className="grid grid-cols-[auto_1fr_1fr_1fr_1fr_1fr_auto] gap-4 px-5 py-3 border-b border-white/8 text-[10px] font-bold uppercase tracking-widest text-white/30 font-mono">
          <div className="w-9" />
          <div>Player</div>
          <div className="text-right">Balance</div>
          <div className="text-right">Net P&amp;L</div>
          <div>Win Rate</div>
          <div className="hidden lg:block">Joined</div>
          <div className="text-right">Actions</div>
        </div>

        {isLoading ? (
          <div className="p-8 text-center">
            <Loader2 className="w-6 h-6 animate-spin mx-auto text-white/30" />
            <p className="text-white/30 font-mono text-sm mt-2">Loading players…</p>
          </div>
        ) : filtered.length === 0 ? (
          <div className="p-12 text-center text-white/25 font-mono text-sm">
            {search ? `No players matching "${search}"` : "No players yet. Create the first one!"}
          </div>
        ) : (
          filtered.map(p => {
            const rank = rankMap.get(p.id) ?? 99;
            const netPnl = (p.totalWon ?? 0) - (p.totalLost ?? 0);
            const isLowBalance = p.balance < 50;
            return (
              <div key={p.id}
                className="grid grid-cols-[auto_1fr_1fr_1fr_1fr_1fr_auto] gap-4 px-5 py-3.5 border-b border-white/5 hover:bg-white/3 transition-colors items-center last:border-0"
                style={rank === 0 ? { background: "rgba(255,214,10,0.03)" } : undefined}
              >
                {/* Avatar */}
                <div className="relative">
                  <Avatar name={p.name} rank={rank} />
                  {rank < 3 && (
                    <Crown className="w-3 h-3 absolute -top-1 -right-1" style={{ color: rank === 0 ? "#FFD60A" : rank === 1 ? "#C0C0C0" : "#CD7F32" }} />
                  )}
                </div>

                {/* Name */}
                <div>
                  <div className="font-bold text-white text-sm">{p.name}</div>
                  <div className="text-[10px] text-white/25 font-mono flex items-center gap-2">
                    <span>{p.gamesPlayed} games</span>
                    {(p.totalKills ?? 0) > 0 && <span className="text-yellow-500/60">⚔️ {p.totalKills} kills</span>}
                  </div>
                </div>

                {/* Balance */}
                <div className="text-right">
                  <div className={`font-black font-mono text-base ${isLowBalance ? "text-rose-400" : "text-yellow-400"}`}>
                    {p.balance.toLocaleString()}
                  </div>
                  <div className="text-[9px] text-white/25 font-mono">pts{isLowBalance ? " ⚠️" : ""}</div>
                </div>

                {/* Net P&L */}
                <div className="text-right">
                  <div className={`font-bold font-mono text-sm ${netPnl >= 0 ? "text-emerald-400" : "text-rose-400"}`}>
                    {netPnl >= 0 ? "+" : ""}{netPnl.toLocaleString()}
                  </div>
                  <div className="text-[9px] text-white/25 font-mono">net</div>
                </div>

                {/* Win rate */}
                <div><WinRateBadge won={p.totalWon} lost={p.totalLost} /></div>

                {/* Joined */}
                <div className="hidden lg:block text-xs text-white/35 font-mono">
                  {format(new Date(p.createdAt), "MMM d, yyyy")}
                </div>

                {/* Actions */}
                <div className="flex items-center justify-end gap-1.5">
                  <Dialog open={reloadOpen === p.id} onOpenChange={(open) => setReloadOpen(open ? p.id : false)}>
                    <DialogTrigger asChild>
                      <Button size="sm" variant="outline"
                        className="h-7 px-2.5 text-xs border-emerald-500/30 text-emerald-400 hover:bg-emerald-500/10 hover:border-emerald-400 gap-1 font-bold">
                        <Coins className="w-3 h-3" /> Load
                      </Button>
                    </DialogTrigger>
                    <DialogContent className="bg-[#111] border-white/10">
                      <DialogHeader><DialogTitle className="font-black">Load Credits — {p.name}</DialogTitle></DialogHeader>
                      {(() => {
                        const depositAmt = parseInt(reloadAmount) || 0;
                        const matchPct = !p.firstDepositDone
                          ? (bonusConfig?.firstDepositPct ?? 100)
                          : (bonusConfig?.reloadPct ?? 100);
                        const bonusAmt = Math.floor(depositAmt * matchPct / 100);
                        const totalReceived = depositAmt + bonusAmt;
                        const newBalance = p.balance + totalReceived;
                        const isFirstDeposit = !p.firstDepositDone;
                        return (
                          <div className="py-4 space-y-3">
                            {/* Current balance */}
                            <div className="p-3 rounded-lg bg-white/4 border border-white/8 flex items-center justify-between">
                              <span className="text-white/45 text-sm font-mono">Current balance</span>
                              <span className="font-black font-mono text-white/70 text-lg">{p.balance.toLocaleString()} pts</span>
                            </div>

                            {/* Match bonus badge */}
                            <div className={`p-2.5 rounded-lg border flex items-center gap-2 ${isFirstDeposit ? "bg-yellow-500/10 border-yellow-500/25" : "bg-emerald-500/10 border-emerald-500/25"}`}>
                              <span className="text-lg">{isFirstDeposit ? "🎁" : "🔄"}</span>
                              <div>
                                <div className={`text-xs font-bold font-mono ${isFirstDeposit ? "text-yellow-400" : "text-emerald-400"}`}>
                                  {isFirstDeposit ? "First Deposit" : "Reload"} Match Bonus — {matchPct}%
                                </div>
                                <div className="text-[10px] text-white/30 font-mono">
                                  Every deposit gets a {matchPct}% bonus added on top
                                </div>
                              </div>
                            </div>

                            {/* Amount input */}
                            <div className="space-y-1.5">
                              <Label className="text-white/45 text-[10px] uppercase tracking-widest font-mono">Cash Deposited (pts)</Label>
                              <Input
                                type="number"
                                value={reloadAmount}
                                onChange={e => setReloadAmount(e.target.value)}
                                placeholder="0"
                                className="bg-white/5 border-white/10 font-mono text-2xl text-center h-14"
                              />
                            </div>

                            {/* Breakdown — only when amount is entered */}
                            {depositAmt > 0 && (
                              <div className="rounded-xl border border-white/8 overflow-hidden">
                                <div className="flex items-center justify-between px-4 py-2.5 border-b border-white/6">
                                  <span className="text-white/40 text-xs font-mono">Cash deposit</span>
                                  <span className="font-bold font-mono text-white/70">+{depositAmt.toLocaleString()}</span>
                                </div>
                                <div className={`flex items-center justify-between px-4 py-2.5 border-b border-white/6 ${isFirstDeposit ? "bg-yellow-500/6" : "bg-emerald-500/6"}`}>
                                  <span className={`text-xs font-mono font-bold ${isFirstDeposit ? "text-yellow-400/80" : "text-emerald-400/80"}`}>
                                    {matchPct}% match bonus
                                  </span>
                                  <span className={`font-black font-mono text-sm ${isFirstDeposit ? "text-yellow-400" : "text-emerald-400"}`}>
                                    +{bonusAmt.toLocaleString()} 🎁
                                  </span>
                                </div>
                                <div className="flex items-center justify-between px-4 py-2.5 bg-white/3">
                                  <span className="text-white/50 text-xs font-mono">Player receives</span>
                                  <span className="font-black font-mono text-white text-base">{totalReceived.toLocaleString()} pts</span>
                                </div>
                                <div className="flex items-center justify-between px-4 py-2.5 bg-emerald-500/8 border-t border-emerald-500/15">
                                  <span className="text-emerald-300/70 text-xs font-mono">New balance</span>
                                  <span className="font-black font-mono text-emerald-400 text-lg">{newBalance.toLocaleString()} pts</span>
                                </div>
                              </div>
                            )}
                          </div>
                        );
                      })()}
                      <DialogFooter>
                        <Button onClick={() => handleReload(p.id)} disabled={reloadMutation.isPending || !reloadAmount || parseInt(reloadAmount) <= 0}
                          className="bg-emerald-500 hover:bg-emerald-400 text-black font-bold w-full h-11 text-sm">
                          {reloadMutation.isPending && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
                          Confirm Load
                        </Button>
                      </DialogFooter>
                    </DialogContent>
                  </Dialog>

                  <Dialog open={cashoutOpen === p.id} onOpenChange={(open) => setCashoutOpen(open ? p.id : false)}>
                    <DialogTrigger asChild>
                      <Button size="sm" variant="outline"
                        className="h-7 px-2.5 text-xs border-rose-500/30 text-rose-400 hover:bg-rose-500/10 hover:border-rose-400 gap-1 font-bold">
                        <ArrowUpFromLine className="w-3 h-3" /> Cash
                      </Button>
                    </DialogTrigger>
                    <DialogContent className="bg-[#111] border-white/10">
                      <DialogHeader><DialogTitle className="font-black">Cash Out — {p.name}</DialogTitle></DialogHeader>
                      <div className="py-4 space-y-3">
                        <div className="p-3 rounded-lg bg-rose-500/8 border border-rose-500/20 flex items-center justify-between">
                          <span className="text-white/50 text-sm font-mono">Available</span>
                          <span className="font-black font-mono text-rose-400 text-xl">{p.balance.toLocaleString()}</span>
                        </div>
                        <div className="space-y-2">
                          <Label className="text-white/50 text-xs uppercase tracking-widest font-mono">Amount to Cash Out</Label>
                          <Input type="number" value={cashoutAmount} onChange={e => setCashoutAmount(e.target.value)} max={p.balance} placeholder="0"
                            className="bg-white/5 border-white/10 font-mono text-lg text-center" />
                        </div>
                        <button className="w-full text-xs text-white/30 hover:text-white/60 font-mono transition-colors"
                          onClick={() => setCashoutAmount(String(p.balance))}>
                          Cash out all ({p.balance.toLocaleString()})
                        </button>
                        {cashoutAmount && parseInt(cashoutAmount) > 0 && parseInt(cashoutAmount) <= p.balance && (
                          <div className="text-center text-sm text-white/40 font-mono">
                            Remaining: <span className="text-rose-400 font-bold">{(p.balance - parseInt(cashoutAmount)).toLocaleString()}</span>
                          </div>
                        )}
                      </div>
                      <DialogFooter>
                        <Button onClick={() => handleCashout(p.id)}
                          disabled={cashoutMutation.isPending || !cashoutAmount || parseInt(cashoutAmount) <= 0 || parseInt(cashoutAmount) > p.balance}
                          className="bg-rose-500 hover:bg-rose-400 text-white font-bold w-full">
                          {cashoutMutation.isPending && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
                          Confirm Cash Out
                        </Button>
                      </DialogFooter>
                    </DialogContent>
                  </Dialog>

                  <Dialog open={resetPinOpen === p.id} onOpenChange={(open) => { setResetPinOpen(open ? p.id : false); setResetPinValue(""); }}>
                    <DialogTrigger asChild>
                      <Button size="sm" variant="outline"
                        className="h-7 px-2.5 text-xs border-violet-500/30 text-violet-400 hover:bg-violet-500/10 hover:border-violet-400 gap-1 font-bold">
                        <KeyRound className="w-3 h-3" /> PIN
                      </Button>
                    </DialogTrigger>
                    <DialogContent className="bg-[#111] border-white/10">
                      <DialogHeader><DialogTitle className="font-black">Reset PIN — {p.name}</DialogTitle></DialogHeader>
                      <div className="py-4 space-y-4">
                        <p className="text-white/40 text-sm font-mono">Enter a new 4-digit PIN for this player.</p>
                        <div className="space-y-2">
                          <Label className="text-white/50 text-xs uppercase tracking-widest font-mono">New 4-Digit PIN</Label>
                          <Input
                            type="password" inputMode="numeric"
                            value={resetPinValue}
                            onChange={e => setResetPinValue(e.target.value.replace(/\D/g, "").slice(0, 4))}
                            maxLength={4} placeholder="••••"
                            className="bg-white/5 border-white/10 focus:border-violet-400/50 font-mono tracking-[0.5em] text-2xl text-center h-14"
                          />
                        </div>
                        {resetPinValue.length > 0 && resetPinValue.length < 4 && (
                          <p className="text-amber-400/70 text-xs font-mono text-center">{4 - resetPinValue.length} more digit{resetPinValue.length < 3 ? "s" : ""} needed</p>
                        )}
                      </div>
                      <DialogFooter>
                        <Button onClick={() => handleResetPin(p.id)}
                          disabled={resetPinMutation.isPending || resetPinValue.length !== 4}
                          className="bg-violet-500 hover:bg-violet-400 text-white font-bold w-full">
                          {resetPinMutation.isPending && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
                          Set New PIN
                        </Button>
                      </DialogFooter>
                    </DialogContent>
                  </Dialog>

                  {/* Rescue / Comeback Credits button — only shown for low-balance players */}
                  {isLowBalance && (
                    <AlertDialog>
                      <AlertDialogTrigger asChild>
                        <Button size="sm" variant="outline"
                          className="h-7 px-2.5 text-xs border-sky-500/40 text-sky-400 hover:bg-sky-500/10 hover:border-sky-400 gap-1 font-bold animate-pulse">
                          <HeartHandshake className="w-3 h-3" /> Rescue
                        </Button>
                      </AlertDialogTrigger>
                      <AlertDialogContent className="bg-[#111] border-white/10">
                        <AlertDialogHeader>
                          <AlertDialogTitle className="text-sky-400 font-black flex items-center gap-2">
                            <HeartHandshake className="w-5 h-5" /> Rescue {p.name}?
                          </AlertDialogTitle>
                          <AlertDialogDescription className="text-white/50">
                            This player's balance is low ({p.balance.toLocaleString()} pts). Send them comeback credits to keep them playing. The amount is set in Game Configuration.
                          </AlertDialogDescription>
                        </AlertDialogHeader>
                        <AlertDialogFooter>
                          <AlertDialogCancel className="bg-white/5 border-white/10 hover:bg-white/10">Cancel</AlertDialogCancel>
                          <AlertDialogAction
                            onClick={() => handleRescue(p.id, p.name)}
                            className="bg-sky-500 hover:bg-sky-400 text-white font-bold"
                          >
                            Send Comeback Credits
                          </AlertDialogAction>
                        </AlertDialogFooter>
                      </AlertDialogContent>
                    </AlertDialog>
                  )}

                  <AlertDialog>
                    <AlertDialogTrigger asChild>
                      <Button size="sm" variant="ghost" className="h-7 w-7 p-0 text-white/20 hover:text-red-400 hover:bg-red-500/10">
                        <Trash2 className="w-3.5 h-3.5" />
                      </Button>
                    </AlertDialogTrigger>
                    <AlertDialogContent className="bg-[#111] border-white/10">
                      <AlertDialogHeader>
                        <AlertDialogTitle className="text-red-400 font-black">Delete {p.name}?</AlertDialogTitle>
                        <AlertDialogDescription className="text-white/50">
                          This permanently removes the player and all their history. Balance of {p.balance.toLocaleString()} pts will be lost. This cannot be undone.
                        </AlertDialogDescription>
                      </AlertDialogHeader>
                      <AlertDialogFooter>
                        <AlertDialogCancel className="bg-white/5 border-white/10 hover:bg-white/10">Cancel</AlertDialogCancel>
                        <AlertDialogAction onClick={() => handleDelete(p.id)} className="bg-red-500 hover:bg-red-400 text-white font-bold">
                          Delete Player
                        </AlertDialogAction>
                      </AlertDialogFooter>
                    </AlertDialogContent>
                  </AlertDialog>
                </div>
              </div>
            );
          })
        )}
      </div>

      {filtered.length > 0 && (
        <p className="text-center text-[10px] text-white/20 font-mono mt-3">
          Showing {filtered.length} of {players?.length ?? 0} players
        </p>
      )}
    </AdminLayout>
  );
}
