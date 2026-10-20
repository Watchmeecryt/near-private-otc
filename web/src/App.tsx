import { BrowserRouter, Route, Routes, Navigate, useParams } from "react-router-dom";
import { ToastProvider } from "@unlocalhosted/metalui";
import Landing from "./pages/Landing";
import Shell from "./app/Shell";
import { AppState } from "./app/state";
import Board from "./pages/Board";
import Deal from "./pages/Deal";
import Create from "./pages/Create";
import Mine from "./pages/Mine";
import WalletPage from "./pages/Wallet";
import How from "./pages/How";

const Short = () => { const { id } = useParams(); return <Navigate to={`/app/d/${id}`} replace />; };
export default function App() {
  return (
    <ToastProvider>
      <BrowserRouter>
        <Routes>
          <Route path="/" element={<Landing />} />
          <Route path="/d/:id" element={<Short />} />
          <Route path="/app" element={<AppState><Shell /></AppState>}>
            <Route index element={<Board />} />
            <Route path="d/:id" element={<Deal />} />
            <Route path="new" element={<Create />} />
            <Route path="mine" element={<Mine />} />
            <Route path="wallet" element={<WalletPage />} />
            <Route path="how" element={<How />} />
          </Route>
          <Route path="*" element={<Landing />} />
        </Routes>
      </BrowserRouter>
    </ToastProvider>
  );
}
