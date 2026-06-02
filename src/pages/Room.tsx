import { useState, useCallback, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { playSound } from '../lib/sound';
import { networkClient } from '../network/NetworkGameClient';
import { useGameStore } from '../stores/gameStore';

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
  const auth = useGameStore(s => s.auth);

  const savedConfig = (() => {
    try { return JSON.parse(sessionStorage.getItem('onlineRoomConfig') || '{}'); }
    catch { return {}; }
  })();
  const action = sessionStorage.getItem('roomAction') || '';  // '' = unknown (direct URL nav)
  const code = paramCode || sessionStorage.getItem('onlineRoomCode') || '----';

  const [roomCode, setRoomCode] = useState(code);
  // isOwner: sessionStorage.roomAction is the definitive source.
  // Only 'create' → owner. 'join' or '' → not owner (server may override '' case).
  const [isOwner, setIsOwner] = useState(action === 'create');
  const [onlineOwnerId, setOnlineOwnerId] = useState<number>(0);
  const [players, setPlayers] = useState<Player[]>([]);
  const [myReady, setMyReady] = useState(false);
  const [baseAmount, setBaseAmount] = useState(savedConfig.baseAmount || 5);
  const [doubleType, setDoubleType] = useState<'flat' | 'steep'>(savedConfig.doubleType || 'flat');
  const [smartShuffle, setSmartShuffle] = useState(savedConfig.smartShuffle || false);
  const [smartShuffleLevel, setSmartShuffleLevel] = useState(savedConfig.smartShuffleLevel || 3);
  const [roundCount, setRoundCount] = useState(savedConfig.totalRounds || 8);
  const [showHandCount, setShowHandCount] = useState(savedConfig.showHandCount !== false);
  const [errorMsg, setErrorMsg] = useState('');

  const allReady = players.length === 4 && players.every(p => p.ready || p.isBot);
  const diamondCost = ROUND_OPTIONS.find(o => o.rounds === roundCount)?.cost || 2;

  // ===== Subscribe to room state =====
  useEffect(() => {
    // Try to load existing players from sessionStorage
    try {
      const saved = sessionStorage.getItem('onlineRoomPlayers');
      if (saved) {
        const plist = JSON.parse(saved);
        setPlayers(plist.map((p: any) => ({
          openid: 'user_' + p.userId,
          name: p.name,
          avatarUrl: '',
          isBot: false,
          seat: p.seat,
          ready: p.ready,
        })));
      }
    } catch {}

    const unsub = networkClient.onRoomState((plist, config, ownerId) => {
      const mapped = plist.map(p => ({
        openid: 'user_' + p.userId,
        name: p.name,
        avatarUrl: '',
        isBot: p.isBot || false,
        seat: p.seat,
        ready: p.ready,
      }));
      setPlayers(mapped);
      // Persist to sessionStorage
      try { sessionStorage.setItem('onlineRoomPlayers', JSON.stringify(mapped)); } catch {}
      // Determine if current user is owner.
      // sessionStorage.roomAction is the definitive source (prevents same-user-2-tabs bug).
      // Only fall back to server ownerId when roomAction is unknown (direct URL nav).
      if (ownerId !== undefined) {
        setOnlineOwnerId(ownerId);
        const storedAction = sessionStorage.getItem('roomAction');
        if (storedAction === 'create') {
          setIsOwner(true);
        } else if (storedAction === 'join') {
          setIsOwner(false);
        } else {
          // No stored action (direct URL nav) — fall back to server
          setIsOwner(auth.userId === ownerId);
        }
      }
      // Sync my ready state
      const me = plist.find(p => p.userId === auth.userId);
      if (me) setMyReady(me.ready);
      // Save room code
      const savedRoomCode = sessionStorage.getItem('onlineRoomCode');
      if (!savedRoomCode && networkClient.roomCode) {
        setRoomCode(networkClient.roomCode);
        sessionStorage.setItem('onlineRoomCode', networkClient.roomCode);
      }
      if (config) {
        setBaseAmount(config.baseAmount);
        setDoubleType(config.doubleType);
        setSmartShuffle(config.smartShuffle);
        setSmartShuffleLevel(config.smartShuffleLevel);
        setRoundCount(config.totalRounds);
        setShowHandCount(config.showHandCount);
      }
    });

    // Listen for game start
    const unsub2 = networkClient.onStateChange((state) => {
      sessionStorage.setItem('onlineGameState', JSON.stringify(state));
      navigate(`/game/online-${state.gameId}`);
    });

    // Listen for errors
    const unsub3 = networkClient.onError((msg) => {
      setErrorMsg(msg);
      setTimeout(() => setErrorMsg(''), 4000);
    });

    return () => { unsub(); unsub2(); unsub3(); };
  }, [navigate]);

  // Sync room config to server when owner changes settings
  useEffect(() => {
    if (!isOwner) return;
    networkClient.updateConfig({
      baseAmount, doubleType, smartShuffle, smartShuffleLevel,
      totalRounds: roundCount, showHandCount,
    });
  }, [isOwner, baseAmount, doubleType, smartShuffle, smartShuffleLevel, roundCount, showHandCount]);

  const addBot = useCallback(() => {
    networkClient.addBot();
  }, []);

  const toggleReady = () => {
    networkClient.setReady();
  };

  const startGame = () => {
    networkClient.startGame();
  };

  const leaveRoom = () => {
    playSound('click');
    networkClient.leaveRoom();
    navigate('/');
  };

  // ===== RENDER =====
  return (
    <div style={{
      width: '100%', height: '100%', background: 'var(--bg-deep)',
      display: 'flex', flexDirection: 'column', overflow: 'hidden',
    }}>
      {/* Error toast */}
      {errorMsg && (
        <div style={{
          position: 'fixed', top: 16, left: '50%', transform: 'translateX(-50%)', zIndex: 300,
          background: 'rgba(196,107,107,0.95)', color: '#fff', padding: '8px 20px',
          borderRadius: 'var(--radius-lg)', fontSize: 'var(--fs-sm)', fontWeight: 700,
          boxShadow: '0 4px 16px rgba(0,0,0,0.4)',
          pointerEvents: 'none',
        }}>{errorMsg}</div>
      )}

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
        {/* Left: Settings card (owner only) or Room info (non-owner) */}
        <div style={{
          width: '38%', flexShrink: 0, display: 'flex',
          alignItems: 'center', justifyContent: 'center',
          padding: '0 clamp(6px, 2vw, 12px)',
        }}>
          {isOwner ? (
            /* Owner: full settings panel */
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
                <span style={{ fontSize: 'var(--fs-sm)', fontWeight: 600, color: 'var(--ink-secondary)' }}>显示手牌数量</span>
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
          ) : (
            /* Non-owner: simplified room info */
            <div style={{
              background: 'var(--bg-card)', borderRadius: 'var(--radius-lg)',
              padding: 'clamp(16px, 3vh, 24px) clamp(12px, 2.5vw, 16px)',
              width: '100%', border: '1px solid rgba(255,255,255,0.04)',
              display: 'flex', flexDirection: 'column', gap: 12, alignItems: 'center',
            }}>
              <div style={{ fontSize: 'var(--fs-xl)', opacity: 0.6 }}>🎴</div>
              <div style={{ fontSize: 'var(--fs-sm)', color: 'var(--ink-secondary)', textAlign: 'center', lineHeight: 1.6 }}>
                等待房主开始游戏...
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 4, width: '100%' }}>
                {[{ label: '底注', value: `${baseAmount} 元` },
                  { label: '翻法', value: doubleType === 'flat' ? '平翻' : '陡翻' },
                  { label: '局数', value: `${roundCount} 局` },
                  { label: '显示手牌', value: showHandCount ? '开' : '关' },
                ].map(row => (
                  <div key={row.label} style={{ display: 'flex', justifyContent: 'space-between', padding: '3px 8px', background: 'rgba(255,255,255,0.02)', borderRadius: 'var(--radius-sm)' }}>
                    <span style={{ fontSize: 'var(--fs-xs)', color: 'var(--ink-dim)' }}>{row.label}</span>
                    <span style={{ fontSize: 'var(--fs-xs)', fontWeight: 600, color: 'var(--ink-secondary)' }}>{row.value}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
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
                const isMe = player.openid === 'user_' + auth.userId;
                const isOwnerSeat = false; // determined by server
                const ready = player.ready;
                return (
                  <div key={seatIdx} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4 }}>
                    <div style={{
                      width: 'clamp(48px, 14vmin, 72px)', height: 'clamp(48px, 14vmin, 72px)',
                      borderRadius: '50%', background: 'var(--bg-card)',
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      fontSize: 'clamp(22px, 6vmin, 34px)',
                      border: ready && !isOwnerSeat
                        ? '2px solid var(--green)'
                        : '2px solid rgba(255,255,255,0.06)',
                      boxShadow: ready && !isOwnerSeat
                        ? '0 0 10px rgba(122,184,126,0.15)'
                        : 'none',
                      position: 'relative', overflow: 'hidden',
                    }}>
                      {player.avatarUrl ? (
                        <img src={player.avatarUrl} style={{ width: '100%', height: '100%', borderRadius: '50%', objectFit: 'cover' }} alt="" />
                      ) : (
                        <span>{player.isBot ? '🤖' : (isMe ? '⭐' : '👤')}</span>
                      )}
                      {ready && !isOwnerSeat && (
                        <div style={{
                          position: 'absolute', bottom: 0, left: 0, right: 0,
                          background: 'rgba(0,0,0,0.7)', padding: '1px 0',
                          display: 'flex', justifyContent: 'center',
                        }}>
                          <span style={{ fontSize: 9, color: 'var(--green)', fontWeight: 800 }}>Ready</span>
                        </div>
                      )}
                    </div>
                    <span style={{ fontSize: 'var(--fs-xs)', fontWeight: 600, color: 'var(--ink-secondary)' }}>
                      {player.name}
                      {isMe ? ' (我)' : ''}
                    </span>
                    <div style={{ display: 'flex', gap: 4 }}>
                      {isOwnerSeat && <span style={badgeStyle('owner')}>房主</span>}
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
            {/* Non-owner: Ready toggle button */}
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
            {/* Owner: Add bot button */}
            {(isOwner && players.length < 4) && (
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
            {/* Owner: Start game button */}
            {isOwner && (
              <button onClick={startGame}
                disabled={!allReady}
                className="btn-game"
                style={{
                  flex: 1, padding: 'clamp(8px, 1.8vh, 12px) 0',
                  fontSize: 'var(--fs-sm)', borderRadius: 'var(--radius-lg)',
                  background: allReady
                    ? 'linear-gradient(135deg, #3b82f6, #2563eb)'
                    : 'rgba(255,255,255,0.06)',
                  color: allReady ? '#fff' : 'var(--ink-dim)',
                  border: allReady
                    ? '2px solid #60a5fa'
                    : '1px solid rgba(255,255,255,0.06)',
                  boxShadow: allReady
                    ? '0 0 16px rgba(59,130,246,0.4), 0 0 32px rgba(59,130,246,0.15)'
                    : 'none',
                  cursor: allReady ? 'pointer' : 'default',
                  opacity: allReady ? 1 : 0.5,
                  transition: 'all 0.3s ease',
                }}
              >{allReady ? '⚡ 开始游戏' : `等待加入 (${players.length}/4)`}</button>
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
