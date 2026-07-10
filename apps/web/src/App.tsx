import { BrowserRouter, Routes, Route } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Layout } from "./components/Layout";
import { HomePage } from "./pages/HomePage";
import { CreateTournamentPage } from "./pages/CreateTournamentPage";
import { TournamentPage } from "./pages/TournamentPage";
import { WatchPage } from "./pages/WatchPage";
import { MatchScorePage } from "./pages/MatchScorePage";

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 5_000,
      retry: 1,
    },
  },
});

export default function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <Routes>
          {/* Full-screen scoreboard — no main layout chrome */}
          <Route path="t/:slug/match/:matchId" element={<MatchScorePage />} />
          <Route element={<Layout />}>
            <Route index element={<HomePage />} />
            <Route path="create" element={<CreateTournamentPage />} />
            <Route path="t/:slug" element={<TournamentPage />} />
            <Route path="watch/:shareCode" element={<WatchPage />} />
          </Route>
        </Routes>
      </BrowserRouter>
    </QueryClientProvider>
  );
}
