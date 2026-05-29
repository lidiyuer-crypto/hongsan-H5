import { useState, useCallback, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import GameEngine from '../engine/gameEngine';

// ===== Types =====
interface BotPlayer {
  openid: string;
  name: string;
  isBot: boolean;
  seat: number;
}

const BOT_NAMES = ['电脑A', '电脑B', '电脑C'];

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

  const [avatarUrl, setAvatarUrl] = useState('');
  const [nickname, setNickname] = useState('');
  const [showCreateModal, setShowCreateModal] = useState(false);
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

  const handleChooseAvatar = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) { const url = URL.createObjectURL(file); setAvatarUrl(url); }
  };

  const closeAllModals = () => {
    setShowCreateModal(false); setShowJoinModal(false); setShowDevModal(false);
  };

  const openJoinModal = () => { setJoinRoomCode(''); setShowJoinModal(true); };
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

  const confirmCreateRoom = () => {
    const config = { baseAmount, doubleType, smartShuffle, smartShuffleLevel };
    sessionStorage.setItem('roomConfig', JSON.stringify(config));
    sessionStorage.setItem('roomAction', 'create');
    closeAllModals();
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
      { openid: 'player_me', name: nickname || '我', avatarUrl, isBot: false },
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
      {/* Profile */}
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8, marginBottom: 'clamp(16px, 4vh, 32px)' }}>
        <label style={{
          width: 'clamp(56px, 14vmin, 80px)', height: 'clamp(56px, 14vmin, 80px)',
          borderRadius: '50%', background: S.bgCard,
          border: '1px solid rgba(255,255,255,0.06)',
          overflow: 'hidden', cursor: 'pointer',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
        }}>
          {avatarUrl ? (
            <img src={avatarUrl} style={{ width: '100%', height: '100%', borderRadius: '50%', objectFit: 'cover' }} alt="" />
          ) : (
            <span style={{ fontSize: 'clamp(26px, 6vmin, 40px)' }}>👤</span>
          )}
          <input type="file" accept="image/*" style={{ display: 'none' }} onChange={handleChooseAvatar} />
        </label>
        <input
          style={{
            width: 'clamp(160px, 40vmin, 240px)', height: 'clamp(30px, 6vmin, 38px)',
            textAlign: 'center', fontSize: 'var(--fs-sm)', fontWeight: 600,
            color: S.ink, background: 'rgba(255,255,255,0.04)',
            border: '1px solid rgba(255,255,255,0.06)', borderRadius: 99,
            padding: '0 16px', outline: 'none',
          }}
          placeholder="点击设置昵称"
          value={nickname}
          onChange={e => setNickname(e.target.value)}
        />
      </div>

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

      {/* Bottom buttons */}
      <div style={{
        position: 'fixed', bottom: 0, left: 0, right: 0,
        display: 'flex', gap: 'clamp(6px, 1.5vw, 10px)',
        padding: 'clamp(10px, 2vh, 16px) clamp(10px, 4vw, 24px)',
        paddingBottom: 'clamp(16px, 4vh, 28px)',
        background: 'linear-gradient(to top, rgba(26,21,16,0.95), transparent)',
        zIndex: 10,
      }}>
        <button onClick={() => setShowCreateModal(true)}
          className="btn-game btn-primary"
          style={{ flex: 1, padding: 'clamp(10px, 2vh, 14px) 0', fontSize: 'var(--fs-base)', borderRadius: 'var(--radius-lg)' }}>
          创建房间
        </button>
        <button onClick={openJoinModal}
          className="btn-game btn-secondary"
          style={{ flex: 1, padding: 'clamp(10px, 2vh, 14px) 0', fontSize: 'var(--fs-base)' }}>
          加入游戏
        </button>
      </div>

      {/* ===== Create Room Modal ===== */}
      {showCreateModal && modalShell(closeAllModals,
        <>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12, flexShrink: 0 }}>
            <span style={{ fontSize: 'var(--fs-md)', fontWeight: 800 }}>创建房间</span>
            <button onClick={closeAllModals}
              style={{ background: 'none', border: 'none', color: S.inkDim, fontSize: 20, cursor: 'pointer', padding: 4 }}>✕</button>
          </div>
          <div style={{ overflowY: 'auto', flex: 1 }}>
            {settingRow('底注金额', stepper(baseAmount, decBase, incBase, '元'))}
            {settingRow('翻法', segmented(['平翻', '陡翻'], doubleType === 'flat' ? '平翻' : '陡翻', v => setDoubleType(v === '平翻' ? 'flat' : 'steep')))}
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: 'clamp(6px, 1.2vh, 10px) 0' }}>
              <span style={{ fontSize: 'var(--fs-sm)', fontWeight: 600, color: S.ink2 }}>坨坨牌</span>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                {toggle(smartShuffle, () => setSmartShuffle(!smartShuffle))}
                {smartShuffle && levelDots(smartShuffleLevel, setSmartShuffleLevel)}
              </div>
            </div>
          </div>
          <div style={{ display: 'flex', gap: 'clamp(8px, 2vw, 12px)', marginTop: 12, flexShrink: 0 }}>
            <button onClick={closeAllModals} className="btn-game btn-secondary" style={{ flex: 1, padding: 'clamp(8px, 1.5vh, 12px) 0', fontSize: 'var(--fs-sm)' }}>取消</button>
            <button onClick={confirmCreateRoom} className="btn-game btn-primary" style={{ flex: 1, padding: 'clamp(8px, 1.5vh, 12px) 0', fontSize: 'var(--fs-sm)' }}>创建并等待</button>
          </div>
        </>
      )}

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
