import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { playSound } from '../lib/sound';
import { useGameStore } from '../stores/gameStore';
import { networkClient } from '../network/NetworkGameClient';

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

  const [baseAmount] = useState(5);
  const [doubleType] = useState<'flat' | 'steep'>('flat');
  const [smartShuffle] = useState(false);
  const [smartShuffleLevel] = useState(3);

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
    // Subscribe BEFORE joining to capture initial room_state broadcast
    // (server broadcasts on addPlayer, but Room component hasn't mounted yet)
    let captured = false;
    const unsub1 = networkClient.onRoomState((players, config, ownerId) => {
      sessionStorage.setItem('onlineRoomPlayers', JSON.stringify(players));
      sessionStorage.setItem('onlineRoomConfig', JSON.stringify(config));
      if (ownerId !== undefined) sessionStorage.setItem('onlineRoomOwnerId', String(ownerId));
      if (!captured) {
        captured = true;
        unsub1(); // only need the first broadcast
      }
    });
    networkClient.joinRoom(onlineJoinCode);
    setTimeout(() => {
      sessionStorage.setItem('roomAction', 'join');
      sessionStorage.setItem('onlineRoomCode', onlineJoinCode);
      navigate(`/room/${onlineJoinCode}?online=1`);
    }, 500);
  };

  const saveServerConfig = () => {
    setServerConfig(serverHost, serverPort);
    playSound('click');
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

  // ===== RENDER =====
  return (
    <div style={{
      width: '100%', height: '100%', background: S.bgDeep,
      display: 'flex', flexDirection: 'column', alignItems: 'center',
      justifyContent: 'center', overflow: 'hidden', position: 'relative',
    }}>
      {/* Title */}
      <div style={{ textAlign: 'center', lineHeight: 1.1 }}>
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

    </div>
  );
}

// Shared style objects
const inputStyle: React.CSSProperties = {
  width: '100%', padding: 'clamp(8px, 1.5vh, 12px)',
  background: 'rgba(255,255,255,0.04)',
  border: '1px solid rgba(255,255,255,0.08)',
  borderRadius: 'var(--radius-md)',
  color: 'var(--ink-primary)',
  fontSize: 'var(--fs-sm)',
  outline: 'none',
};
