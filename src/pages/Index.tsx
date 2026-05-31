import { useState, useCallback, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import GameEngine from '../engine/gameEngine';
import { playSound } from '../lib/sound';
import { useGameStore } from '../stores/gameStore';
import { networkClient } from '../network/NetworkGameClient';

// ===== Types =====
interface BotPlayer {
  openid: string;
  name: string;
  isBot: boolean;
  seat: number;
}

const BOT_NAMES = ['电脑A', '电脑B', '电脑C'];

function getApiBase(): string {
  const host = localStorage.getItem('server_host') || location.hostname;
  const port = localStorage.getItem('server_port') || location.port || (location.protocol === 'https:' ? '443' : '80');
  return `${location.protocol}//${host}:${port}`;
}

// Inline style helpers using CSS variables
const S = {
  bgDeep: 'var(--bg-deep)',
  bgSurface: 'var(--bg-surface)',
  bgCard: 'var(--bg-card)',
  bgElevated: 'var(--bg-elevated)',
  ink: 'var(--ink-primary)',
  ink2: 'var(--ink-secondary)',
  inkDim: 'var(--ink-dim)',
  accent: 'var(--accent)',
  accentGlow: 'var(--accent-glow)',
  accentSoft: 'var(--accent-soft)',
  green: 'var(--green)',
  greenSoft: 'var(--green-soft)',
  red: 'var(--red)',
  redSoft: 'var(--red-soft)',
  radiusSm: 'var(--radius-sm)',
  radiusMd: 'var(--radius-md)',
  radiusLg: 'var(--radius-lg)',
  radiusXl: 'var(--radius-xl)',
};

export default function Index() {
  const navigate = useNavigate();
  const titleTimer = useRef<ReturnType<typeof setTimeout>>();

  // ===== Auth state =====
  const { auth, login, logout, online, setServerConfig } = useGameStore();
  const [showAuthModal, setShowAuthModal] = useState(false);
  const [authView, setAuthView] = useState<'login' | 'register'>('login');
  const [authUsername, setAuthUsername] = useState('');
  const [authPassword, setAuthPassword] = useState('');
  const [authNickname, setAuthNickname] = useState('');
  const [authError, setAuthError] = useState('');
  const [authLoading, setAuthLoading] = useState(false);

  // ===== Online room state =====
  const [showOnlineCreate, setShowOnlineCreate] = useState(false);
  const [onlineJoinCode, setOnlineJoinCode] = useState('');
  const [serverHost, setServerHost] = useState(localStorage.getItem('server_host') || 'localhost');
  const [serverPort, setServerPort] = useState(localStorage.getItem('server_port') || '3001');

  const [showJoinModal, setShowJoinModal] = useState(false);
  const [showDevModal, setShowDevModal] = useState(false);

  const [baseAmount, setBaseAmount] = useState(5);
  const [doubleType, setDoubleType] = useState<'flat' | 'steep'>('flat');
  const [smartShuffle, setSmartShuffle] = useState(false);
  const [smartShuffleLevel, setSmartShuffleLevel] = useState(3);

  const [joinRoomCode, setJoinRoomCode] = useState('');
  const [titleTapCount, setTitleTapCount] = useState(0);
  const [devPlayers, setDevPlayers] = useState<BotPlayer[]>([]);
  const [testModeType, setTestModeType] = useState('normal-22');
  const [botRevealed, setBotRevealed] = useState(false);
  const [skipToFinalRound, setSkipToFinalRound] = useState(false);

  const closeAllModals = () => {
    playSound('modal_close');
    setShowJoinModal(false); setShowDevModal(false);
    setShowAuthModal(false); setShowOnlineCreate(false);
  };

  // ===== Auth API calls =====
  const doLogin = async () => {
    if (!authUsername || !authPassword) { setAuthError('请填写用户名和密码'); return; }
    setAuthLoading(true); setAuthError('');
    try {
      const res = await fetch(`${getApiBase()}/api/auth/login`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: authUsername, password: authPassword }),
      });
      const data = await res.json();
      if (data.error) { setAuthError(data.error); return; }
      login(data.token, data.user.id, data.user.nickname, data.user.username);
      setShowAuthModal(false);
    } catch (e) {
      setAuthError('无法连接服务器，请检查服务器地址');
    } finally { setAuthLoading(false); }
  };

  const doRegister = async () => {
    if (!authUsername || !authPassword || !authNickname) { setAuthError('请填写所有字段'); return; }
    if (authUsername.length < 2) { setAuthError('用户名至少2个字符'); return; }
    if (authPassword.length < 4) { setAuthError('密码至少4个字符'); return; }
    setAuthLoading(true); setAuthError('');
    try {
      const res = await fetch(`${getApiBase()}/api/auth/register`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: authUsername, password: authPassword, nickname: authNickname }),
      });
      const data = await res.json();
      if (data.error) { setAuthError(data.error); return; }
      login(data.token, data.user.id, data.user.nickname, data.user.username);
      setShowAuthModal(false);
    } catch (e) {
      setAuthError('无法连接服务器，请检查服务器地址');
    } finally { setAuthLoading(false); }
  };

  const doLogout = () => { logout(); };

  // ===== Online mode handlers =====
  const goOnlineCreateRoom = async () => {
    if (!auth.token) { setShowAuthModal(true); return; }
    // Connect to server first
    try {
      await networkClient.connect(auth.token);
    } catch {
      setAuthError('连接服务器失败');
      return;
    }
    // Subscribe to room events
    const unsub1 = networkClient.onRoomState((players, config) => {
      // Store room state for Room page
      sessionStorage.setItem('onlineRoomPlayers', JSON.stringify(players));
      sessionStorage.setItem('onlineRoomConfig', JSON.stringify(config));
    });
    const unsub2 = networkClient.onStateChange((state) => {
      sessionStorage.setItem('onlineGameState', JSON.stringify(state));
      navigate(`/game/online-${state.gameId}`);
      unsub1(); unsub2();
    });

    networkClient.createRoom({
      baseAmount, doubleType, smartShuffle, smartShuffleLevel,
      totalRounds: 8, showHandCount: true,
    });

    // Wait briefly for room_created response
    setTimeout(() => {
      const code = networkClient.roomCode || '----';
      sessionStorage.setItem('roomAction', 'create');
      sessionStorage.setItem('onlineRoomCode', code);
      sessionStorage.setItem('onlineRoomConfig', JSON.stringify({
        baseAmount, doubleType, smartShuffle, smartShuffleLevel,
        totalRounds: 8, showHandCount: true,
      }));
      navigate(`/room/${code}?online=1`);
    }, 500);
  };

  const goOnlineJoinRoom = async () => {
    if (onlineJoinCode.length < 4) return;
    if (!auth.token) { setShowAuthModal(true); return; }
    try {
      await networkClient.connect(auth.token);
    } catch {
      setAuthError('连接服务器失败');
      return;
    }
    networkClient.joinRoom(onlineJoinCode);
    setTimeout(() => {
      sessionStorage.setItem('roomAction', 'join');
      sessionStorage.setItem('onlineRoomCode', onlineJoinCode);
      sessionStorage.setItem('onlineRoomConfig', JSON.stringify({
        baseAmount, doubleType, smartShuffle, smartShuffleLevel,
        totalRounds: 8, showHandCount: true,
      }));
      navigate(`/room/${onlineJoinCode}?online=1`);
    }, 500);
  };

  const saveServerConfig = () => {
    setServerConfig(serverHost, serverPort);
    playSound('click');
  };

  const openJoinModal = () => { playSound('modal_open'); setJoinRoomCode(''); setShowJoinModal(true); };
  const decBase = () => { if (baseAmount > 1) setBaseAmount(baseAmount - 1); };
  const incBase = () => setBaseAmount(baseAmount + 1);

  const onTitleTap = useCallback(() => {
    let count = titleTapCount + 1;
    if (count >= 3) {
      count = 0;
      const players: BotPlayer[] = BOT_NAMES.map((name, i) => ({
        openid: 'bot_dev_' + i, name, isBot: true, seat: i + 1,
      }));
      setDevPlayers(players);
      setTestModeType('normal-22');
      setBotRevealed(false);
      setShowDevModal(true);
    }
    setTitleTapCount(count);
    if (titleTimer.current) clearTimeout(titleTimer.current);
    titleTimer.current = setTimeout(() => setTitleTapCount(0), 1000);
  }, [titleTapCount]);

  const goCreateRoom = () => {
    const config = { baseAmount, doubleType, smartShuffle, smartShuffleLevel };
    sessionStorage.setItem('roomConfig', JSON.stringify(config));
    sessionStorage.setItem('roomAction', 'create');
    navigate('/room/create');
  };

  const confirmJoinRoom = () => {
    if (joinRoomCode.length < 4) return;
    const config = { baseAmount, doubleType, smartShuffle, smartShuffleLevel };
    sessionStorage.setItem('roomConfig', JSON.stringify(config));
    sessionStorage.setItem('roomAction', 'join');
    sessionStorage.setItem('joinCode', joinRoomCode);
    closeAllModals();
    navigate(`/room/${joinRoomCode}`);
  };

  const addDevBot = () => {
    if (devPlayers.length >= 3) return;
    const idx = devPlayers.length;
    setDevPlayers([...devPlayers, {
      openid: 'bot_dev_' + idx, name: BOT_NAMES[idx], isBot: true, seat: idx + 1,
    }]);
  };

  const removeBot = (idx: number) => { setDevPlayers(devPlayers.filter((_, i) => i !== idx)); };

  const startDevGame = () => {
    if (devPlayers.length !== 3) return;
    const config = {
      baseAmount, doubleType, smartShuffle, smartShuffleLevel,
      testModeType, botRevealed, skipToFinalRound,
      totalRounds: skipToFinalRound ? 1 : 8,
    };
    const players = [
      { openid: 'player_me', name: '我', avatarUrl: '', isBot: false },
      ...devPlayers,
    ];
    const engine = new GameEngine();
    engine.createGame(players, config);
    sessionStorage.setItem('localGame', JSON.stringify(engine._state));
    closeAllModals();
    navigate(`/game/${engine._state.gameId}`);
  };

  const onJoinCodeChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value.replace(/\D/g, '').slice(0, 4);
    setJoinRoomCode(val);
  };

  // Shared modal shell
  const modalShell = (onClose: () => void, children: React.ReactNode, width = 'min(88vw, 360px)') => (
    <div
      onClick={onClose}
      style={{
        position: 'fixed', inset: 0, zIndex: 200,
        background: 'rgba(0,0,0,0.7)', backdropFilter: 'blur(4px)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
      }}
    >
      <div
        onClick={e => e.stopPropagation()}
        style={{
          background: S.bgSurface, borderRadius: 'var(--radius-xl)',
          padding: 'clamp(16px, 3vh, 28px) clamp(14px, 4vw, 24px)',
          width, maxWidth: '92vw', maxHeight: '88vh',
          display: 'flex', flexDirection: 'column',
          border: '1px solid rgba(255,255,255,0.06)',
          boxShadow: '0 16px 48px rgba(0,0,0,0.5)',
          overflow: 'hidden',
        }}
      >
        {children}
      </div>
    </div>
  );

  // Toggle switch
  const toggle = (on: boolean, onClick: () => void) => (
    <button
      onClick={onClick}
      style={{
        width: 44, height: 24, borderRadius: 12, border: 'none', cursor: 'pointer',
        background: on ? S.accent : 'rgba(255,255,255,0.1)',
        position: 'relative', transition: 'background 0.2s',
      }}
    >
      <span style={{
        position: 'absolute', top: 2, width: 20, height: 20, borderRadius: '50%',
        background: '#fff', transition: 'left 0.2s',
        left: on ? 22 : 2,
      }} />
    </button>
  );

  // Stepper
  const stepper = (val: number, onDec: () => void, onInc: () => void, suffix?: string) => (
    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
      <button onClick={onDec} style={stepperBtnStyle}>−</button>
      <span style={{ fontSize: 'var(--fs-base)', fontWeight: 800, color: S.accent, minWidth: 24, textAlign: 'center' }}>{val}</span>
      <button onClick={onInc} style={stepperBtnStyle}>+</button>
      {suffix && <span style={{ fontSize: 'var(--fs-sm)', color: S.inkDim }}>{suffix}</span>}
    </div>
  );

  // Segmented control
  const segmented = (options: string[], active: string, onChange: (v: string) => void) => (
    <div style={{ display: 'flex', borderRadius: 'var(--radius-md)', overflow: 'hidden', border: '1px solid rgba(255,255,255,0.08)' }}>
      {options.map(opt => (
        <button key={opt} onClick={() => onChange(opt)}
          style={{
            padding: '8px 16px', border: 'none', cursor: 'pointer',
            fontSize: 'var(--fs-sm)', fontWeight: 700,
            background: active === opt ? S.accentSoft : 'transparent',
            color: active === opt ? S.accent : S.inkDim,
            transition: 'all 0.15s',
          }}
        >{opt}</button>
      ))}
    </div>
  );

  // Level dots
  const levelDots = (level: number, onChange: (lv: number) => void) => (
    <div style={{ display: 'flex', gap: 4 }}>
      {[1, 2, 3, 4, 5].map(lv => (
        <button key={lv} onClick={() => onChange(lv)}
          style={{
            width: 26, height: 26, borderRadius: '50%', border: level === lv ? `1px solid ${S.accent}` : '1px solid rgba(255,255,255,0.1)',
            background: level === lv ? S.accentSoft : 'rgba(255,255,255,0.04)',
            color: level === lv ? S.accent : S.inkDim,
            fontSize: 'var(--fs-xs)', fontWeight: 700, cursor: 'pointer',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}
        >{lv}</button>
      ))}
    </div>
  );

  // Setting row (reusable)
  const settingRow = (label: string, right: React.ReactNode) => (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: 'clamp(6px, 1.2vh, 10px) 0' }}>
      <span style={{ fontSize: 'var(--fs-sm)', fontWeight: 600, color: S.ink2 }}>{label}</span>
      {right}
    </div>
  );

  // ===== RENDER =====
  return (
    <div style={{
      width: '100%', height: '100%', background: S.bgDeep,
      display: 'flex', flexDirection: 'column', alignItems: 'center',
      justifyContent: 'center', overflow: 'hidden', position: 'relative',
    }}>
      {/* Title */}
      <div style={{ textAlign: 'center', lineHeight: 1.1, cursor: 'pointer', userSelect: 'none' }} onClick={onTitleTap}>
        <span style={{
          display: 'block', fontSize: 'clamp(28px, 9vmin, 52px)', fontWeight: 900,
          background: 'linear-gradient(180deg, #f5d78c 0%, #f0a828 60%, #b87514 100%)',
          WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent',
          letterSpacing: '0.04em',
        }}>找兄弟</span>
        <span style={{
          display: 'block', fontSize: 'var(--fs-sm)', color: S.inkDim,
          letterSpacing: '0.15em', marginTop: 4,
        }}>红三 · 坨坨牌</span>
      </div>

      {/* Bottom buttons — middle-lower area */}
      <div style={{
        display: 'flex', gap: 'clamp(6px, 1.5vw, 10px)',
        marginTop: 'clamp(32px, 8vh, 64px)',
        padding: '0 clamp(10px, 4vw, 24px)',
        width: '100%', maxWidth: 'clamp(260px, 60vmin, 360px)',
      }}>
        <button onClick={() => { playSound('click'); goCreateRoom(); }}
          className="btn-game btn-primary"
          style={{ flex: 1, padding: 'clamp(10px, 2vh, 14px) 0', fontSize: 'var(--fs-base)', borderRadius: 'var(--radius-lg)' }}>
          创建房间
        </button>
        <button onClick={() => { playSound('click'); openJoinModal(); }}
          className="btn-game btn-secondary"
          style={{ flex: 1, padding: 'clamp(10px, 2vh, 14px) 0', fontSize: 'var(--fs-base)' }}>
          加入游戏
        </button>
      </div>

      {/* ===== Online Mode Section ===== */}
      <div style={{
        marginTop: 'clamp(20px, 5vh, 44px)',
        padding: '0 clamp(10px, 4vw, 24px)',
        width: '100%', maxWidth: 'clamp(260px, 60vmin, 360px)',
      }}>
        {/* Divider */}
        <div style={{
          display: 'flex', alignItems: 'center', gap: 10, marginBottom: 'clamp(12px, 2.5vh, 18px)',
        }}>
          <div style={{ flex: 1, height: 1, background: 'rgba(255,255,255,0.08)' }} />
          <span style={{ fontSize: 'var(--fs-xs)', color: S.inkDim, fontWeight: 700, letterSpacing: '0.1em' }}>联网对战</span>
          <div style={{ flex: 1, height: 1, background: 'rgba(255,255,255,0.08)' }} />
        </div>

        {!auth.isLoggedIn ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            <button onClick={() => { setAuthView('login'); setAuthError(''); setShowAuthModal(true); }}
              style={{
                width: '100%', padding: 'clamp(8px, 1.5vh, 12px) 0',
                borderRadius: 'var(--radius-lg)', border: '1px solid rgba(96,165,250,0.3)',
                background: 'rgba(96,165,250,0.08)', color: '#60a5fa',
                fontSize: 'var(--fs-sm)', fontWeight: 700, cursor: 'pointer',
              }}>
              🔑 登录 / 注册
            </button>
            {/* Server config */}
            <div style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
              <input
                value={serverHost} onChange={e => setServerHost(e.target.value)}
                placeholder="服务器地址"
                style={{
                  flex: 1, padding: '4px 8px', background: 'rgba(255,255,255,0.03)',
                  border: '1px solid rgba(255,255,255,0.08)', borderRadius: 'var(--radius-sm)',
                  color: S.inkDim, fontSize: '11px', outline: 'none',
                }}
              />
              <input
                value={serverPort} onChange={e => setServerPort(e.target.value)}
                placeholder="3001"
                style={{
                  width: 48, padding: '4px 6px', background: 'rgba(255,255,255,0.03)',
                  border: '1px solid rgba(255,255,255,0.08)', borderRadius: 'var(--radius-sm)',
                  color: S.inkDim, fontSize: '11px', outline: 'none', textAlign: 'center',
                }}
              />
              <button onClick={saveServerConfig}
                style={{
                  padding: '4px 8px', borderRadius: 'var(--radius-sm)', fontSize: '11px',
                  background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.06)',
                  color: S.inkDim, cursor: 'pointer', fontWeight: 600,
                }}>保存</button>
            </div>
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {/* User info bar */}
            <div style={{
              display: 'flex', alignItems: 'center', justifyContent: 'space-between',
              background: 'rgba(240,168,40,0.06)', borderRadius: 'var(--radius-md)',
              padding: '6px 12px', border: '1px solid rgba(240,168,40,0.12)',
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <span style={{ fontSize: 14 }}>👤</span>
                <span style={{ fontSize: 'var(--fs-sm)', fontWeight: 700, color: S.accent }}>{auth.nickname}</span>
                <span style={{
                  fontSize: 9, color: online.connectionStatus === 'connected' ? S.green : S.inkDim,
                  padding: '1px 6px', borderRadius: 8,
                  background: online.connectionStatus === 'connected' ? S.greenSoft : 'rgba(255,255,255,0.04)',
                }}>
                  {online.connectionStatus === 'connected' ? '在线' : '离线'}
                </span>
              </div>
              <button onClick={doLogout}
                style={{
                  background: 'none', border: 'none', color: S.inkDim, fontSize: 'var(--fs-xs)',
                  cursor: 'pointer', fontWeight: 600,
                }}>退出</button>
            </div>
            {/* Online buttons */}
            <div style={{ display: 'flex', gap: 8 }}>
              <button onClick={goOnlineCreateRoom}
                className="btn-game btn-primary"
                style={{ flex: 1, padding: 'clamp(8px, 1.5vh, 12px) 0', fontSize: 'var(--fs-sm)' }}>
                🌐 创建在线房间
              </button>
              <button onClick={() => { setOnlineJoinCode(''); setShowOnlineCreate(true); }}
                className="btn-game btn-secondary"
                style={{ flex: 1, padding: 'clamp(8px, 1.5vh, 12px) 0', fontSize: 'var(--fs-sm)' }}>
                🔗 加入在线房间
              </button>
            </div>
          </div>
        )}
      </div>

      {/* ===== Join Room Modal ===== */}
      {showJoinModal && modalShell(closeAllModals,
        <>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12, flexShrink: 0 }}>
            <span style={{ fontSize: 'var(--fs-md)', fontWeight: 800 }}>加入房间</span>
            <button onClick={closeAllModals}
              style={{ background: 'none', border: 'none', color: S.inkDim, fontSize: 20, cursor: 'pointer', padding: 4 }}>✕</button>
          </div>
          <div style={{ overflowY: 'auto', flex: 1 }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <span style={{ fontSize: 'var(--fs-sm)', fontWeight: 600, color: S.ink2 }}>房间号</span>
              <div style={{ display: 'flex', gap: 6 }}>
                {[0, 1, 2, 3].map(i => (
                  <div key={i} style={{
                    width: 'clamp(32px, 8vmin, 44px)', height: 'clamp(32px, 8vmin, 44px)',
                    border: `1px solid rgba(240,168,40,0.2)`, borderRadius: 'var(--radius-md)',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    background: 'rgba(255,255,255,0.03)',
                  }}>
                    <span style={{ fontSize: 'var(--fs-lg)', fontWeight: 900, color: S.accent }}>{joinRoomCode[i] || ''}</span>
                  </div>
                ))}
              </div>
            </div>
            <input
              type="text" inputMode="numeric"
              style={{
                width: '100%', marginTop: 12, padding: 'clamp(8px, 1.5vh, 12px)',
                background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)',
                borderRadius: 'var(--radius-md)', color: S.ink,
                fontSize: 'clamp(18px, 5vmin, 28px)', textAlign: 'center',
                letterSpacing: '0.3em', outline: 'none',
              }}
              placeholder="输入4位房间号"
              value={joinRoomCode}
              onChange={onJoinCodeChange}
              maxLength={4}
            />
          </div>
          <div style={{ display: 'flex', gap: 'clamp(8px, 2vw, 12px)', marginTop: 12, flexShrink: 0 }}>
            <button onClick={closeAllModals} className="btn-game btn-secondary" style={{ flex: 1, padding: 'clamp(8px, 1.5vh, 12px) 0', fontSize: 'var(--fs-sm)' }}>取消</button>
            <button onClick={confirmJoinRoom} disabled={joinRoomCode.length < 4}
              className="btn-game btn-primary"
              style={{ flex: 1, padding: 'clamp(8px, 1.5vh, 12px) 0', fontSize: 'var(--fs-sm)', opacity: joinRoomCode.length < 4 ? 0.4 : 1 }}>
              加入房间
            </button>
          </div>
        </>
      )}

      {/* ===== Auth Modal (Login/Register) ===== */}
      {showAuthModal && modalShell(() => { setShowAuthModal(false); setAuthError(''); },
        <>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12, flexShrink: 0 }}>
            <span style={{ fontSize: 'var(--fs-md)', fontWeight: 800 }}>
              {authView === 'login' ? '登录' : '注册'}
            </span>
            <button onClick={() => { setShowAuthModal(false); setAuthError(''); }}
              style={{ background: 'none', border: 'none', color: S.inkDim, fontSize: 20, cursor: 'pointer', padding: 4 }}>✕</button>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            <input
              value={authUsername} onChange={e => setAuthUsername(e.target.value)}
              placeholder="用户名"
              style={inputStyle}
            />
            {authView === 'register' && (
              <input
                value={authNickname} onChange={e => setAuthNickname(e.target.value)}
                placeholder="昵称（游戏内显示）"
                style={inputStyle}
              />
            )}
            <input
              type="password"
              value={authPassword} onChange={e => setAuthPassword(e.target.value)}
              placeholder="密码"
              onKeyDown={e => {
                if (e.key === 'Enter') {
                  authView === 'login' ? doLogin() : doRegister();
                }
              }}
              style={inputStyle}
            />

            {authError && (
              <div style={{ fontSize: 'var(--fs-xs)', color: S.red, padding: '4px 8px', background: S.redSoft, borderRadius: 'var(--radius-sm)' }}>
                {authError}
              </div>
            )}

            <button
              onClick={authView === 'login' ? doLogin : doRegister}
              disabled={authLoading}
              className="btn-game btn-primary"
              style={{ width: '100%', padding: 'clamp(8px, 1.5vh, 12px) 0', fontSize: 'var(--fs-sm)', opacity: authLoading ? 0.6 : 1 }}>
              {authLoading ? '请稍候...' : (authView === 'login' ? '登录' : '注册')}
            </button>

            <button
              onClick={() => { setAuthView(authView === 'login' ? 'register' : 'login'); setAuthError(''); }}
              style={{
                background: 'none', border: 'none', color: '#60a5fa', fontSize: 'var(--fs-xs)',
                cursor: 'pointer', fontWeight: 600,
              }}>
              {authView === 'login' ? '没有账号？立即注册' : '已有账号？去登录'}
            </button>
          </div>
        </>
      )}

      {/* ===== Online Join Room Modal ===== */}
      {showOnlineCreate && modalShell(() => setShowOnlineCreate(false),
        <>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12, flexShrink: 0 }}>
            <span style={{ fontSize: 'var(--fs-md)', fontWeight: 800 }}>加入在线房间</span>
            <button onClick={() => setShowOnlineCreate(false)}
              style={{ background: 'none', border: 'none', color: S.inkDim, fontSize: 20, cursor: 'pointer', padding: 4 }}>✕</button>
          </div>
          <div style={{ display: 'flex', gap: 6, marginBottom: 12 }}>
            {[0, 1, 2, 3].map(i => (
              <div key={i} style={{
                width: 'clamp(32px, 8vmin, 44px)', height: 'clamp(32px, 8vmin, 44px)',
                border: '1px solid rgba(240,168,40,0.2)', borderRadius: 'var(--radius-md)',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                background: 'rgba(255,255,255,0.03)',
              }}>
                <span style={{ fontSize: 'var(--fs-lg)', fontWeight: 900, color: S.accent }}>{onlineJoinCode[i] || ''}</span>
              </div>
            ))}
          </div>
          <input
            type="text" inputMode="numeric"
            style={{
              width: '100%', padding: 'clamp(8px, 1.5vh, 12px)',
              background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)',
              borderRadius: 'var(--radius-md)', color: S.ink,
              fontSize: 'clamp(18px, 5vmin, 28px)', textAlign: 'center',
              letterSpacing: '0.3em', outline: 'none',
            }}
            placeholder="输入4位房间号"
            value={onlineJoinCode}
            onChange={e => {
              const val = e.target.value.replace(/\D/g, '').slice(0, 4);
              setOnlineJoinCode(val);
            }}
            maxLength={4}
            onKeyDown={e => { if (e.key === 'Enter') goOnlineJoinRoom(); }}
          />
          <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
            <button onClick={() => setShowOnlineCreate(false)} className="btn-game btn-secondary" style={{ flex: 1, padding: 'clamp(8px, 1.5vh, 12px) 0', fontSize: 'var(--fs-sm)' }}>取消</button>
            <button onClick={goOnlineJoinRoom} disabled={onlineJoinCode.length < 4}
              className="btn-game btn-primary"
              style={{ flex: 1, padding: 'clamp(8px, 1.5vh, 12px) 0', fontSize: 'var(--fs-sm)', opacity: onlineJoinCode.length < 4 ? 0.4 : 1 }}>
              加入房间
            </button>
          </div>
        </>
      )}

      {/* ===== Dev Mode Modal ===== */}
      {showDevModal && modalShell(closeAllModals,
        <>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12, flexShrink: 0,
            padding: '0 0 10px 0', borderBottom: '1px solid rgba(122,184,126,0.12)' }}>
            <span style={{ fontSize: 'var(--fs-md)', fontWeight: 800, color: S.green }}>🔧 开发者模式</span>
            <button onClick={closeAllModals}
              style={{ background: 'none', border: 'none', color: S.inkDim, fontSize: 20, cursor: 'pointer', padding: 4 }}>✕</button>
          </div>
          <div style={{ overflowY: 'auto', flex: 1 }}>
            <span style={{ display: 'block', fontSize: 'var(--fs-xs)', fontWeight: 800, color: S.green, opacity: 0.7, marginTop: 8, marginBottom: 4, textTransform: 'uppercase', letterSpacing: '0.06em' }}>房间配置</span>
            {settingRow('底注金额', stepper(baseAmount, decBase, incBase, '元'))}
            {settingRow('翻法', segmented(['平翻', '陡翻'], doubleType === 'flat' ? '平翻' : '陡翻', v => setDoubleType(v === '平翻' ? 'flat' : 'steep')))}
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: 'clamp(6px, 1.2vh, 10px) 0' }}>
              <span style={{ fontSize: 'var(--fs-sm)', fontWeight: 600, color: S.ink2 }}>坨坨牌</span>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                {toggle(smartShuffle, () => setSmartShuffle(!smartShuffle))}
                {smartShuffle && levelDots(smartShuffleLevel, setSmartShuffleLevel)}
              </div>
            </div>

            <span style={{ display: 'block', fontSize: 'var(--fs-xs)', fontWeight: 800, color: S.green, opacity: 0.7, marginTop: 14, marginBottom: 4, textTransform: 'uppercase', letterSpacing: '0.06em' }}>机器人玩家 ({devPlayers.length}/3)</span>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              {devPlayers.map((p, i) => (
                <div key={i} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', background: 'rgba(255,255,255,0.03)', borderRadius: 'var(--radius-md)', padding: '6px 10px' }}>
                  <span style={{ fontSize: 'var(--fs-sm)', fontWeight: 600 }}>{p.name}</span>
                  <button onClick={() => removeBot(i)}
                    style={{ background: S.redSoft, color: S.red, border: `1px solid rgba(196,107,107,0.2)`, borderRadius: 'var(--radius-sm)', padding: '2px 10px', fontSize: 'var(--fs-xs)', fontWeight: 700, cursor: 'pointer' }}>移除</button>
                </div>
              ))}
            </div>
            {devPlayers.length < 3 && (
              <button onClick={addDevBot}
                style={{ width: '100%', marginTop: 6, padding: '8px 0', borderRadius: 'var(--radius-md)', background: S.greenSoft, color: S.green, border: '1px dashed rgba(122,184,126,0.25)', fontSize: 'var(--fs-sm)', fontWeight: 700, cursor: 'pointer' }}>
                + 添加电脑 ({devPlayers.length + 1}/3)
              </button>
            )}

            <span style={{ display: 'block', fontSize: 'var(--fs-xs)', fontWeight: 800, color: S.green, opacity: 0.7, marginTop: 14, marginBottom: 4, textTransform: 'uppercase', letterSpacing: '0.06em' }}>测试模式</span>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
              {[
                { type: 'business-self', label: '自己做业务（2个红三发给我）' },
                { type: 'business-other', label: '其他玩家做业务（2个红三随机发给电脑）' },
                { type: 'normal-22', label: '正常22阵营（2张红三分开发）' },
              ].map(opt => (
                <div key={opt.type} onClick={() => setTestModeType(opt.type)}
                  style={{
                    display: 'flex', alignItems: 'center', gap: 8, padding: '6px 10px',
                    borderRadius: 'var(--radius-md)', cursor: 'pointer',
                    background: testModeType === opt.type ? 'rgba(122,184,126,0.06)' : 'rgba(255,255,255,0.02)',
                    border: testModeType === opt.type ? '1px solid rgba(122,184,126,0.2)' : '1px solid rgba(255,255,255,0.04)',
                  }}>
                  <div style={{
                    width: 14, height: 14, borderRadius: '50%', flexShrink: 0,
                    border: testModeType === opt.type ? `2px solid ${S.green}` : '2px solid rgba(255,255,255,0.2)',
                    background: testModeType === opt.type ? S.green : 'transparent',
                  }} />
                  <span style={{ fontSize: 'var(--fs-xs)', color: testModeType === opt.type ? S.ink : S.ink2 }}>{opt.label}</span>
                </div>
              ))}
            </div>

            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: 'clamp(6px, 1.2vh, 10px) 0', marginTop: 4 }}>
              <div>
                <span style={{ fontSize: 'var(--fs-sm)', fontWeight: 600, color: S.ink2 }}>电脑明牌 </span>
                <span style={{ fontSize: 'var(--fs-xs)', color: S.inkDim }}>开启后电脑牌面朝上</span>
              </div>
              {toggle(botRevealed, () => setBotRevealed(!botRevealed))}
            </div>

            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: 'clamp(6px, 1.2vh, 10px) 0' }}>
              <div>
                <span style={{ fontSize: 'var(--fs-sm)', fontWeight: 600, color: S.ink2 }}>直接最终局 </span>
                <span style={{ fontSize: 'var(--fs-xs)', color: S.inkDim }}>首局即为最后一局</span>
              </div>
              {toggle(skipToFinalRound, () => setSkipToFinalRound(!skipToFinalRound))}
            </div>
          </div>
          <div style={{ display: 'flex', gap: 'clamp(8px, 2vw, 12px)', marginTop: 12, flexShrink: 0 }}>
            <button onClick={closeAllModals} className="btn-game btn-secondary" style={{ flex: 1, padding: 'clamp(8px, 1.5vh, 12px) 0', fontSize: 'var(--fs-sm)' }}>取消</button>
            <button onClick={startDevGame} className="btn-game" style={{ flex: 1, padding: 'clamp(8px, 1.5vh, 12px) 0', fontSize: 'var(--fs-sm)', fontWeight: 700, borderRadius: 'var(--radius-lg)', border: 'none', cursor: 'pointer', background: S.green, color: '#1a1510' }}>开始游戏</button>
          </div>
        </>
      )}
    </div>
  );
}

// Shared style objects
const stepperBtnStyle: React.CSSProperties = {
  width: 28, height: 28, borderRadius: '50%',
  background: 'var(--bg-card)', color: 'var(--ink-primary)',
  border: '1px solid rgba(255,255,255,0.08)',
  fontSize: 16, cursor: 'pointer',
  display: 'flex', alignItems: 'center', justifyContent: 'center',
};

const inputStyle: React.CSSProperties = {
  width: '100%', padding: 'clamp(8px, 1.5vh, 12px)',
  background: 'rgba(255,255,255,0.04)',
  border: '1px solid rgba(255,255,255,0.08)',
  borderRadius: 'var(--radius-md)',
  color: 'var(--ink-primary)',
  fontSize: 'var(--fs-sm)',
  outline: 'none',
};
