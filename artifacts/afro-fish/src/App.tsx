import { Switch, Route, Router as WouterRouter } from "wouter";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import Home from "@/pages/Home";
import Lobby from "@/pages/Lobby";
import FishHunterGame from "@/pages/FishHunterGame";
import DragonKingGame from "@/pages/DragonKingGame";
import MultiplayerGame from "@/pages/MultiplayerGame";
import AdminLogin from "@/pages/AdminLogin";
import AdminDashboard from "@/pages/AdminDashboard";
import AdminPlayers from "@/pages/AdminPlayers";
import AdminTransactions from "@/pages/AdminTransactions";
import AdminGameConfig from "@/pages/AdminGameConfig";
import AdminAnalytics from "@/pages/AdminAnalytics";
import AdminBackups from "@/pages/AdminBackups";
import NotFound from "@/pages/not-found";

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: 1,
      staleTime: 5_000,
    },
  },
});

function Router() {
  return (
    <Switch>
      <Route path="/" component={Home} />
      <Route path="/lobby" component={Lobby} />
      <Route path="/game/fish-hunter" component={FishHunterGame} />
      <Route path="/game/dragon-king" component={DragonKingGame} />
      <Route path="/game/multiplayer" component={MultiplayerGame} />
      <Route path="/admin" component={AdminLogin} />
      <Route path="/admin/dashboard" component={AdminDashboard} />
      <Route path="/admin/players" component={AdminPlayers} />
      <Route path="/admin/transactions" component={AdminTransactions} />
      <Route path="/admin/game-config" component={AdminGameConfig} />
      <Route path="/admin/analytics" component={AdminAnalytics} />
      <Route path="/admin/backups" component={AdminBackups} />
      <Route component={NotFound} />
    </Switch>
  );
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <WouterRouter base={import.meta.env.BASE_URL.replace(/\/$/, "")}>
          <Router />
        </WouterRouter>
        <Toaster />
      </TooltipProvider>
    </QueryClientProvider>
  );
}

export default App;
