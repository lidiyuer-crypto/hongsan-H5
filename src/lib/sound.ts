/**
 * 音效系统 — Web Audio API 合成音效
 * 无需外部音频文件，通过振荡器+噪声生成全部音效
 * 后期可替换为真实采样
 */

// ===== 音效名称类型 =====
export type SoundName =
  // UI 交互
  | 'click' | 'modal_open' | 'modal_close'
  // 选牌
  | 'card_select' | 'card_deselect' | 'card_error'
  // 出牌（按牌型）
  | 'play_single' | 'play_pair' | 'play_straight'
  | 'play_bomb' | 'play_hbomb' | 'play_che'
  // 过牌
  | 'pass_self' | 'pass_other'
  // 计时器
  | 'turn_start' | 'timer_warning' | 'timer_timeout'
  // 扯牌
  | 'che_open' | 'che_close'
  // 身份/红三
  | 'red3_reveal' | 'first_turn_h4'
  // 出完牌
  | 'player_finish'
  // 结算
  | 'settlement_show' | 'settlement_win' | 'settlement_lose' | 'settlement_final'
  // 房间
  | 'room_join' | 'game_start'
  // 托管
  | 'managed_on' | 'managed_off';

// ===== 全局状态 =====
let audioCtx: AudioContext | null = null;
let _muted = false;
const soundVolume: Record<string, number> = {
  ui: 0.25,
  card: 0.3,
  play: 0.4,
  bomb: 0.55,
  pass: 0.2,
  timer: 0.35,
  che: 0.4,
  identity: 0.4,
  finish: 0.5,
  settlement: 0.45,
  room: 0.4,
};

function ctx(): AudioContext {
  if (!audioCtx) {
    audioCtx = new (window.AudioContext || (window as any).webkitAudioContext)();
  }
  // Resume if suspended (browser autoplay policy)
  if (audioCtx.state === 'suspended') {
    audioCtx.resume();
  }
  return audioCtx;
}

export function isMuted() { return _muted; }
export function setMuted(m: boolean) { _muted = m; }
export function toggleMute() { _muted = !_muted; return _muted; }

// ===== 音频工具函数 =====

/** 短促噪声（用于 click/pick 类） */
function noiseBurst(
  duration: number,
  freq: number,
  vol: number,
  type: OscillatorType = 'square',
  filterFreq?: number,
) {
  if (_muted) return;
  const c = ctx();
  const t = c.currentTime;

  const osc = c.createOscillator();
  osc.type = type;
  osc.frequency.setValueAtTime(freq, t);
  osc.frequency.exponentialRampToValueAtTime(freq * 0.3, t + duration);

  const gain = c.createGain();
  gain.gain.setValueAtTime(vol, t);
  gain.gain.exponentialRampToValueAtTime(0.001, t + duration);

  if (filterFreq) {
    const filter = c.createBiquadFilter();
    filter.type = 'bandpass';
    filter.frequency.setValueAtTime(filterFreq, t);
    filter.Q.setValueAtTime(2, t);
    osc.connect(filter);
    filter.connect(gain);
    gain.connect(c.destination);
  } else {
    osc.connect(gain);
    gain.connect(c.destination);
  }

  osc.start(t);
  osc.stop(t + duration);
}

/** 低频轰击（炸弹/氢弹） */
function boom(
  duration: number,
  baseFreq: number,
  vol: number,
  withNoise = false,
) {
  if (_muted) return;
  const c = ctx();
  const t = c.currentTime;

  // 低频正弦 — 震感
  const osc = c.createOscillator();
  osc.type = 'sine';
  osc.frequency.setValueAtTime(baseFreq, t);
  osc.frequency.exponentialRampToValueAtTime(baseFreq * 0.15, t + duration);

  const gain = c.createGain();
  gain.gain.setValueAtTime(vol * 1.2, t);
  gain.gain.exponentialRampToValueAtTime(0.001, t + duration);

  const filter = c.createBiquadFilter();
  filter.type = 'lowpass';
  filter.frequency.setValueAtTime(baseFreq * 2, t);
  filter.frequency.exponentialRampToValueAtTime(40, t + duration);

  osc.connect(filter);
  filter.connect(gain);
  gain.connect(c.destination);
  osc.start(t);
  osc.stop(t + duration);

  // 叠加噪声层 — 爆炸感
  if (withNoise) {
    const noiseLen = duration * 1.5;
    const buffer = c.createBuffer(1, c.sampleRate * noiseLen, c.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < data.length; i++) {
      data[i] = (Math.random() * 2 - 1) * Math.exp(-i / (c.sampleRate * 0.08));
    }
    const noise = c.createBufferSource();
    noise.buffer = buffer;
    const noiseGain = c.createGain();
    noiseGain.gain.setValueAtTime(vol * 0.6, t);
    noiseGain.gain.exponentialRampToValueAtTime(0.001, t + noiseLen);
    const noiseFilter = c.createBiquadFilter();
    noiseFilter.type = 'lowpass';
    noiseFilter.frequency.setValueAtTime(2000, t);
    noiseFilter.frequency.exponentialRampToValueAtTime(100, t + noiseLen);
    noise.connect(noiseFilter);
    noiseFilter.connect(noiseGain);
    noiseGain.connect(c.destination);
    noise.start(t);
    noise.stop(t + noiseLen);
  }
}

/** 上升/下降音阶（胜利/失败） */
function arpeggio(
  notes: number[],
  noteDuration: number,
  vol: number,
  type: OscillatorType = 'triangle',
) {
  if (_muted) return;
  const c = ctx();
  const t = c.currentTime;
  notes.forEach((freq, i) => {
    const osc = c.createOscillator();
    osc.type = type;
    const startT = t + i * noteDuration;
    osc.frequency.setValueAtTime(freq, startT);
    const gain = c.createGain();
    gain.gain.setValueAtTime(0, startT);
    gain.gain.linearRampToValueAtTime(vol, startT + 0.02);
    gain.gain.setValueAtTime(vol, startT + noteDuration * 0.7);
    gain.gain.exponentialRampToValueAtTime(0.001, startT + noteDuration);
    osc.connect(gain);
    gain.connect(c.destination);
    osc.start(startT);
    osc.stop(startT + noteDuration);
  });
}

/** 简单正弦音（提示/警告类） */
function tone(
  freq: number,
  duration: number,
  vol: number,
  type: OscillatorType = 'sine',
  ramp = true,
) {
  if (_muted) return;
  const c = ctx();
  const t = c.currentTime;
  const osc = c.createOscillator();
  osc.type = type;
  osc.frequency.setValueAtTime(freq, t);
  const gain = c.createGain();
  gain.gain.setValueAtTime(vol, t);
  if (ramp) {
    gain.gain.exponentialRampToValueAtTime(0.001, t + duration);
  }
  osc.connect(gain);
  gain.connect(c.destination);
  osc.start(t);
  osc.stop(t + duration);
}

/** 双音（确认/完成类） */
function doubleTone(f1: number, f2: number, gap: number, vol: number) {
  if (_muted) return;
  tone(f1, 0.1, vol, 'sine');
  setTimeout(() => tone(f2, 0.15, vol, 'sine'), gap * 1000);
}

// ===== 音效播放主函数 =====
export function playSound(name: SoundName) {
  if (_muted) return;
  const v = (cat: string) => soundVolume[cat] || 0.3;

  switch (name) {
    // --- UI ---
    case 'click':
      noiseBurst(0.04, 1800, v('ui'), 'square', 3000); break;
    case 'modal_open':
      tone(600, 0.15, v('ui') * 1.2, 'sine');
      setTimeout(() => tone(900, 0.12, v('ui'), 'sine'), 80);
      break;
    case 'modal_close':
      tone(900, 0.08, v('ui'), 'sine');
      setTimeout(() => tone(600, 0.1, v('ui') * 0.8, 'sine'), 60);
      break;

    // --- 选牌 ---
    case 'card_select':
      noiseBurst(0.03, 2200, v('card'), 'sine', 4000); break;
    case 'card_deselect':
      noiseBurst(0.04, 1600, v('card') * 0.7, 'sine', 3000); break;
    case 'card_error':
      doubleTone(200, 180, 0.08, v('card') * 0.8); break;

    // --- 出牌 ---
    case 'play_single':
      noiseBurst(0.08, 900, v('play'), 'triangle', 2000); break;
    case 'play_pair':
      tone(700, 0.06, v('play'), 'triangle');
      setTimeout(() => tone(750, 0.06, v('play'), 'triangle'), 60);
      break;
    case 'play_straight':
      for (let i = 0; i < 5; i++) {
        setTimeout(() => noiseBurst(0.06, 600 + i * 80, v('play') * 0.7, 'triangle', 2000), i * 50);
      }
      break;
    case 'play_bomb':
      boom(0.6, 55, v('bomb'), true); break;
    case 'play_hbomb':
      boom(0.9, 35, v('bomb') * 1.3, true);
      // 额外颤音叠加
      setTimeout(() => tone(80, 0.5, v('bomb') * 0.5, 'sawtooth'), 150);
      break;
    case 'play_che':
      // 尖锐抢断音
      noiseBurst(0.12, 2400, v('play'), 'sawtooth', 3500);
      setTimeout(() => tone(3000, 0.1, v('play') * 0.6, 'square'), 80);
      break;

    // --- 过牌 ---
    case 'pass_self':
      tone(250, 0.15, v('pass'), 'sine'); break;
    case 'pass_other':
      tone(300, 0.1, v('pass') * 0.6, 'sine'); break;

    // --- 计时器 ---
    case 'turn_start':
      doubleTone(800, 1000, 0.08, v('timer')); break;
    case 'timer_warning':
      noiseBurst(0.06, 1200, v('timer'), 'square', 3000); break;
    case 'timer_timeout':
      tone(150, 0.3, v('timer'), 'sawtooth'); break;

    // --- 扯牌阶段 ---
    case 'che_open':
      tone(1100, 0.1, v('che'), 'square');
      setTimeout(() => tone(1400, 0.08, v('che') * 0.7, 'square'), 80);
      break;
    case 'che_close':
      tone(1400, 0.06, v('che') * 0.5, 'square');
      setTimeout(() => tone(1100, 0.08, v('che') * 0.5, 'square'), 50);
      break;

    // --- 身份 ---
    case 'red3_reveal':
      tone(1000, 0.2, v('identity'), 'triangle');
      setTimeout(() => tone(1400, 0.25, v('identity'), 'triangle'), 150);
      break;
    case 'first_turn_h4':
      doubleTone(523, 659, 0.12, v('identity'));  // C5-E5
      break;

    // --- 出完牌 ---
    case 'player_finish':
      arpeggio([523, 659, 784, 1047], 0.12, v('finish'), 'triangle'); break;

    // --- 结算 ---
    case 'settlement_show':
      tone(400, 0.3, v('settlement'), 'triangle');
      setTimeout(() => tone(600, 0.4, v('settlement'), 'triangle'), 200);
      break;
    case 'settlement_win':
      arpeggio([523, 659, 784, 1047, 1319], 0.1, v('settlement'), 'triangle'); break;
    case 'settlement_lose':
      arpeggio([400, 350, 300, 250, 200], 0.15, v('settlement') * 0.8, 'triangle'); break;
    case 'settlement_final':
      arpeggio([523, 659, 784, 1047, 1319, 1568], 0.08, v('settlement') * 1.1, 'triangle'); break;

    // --- 房间 ---
    case 'room_join':
      doubleTone(500, 700, 0.1, v('room')); break;
    case 'game_start':
      arpeggio([523, 659, 784], 0.15, v('room'), 'triangle');
      setTimeout(() => tone(1047, 0.4, v('room'), 'triangle'), 400);
      break;

    // --- 托管 ---
    case 'managed_on':
      doubleTone(900, 1200, 0.06, v('ui') * 0.6); break;
    case 'managed_off':
      doubleTone(1200, 900, 0.06, v('ui') * 0.6); break;
  }
}
