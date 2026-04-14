/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { useEffect, useRef, useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Mic, MicOff, Activity, BarChart3, Info, Settings2, Wind, Volume2, ShieldCheck, Square, Play, Trash2, Download } from 'lucide-react';

export default function App() {
  const [isListening, setIsListening] = useState(false);
  const [isRecording, setIsRecording] = useState(false);
  const [isNoiseReductionEnabled, setIsNoiseReductionEnabled] = useState(false);
  const [recordedBlob, setRecordedBlob] = useState<Blob | null>(null);
  const [audioUrl, setAudioUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  
  const audioContextRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const sourceRef = useRef<MediaStreamAudioSourceNode | null>(null);
  const filterRef = useRef<BiquadFilterNode | null>(null);
  const compressorRef = useRef<DynamicsCompressorNode | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const animationRef = useRef<number | null>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  
  const waveformCanvasRef = useRef<HTMLCanvasElement>(null);
  const spectrumCanvasRef = useRef<HTMLCanvasElement>(null);

  const startListening = async () => {
    try {
      setError(null);
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;

      const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
      const audioContext = new AudioContextClass();
      audioContextRef.current = audioContext;

      const analyser = audioContext.createAnalyser();
      analyser.fftSize = 2048;
      analyserRef.current = analyser;

      const source = audioContext.createMediaStreamSource(stream);
      sourceRef.current = source;

      // Noise Reduction Chain
      if (isNoiseReductionEnabled) {
        const filter = audioContext.createBiquadFilter();
        filter.type = 'highpass';
        filter.frequency.value = 150;
        filterRef.current = filter;

        const compressor = audioContext.createDynamicsCompressor();
        compressor.threshold.setValueAtTime(-50, audioContext.currentTime);
        compressor.knee.setValueAtTime(40, audioContext.currentTime);
        compressor.ratio.setValueAtTime(12, audioContext.currentTime);
        compressor.attack.setValueAtTime(0, audioContext.currentTime);
        compressor.release.setValueAtTime(0.25, audioContext.currentTime);
        compressorRef.current = compressor;

        source.connect(filter);
        filter.connect(compressor);
        compressor.connect(analyser);
      } else {
        source.connect(analyser);
      }

      setIsListening(true);
      draw();
    } catch (err) {
      console.error('Error accessing microphone:', err);
      setError('无法访问麦克风。请确保已授予权限。');
    }
  };

  const stopListening = () => {
    if (isRecording) {
      stopRecording();
    }
    if (animationRef.current) {
      cancelAnimationFrame(animationRef.current);
    }
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(track => track.stop());
    }
    if (audioContextRef.current) {
      audioContextRef.current.close();
    }
    setIsListening(false);
  };

  const startRecording = () => {
    if (!streamRef.current) return;
    
    chunksRef.current = [];
    const mediaRecorder = new MediaRecorder(streamRef.current);
    mediaRecorderRef.current = mediaRecorder;

    mediaRecorder.ondataavailable = (e) => {
      if (e.data.size > 0) {
        chunksRef.current.push(e.data);
      }
    };

    mediaRecorder.onstop = () => {
      const blob = new Blob(chunksRef.current, { type: 'audio/webm' });
      const url = URL.createObjectURL(blob);
      setRecordedBlob(blob);
      setAudioUrl(url);
    };

    mediaRecorder.start();
    setIsRecording(true);
  };

  const stopRecording = () => {
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
      mediaRecorderRef.current.stop();
      setIsRecording(false);
    }
  };

  const deleteRecording = () => {
    if (audioUrl) {
      URL.revokeObjectURL(audioUrl);
    }
    setRecordedBlob(null);
    setAudioUrl(null);
  };

  const toggleNoiseReduction = () => {
    const newState = !isNoiseReductionEnabled;
    setIsNoiseReductionEnabled(newState);
    
    if (isListening) {
      stopListening();
      setTimeout(() => {
        startListening();
      }, 100);
    }
  };

  const draw = () => {
    if (!analyserRef.current || !waveformCanvasRef.current || !spectrumCanvasRef.current) return;

    const analyser = analyserRef.current;
    const waveformCanvas = waveformCanvasRef.current;
    const spectrumCanvas = spectrumCanvasRef.current;
    
    const waveformCtx = waveformCanvas.getContext('2d');
    const spectrumCtx = spectrumCanvas.getContext('2d');

    if (!waveformCtx || !spectrumCtx) return;

    const bufferLength = analyser.frequencyBinCount;
    const timeData = new Uint8Array(bufferLength);
    const frequencyData = new Uint8Array(bufferLength);

    const render = () => {
      animationRef.current = requestAnimationFrame(render);

      // Get data
      analyser.getByteTimeDomainData(timeData);
      analyser.getByteFrequencyData(frequencyData);

      // Clear canvases
      waveformCtx.clearRect(0, 0, waveformCanvas.width, waveformCanvas.height);
      spectrumCtx.clearRect(0, 0, spectrumCanvas.width, spectrumCanvas.height);

      // --- Draw Waveform (Time Domain) ---
      waveformCtx.lineWidth = 2;
      waveformCtx.strokeStyle = '#10b981'; // Emerald 500
      waveformCtx.beginPath();

      const sliceWidth = waveformCanvas.width / bufferLength;
      let x = 0;

      for (let i = 0; i < bufferLength; i++) {
        const v = timeData[i] / 128.0;
        const y = (v * waveformCanvas.height) / 2;

        if (i === 0) {
          waveformCtx.moveTo(x, y);
        } else {
          waveformCtx.lineTo(x, y);
        }

        x += sliceWidth;
      }

      waveformCtx.lineTo(waveformCanvas.width, waveformCanvas.height / 2);
      waveformCtx.stroke();

      // --- Draw Spectrum (Frequency Domain) ---
      const barWidth = (spectrumCanvas.width / bufferLength) * 2.5;
      let barX = 0;

      for (let i = 0; i < bufferLength; i++) {
        const barHeight = (frequencyData[i] / 255) * spectrumCanvas.height;
        
        // Color gradient based on frequency
        const hue = (i / bufferLength) * 360;
        spectrumCtx.fillStyle = `hsla(${hue}, 70%, 50%, 0.8)`;
        
        spectrumCtx.fillRect(barX, spectrumCanvas.height - barHeight, barWidth, barHeight);

        barX += barWidth + 1;
      }
    };

    render();
  };

  useEffect(() => {
    return () => {
      if (animationRef.current) cancelAnimationFrame(animationRef.current);
      if (streamRef.current) streamRef.current.getTracks().forEach(track => track.stop());
      if (audioContextRef.current) audioContextRef.current.close();
    };
  }, []);

  return (
    <div className="min-h-screen bg-[#0f172a] text-slate-200 font-sans selection:bg-emerald-500/30">
      {/* Header */}
      <header className="border-b border-slate-800 bg-slate-900/50 backdrop-blur-md sticky top-0 z-10">
        <div className="max-w-7xl mx-auto px-4 h-16 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-emerald-500 rounded-xl flex items-center justify-center shadow-lg shadow-emerald-500/20">
              <Activity className="text-white w-6 h-6" />
            </div>
            <div>
              <h1 className="font-bold text-xl tracking-tight text-white">Sonic Fourier</h1>
              <p className="text-xs text-slate-400 font-mono uppercase tracking-widest">Real-time FFT Analyzer</p>
            </div>
          </div>
          
          <div className="flex items-center gap-4">
            <button className="p-2 text-slate-400 hover:text-white transition-colors">
              <Settings2 size={20} />
            </button>
            <button className="p-2 text-slate-400 hover:text-white transition-colors">
              <Info size={20} />
            </button>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 py-8 space-y-8">
        {/* Control Panel */}
        <section className="bg-slate-900 border border-slate-800 rounded-3xl p-8 shadow-2xl relative overflow-hidden">
          <div className="absolute top-0 right-0 p-4 opacity-10">
            <Activity size={120} />
          </div>
          
          <div className="relative z-10 flex flex-col md:flex-row items-center justify-between gap-8">
            <div className="space-y-4 max-w-xl">
              <h2 className="text-3xl font-bold text-white">傅里叶变换：声音的数学解构</h2>
              <p className="text-slate-400 leading-relaxed">
                通过 Web Audio API，我们能够实时捕捉环境声音，并利用**快速傅里叶变换 (FFT)** 算法将复杂的时域波形分解为不同频率的振幅。
                观察下方图表，感受声音在时间和频率两个维度上的奇妙变化。
              </p>
              
              {error && (
                <motion.div 
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="bg-red-500/10 border border-red-500/20 text-red-400 px-4 py-2 rounded-lg text-sm"
                >
                  {error}
                </motion.div>
              )}
            </div>

            <div className="flex flex-col sm:flex-row items-center gap-4">
              <motion.button
                whileHover={{ scale: 1.02 }}
                whileTap={{ scale: 0.98 }}
                onClick={toggleNoiseReduction}
                className={`
                  flex items-center gap-2 px-6 py-4 rounded-2xl font-semibold transition-all border
                  ${isNoiseReductionEnabled 
                    ? 'bg-blue-500/20 border-blue-500 text-blue-400 shadow-lg shadow-blue-500/10' 
                    : 'bg-slate-800 border-slate-700 text-slate-400 hover:border-slate-600'}
                `}
              >
                {isNoiseReductionEnabled ? <ShieldCheck size={20} /> : <Wind size={20} />}
                <span>降噪模式: {isNoiseReductionEnabled ? '开启' : '关闭'}</span>
              </motion.button>

              <div className="flex items-center gap-2">
                <motion.button
                  whileHover={{ scale: 1.02 }}
                  whileTap={{ scale: 0.98 }}
                  onClick={isListening ? stopListening : startListening}
                  className={`
                    relative group flex items-center gap-3 px-8 py-4 rounded-2xl font-bold text-lg transition-all
                    ${isListening 
                      ? 'bg-red-500 text-white shadow-lg shadow-red-500/25' 
                      : 'bg-emerald-500 text-white shadow-lg shadow-emerald-500/25'}
                  `}
                >
                  {isListening ? (
                    <>
                      <MicOff size={24} />
                      <span>停止监听</span>
                    </>
                  ) : (
                    <>
                      <Mic size={24} />
                      <span>开始监听</span>
                    </>
                  )}
                  
                  {isListening && (
                    <span className="absolute -top-1 -right-1 flex h-4 w-4">
                      <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-400 opacity-75"></span>
                      <span className="relative inline-flex rounded-full h-4 w-4 bg-red-500 border-2 border-slate-900"></span>
                    </span>
                  )}
                </motion.button>

                {isListening && (
                  <motion.button
                    initial={{ opacity: 0, x: -20 }}
                    animate={{ opacity: 1, x: 0 }}
                    whileHover={{ scale: 1.05 }}
                    whileTap={{ scale: 0.95 }}
                    onClick={isRecording ? stopRecording : startRecording}
                    className={`
                      p-4 rounded-2xl transition-all border shadow-lg
                      ${isRecording 
                        ? 'bg-red-500/20 border-red-500 text-red-500 animate-pulse' 
                        : 'bg-slate-800 border-slate-700 text-slate-400 hover:text-white'}
                    `}
                    title={isRecording ? "停止录音" : "开始录音"}
                  >
                    {isRecording ? <Square size={24} fill="currentColor" /> : <div className="w-6 h-6 rounded-full bg-red-500" />}
                  </motion.button>
                )}
              </div>
            </div>
          </div>
        </section>

        {/* Playback Section */}
        <AnimatePresence>
          {audioUrl && (
            <motion.section
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: 'auto' }}
              exit={{ opacity: 0, height: 0 }}
              className="bg-slate-900 border border-slate-800 rounded-3xl p-6 shadow-xl overflow-hidden"
            >
              <div className="flex flex-col md:flex-row items-center justify-between gap-6">
                <div className="flex items-center gap-4">
                  <div className="w-12 h-12 bg-blue-500/20 rounded-full flex items-center justify-center text-blue-400">
                    <Volume2 size={24} />
                  </div>
                  <div>
                    <h3 className="font-bold text-white">录音回放</h3>
                    <p className="text-xs text-slate-500 font-mono uppercase tracking-widest">Recorded Audio Ready</p>
                  </div>
                </div>

                <div className="flex-1 max-w-md w-full">
                  <audio src={audioUrl} controls className="w-full h-10 accent-emerald-500" />
                </div>

                <div className="flex items-center gap-3">
                  <a 
                    href={audioUrl} 
                    download="recording.webm"
                    className="p-3 bg-slate-800 border border-slate-700 text-slate-400 hover:text-white rounded-xl transition-all"
                    title="下载录音"
                  >
                    <Download size={20} />
                  </a>
                  <button 
                    onClick={deleteRecording}
                    className="p-3 bg-red-500/10 border border-red-500/20 text-red-400 hover:bg-red-500 hover:text-white rounded-xl transition-all"
                    title="删除录音"
                  >
                    <Trash2 size={20} />
                  </button>
                </div>
              </div>
            </motion.section>
          )}
        </AnimatePresence>

        {/* Visualizers */}
        <div className="grid grid-cols-1 gap-8">
          {/* Waveform Card */}
          <motion.div 
            layout
            className="bg-slate-900 border border-slate-800 rounded-3xl overflow-hidden shadow-xl"
          >
            <div className="p-6 border-b border-slate-800 flex items-center justify-between bg-slate-900/50">
              <div className="flex items-center gap-3">
                <Activity className="text-emerald-500" size={20} />
                <h3 className="font-bold text-white">时域波形 (Time Domain)</h3>
              </div>
              <span className="text-xs font-mono text-slate-500 uppercase tracking-tighter">Oscilloscope View</span>
            </div>
            <div className="relative h-64 bg-black/40">
              <canvas 
                ref={waveformCanvasRef} 
                width={1200} 
                height={400} 
                className="w-full h-full"
              />
              {!isListening && (
                <div className="absolute inset-0 flex items-center justify-center text-slate-600 font-mono text-sm uppercase tracking-widest">
                  Waiting for input...
                </div>
              )}
            </div>
          </motion.div>

          {/* Spectrum Card */}
          <motion.div 
            layout
            className="bg-slate-900 border border-slate-800 rounded-3xl overflow-hidden shadow-xl"
          >
            <div className="p-6 border-b border-slate-800 flex items-center justify-between bg-slate-900/50">
              <div className="flex items-center gap-3">
                <BarChart3 className="text-blue-500" size={20} />
                <h3 className="font-bold text-white">频域频谱 (Frequency Spectrum)</h3>
              </div>
              <span className="text-xs font-mono text-slate-500 uppercase tracking-tighter">FFT Analysis</span>
            </div>
            <div className="relative h-80 bg-black/40">
              <canvas 
                ref={spectrumCanvasRef} 
                width={1200} 
                height={400} 
                className="w-full h-full"
              />
              {!isListening && (
                <div className="absolute inset-0 flex items-center justify-center text-slate-600 font-mono text-sm uppercase tracking-widest">
                  Waiting for input...
                </div>
              )}
            </div>
            <div className="px-6 py-4 bg-slate-950/50 flex justify-between text-[10px] font-mono text-slate-500 uppercase tracking-widest">
              <span>Low Freq (Bass)</span>
              <span>Mid Range</span>
              <span>High Freq (Treble)</span>
            </div>
          </motion.div>
        </div>

        {/* Educational Footer */}
        <footer className="grid grid-cols-1 md:grid-cols-3 gap-6 pb-12">
          <div className="p-6 bg-slate-900/50 border border-slate-800 rounded-2xl space-y-2">
            <h4 className="text-white font-bold text-sm">什么是傅里叶变换？</h4>
            <p className="text-xs text-slate-400 leading-relaxed">
              它是一种数学方法，可以将信号从时间（或空间）域转换到频率域。在音频中，它能告诉我们一段声音是由哪些频率的纯音组成的。
            </p>
          </div>
          <div className="p-6 bg-slate-900/50 border border-slate-800 rounded-2xl space-y-2">
            <h4 className="text-white font-bold text-sm">如何观察？</h4>
            <p className="text-xs text-slate-400 leading-relaxed">
              唱歌时，你会看到频谱图中出现明显的尖峰（基频及其谐波）。拍手或敲击桌子会产生宽频噪声，整个频谱都会波动。
            </p>
          </div>
          <div className="p-6 bg-slate-900/50 border border-slate-800 rounded-2xl space-y-2">
            <h4 className="text-white font-bold text-sm">降噪原理 (Noise Reduction)</h4>
            <p className="text-xs text-slate-400 leading-relaxed">
              开启降噪后，系统会启用**高通滤波器 (High-pass Filter)** 过滤 150Hz 以下的低频噪音（如风扇声），并配合**动态压缩器 (Compressor)** 平滑音量波动。
            </p>
          </div>
        </footer>
      </main>
    </div>
  );
}
