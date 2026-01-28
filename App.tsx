
import React, { useState, useEffect, useMemo } from 'react';
import { CorrectionSettings, ViewMode, EditSession, ReferencePack, ReferenceImage, AutoCorrectionScope } from './types';
import CanvasEditor from './components/CanvasEditor';
import ComparisonViewer from './components/ComparisonViewer';
import ReferenceLibrary from './components/ReferenceLibrary';
import { correctArt, retrieveSimilarReferences, CorrectionFailedError } from './services/gemini';

const App: React.FC = () => {
  const [activeTab, setActiveTab] = useState<'Editor' | 'Library'>('Editor');
  const [originalImage, setOriginalImage] = useState<string | null>(null);
  const [correctedImage, setCorrectedImage] = useState<string | null>(null);
  const [imageDimensions, setImageDimensions] = useState<{ width: number; height: number }>({ width: 1024, height: 1024 });
  const [isProcessing, setIsProcessing] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [viewMode, setViewMode] = useState<ViewMode>('After');
  const [history, setHistory] = useState<EditSession[]>([]);
  
  const [packs, setPacks] = useState<ReferencePack[]>(() => {
    try {
      const saved = localStorage.getItem('art_packs');
      if (saved) return JSON.parse(saved);
    } catch (e) {}
    return [
      { id: '1', name: 'Standard Anime Eyes', description: 'Clean eye references.', images: [], createdAt: Date.now() },
      { id: '2', name: 'Profile Jawlines', description: 'Sharp chin silhouttes.', images: [], createdAt: Date.now() }
    ];
  });

  const [retrievedRefs, setRetrievedRefs] = useState<ReferenceImage[]>([]);
  
  const [selectedPackIds, setSelectedPackIds] = useState<string[]>(() => {
    try {
      const saved = localStorage.getItem('art_selected_packs');
      if (saved) return JSON.parse(saved);
    } catch (e) {}
    return packs.map(p => p.id);
  });

  const [settings, setSettings] = useState<CorrectionSettings>(() => {
    try {
      const saved = localStorage.getItem('art_settings_v6');
      if (saved) return JSON.parse(saved);
    } catch (e) {}
    return {
      strength: 50,
      linePreservation: 85,
      mode: 'Proportion (Mode A)',
      angleTag: '3/4 View',
      scope: 'Full Image',
      absoluteLineFidelity: true
    };
  });

  const storageUsage = useMemo(() => (JSON.stringify(packs).length * 2) / (1024 * 1024), [packs]);

  useEffect(() => {
    localStorage.setItem('art_packs', JSON.stringify(packs));
    localStorage.setItem('art_settings_v6', JSON.stringify(settings));
    localStorage.setItem('art_selected_packs', JSON.stringify(selectedPackIds));
  }, [packs, settings, selectedPackIds]);

  useEffect(() => {
    if (originalImage && packs.length > 0) {
      const activePacks = packs.filter(p => selectedPackIds.includes(p.id));
      setRetrievedRefs(retrieveSimilarReferences(originalImage, activePacks, settings.angleTag));
    }
  }, [originalImage, settings.angleTag, selectedPackIds, packs]);

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onload = (ev) => {
        const base64 = ev.target?.result as string;
        const img = new Image();
        img.onload = () => {
          setImageDimensions({ width: img.width, height: img.height });
          setOriginalImage(base64);
          setCorrectedImage(null);
          setErrorMsg(null);
        };
        img.src = base64;
      };
      reader.readAsDataURL(file);
    }
  };

  const handleRunCorrection = async () => {
    if (!originalImage) return setErrorMsg("Upload an image first.");
    setErrorMsg(null);
    setIsProcessing(true);
    
    try {
      const { resultImage, metrics } = await correctArt(originalImage, settings, retrievedRefs, imageDimensions);
      setCorrectedImage(resultImage);
      
      const newSession: EditSession = {
        id: Date.now().toString(),
        originalImage,
        resultImage,
        settings: { ...settings },
        timestamp: Date.now(),
        metrics
      };
      
      setHistory(prev => [newSession, ...prev].slice(0, 20));
      setViewMode('After');
    } catch (error: any) {
      setErrorMsg(error instanceof CorrectionFailedError ? error.message : "Refinement process interrupted.");
    } finally {
      setIsProcessing(false);
    }
  };

  const handlePromoteToSource = () => {
    if (correctedImage) {
      setOriginalImage(correctedImage);
      setCorrectedImage(null);
      setViewMode('Before');
      setErrorMsg(null);
    }
  };

  const handleSaveCorrection = () => {
    if (!correctedImage) return;
    const link = document.createElement('a');
    link.href = correctedImage;
    link.download = `on-model-correction-${Date.now()}.png`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const clearHistory = () => {
    if (window.confirm("Clear all previous refinement logs?")) {
      setHistory([]);
    }
  };

  const togglePackSelection = (id: string) => {
    setSelectedPackIds(prev => 
      prev.includes(id) ? prev.filter(pid => pid !== id) : [...prev, id]
    );
  };

  const currentMetrics = history[0]?.metrics;

  return (
    <div className="flex flex-col min-h-screen bg-slate-950 text-slate-100 font-sans">
      <header className="flex items-center justify-between px-6 py-3 bg-slate-900 border-b border-slate-800 sticky top-0 z-50 shadow-md">
        <div className="flex items-center gap-8">
          <div className="flex items-center gap-3">
            <div className="bg-indigo-600 p-2 rounded-lg shadow-lg">
              <i className="fa-solid fa-wand-magic-sparkles text-xl"></i>
            </div>
            <h1 className="text-xl font-bold tracking-tight bg-clip-text text-transparent bg-gradient-to-r from-white to-slate-400">On-Model Assistant</h1>
          </div>
          <nav className="flex gap-1 bg-slate-950 p-1 rounded-lg border border-slate-800">
            {['Editor', 'Library'].map(tab => (
              <button key={tab} onClick={() => setActiveTab(tab as any)} className={`px-4 py-1.5 rounded-md text-xs font-bold transition-all ${activeTab === tab ? 'bg-slate-700 text-white shadow-sm' : 'text-slate-500 hover:text-slate-300'}`}>
                {tab}
              </button>
            ))}
          </nav>
        </div>
        {activeTab === 'Editor' && (
          <div className="flex items-center gap-3">
            {correctedImage && (
              <button 
                onClick={handlePromoteToSource}
                title="Iterate: use this result for a second pass"
                className="px-5 py-2 rounded-full font-bold text-xs bg-slate-800 hover:bg-slate-700 border border-slate-700 transition-all flex items-center gap-2 active:scale-95 text-slate-300"
              >
                <i className="fa-solid fa-arrow-up"></i> Use as New Source
              </button>
            )}
            <button 
              onClick={handleRunCorrection} 
              disabled={isProcessing || !originalImage} 
              className={`px-8 py-2 rounded-full font-bold transition-all flex items-center gap-2 ${isProcessing ? 'bg-slate-700 text-slate-400' : 'bg-indigo-600 hover:bg-indigo-500 shadow-xl active:scale-95'}`}
            >
              {isProcessing ? (
                <><i className="fa-solid fa-spinner animate-spin"></i> Analyzing...</>
              ) : (
                <><i className={`fa-solid ${correctedImage ? 'fa-rotate-right' : 'fa-magic'}`}></i> {correctedImage ? 'Re-Refine Source' : 'Auto-Refine'}</>
              )}
            </button>
          </div>
        )}
      </header>

      {activeTab === 'Library' ? (
        <ReferenceLibrary packs={packs} onAddPack={(n, d) => setPacks([...packs, { id: Math.random().toString(36).substr(7), name: n, description: d, images: [], createdAt: Date.now() }])} onUpdatePack={(id, n, d) => setPacks(packs.map(p => p.id === id ? {...p, name: n, description: d} : p))} onDeletePack={(id) => setPacks(packs.filter(p => p.id !== id))} onUploadToPack={(id, imgs) => setPacks(packs.map(p => p.id === id ? {...p, images: [...p.images, ...imgs.map(data => ({ id: Math.random().toString(36).substr(7), packId: id, data, tags: [] }))]} : p))} onDeleteImage={(pid, imgid) => setPacks(packs.map(p => p.id === pid ? {...p, images: p.images.filter(i => i.id !== imgid)} : p))} storageUsage={storageUsage} />
      ) : (
        <main className="flex flex-1 overflow-hidden">
          <aside className="w-80 bg-slate-900/50 border-r border-slate-800 flex flex-col overflow-y-auto p-6 scrollbar-hide">
            <section className="mb-8">
              <h2 className="text-[10px] font-black text-slate-500 uppercase tracking-widest mb-4">Refinement Setup</h2>
              <div className="space-y-4">
                <label className="block">
                  <div className="relative border-2 border-dashed border-slate-700 hover:border-indigo-500 rounded-xl p-6 transition-all cursor-pointer text-center bg-slate-950/50 group">
                    <input type="file" className="absolute inset-0 opacity-0 cursor-pointer" accept="image/*" onChange={handleFileUpload} />
                    <i className="fa-solid fa-image text-slate-600 text-2xl mb-2 group-hover:text-indigo-400"></i>
                    <p className="text-[10px] text-slate-500 font-bold uppercase">Import Base Sketch</p>
                  </div>
                </label>
                
                <div>
                  <span className="text-[10px] font-black text-slate-500 uppercase mb-2 block">Correction Scope</span>
                  <select className="w-full bg-slate-800 border border-slate-700 rounded-lg p-2.5 text-xs font-bold text-white focus:ring-1 focus:ring-indigo-500" value={settings.scope} onChange={e => setSettings({...settings, scope: e.target.value as AutoCorrectionScope})}>
                    <option>Full Image</option>
                    <option>Face Priority</option>
                    <option>Clothing Priority</option>
                    <option>Hands Priority</option>
                  </select>
                </div>

                <div>
                  <div className="flex justify-between text-[10px] font-black text-slate-500 uppercase mb-2">
                    <span>Change Amount</span>
                    <span className="text-indigo-400 font-mono">{settings.strength}%</span>
                  </div>
                  <input type="range" min="1" max="100" value={settings.strength} onChange={e => setSettings({...settings, strength: parseInt(e.target.value)})} className="w-full h-1.5 bg-slate-800 rounded-lg appearance-none cursor-pointer accent-indigo-500" />
                </div>
              </div>
            </section>

            <section className="mb-8">
              <h2 className="text-[10px] font-black text-slate-500 uppercase tracking-widest mb-4">Select Style Guides</h2>
              <div className="space-y-1.5 max-h-48 overflow-y-auto pr-2 custom-scrollbar border border-slate-800/50 rounded-lg p-2 bg-slate-900/30">
                {packs.length === 0 ? (
                  <p className="text-[10px] text-slate-600 italic p-2">No packs found.</p>
                ) : (
                  packs.map(pack => (
                    <label key={pack.id} className={`flex items-center gap-3 p-2 rounded-lg cursor-pointer transition-all border ${selectedPackIds.includes(pack.id) ? 'bg-indigo-600/10 border-indigo-500/40' : 'bg-slate-900/50 border-slate-800 text-slate-500 hover:border-slate-600'}`}>
                      <input 
                        type="checkbox" 
                        checked={selectedPackIds.includes(pack.id)}
                        onChange={() => togglePackSelection(pack.id)}
                        className="w-3.5 h-3.5 rounded border-slate-700 bg-slate-800 text-indigo-600 focus:ring-0 focus:ring-offset-0 cursor-pointer"
                      />
                      <span className={`text-[11px] font-bold truncate flex-1 ${selectedPackIds.includes(pack.id) ? 'text-indigo-100' : ''}`}>{pack.name}</span>
                      <span className="text-[9px] font-mono opacity-50">{pack.images.length}</span>
                    </label>
                  ))
                )}
              </div>
            </section>

            <section className="mb-8 bg-indigo-500/5 p-4 rounded-xl border border-indigo-500/20 shadow-inner">
              <h2 className="text-[10px] font-black text-indigo-400/70 uppercase tracking-widest mb-4 flex items-center gap-2">
                <i className="fa-solid fa-bolt-lightning"></i> Shift Analysis
              </h2>
              <div className="space-y-2.5">
                {[
                  { label: 'Coverage', value: currentMetrics?.mask_coverage, format: (v: number) => `${Math.round(v * 100)}% Area` },
                  { label: 'Correction Lift', value: currentMetrics?.denoise_used, format: (v: number) => v.toFixed(2) },
                  { label: 'Pixel Delta', value: currentMetrics?.diff_in_mask, format: (v: number) => (v * 100).toFixed(3) + '%' }
                ].map(m => (
                  <div key={m.label} className="flex justify-between items-center bg-slate-900/40 p-2 rounded border border-slate-800/50">
                    <span className="text-[9px] text-slate-500 font-bold uppercase tracking-tight">{m.label}</span>
                    <span className="font-mono text-[10px] text-indigo-300 font-bold">{m.value !== undefined ? m.format(m.value) : '--'}</span>
                  </div>
                ))}
              </div>
            </section>

            <section className="space-y-4 pt-4 border-t border-slate-800">
               <h2 className="text-[10px] font-black text-slate-500 uppercase tracking-widest mb-2">Refinement Rules</h2>
               <div className="flex items-center justify-between p-3 bg-slate-900 rounded-lg border border-slate-800">
                  <span className="text-xs font-bold text-slate-400">Strict Line Adherence</span>
                  <input type="checkbox" checked={settings.absoluteLineFidelity} onChange={e => setSettings({...settings, absoluteLineFidelity: e.target.checked})} className="w-4 h-4 rounded border-slate-700 bg-slate-800 text-indigo-600 focus:ring-offset-slate-900" />
               </div>
               <div className="space-y-2">
                  <span className="text-[10px] font-black text-slate-500 uppercase block">Anatomical Angle</span>
                  <select className="w-full bg-slate-800 border border-slate-700 rounded-lg p-2.5 text-xs font-bold text-white" value={settings.angleTag} onChange={e => setSettings({...settings, angleTag: e.target.value as any})}>
                    {['Generic', 'Front', '3/4 View', 'Profile', 'Upshot', 'Downshot'].map(a => <option key={a}>{a}</option>)}
                  </select>
               </div>
            </section>
          </aside>

          <section className="flex-1 bg-slate-950 p-6 flex flex-col gap-4 overflow-hidden relative">
            <div className="flex items-center justify-between">
              <div className="flex bg-slate-900 rounded-lg p-1 border border-slate-800 shadow-inner">
                {(['Before', 'After', 'Overlay'] as ViewMode[]).map(mode => (
                  <button key={mode} onClick={() => setViewMode(mode)} disabled={mode !== 'Before' && !correctedImage} className={`px-5 py-1.5 rounded-md text-[10px] font-black uppercase tracking-wider transition-all ${viewMode === mode ? 'bg-slate-700 text-white shadow-md' : 'text-slate-500 hover:text-slate-300'}`}>
                    {mode}
                  </button>
                ))}
              </div>
              {errorMsg && (
                <div className="text-rose-400 text-[10px] font-black uppercase bg-rose-400/10 px-4 py-2 rounded-lg border border-rose-400/20 animate-pulse flex items-center">
                  <i className="fa-solid fa-triangle-exclamation mr-2"></i>
                  {errorMsg}
                </div>
              )}
              <div className="text-[10px] font-black text-slate-600 uppercase tracking-widest hidden lg:block">
                <i className="fa-solid fa-shield-halved mr-2"></i> On-Model Assertion: Active
              </div>
            </div>

            <div className="flex-1 relative flex items-center justify-center overflow-hidden bg-[#05080f] rounded-3xl border border-slate-900 shadow-[inset_0_0_100px_rgba(0,0,0,0.8)]">
              {correctedImage && viewMode !== 'Before' ? (
                <ComparisonViewer original={originalImage!} corrected={correctedImage} mode={viewMode} />
              ) : (
                <div className="w-full h-full flex items-center justify-center p-8">
                  {originalImage ? (
                    <img src={originalImage} className="max-w-full max-h-full object-contain rounded shadow-2xl" />
                  ) : (
                    <div className="text-center opacity-10">
                      <i className="fa-solid fa-file-arrow-up text-9xl mb-6"></i>
                      <p className="text-2xl font-black uppercase tracking-[0.2em]">Source Empty</p>
                    </div>
                  )}
                </div>
              )}
              
              {isProcessing && (
                <div className="absolute inset-0 bg-slate-950/90 backdrop-blur-md flex flex-col items-center justify-center z-50">
                   <div className="relative mb-8">
                      <div className="w-24 h-24 border-2 border-indigo-500/20 rounded-full"></div>
                      <div className="absolute inset-0 w-24 h-24 border-t-2 border-indigo-500 rounded-full animate-spin"></div>
                   </div>
                   <h2 className="text-3xl font-black text-white tracking-tighter uppercase mb-2 text-center px-6">Anatomical Refinement</h2>
                   <div className="flex gap-4 items-center">
                      <span className="text-indigo-400 font-mono text-[10px] uppercase tracking-widest animate-pulse">Calculating Vectors</span>
                      <div className="w-1 h-1 rounded-full bg-slate-800"></div>
                      <span className="text-slate-500 font-mono text-[10px] uppercase tracking-widest">Nudging Features</span>
                   </div>
                </div>
              )}
            </div>

            <footer className="bg-slate-900/80 p-5 rounded-2xl border border-slate-800 flex items-center justify-between backdrop-blur-md">
               <div className="flex gap-12">
                  <div className="flex flex-col">
                    <span className="text-[9px] text-slate-500 font-black uppercase mb-1 tracking-widest">Output Consistency</span>
                    <span className={`text-[11px] font-black uppercase tracking-wider ${currentMetrics?.diff_in_mask && currentMetrics.diff_in_mask > 0.004 ? 'text-emerald-400' : 'text-amber-500'}`}>
                      {currentMetrics ? `Pass: Corrected for ${settings.angleTag}` : 'Ready for Cleanup'}
                    </span>
                  </div>
                  <div className="flex flex-col border-l border-slate-800 pl-12">
                    <span className="text-[9px] text-slate-500 font-black uppercase mb-1 tracking-widest">Canvas Bound</span>
                    <span className="text-[11px] text-indigo-400 font-black uppercase tracking-wider">{imageDimensions.width}x{imageDimensions.height}</span>
                  </div>
               </div>
               <div className="flex gap-3">
                  <button 
                    onClick={handleSaveCorrection}
                    disabled={!correctedImage}
                    className={`px-8 py-2.5 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all shadow-lg active:scale-95 flex items-center gap-2 ${correctedImage ? 'bg-indigo-600 hover:bg-indigo-500 text-white shadow-indigo-900/20' : 'bg-slate-800 text-slate-600 cursor-not-allowed'}`}
                  >
                    <i className="fa-solid fa-cloud-arrow-down"></i> Save Correction
                  </button>
               </div>
            </footer>
          </section>

          <aside className="w-72 bg-slate-900 border-l border-slate-800 flex flex-col overflow-hidden">
            <div className="p-6 flex-1 overflow-y-auto custom-scrollbar">
              <h2 className="text-[10px] font-black text-slate-500 uppercase tracking-widest mb-6 flex justify-between">
                Style Guidance
                <span className="bg-slate-800 px-2 py-0.5 rounded text-[8px] text-indigo-400 font-bold border border-indigo-400/20">{retrievedRefs.length} Contexts</span>
              </h2>
              <div className="grid grid-cols-2 gap-3 mb-10">
                {retrievedRefs.length === 0 ? (
                  <div className="col-span-2 text-center py-4 border border-dashed border-slate-800 rounded-xl opacity-30 text-[9px] uppercase font-bold">
                    No matching context
                  </div>
                ) : (
                  retrievedRefs.map(ref => (
                    <div key={ref.id} className="aspect-square bg-slate-950 rounded-xl overflow-hidden border border-slate-800 relative group shadow-lg">
                      <img src={ref.data} className="w-full h-full object-cover transition-transform group-hover:scale-110" />
                      <div className="absolute inset-0 bg-indigo-600/10 opacity-0 group-hover:opacity-100 transition-opacity"></div>
                      {ref.tags.includes(settings.angleTag) && (
                        <div className="absolute top-1 right-1 bg-emerald-500 w-2 h-2 rounded-full border border-slate-950 shadow-sm" title="Exact Angle Match"></div>
                      )}
                    </div>
                  ))
                )}
              </div>

              <div className="flex items-center justify-between mb-6">
                <h2 className="text-[10px] font-black text-slate-500 uppercase tracking-widest">Refinement History</h2>
                {history.length > 0 && (
                  <button 
                    onClick={clearHistory}
                    className="text-[9px] font-black text-rose-500/60 hover:text-rose-400 uppercase tracking-tighter transition-colors"
                  >
                    Clear All
                  </button>
                )}
              </div>
              <div className="space-y-3 pb-8">
                {history.length === 0 ? (
                  <div className="text-center py-12 opacity-20 italic text-xs">No entries yet.</div>
                ) : (
                  history.map(session => (
                    <div key={session.id} onClick={() => { setCorrectedImage(session.resultImage); setOriginalImage(session.originalImage); setViewMode('After'); }} className="group cursor-pointer bg-slate-950 rounded-xl overflow-hidden border border-slate-800 hover:border-indigo-500 transition-all active:scale-95 shadow-md">
                      <div className="relative">
                        <img src={session.resultImage} className="w-full h-20 object-cover opacity-60 group-hover:opacity-100 transition-opacity" />
                      </div>
                      <div className="p-2.5 bg-slate-900 flex justify-between items-center text-[8px] font-black uppercase tracking-widest">
                        <span className="text-slate-600">{new Date(session.timestamp).toLocaleTimeString([], {hour:'2-digit', minute:'2-digit'})}</span>
                        <span className="text-emerald-500/70">Refined Pass</span>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>
          </aside>
        </main>
      )}
    </div>
  );
};

export default App;
