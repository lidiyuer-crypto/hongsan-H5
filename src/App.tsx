import { BrowserRouter, Routes, Route } from 'react-router-dom';
import Index from './pages/Index';
import Room from './pages/Room';
import Game from './pages/Game';

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<Index />} />
        <Route path="/room/:roomCode" element={<Room />} />
        <Route path="/game/:gameId" element={<Game />} />
      </Routes>
    </BrowserRouter>
  );
}
