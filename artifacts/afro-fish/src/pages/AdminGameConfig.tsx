import { useState } from "react";
import {
  useGetGameConfig, getGetGameConfigQueryKey, useUpdateGameConfig,
  useGetBonusConfig, getGetBonusConfigQueryKey, useUpdateBonusConfig,
} from "@workspace/api-client-react";
import { useAdminAuth } from "@/hooks/use-auth";
import { AdminLayout } from "@/components/AdminLayout";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Slider } from "@/components/ui/slider";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { Loader2, Save, Gift } from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";

export default function AdminGameConfig() {
  const { adminKey } = useAdminAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const { data: configData, isLoading } = useGetGameConfig(
    { adminKey: adminKey! },
    { query: { enabled: !!adminKey, queryKey: getGetGameConfigQueryKey({ adminKey: adminKey! }) } }
  );

  const { data: bonusData, isLoading: bonusLoading } = useGetBonusConfig(
    { adminKey: adminKey! },
    { query: { enabled: !!adminKey, queryKey: getGetBonusConfigQueryKey({ adminKey: adminKey! }) } }
  );

  const updateMutation = useUpdateGameConfig();
  const updateBonusMutation = useUpdateBonusConfig();

  const [localValues, setLocalValues] = useState<Record<string, number>>({});
  const [localBonus, setLocalBonus] = useState<Record<string, number>>({});

  const handleSliderChange = (game: string, tier: string, value: number) => {
    setLocalValues((prev) => ({ ...prev, [`${game}-${tier}`]: value }));
  };

  const handleBonusChange = (key: string, value: number) => {
    setLocalBonus((prev) => ({ ...prev, [key]: value }));
  };

  const handleSave = (game: string, tier: string) => {
    const value = localValues[`${game}-${tier}`];
    if (value === undefined) return;

    updateMutation.mutate(
      { params: { adminKey: adminKey!, game, tier }, data: { winRate: value } },
      {
        onSuccess: () => {
          toast({ title: "Configuration Saved", description: `Updated win rate for ${game} (${tier}) to ${value}%` });
          queryClient.invalidateQueries({ queryKey: getGetGameConfigQueryKey({ adminKey: adminKey! }) });
        },
        onError: (err: any) => {
          toast({ title: "Save Failed", description: err.message || "Failed to update configuration", variant: "destructive" });
        }
      }
    );
  };

  const handleSaveBonus = (key: string, label: string) => {
    const value = localBonus[key];
    if (value === undefined) return;

    updateBonusMutation.mutate(
      { params: { adminKey: adminKey! }, data: { [key]: value } as any },
      {
        onSuccess: () => {
          toast({ title: "Bonus Config Saved", description: `${label} updated to ${value}` });
          queryClient.invalidateQueries({ queryKey: getGetBonusConfigQueryKey({ adminKey: adminKey! }) });
        },
        onError: (err: any) => {
          toast({ title: "Save Failed", description: err.message || "Failed", variant: "destructive" });
        }
      }
    );
  };

  const renderConfigGroup = (gameName: string, gameLabel: string) => {
    const configs = configData?.configs.filter((c) => c.game === gameName) || [];
    const tiers = ["bronze", "silver", "gold"];

    return (
      <Card className="bg-card border-border mb-6">
        <CardHeader>
          <CardTitle className="text-xl capitalize">{gameLabel}</CardTitle>
          <CardDescription>
            Base win rate applied as <strong>winRate ÷ fishMult</strong> per creature — small fish hit at the full rate, big fish hit at a fraction (e.g. Megalodon at winRate÷7). Every creature returns the same expected value, so this slider controls house edge uniformly across all targets.
            <span className="text-yellow-400 font-mono ml-1">88% = 12% house edge · 92% = 8% · 80% = 20%</span>
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-8">
          {isLoading ? (
            <div className="flex justify-center p-8"><Loader2 className="animate-spin text-muted-foreground w-8 h-8" /></div>
          ) : (
            tiers.map((tier) => {
              const config = configs.find(c => c.tier === tier);
              const currentValue = localValues[`${gameName}-${tier}`] ?? config?.winRate ?? 70;
              const hasChanged = localValues[`${gameName}-${tier}`] !== undefined && localValues[`${gameName}-${tier}`] !== config?.winRate;

              const tierColors: Record<string, string> = {
                bronze: "bg-orange-700/20 text-orange-500 border-orange-700/50",
                silver: "bg-slate-400/20 text-slate-300 border-slate-400/50",
                gold: "bg-yellow-500/20 text-yellow-500 border-yellow-500/50"
              };

              return (
                <div key={tier} className="space-y-4 bg-black/20 p-6 rounded-lg border border-white/5">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <Badge variant="outline" className={`capitalize text-sm px-3 py-1 ${tierColors[tier]}`}>
                        {tier} Room
                      </Badge>
                      <span className="font-mono text-2xl font-bold">{currentValue}%</span>
                    </div>
                    <Button
                      size="sm"
                      onClick={() => handleSave(gameName, tier)}
                      disabled={!hasChanged || updateMutation.isPending}
                      variant={hasChanged ? "default" : "secondary"}
                    >
                      <Save className="w-4 h-4 mr-2" />Save
                    </Button>
                  </div>
                  <Slider
                    defaultValue={[config?.winRate ?? 70]}
                    value={[currentValue]}
                    max={100} min={10} step={1}
                    onValueChange={(vals) => handleSliderChange(gameName, tier, vals[0])}
                    className="py-4"
                  />
                  <div className="flex justify-between text-xs text-muted-foreground font-mono">
                    <span>10% (Hard)</span><span>50%</span><span>100% (Loose)</span>
                  </div>
                </div>
              );
            })
          )}
        </CardContent>
      </Card>
    );
  };

  const bonusSections = [
    {
      key: "firstDepositPct",
      label: "First Deposit Match Bonus",
      desc: "% of deposit added as bonus on a player's very first cash load (100 = full match)",
      current: localBonus["firstDepositPct"] ?? bonusData?.firstDepositPct ?? 100,
      min: 0, max: 200, step: 5, suffix: "%",
    },
    {
      key: "reloadPct",
      label: "Reload Match Bonus",
      desc: "% of deposit added as bonus on every subsequent reload (100 = full match)",
      current: localBonus["reloadPct"] ?? bonusData?.reloadPct ?? 100,
      min: 0, max: 200, step: 5, suffix: "%",
    },
    {
      key: "dailyLoginBonus",
      label: "Daily Login Bonus",
      desc: "Credits awarded to players each calendar day they log in",
      current: localBonus["dailyLoginBonus"] ?? bonusData?.dailyLoginBonus ?? 10,
      min: 0, max: 500, step: 5, suffix: " pts",
    },
    {
      key: "sessionMilestoneAmt",
      label: "Session Milestone Reward",
      desc: "Credits awarded at each shot milestone during a session",
      current: localBonus["sessionMilestoneAmt"] ?? bonusData?.sessionMilestoneAmt ?? 25,
      min: 0, max: 500, step: 5, suffix: " pts",
    },
    {
      key: "sessionMilestoneEvery",
      label: "Milestone Every (shots)",
      desc: "How many shots between each session milestone award",
      current: localBonus["sessionMilestoneEvery"] ?? bonusData?.sessionMilestoneEvery ?? 200,
      min: 50, max: 1000, step: 50, suffix: " shots",
    },
    {
      key: "comebackThreshold",
      label: "Comeback Threshold",
      desc: "Admin can rescue players whose balance falls below this level",
      current: localBonus["comebackThreshold"] ?? bonusData?.comebackThreshold ?? 50,
      min: 0, max: 500, step: 10, suffix: " pts",
    },
    {
      key: "comebackAmt",
      label: "Comeback Credits Amount",
      desc: "How many credits the Rescue button gives to a low-balance player",
      current: localBonus["comebackAmt"] ?? bonusData?.comebackAmt ?? 30,
      min: 0, max: 500, step: 10, suffix: " pts",
    },
    {
      key: "miniJackpotOdds",
      label: "Mini Jackpot Odds",
      desc: "Probability (%) that each shot triggers a mini jackpot (20× bet)",
      current: localBonus["miniJackpotOdds"] ?? bonusData?.miniJackpotOdds ?? 3,
      min: 0, max: 20, step: 0.5, suffix: "%",
    },
  ];

  return (
    <AdminLayout>
      <div className="mb-8">
        <h1 className="text-3xl font-bold tracking-tight mb-2">Game Configuration</h1>
        <p className="text-muted-foreground">Manage payout rates, bonuses, and jackpot odds</p>
      </div>

      {renderConfigGroup("fish-hunter", "Fish Hunter")}
      {renderConfigGroup("dragon-king", "Dragon King")}

      {/* Bonus Configuration */}
      <Card className="bg-card border-border">
        <CardHeader>
          <div className="flex items-center gap-3">
            <Gift className="w-6 h-6 text-yellow-400" />
            <div>
              <CardTitle className="text-xl">Bonus Configuration</CardTitle>
              <CardDescription>Configure all 10 bonus systems: jackpots, daily login, milestones, deposits, and rescues</CardDescription>
            </div>
          </div>
          {bonusData && (
            <div className="mt-2 p-3 rounded-lg bg-yellow-500/10 border border-yellow-500/20 text-sm font-mono text-yellow-300">
              Grand Jackpot Pool: <span className="font-black text-yellow-400">{bonusData.jackpotPool.toLocaleString()} pts</span>
              <span className="text-yellow-300/50 ml-2">(accumulates at 2% of every bet, randomly awarded at 0.08% per shot)</span>
            </div>
          )}
        </CardHeader>
        <CardContent className="space-y-6">
          {bonusLoading ? (
            <div className="flex justify-center p-8"><Loader2 className="animate-spin text-muted-foreground w-8 h-8" /></div>
          ) : (
            bonusSections.map(({ key, label, desc, current, min, max, step, suffix }) => {
              const hasChanged = localBonus[key] !== undefined && localBonus[key] !== (bonusData as any)?.[key];
              return (
                <div key={key} className="space-y-3 bg-black/20 p-5 rounded-lg border border-white/5">
                  <div className="flex items-center justify-between">
                    <div>
                      <div className="font-semibold text-sm">{label}</div>
                      <div className="text-xs text-muted-foreground mt-0.5">{desc}</div>
                    </div>
                    <div className="flex items-center gap-3">
                      <span className="font-mono text-xl font-bold text-yellow-400">{current}{suffix}</span>
                      <Button
                        size="sm"
                        onClick={() => handleSaveBonus(key, label)}
                        disabled={!hasChanged || updateBonusMutation.isPending}
                        variant={hasChanged ? "default" : "secondary"}
                      >
                        <Save className="w-3 h-3 mr-1" />Save
                      </Button>
                    </div>
                  </div>
                  <Slider
                    value={[current]}
                    max={max} min={min} step={step}
                    onValueChange={(vals) => handleBonusChange(key, vals[0])}
                    className="py-2"
                  />
                  <div className="flex justify-between text-xs text-muted-foreground font-mono">
                    <span>{min}{suffix}</span>
                    <span>{max}{suffix}</span>
                  </div>
                </div>
              );
            })
          )}
        </CardContent>
      </Card>
    </AdminLayout>
  );
}
