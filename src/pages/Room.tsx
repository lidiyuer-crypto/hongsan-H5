import { useState, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import GameEngine from '../engine/gameEngine';

interface Player {
  openid: string;
  name: string;
  avatarUrl?: string;
  isBot: boolean;
  seat: number;
  ready?: boolean;
}

const ROUND_OPTIONS = [
  { rounds: 8, cost: 2 },
  { rounds: 16, cost: 4 },
  { rounds: 24, cost: 6 },
  { rounds: 32, cost: 8 },
];

export default function Room() {
  const { roomCode: paramCode } = useParams<{ roomCode: string }>();
  const navigate = useNavigate();

  const savedConfig = (() => {
    try { return JSON.parse(sessionStorage.getItem('roomConfig') || '{}'); } catch { return {}; }
  })();
  const action = sessionStorage.getItem('roomAction') || 'create';
  const code = paramCode || sessionStorage.getItem('joinCode') || '----';

  const [roomCode] = useState(code);
  const [isOwner] = useState(action === 'create');
  const [ownerId] = useState(action === 'create' ? 'player_me' : '');
  const [players, setPlayers] = useState<Player[]>(() => {
    if (action === 'create') {
      return [{ openid: 'player_me', name: '房主', avatarUrl: '', isBot: false, seat: 0, ready: true }];
    }
    return [];
  });
  const [myReady, setMyReady] = useState(action === 'create');
  const [baseAmount, setBaseAmount] = useState(savedConfig.baseAmount || 5);
  const [doubleType, setDoubleType] = useState<'flat' | 'steep'>(savedConfig.doubleType || 'flat');
  const [smartShuffle, setSmartShuffle] = useState(savedConfig.smartShuffle || false);
  const [smartShuffleLevel, setSmartShuffleLevel] = useState(savedConfig.smartShuffleLevel || 3);
  const [roundCount, setRoundCount] = useState(8);
  const [showHandCount, setShowHandCount] = useState(savedConfig.showHandCount !== false);

  const allReady = players.length === 4 && players.every(p => p.ready);
  const diamondCost = ROUND_OPTIONS.find(o => o.rounds === roundCount)?.cost || 2;

  const addBot = useCallback(() => {
    if (players.length >= 4) return;
    const idx = players.length;
    const botNames = ['电脑A', '电脑B', '电脑C'];
    const newPlayer: Player = {
      openid: 'bot_' + idx, name: botNames[idx - 1] || ('电脑' + idx),
      isBot: true, seat: idx, ready: true,
    };
    setPlayers([...players, newPlayer]);
  }, [players]);

  const toggleReady = () => {
    if (isOwner) return;
    setPlayers(players.map(p =>
      p.openid === 'player_me' ? { ...p, ready: !myReady } : p
    ));
    setMyReady(!myReady);
  };

  const startGame = () => {
    if (!allReady) return;
    const config = { baseAmount, doubleType, smartShuffle, smartShuffleLevel, totalRounds: roundCount, showHandCount };
    const engine = new GameEngine();
    engine.createGame(players.map((p, i) => ({
      id: i, openid: p.openid, seat: i,
      name: p.name, avatarUrl: p.avatarUrl || '',
      isBot: p.isBot, hand: [], pot: 0, finished: false,
      isRed3Team: false, revealed: false, rank: null, canChe: false,
    })), config);
    sessionStorage.setItem('localGame', JSON.stringify(engine._state));
    navigate(`/game/${engine._state.gameId}`);
  };

  const leaveRoom = () => { navigate('/'); };

  // ===== RENDER =====
  return (
    <div style={{
      width: '100%', height: '100%', background: 'var(--bg-deep)',
      display: 'flex', flexDirection: 'column', overflow: 'hidden',
    }}>
      {/* Top bar */}
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        padding: 'clamp(8px, 2vh, 14px) clamp(10px, 4vw, 20px)',
        flexShrink: 0,
      }}>
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 6 }}>
          <span style={{ fontSize: 'var(--fs-xs)', color: 'var(--ink-dim)' }}>房间号</span>
          <span style={{
            fontSize: 'clamp(18px, 5vmin, 28px)', fontWeight: 900,
            color: 'var(--accent)', letterSpacing: '0.12em',
          }}>{roomCode}</span>
        </div>
        <div style={{
          display: 'flex', alignItems: 'center', gap: 4,
          background: 'var(--bg-card)', padding: '6px 12px',
          borderRadius: 'var(--radius-xl)', fontSize: 'var(--fs-sm)', fontWeight: 700,
        }}>💎 0</div>
      </div>

      {/* Main: left settings + right seats */}
      <div style={{ flex: 1, display: 'flex', minHeight: 0 }}>
        {/* Left: Settings card */}
        <div style={{
          width: '38%', flexShrink: 0, display: 'flex',
          alignItems: 'center', justifyContent: 'center',
          padding: '0 clamp(6px, 2vw, 12px)',
        }}>
          <div style={{
            background: 'var(--bg-card)', borderRadius: 'var(--radius-lg)',
            padding: 'clamp(10px, 2.5vh, 20px) clamp(10px, 2.5vw, 16px)',
            width: '100%', border: '1px solid rgba(255,255,255,0.04)',
          }}>
            {/* 底注 */}
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: 'clamp(6px, 1.2vh, 10px) 0' }}>
              <span style={{ fontSize: 'var(--fs-sm)', fontWeight: 600, color: 'var(--ink-secondary)' }}>底注</span>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <button onClick={() => { if (baseAmount > 1) setBaseAmount(baseAmount - 1); }}
                  style={stepperBtn}>−</button>
                <span style={{ fontSize: 'var(--fs-base)', fontWeight: 800, color: 'var(--accent)', minWidth: 20, textAlign: 'center' }}>{baseAmount}</span>
                <button onClick={() => setBaseAmount(baseAmount + 1)}
                  style={stepperBtn}>+</button>
              </div>
              <span style={{ fontSize: 'var(--fs-xs)', color: 'var(--ink-dim)' }}>元</span>
            </div>

            {/* 翻法 */}
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: 'clamp(6px, 1.2vh, 10px) 0' }}>
              <span style={{ fontSize: 'var(--fs-sm)', fontWeight: 600, color: 'var(--ink-secondary)' }}>翻法</span>
              <div style={{ display: 'flex', borderRadius: 'var(--radius-md)', overflow: 'hidden', border: '1px solid rgba(255,255,255,0.08)' }}>
                <button onClick={() => setDoubleType('flat')}
                  style={segBtnStyle(doubleType === 'flat')}>平翻</button>
                <button onClick={() => setDoubleType('steep')}
                  style={segBtnStyle(doubleType === 'steep')}>陡翻</button>
              </div>
            </div>

            {/* 坨坨牌 */}
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: 'clamp(6px, 1.2vh, 10px) 0' }}>
              <span style={{ fontSize: 'var(--fs-sm)', fontWeight: 600, color: 'var(--ink-secondary)' }}>坨坨牌</span>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <button onClick={() => setSmartShuffle(!smartShuffle)}
                  style={{
                    width: 44, height: 24, borderRadius: 12, border: 'none', cursor: 'pointer',
                    background: smartShuffle ? 'var(--accent)' : 'rgba(255,255,255,0.1)',
                    position: 'relative', transition: 'background 0.2s',
                  }}>
                  <span style={{
                    position: 'absolute', top: 2, width: 20, height: 20, borderRadius: '50%',
                    background: '#fff', transition: 'left 0.2s',
                    left: smartShuffle ? 22 : 2,
                  }} />
                </button>
                {smartShuffle && (
                  <div style={{ display: 'flex', gap: 3 }}>
                    {[1, 2, 3, 4, 5].map(lv => (
                      <button key={lv} onClick={() => setSmartShuffleLevel(lv)}
                        style={{
                          width: 24, height: 24, borderRadius: '50%', cursor: 'pointer',
                          border: smartShuffleLevel === lv ? '1px solid rgba(240,168,40,0.3)' : '1px solid rgba(255,255,255,0.08)',
                          background: smartShuffleLevel === lv ? 'var(--accent-soft)' : 'rgba(255,255,255,0.03)',
                          color: smartShuffleLevel === lv ? 'var(--accent)' : 'var(--ink-dim)',
                          fontSize: 'var(--fs-xs)', fontWeight: 700,
                          display: 'flex', alignItems: 'center', justifyContent: 'center',
                        }}
                      >{lv}</button>
                    ))}
                  </div>
                )}
              </div>
            </div>

            {/* 显示手牌数量 */}
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: 'clamp(6px, 1.2vh, 10px) 0' }}>
              <span style={{ fontSize: 'var(--fs-sm)', fontWeight: 600, color: 'var(--ink-secondary)' }}>手牌数量</span>
              <button onClick={() => setShowHandCount(!showHandCount)}
                style={{
                  width: 44, height: 24, borderRadius: 12, border: 'none', cursor: 'pointer',
                  background: showHandCount ? 'var(--accent)' : 'rgba(255,255,255,0.1)',
                  position: 'relative', transition: 'background 0.2s',
                }}>
                <span style={{
                  position: 'absolute', top: 2, width: 20, height: 20, borderRadius: '50%',
                  background: '#fff', transition: 'left 0.2s',
                  left: showHandCount ? 22 : 2,
                }} />
              </button>
            </div>

            {/* 局数 */}
            <div style={{ padding: 'clamp(6px, 1.2vh, 10px) 0' }}>
              <span style={{ fontSize: 'var(--fs-sm)', fontWeight: 600, color: 'var(--ink-secondary)', display: 'block', marginBottom: 6 }}>局数</span>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr 1fr', gap: 4 }}>
                {ROUND_OPTIONS.map(opt => (
                  <button key={opt.rounds} onClick={() => setRoundCount(opt.rounds)}
                    style={{
                      padding: '6px 0', borderRadius: 'var(--radius-md)', cursor: 'pointer', border: 'none',
                      background: roundCount === opt.rounds ? 'var(--accent-soft)' : 'transparent',
                      color: roundCount === opt.rounds ? 'var(--accent)' : 'var(--ink-dim)',
                      fontWeight: 700, fontSize: 'var(--fs-xs)',
                      display: 'flex', flexDirection: 'column', alignItems: 'center',
                      outline: roundCount === opt.rounds ? '1px solid rgba(240,168,40,0.2)' : 'none',
                    }}
                  >
                    <span>{opt.rounds}局</span>
                    <span style={{ fontSize: 9, opacity: 0.5 }}>{opt.cost}💎</span>
                  </button>
                ))}
              </div>
            </div>

            {/* 消耗 */}
            <div style={{
              display: 'flex', alignItems: 'center', justifyContent: 'space-between',
              padding: 'clamp(8px, 1.5vh, 12px) 0 0',
              borderTop: '1px solid rgba(255,255,255,0.04)', marginTop: 4,
            }}>
              <span style={{ fontSize: 'var(--fs-sm)', fontWeight: 600, color: 'var(--ink-secondary)' }}>消耗</span>
              <span style={{ fontSize: 'var(--fs-base)', fontWeight: 800, color: 'var(--accent)' }}>{diamondCost} 💎</span>
            </div>
          </div>
        </div>

        {/* Right: Seats + Actions */}
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', justifyContent: 'center', padding: '0 clamp(6px, 2vw, 12px) 0 0' }}>
          <div style={{
            display: 'grid', gridTemplateColumns: '1fr 1fr',
            gridTemplateRows: '1fr 1fr', gap: 'clamp(6px, 1.5vw, 10px)',
            flex: 1, alignContent: 'center',
          }}>
            {[0, 1, 2, 3].map(seatIdx => {
              const player = players[seatIdx];
              if (player) {
                const ready = player.openid === ownerId ? true : (player.ready || false);
                return (
                  <div key={seatIdx} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4 }}>
                    <div style={{
                      width: 'clamp(48px, 14vmin, 72px)', height: 'clamp(48px, 14vmin, 72px)',
                      borderRadius: '50%', background: 'var(--bg-card)',
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      fontSize: 'clamp(22px, 6vmin, 34px)',
                      border: ready && player.openid !== ownerId
                        ? '2px solid var(--green)'
                        : '2px solid rgba(255,255,255,0.06)',
                      boxShadow: ready && player.openid !== ownerId
                        ? '0 0 10px rgba(122,184,126,0.15)'
                        : 'none',
                      position: 'relative', overflow: 'hidden',
                    }}>
                      {player.avatarUrl ? (
                        <img src={player.avatarUrl} style={{ width: '100%', height: '100%', borderRadius: '50%', objectFit: 'cover' }} alt="" />
                      ) : (
                        <span>{player.isBot ? '🤖' : '👤'}</span>
                      )}
                      {ready && player.openid !== ownerId && (
                        <div style={{
                          position: 'absolute', bottom: 0, left: 0, right: 0,
                          background: 'rgba(0,0,0,0.7)', padding: '1px 0',
                          display: 'flex', justifyContent: 'center',
                        }}>
                          <span style={{ fontSize: 9, color: 'var(--green)', fontWeight: 800 }}>Ready</span>
                        </div>
                      )}
                    </div>
                    <span style={{ fontSize: 'var(--fs-xs)', fontWeight: 600, color: 'var(--ink-secondary)' }}>{player.name}</span>
                    <div style={{ display: 'flex', gap: 4 }}>
                      {player.openid === ownerId && <span style={badgeStyle('owner')}>房主</span>}
                      {player.isBot && <span style={badgeStyle('bot')}>电脑</span>}
                    </div>
                  </div>
                );
              }
              return (
                <div key={seatIdx} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4 }}>
                  <div style={{
                    width: 'clamp(48px, 14vmin, 72px)', height: 'clamp(48px, 14vmin, 72px)',
                    borderRadius: '50%', border: '2px dashed rgba(255,255,255,0.06)',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    color: 'var(--ink-dim)', fontSize: 'clamp(22px, 6vmin, 34px)',
                  }}>+</div>
                  <span style={{ fontSize: 'var(--fs-xs)', color: 'var(--ink-dim)' }}>等待加入</span>
                </div>
              );
            })}
          </div>

          {/* Action buttons */}
          <div style={{
            display: 'flex', gap: 8, justifyContent: 'center',
            padding: 'clamp(6px, 1.5vh, 12px) 0', flexShrink: 0,
          }}>
            {!isOwner && (
              <button onClick={toggleReady}
                className="btn-game"
                style={{
                  flex: 1, padding: 'clamp(8px, 1.8vh, 12px) 0',
                  fontSize: 'var(--fs-sm)', borderRadius: 'var(--radius-lg)',
                  background: myReady ? 'var(--green-soft)' : 'rgba(96,165,250,0.12)',
                  color: myReady ? 'var(--green)' : '#60a5fa',
                  border: myReady ? '1px solid rgba(122,184,126,0.25)' : '1px solid rgba(96,165,250,0.2)',
                }}
              >{myReady ? '✓ 已准备' : '点击准备'}</button>
            )}
            {isOwner && players.length < 4 && (
              <button onClick={addBot}
                className="btn-game"
                style={{
                  flex: 1, padding: 'clamp(8px, 1.8vh, 12px) 0',
                  fontSize: 'var(--fs-sm)', borderRadius: 'var(--radius-lg)',
                  background: 'var(--green-soft)', color: 'var(--green)',
                  border: '1px solid rgba(122,184,126,0.2)',
                }}
              >🤖 添加电脑</button>
            )}
            {isOwner && (
              <button onClick={startGame}
                className="btn-game"
                style={{
                  flex: 1, padding: 'clamp(8px, 1.8vh, 12px) 0',
                  fontSize: 'var(--fs-sm)', borderRadius: 'var(--radius-lg)',
                  background: allReady ? 'linear-gradient(135deg, #f0a828, #d4880f)' : 'rgba(255,255,255,0.06)',
                  color: allReady ? '#1a1510' : 'var(--ink-dim)',
                  border: 'none',
                }}
              >{allReady ? '开始游戏' : `等待加入 (${players.length}/4)`}</button>
            )}
            <button onClick={leaveRoom}
              className="btn-game"
              style={{
                padding: 'clamp(8px, 1.8vh, 12px) clamp(16px, 4vw, 24px)',
                fontSize: 'var(--fs-sm)', borderRadius: 'var(--radius-lg)',
                background: 'rgba(255,255,255,0.04)', color: 'var(--ink-dim)',
                border: '1px solid rgba(255,255,255,0.06)',
              }}
            >离开</button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ===== Shared styles =====

const stepperBtn: React.CSSProperties = {
  width: 28, height: 28, borderRadius: '50%',
  background: 'var(--bg-card)', color: 'var(--ink-primary)',
  border: '1px solid rgba(255,255,255,0.08)',
  fontSize: 16, cursor: 'pointer',
  display: 'flex', alignItems: 'center', justifyContent: 'center',
};

function segBtnStyle(active: boolean): React.CSSProperties {
  return {
    padding: '8px 16px', border: 'none', cursor: 'pointer',
    fontSize: 'var(--fs-sm)', fontWeight: 700,
    background: active ? 'var(--accent-soft)' : 'transparent',
    color: active ? 'var(--accent)' : 'var(--ink-dim)',
  };
}

function badgeStyle(type: 'owner' | 'bot'): React.CSSProperties {
  return {
    fontSize: 9, fontWeight: 700, padding: '1px 8px',
    borderRadius: 'var(--radius-sm)',
    background: type === 'owner' ? 'var(--accent-soft)' : 'var(--green-soft)',
    color: type === 'owner' ? 'var(--accent)' : 'var(--green)',
  };
}
