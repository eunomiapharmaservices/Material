'use client';
// components/Platform.jsx
// Adapted from the prototype — state now persisted via API routes + Supabase.

import { useState, useRef, useEffect, useCallback } from 'react';

// ══════════════════════════════════════════════════════════════
// CONSTANTS (same as prototype)
// ══════════════════════════════════════════════════════════════
const MATERIAL_TYPES = [
  'PDF Document','Word Document (.docx)','PowerPoint Presentation (.pptx)',
  'Excel Spreadsheet (.xlsx)','Audio File','Video File','Other',
];
const ROLES = [
  { id:'owner',     label:'Business Owner',       user:'Sarah Johnson',       init:'SJ', color:'#1e3a5f' },
  { id:'reviewer',  label:'Reviewer / Compliance', user:'Dr. Michael Chen',    init:'MC', color:'#7c3aed' },
  { id:'signatory', label:'Medical Signatory',     user:'Prof. Emily Williams', init:'EW', color:'#0f766e' },
];
const ST = {
  REVIEW:'under_review', REVISE:'revise_resubmit', APPROVED:'approved',
  CERT:'under_certification', CERTIFIED:'certified', REJECTED:'not_approved', CANCELLED:'cancelled',
};
const SMETA = {
  under_review:        { label:'Under Review',        dot:'#f59e0b', bg:'#fffbeb', fg:'#92400e', bd:'#fde68a' },
  revise_resubmit:     { label:'Revise & Resubmit',   dot:'#f97316', bg:'#fff7ed', fg:'#9a3412', bd:'#fed7aa' },
  approved:            { label:'Approved',             dot:'#22c55e', bg:'#f0fdf4', fg:'#15803d', bd:'#bbf7d0' },
  under_certification: { label:'Under Certification', dot:'#6366f1', bg:'#eef2ff', fg:'#4338ca', bd:'#c7d2fe' },
  certified:           { label:'Certified',            dot:'#10b981', bg:'#ecfdf5', fg:'#065f46', bd:'#a7f3d0' },
  not_approved:        { label:'Not Approved',         dot:'#ef4444', bg:'#fef2f2', fg:'#991b1b', bd:'#fecaca' },
  cancelled:           { label:'Cancelled',            dot:'#9ca3af', bg:'#f9fafb', fg:'#6b7280', bd:'#e5e7eb' },
};
const fmt  = d => new Date(d).toLocaleString('en-GB',{day:'2-digit',month:'short',year:'numeric',hour:'2-digit',minute:'2-digit'});
const fmtD = d => new Date(d).toLocaleDateString('en-GB',{day:'2-digit',month:'short',year:'numeric'});
const fileIcon = t => t?.includes('PDF')?'📄':t?.includes('Word')?'📝':t?.includes('PowerPoint')||t?.includes('pptx')?'📊':t?.includes('Excel')?'📈':t?.includes('Audio')?'🎵':t?.includes('Video')?'🎬':'📎';
const isMedia = t => ['Audio File','Video File'].includes(t);

// ══════════════════════════════════════════════════════════════
// API HELPERS
// ══════════════════════════════════════════════════════════════
async function apiFetch(path, opts={}) {
  const res = await fetch(path, { headers:{'Content-Type':'application/json'}, ...opts });
  if (!res.ok) { const e = await res.json().catch(()=>({error:res.statusText})); throw new Error(e.error||res.statusText); }
  return res.json();
}

async function uploadFile(file, materialId, version) {
  const fd = new FormData();
  fd.append('file', file);
  fd.append('materialId', materialId);
  fd.append('version', String(version));
  const res = await fetch('/api/upload', { method:'POST', body:fd });
  if (!res.ok) throw new Error('Upload failed');
  return res.json(); // { path, url, fileName }
}

// ══════════════════════════════════════════════════════════════
// ATOMS
// ══════════════════════════════════════════════════════════════
function StatusBadge({ status }) {
  const m = SMETA[status] || { label:status, dot:'#94a3b8', bg:'#f1f5f9', fg:'#475569', bd:'#e2e8f0' };
  return (
    <span style={{background:m.bg,color:m.fg,border:`1px solid ${m.bd}`,padding:'2px 10px',borderRadius:20,fontSize:11,fontWeight:700,display:'inline-flex',alignItems:'center',gap:5,whiteSpace:'nowrap'}}>
      <span style={{width:7,height:7,borderRadius:'50%',background:m.dot,flexShrink:0}}/>
      {m.label}
    </span>
  );
}

function Btn({ children, variant='primary', size='md', style={}, disabled, onClick }) {
  const [hov, setHov] = useState(false);
  const sizes = { sm:{padding:'5px 12px',fontSize:12}, md:{padding:'8px 16px',fontSize:13}, lg:{padding:'11px 22px',fontSize:14} };
  const variants = {
    primary:{background:'#1e3a5f',color:'#fff'}, success:{background:'#16a34a',color:'#fff'},
    warning:{background:'#ea580c',color:'#fff'}, danger:{background:'#dc2626',color:'#fff'},
    violet:{background:'#7c3aed',color:'#fff'}, teal:{background:'#0f766e',color:'#fff'},
    outline:{background:'#fff',color:'#374151',border:'1.5px solid #d1d5db'},
    ghost:{background:'transparent',color:'#6b7280'},
  };
  return (
    <button onClick={disabled?undefined:onClick} onMouseEnter={()=>setHov(true)} onMouseLeave={()=>setHov(false)}
      style={{display:'inline-flex',alignItems:'center',justifyContent:'center',gap:6,fontFamily:"'DM Sans',sans-serif",fontWeight:700,borderRadius:10,border:'none',cursor:disabled?'not-allowed':'pointer',transition:'all 0.15s',
        ...sizes[size],...variants[variant],opacity:disabled?0.45:1,filter:hov&&!disabled?'brightness(0.91)':'none',...style}}>
      {children}
    </button>
  );
}

function Field({ label, required, children, hint }) {
  return (
    <div style={{display:'flex',flexDirection:'column',gap:5}}>
      <label style={{fontSize:11,fontWeight:700,color:'#64748b',textTransform:'uppercase',letterSpacing:'0.07em'}}>
        {label}{required&&<span style={{color:'#f87171',marginLeft:2}}>*</span>}
      </label>
      {children}
      {hint&&<p style={{fontSize:11,color:'#94a3b8'}}>{hint}</p>}
    </div>
  );
}

function Spinner() {
  return <span style={{display:'inline-block',width:18,height:18,border:'2.5px solid #e2e8f0',borderTopColor:'#1e3a5f',borderRadius:'50%',animation:'spin 0.6s linear infinite'}}/>
}

// ══════════════════════════════════════════════════════════════
// PDF CANVAS RENDERER — uses PDF.js, works in all browsers
// regardless of CSP, sandbox, or Content-Disposition headers
// ══════════════════════════════════════════════════════════════
function PdfCanvasViewer({ arrayBuf, blobUrl, fileName, canAnnotate, annotations, onAnnotate }) {
  var containerRef = useRef(null);
  var [pdfLoading, setPdfLoading] = useState(true);
  var [pageCount,  setPageCount]  = useState(0);
  var [popup, setPopup]           = useState(null); // {page, xPct, yPct, screenX, screenY}
  var [popupText, setPopupText]   = useState('');
  var popupRef = useRef(null);

  var PDFJS_CDN  = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js';
  var WORKER_CDN = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';

  // Close popup when clicking outside
  useEffect(function() {
    function onOutsideClick(e) {
      if (popupRef.current && !popupRef.current.contains(e.target)) setPopup(null);
    }
    document.addEventListener('mousedown', onOutsideClick);
    return function() { document.removeEventListener('mousedown', onOutsideClick); };
  }, []);

  useEffect(function() {
    if (!arrayBuf || !containerRef.current) return;

    function loadScript(src) {
      return new Promise(function(res, rej) {
        if (document.querySelector('script[src="' + src + '"]')) { res(); return; }
        var s = document.createElement('script');
        s.src = src; s.onload = res; s.onerror = rej;
        document.head.appendChild(s);
      });
    }

    var container = containerRef.current;
    container.innerHTML = '';
    setPdfLoading(true);

    loadScript(PDFJS_CDN)
      .then(function() {
        window.pdfjsLib.GlobalWorkerOptions.workerSrc = WORKER_CDN;
        return window.pdfjsLib.getDocument({ data: arrayBuf.slice(0) }).promise;
      })
      .then(function(pdf) {
        setPageCount(pdf.numPages);
        var chain = Promise.resolve();

        for (var i = 1; i <= pdf.numPages; i++) {
          (function(pageNum) {
            chain = chain.then(function() {
              return pdf.getPage(pageNum).then(function(page) {
                var scale    = 1.8;
                var viewport = page.getViewport({ scale: scale });

                // Page wrapper — position:relative so overlays can be absolute inside
                var wrapper = document.createElement('div');
                wrapper.style.cssText = 'position:relative;margin:0 auto 12px;max-width:900px;box-shadow:0 2px 12px rgba(0,0,0,0.25);background:#fff;cursor:' + (canAnnotate ? 'crosshair' : 'default') + ';';
                wrapper.dataset.page = pageNum;

                var canvas = document.createElement('canvas');
                canvas.width  = viewport.width;
                canvas.height = viewport.height;
                canvas.style.cssText = 'display:block;width:100%;height:auto;';
                wrapper.appendChild(canvas);

                // Click overlay for annotations
                if (canAnnotate) {
                  var overlay = document.createElement('div');
                  overlay.style.cssText = 'position:absolute;inset:0;z-index:1;';
                  overlay.addEventListener('click', function(e) {
                    var rect   = wrapper.getBoundingClientRect();
                    var contR  = container.getBoundingClientRect();
                    var xPct   = Math.round((e.clientX - rect.left)  / rect.width  * 100);
                    var yPct   = Math.round((e.clientY - rect.top)   / rect.height * 100);
                    var screenX = e.clientX - contR.left;
                    var screenY = e.clientY - contR.top  + container.scrollTop;
                    setPopup({ page: pageNum, xPct: xPct, yPct: yPct, screenX: screenX, screenY: screenY });
                    setPopupText('');
                  });
                  wrapper.appendChild(overlay);
                }

                container.appendChild(wrapper);

                return page.render({ canvasContext: canvas.getContext('2d'), viewport: viewport }).promise
                  .then(function() {
                    // Draw existing annotation pins for this page
                    var ctx    = canvas.getContext('2d');
                    var pageAnns = (annotations || []).filter(function(a) {
                      return a.reference && a.reference.indexOf('Page ' + pageNum) !== -1;
                    });
                    pageAnns.forEach(function(ann) {
                      // Parse position from reference like "Page 3 (45%, 67%)"
                      var match = ann.reference.match(/\((\d+)%,\s*(\d+)%\)/);
                      if (match) {
                        var px = parseInt(match[1]) / 100 * canvas.width;
                        var py = parseInt(match[2]) / 100 * canvas.height;
                        // Draw pin
                        ctx.beginPath();
                        ctx.arc(px, py, 12, 0, Math.PI * 2);
                        ctx.fillStyle = ann.role === 'signatory' ? 'rgba(124,58,237,0.85)' : 'rgba(245,158,11,0.9)';
                        ctx.fill();
                        ctx.font = 'bold 14px Arial';
                        ctx.fillStyle = '#fff';
                        ctx.textAlign = 'center';
                        ctx.textBaseline = 'middle';
                        ctx.fillText('💬', px, py);
                      }
                    });
                  });
              });
            });
          })(i);
        }
        return chain;
      })
      .then(function() { setPdfLoading(false); })
      .catch(function(e) {
        console.error('PDF.js error:', e);
        if (container) container.innerHTML = '<p style="color:#dc2626;padding:20px;text-align:center;">PDF render failed: ' + e.message + '</p>';
        setPdfLoading(false);
      });
  }, [arrayBuf, canAnnotate]);

  function submitAnnotation() {
    if (!popupText.trim() || !popup) return;
    onAnnotate({
      reference: 'Page ' + popup.page + ' (' + popup.xPct + '%, ' + popup.yPct + '%)',
      body:      popupText.trim(),
    });
    setPopup(null);
    setPopupText('');
  }

  return (
    <div style={{flex:1,display:'flex',flexDirection:'column',overflow:'hidden'}}>
      {/* Toolbar */}
      <div style={{background:'#f8fafc',borderBottom:'1px solid #e2e8f0',padding:'6px 14px',display:'flex',alignItems:'center',justifyContent:'space-between',flexShrink:0}}>
        <span style={{fontSize:11,color:'#94a3b8',fontWeight:600}}>
          📄 {fileName} {pageCount > 0 ? '(' + pageCount + (pageCount === 1 ? ' page' : ' pages') + ')' : ''}
        </span>
        <div style={{display:'flex',alignItems:'center',gap:12}}>
          {canAnnotate && <span style={{fontSize:11,color:'#f97316',fontWeight:700,background:'#fff7ed',padding:'2px 10px',borderRadius:20,border:'1px solid #fed7aa'}}>✦ Click anywhere to comment</span>}
          {blobUrl && <a href={blobUrl} target="_blank" rel="noreferrer" style={{fontSize:11,color:'#1e3a5f',fontWeight:700,textDecoration:'none'}}>Open in new tab ↗</a>}
        </div>
      </div>

      {/* PDF canvas area */}
      <div style={{flex:1,position:'relative',overflow:'hidden'}}>
        {pdfLoading && (
          <div style={{position:'absolute',inset:0,display:'flex',flexDirection:'column',alignItems:'center',justifyContent:'center',background:'rgba(82,86,89,0.7)',zIndex:10}}>
            <div style={{width:32,height:32,border:'3px solid rgba(255,255,255,0.3)',borderTopColor:'#fff',borderRadius:'50%',animation:'spin 0.7s linear infinite',marginBottom:12}}/>
            <p style={{fontSize:13,fontWeight:600,color:'#fff'}}>Rendering PDF…</p>
          </div>
        )}

        <div ref={containerRef} style={{height:'100%',overflowY:'auto',background:'#525659',padding:'16px 24px',position:'relative'}}/>

        {/* Annotation popup */}
        {popup && (
          <div ref={popupRef} style={{
            position:'absolute',
            left: Math.min(popup.screenX + 12, 580),
            top:  Math.max(popup.screenY - 20, 8),
            background:'#fff',
            border:'1px solid #e2e8f0',
            borderRadius:14,
            padding:14,
            boxShadow:'0 8px 32px rgba(0,0,0,0.18)',
            zIndex:20,
            width:280,
          }}>
            <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',marginBottom:10}}>
              <span style={{fontSize:11,fontWeight:800,color:'#1e3a5f',textTransform:'uppercase',letterSpacing:'0.07em'}}>
                Add Comment — Page {popup.page}
              </span>
              <button onClick={function(){setPopup(null);}} style={{background:'none',border:'none',color:'#94a3b8',cursor:'pointer',fontSize:16,lineHeight:1,padding:2}}>✕</button>
            </div>
            <div style={{fontSize:10,color:'#94a3b8',marginBottom:8,fontWeight:600}}>
              📍 Position: {popup.xPct}%, {popup.yPct}% on page {popup.page}
            </div>
            <textarea
              autoFocus
              placeholder="Write your comment…"
              value={popupText}
              onChange={function(e){setPopupText(e.target.value);}}
              onKeyDown={function(e){ if(e.key==='Enter'&&(e.ctrlKey||e.metaKey)) submitAnnotation(); }}
              rows={3}
              style={{width:'100%',border:'1.5px solid #e2e8f0',borderRadius:8,padding:'8px 10px',fontSize:12,resize:'none',fontFamily:'inherit',outline:'none',marginBottom:10}}
            />
            <div style={{display:'flex',gap:8}}>
              <button onClick={submitAnnotation} disabled={!popupText.trim()}
                style={{flex:1,padding:'8px',background:popupText.trim()?'#1e3a5f':'#94a3b8',color:'#fff',border:'none',borderRadius:8,fontSize:12,fontWeight:700,cursor:popupText.trim()?'pointer':'not-allowed',fontFamily:'inherit'}}>
                Add Comment
              </button>
              <button onClick={function(){setPopup(null);}}
                style={{padding:'8px 12px',background:'#f1f5f9',border:'none',borderRadius:8,fontSize:12,cursor:'pointer',fontFamily:'inherit',color:'#64748b'}}>
                Cancel
              </button>
            </div>
            <p style={{fontSize:10,color:'#94a3b8',marginTop:8,textAlign:'center'}}>Ctrl+Enter to submit</p>
          </div>
        )}
      </div>
    </div>
  );
}

// ══════════════════════════════════════════════════════════════
// WORD VIEWER — mammoth HTML render + inline comment popup
// ══════════════════════════════════════════════════════════════
function WordViewer({ docHtml, blobUrl, fileName, canAnnotate, annotations, onAnnotate, onTextSelect }) {
  var [popup, setPopup]       = useState(null); // {x, y, selectedText}
  var [popupText, setPopupText] = useState('');
  var popupRef = useRef(null);

  useEffect(function() {
    function onOutsideClick(e) {
      if (popupRef.current && !popupRef.current.contains(e.target)) setPopup(null);
    }
    document.addEventListener('mousedown', onOutsideClick);
    return function() { document.removeEventListener('mousedown', onOutsideClick); };
  }, []);

  function handleMouseUp(e) {
    try {
      var sel = window.getSelection().toString().trim();
      if (!sel || sel.length < 2) return;
      if (onTextSelect) onTextSelect('"' + sel.substring(0, 80) + '"');
      if (canAnnotate) {
        var rect = e.currentTarget.getBoundingClientRect();
        setPopup({ x: e.clientX - rect.left, y: e.clientY - rect.top + 8, selectedText: sel });
        setPopupText('');
      }
    } catch(e2) {}
  }

  function submitAnnotation() {
    if (!popupText.trim() || !popup) return;
    onAnnotate({
      reference: '"' + popup.selectedText.substring(0, 60) + '"',
      body:      popupText.trim(),
    });
    setPopup(null); setPopupText('');
    // Clear selection
    try { window.getSelection().removeAllRanges(); } catch(e) {}
  }

  return (
    <div style={{flex:1,display:'flex',flexDirection:'column',overflow:'hidden'}}>
      <div style={{background:'#f8fafc',borderBottom:'1px solid #e2e8f0',padding:'6px 14px',display:'flex',alignItems:'center',justifyContent:'space-between',flexShrink:0}}>
        <span style={{fontSize:11,color:'#94a3b8',fontWeight:600}}>📝 {fileName}</span>
        <div style={{display:'flex',alignItems:'center',gap:12}}>
          {canAnnotate
            ? <span style={{fontSize:11,color:'#f97316',fontWeight:700,background:'#fff7ed',padding:'2px 10px',borderRadius:20,border:'1px solid #fed7aa'}}>✦ Select text to comment</span>
            : <span style={{fontSize:11,color:'#6366f1',fontWeight:600}}>💡 Select text to reference in a comment</span>
          }
          {blobUrl && <a href={blobUrl} download={fileName} style={{fontSize:11,color:'#1e3a5f',fontWeight:700,textDecoration:'none'}}>⬇ Download</a>}
        </div>
      </div>
      <div style={{flex:1,overflowY:'auto',padding:'32px 40px',background:'#fff',position:'relative'}} onMouseUp={handleMouseUp}>
        <style>{'.docx-body{max-width:720px;margin:0 auto;font-family:Georgia,serif;font-size:14px;line-height:1.9;color:#1e293b}.docx-body h1{font-size:22px;font-weight:700;margin:24px 0 12px;border-bottom:2px solid #e2e8f0;padding-bottom:8px}.docx-body h2{font-size:18px;font-weight:700;margin:18px 0 8px}.docx-body h3{font-size:15px;font-weight:700;margin:14px 0 6px}.docx-body p{margin:0 0 12px}.docx-body table{border-collapse:collapse;width:100%;margin:16px 0}.docx-body td,.docx-body th{border:1px solid #e2e8f0;padding:8px 12px;font-size:13px}.docx-body th{background:#f8fafc;font-weight:700}.docx-body ul,.docx-body ol{margin:8px 0 12px 24px}.docx-body li{margin-bottom:4px}::selection{background:#c7d2fe;color:#1e293b}'}</style>
        {docHtml
          ? <div className="docx-body" dangerouslySetInnerHTML={{ __html: docHtml }}/>
          : <p style={{textAlign:'center',paddingTop:80,color:'#94a3b8',fontSize:13}}>Rendering document…</p>
        }
        {/* Inline comment popup on text selection */}
        {popup && canAnnotate && (
          <div ref={popupRef} style={{
            position:'absolute',
            left: Math.min(popup.x, 560),
            top:  popup.y,
            background:'#fff',
            border:'1px solid #e2e8f0',
            borderRadius:14,
            padding:14,
            boxShadow:'0 8px 32px rgba(0,0,0,0.16)',
            zIndex:20,
            width:300,
          }}>
            <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',marginBottom:8}}>
              <span style={{fontSize:11,fontWeight:800,color:'#1e3a5f',textTransform:'uppercase',letterSpacing:'0.07em'}}>Add Comment</span>
              <button onClick={function(){setPopup(null);}} style={{background:'none',border:'none',color:'#94a3b8',cursor:'pointer',fontSize:16,lineHeight:1}}>✕</button>
            </div>
            <div style={{fontSize:11,color:'#6366f1',background:'#eef2ff',border:'1px solid #c7d2fe',borderRadius:6,padding:'4px 8px',marginBottom:10,fontStyle:'italic',overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>
              📍 "{popup.selectedText.substring(0, 50)}{popup.selectedText.length > 50 ? '…' : ''}"
            </div>
            <textarea autoFocus placeholder="Write your comment…" value={popupText}
              onChange={function(e){setPopupText(e.target.value);}}
              onKeyDown={function(e){ if(e.key==='Enter'&&(e.ctrlKey||e.metaKey)) submitAnnotation(); }}
              rows={3} style={{width:'100%',border:'1.5px solid #e2e8f0',borderRadius:8,padding:'8px 10px',fontSize:12,resize:'none',fontFamily:'inherit',outline:'none',marginBottom:10}}/>
            <div style={{display:'flex',gap:8}}>
              <button onClick={submitAnnotation} disabled={!popupText.trim()}
                style={{flex:1,padding:'8px',background:popupText.trim()?'#1e3a5f':'#94a3b8',color:'#fff',border:'none',borderRadius:8,fontSize:12,fontWeight:700,cursor:popupText.trim()?'pointer':'not-allowed',fontFamily:'inherit'}}>
                Add Comment
              </button>
              <button onClick={function(){setPopup(null);}} style={{padding:'8px 12px',background:'#f1f5f9',border:'none',borderRadius:8,fontSize:12,cursor:'pointer',fontFamily:'inherit',color:'#64748b'}}>
                Cancel
              </button>
            </div>
            <p style={{fontSize:10,color:'#94a3b8',marginTop:8,textAlign:'center'}}>Ctrl+Enter to submit</p>
          </div>
        )}
      </div>
    </div>
  );
}

// ══════════════════════════════════════════════════════════════
// DOCUMENT VIEWER — fetches file, processes, renders inline
// ══════════════════════════════════════════════════════════════
function DocumentViewer({ fileUrl, filePath, fileName, type, canAnnotate, annotations, onAnnotate, onTextSelect }) {
  var [arrayBuf,  setArrayBuf]  = useState(null);
  var [blobUrl,   setBlobUrl]   = useState(null);
  var [docHtml,   setDocHtml]   = useState(null);
  var [sheets,    setSheets]    = useState([]);
  var [activeTab, setActiveTab] = useState(0);
  var [loading,   setLoading]   = useState(false);
  var [viewErr,   setViewErr]   = useState(null);

  var fetchUrl = filePath
    ? '/api/file-proxy?path=' + encodeURIComponent(filePath)
    : fileUrl;

  var loadScript = useCallback(function(src) {
    return new Promise(function(res, rej) {
      if (document.querySelector('script[src="' + src + '"]')) { res(); return; }
      var s = document.createElement('script');
      s.src = src; s.onload = res; s.onerror = function() { rej(new Error('Script load failed')); };
      document.head.appendChild(s);
    });
  }, []);

  useEffect(function() {
    if (!fetchUrl) return;
    setArrayBuf(null); setDocHtml(null); setSheets([]); setViewErr(null); setLoading(true);
    setBlobUrl(function(old) { if (old) URL.revokeObjectURL(old); return null; });

    fetch(fetchUrl)
      .then(function(r) {
        if (!r.ok) throw new Error('HTTP ' + r.status + ' — try re-uploading the file');
        return r.arrayBuffer();
      })
      .then(function(buf) {
        setArrayBuf(buf);

        // Create blob URL for audio/video and download links
        var ext = (fileName || '').split('.').pop().toLowerCase();
        var mimeMap = { pdf:'application/pdf', mp3:'audio/mpeg', wav:'audio/wav', mp4:'video/mp4', mov:'video/quicktime', webm:'video/webm',
          docx:'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
          xlsx:'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' };
        var blob = new Blob([buf], { type: mimeMap[ext] || 'application/octet-stream' });
        setBlobUrl(URL.createObjectURL(blob));

        // Word — parse with mammoth
        if (type && type.indexOf('Word') !== -1) {
          return loadScript('https://cdnjs.cloudflare.com/ajax/libs/mammoth/1.6.0/mammoth.browser.min.js')
            .then(function() { return window.mammoth.convertToHtml({ arrayBuffer: buf.slice(0) }); })
            .then(function(r) { setDocHtml(r.value || '<p>Empty document.</p>'); });
        }
        // Excel — parse with SheetJS
        if (type && type.indexOf('Excel') !== -1) {
          return loadScript('https://cdnjs.cloudflare.com/ajax/libs/xlsx/0.18.5/xlsx.full.min.js')
            .then(function() {
              var wb = window.XLSX.read(buf.slice(0), { type:'array' });
              setSheets(wb.SheetNames.map(function(n) { return { name:n, html:window.XLSX.utils.sheet_to_html(wb.Sheets[n]) }; }));
            });
        }
      })
      .then(function() { setLoading(false); })
      .catch(function(e) { console.error('DocumentViewer:', e); setViewErr(e.message); setLoading(false); });

    return function() { setBlobUrl(function(old) { if (old) URL.revokeObjectURL(old); return null; }); };
  }, [fetchUrl, type]);

  function handleMouseUp() {
    try {
      var sel = window.getSelection().toString().trim();
      if (sel && sel.length > 1 && onTextSelect) onTextSelect('"' + sel.substring(0, 80) + '"');
    } catch(e) {}
  }

  if (!fetchUrl) return (
    <div style={{flex:1,display:'flex',alignItems:'center',justifyContent:'center',background:'#f8fafc'}}>
      <div style={{textAlign:'center',color:'#94a3b8'}}>
        <div style={{fontSize:52,marginBottom:10}}>{fileIcon(type)}</div>
        <p style={{fontSize:13,fontWeight:600}}>No file uploaded</p>
      </div>
    </div>
  );

  if (loading) return (
    <div style={{flex:1,display:'flex',flexDirection:'column',alignItems:'center',justifyContent:'center',gap:14,background:'#f8fafc'}}>
      <div style={{width:36,height:36,border:'3px solid #e2e8f0',borderTopColor:'#1e3a5f',borderRadius:'50%',animation:'spin 0.7s linear infinite'}}/>
      <p style={{fontSize:13,color:'#64748b',fontWeight:600}}>Loading file…</p>
    </div>
  );

  if (viewErr) return (
    <div style={{flex:1,display:'flex',alignItems:'center',justifyContent:'center',background:'#fef2f2',padding:32}}>
      <div style={{textAlign:'center',maxWidth:380}}>
        <div style={{fontSize:40,marginBottom:12}}>⚠️</div>
        <p style={{fontWeight:700,color:'#991b1b',marginBottom:8}}>Could not load file</p>
        <p style={{fontSize:12,color:'#dc2626',marginBottom:4}}>{viewErr}</p>
        <p style={{fontSize:11,color:'#94a3b8',marginBottom:16}}>Delete this material and re-upload the file to fix this.</p>
      </div>
    </div>
  );

  // ── PDF — rendered via PDF.js canvas (bypasses all browser restrictions) ──
  if (type === 'PDF Document') {
    return arrayBuf
      ? <PdfCanvasViewer arrayBuf={arrayBuf} blobUrl={blobUrl} fileName={fileName}
          canAnnotate={canAnnotate} annotations={annotations} onAnnotate={onAnnotate}/>
      : <div style={{flex:1,display:'flex',alignItems:'center',justifyContent:'center'}}><Spinner/></div>;
  }

  // ── AUDIO ──────────────────────────────────────────────────────
  if (type === 'Audio File') return (
    <div style={{flex:1,display:'flex',flexDirection:'column',alignItems:'center',justifyContent:'center',background:'linear-gradient(135deg,#f0f9ff,#e0e7ff)',gap:20,padding:40}}>
      <div style={{width:80,height:80,borderRadius:20,background:'#e0e7ff',display:'flex',alignItems:'center',justifyContent:'center',fontSize:36}}>🎵</div>
      <p style={{fontWeight:700,color:'#3730a3'}}>{fileName}</p>
      {blobUrl && <audio controls src={blobUrl} style={{width:'100%',maxWidth:420,borderRadius:8}}/>}
      <p style={{fontSize:12,color:'#6366f1'}}>Add timestamped comments in the panel on the right</p>
    </div>
  );

  // ── VIDEO ──────────────────────────────────────────────────────
  if (type === 'Video File') return (
    <div style={{flex:1,background:'#0f172a',display:'flex',alignItems:'center',justifyContent:'center',padding:16}}>
      {blobUrl && <video controls src={blobUrl} style={{maxHeight:'100%',maxWidth:'100%',borderRadius:8}}/>}
    </div>
  );

  // ── WORD — mammoth renders HTML + inline comment popup ────────
  if (type && type.indexOf('Word') !== -1) {
    return <WordViewer docHtml={docHtml} blobUrl={blobUrl} fileName={fileName}
      canAnnotate={canAnnotate} annotations={annotations} onAnnotate={onAnnotate} onTextSelect={onTextSelect}/>;
  }

  // ── EXCEL — SheetJS renders table ─────────────────────────────
  if (type && type.indexOf('Excel') !== -1) return (
    <div style={{flex:1,display:'flex',flexDirection:'column',overflow:'hidden'}}>
      {sheets.length > 1 && (
        <div style={{display:'flex',gap:4,padding:'8px 12px',background:'#f8fafc',borderBottom:'1px solid #e2e8f0',flexShrink:0,overflowX:'auto'}}>
          {sheets.map(function(s, i) {
            return <button key={i} onClick={function(){ setActiveTab(i); }}
              style={{padding:'4px 12px',borderRadius:6,border:'1px solid #e2e8f0',fontSize:11,fontWeight:700,cursor:'pointer',whiteSpace:'nowrap',fontFamily:'inherit',
                background:activeTab===i?'#1e3a5f':'#fff',color:activeTab===i?'#fff':'#64748b'}}>{s.name}</button>;
          })}
        </div>
      )}
      <div style={{flex:1,overflow:'auto',padding:16,background:'#fff'}} onMouseUp={handleMouseUp}>
        <style>{'.xlsx-wrap table{border-collapse:collapse;font-size:12px;min-width:100%}.xlsx-wrap td,.xlsx-wrap th{border:1px solid #e2e8f0;padding:5px 10px;white-space:nowrap;color:#334155;text-align:left}.xlsx-wrap tr:first-child td{background:#f8fafc;font-weight:700;position:sticky;top:0;z-index:1}.xlsx-wrap tr:hover td{background:#f0f4ff}'}</style>
        {sheets.length > 0 && sheets[activeTab]
          ? <div className="xlsx-wrap" dangerouslySetInnerHTML={{ __html: sheets[activeTab].html }}/>
          : null}
      </div>
    </div>
  );

  // ── POWERPOINT — Google Docs Viewer ───────────────────────────
  if (type && type.indexOf('PowerPoint') !== -1) {
    var origin = typeof window !== 'undefined' ? window.location.origin : '';
    var gdocsUrl = 'https://docs.google.com/viewer?url=' + encodeURIComponent(origin + '/api/file-proxy?path=' + encodeURIComponent(filePath || '')) + '&embedded=true';
    return (
      <div style={{flex:1,display:'flex',flexDirection:'column',overflow:'hidden'}}>
        <div style={{background:'#f8fafc',borderBottom:'1px solid #e2e8f0',padding:'6px 14px',display:'flex',alignItems:'center',justifyContent:'space-between',flexShrink:0}}>
          <span style={{fontSize:11,color:'#94a3b8',fontWeight:600}}>📋 {fileName}</span>
          {blobUrl && <a href={blobUrl} download={fileName} style={{fontSize:11,color:'#1e3a5f',fontWeight:700,textDecoration:'none'}}>⬇ Download</a>}
        </div>
        <iframe src={gdocsUrl} style={{flex:1,width:'100%',border:'none'}} title="PowerPoint Viewer"/>
      </div>
    );
  }

  // ── FALLBACK ───────────────────────────────────────────────────
  return (
    <div style={{flex:1,display:'flex',alignItems:'center',justifyContent:'center',background:'#f8fafc',padding:40}}>
      <div style={{textAlign:'center',maxWidth:280,background:'#fff',borderRadius:20,padding:36,boxShadow:'0 4px 20px rgba(0,0,0,0.06)',border:'1px solid #e2e8f0'}}>
        <div style={{fontSize:56,marginBottom:14}}>{fileIcon(type)}</div>
        <p style={{fontWeight:700,color:'#1e293b',marginBottom:6}}>{fileName}</p>
        <p style={{fontSize:13,color:'#64748b',marginBottom:20}}>Download to review, then add comments in the right panel.</p>
        {blobUrl && <a href={blobUrl} download={fileName}
          style={{display:'inline-flex',alignItems:'center',gap:6,padding:'9px 18px',background:'#1e3a5f',color:'#fff',borderRadius:10,fontSize:13,fontWeight:700,textDecoration:'none'}}>
          ⬇ Download to Review
        </a>}
      </div>
    </div>
  );
}



// ══════════════════════════════════════════════════════════════
// ANNOTATION PANEL
// ══════════════════════════════════════════════════════════════
function AnnotationPanel({ material, currentVersion, roleId, user, onAdd, onResolve, prefillRef, onPrefillUsed }) {
  const [text, setText] = useState('');
  const [ref_, setRef_] = useState('');
  const [filter, setFilter] = useState('open');
  const [saving, setSaving] = useState(false);

  // When parent sends a text-selection reference, populate the field
  useEffect(() => {
    if (prefillRef) { setRef_(prefillRef); if (onPrefillUsed) onPrefillUsed(); }
  }, [prefillRef]);

  const anns = currentVersion?.annotations || [];
  const shown = filter==='all'?anns : filter==='open'?anns.filter(a=>!a.resolved) : anns.filter(a=>a.resolved);
  const canComment = (roleId==='reviewer'&&material.status===ST.REVIEW)||(roleId==='signatory'&&material.status===ST.CERT);
  const roleColorMap = {
    reviewer:{bg:'#fffbeb',bd:'#fde68a',dot:'#f59e0b'},
    signatory:{bg:'#f5f3ff',bd:'#ddd6fe',dot:'#7c3aed'},
    owner:{bg:'#f8fafc',bd:'#e2e8f0',dot:'#94a3b8'},
  };

  const submit = async () => {
    if (!text.trim()||saving) return;
    setSaving(true);
    try {
      await onAdd({ author:user, role:roleId, body:text.trim(), reference:ref_.trim(),
        version_num: material.current_version, is_cert: roleId==='signatory' });
      setText(''); setRef_('');
    } finally { setSaving(false); }
  };

  return (
    <div style={{width:272,flexShrink:0,display:'flex',flexDirection:'column',borderLeft:'1px solid #e2e8f0',background:'#fff'}}>
      <div style={{padding:'12px 14px',borderBottom:'1px solid #f1f5f9',background:'#fafbfc'}}>
        <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',marginBottom:10}}>
          <span style={{fontSize:11,fontWeight:800,color:'#64748b',textTransform:'uppercase',letterSpacing:'0.07em'}}>Comments</span>
          <span style={{fontSize:11,fontWeight:700,color:'#94a3b8',background:'#f1f5f9',padding:'2px 8px',borderRadius:20}}>{anns.length}</span>
        </div>
        <div style={{display:'flex',gap:4}}>
          {['open','all','resolved'].map(f=>(
            <button key={f} onClick={()=>setFilter(f)} style={{flex:1,padding:'4px 0',borderRadius:8,border:filter===f?'none':'1px solid #e2e8f0',fontSize:11,fontWeight:700,cursor:'pointer',textTransform:'capitalize',background:filter===f?'#1e3a5f':'#fff',color:filter===f?'#fff':'#94a3b8',transition:'all 0.15s'}}>
              {f}
            </button>
          ))}
        </div>
      </div>
      <div style={{flex:1,overflowY:'auto',padding:12,display:'flex',flexDirection:'column',gap:10}}>
        {shown.length===0&&<div style={{textAlign:'center',padding:'30px 0',color:'#94a3b8'}}><div style={{fontSize:28,marginBottom:8}}>💬</div><p style={{fontSize:12}}>No {filter!=='all'?filter:''} comments</p></div>}
        {shown.map(a=>{
          const c=roleColorMap[a.role]||roleColorMap.owner;
          return (
            <div key={a.id} style={{borderRadius:12,padding:'10px 12px',border:`1px solid ${a.resolved?'#f1f5f9':c.bd}`,background:a.resolved?'#fafafa':c.bg,opacity:a.resolved?0.6:1,fontSize:12}}>
              <div style={{display:'flex',justifyContent:'space-between',alignItems:'flex-start',marginBottom:4}}>
                <div style={{display:'flex',alignItems:'center',gap:6}}>
                  <span style={{width:8,height:8,borderRadius:'50%',background:a.resolved?'#cbd5e1':c.dot,flexShrink:0}}/>
                  <span style={{fontWeight:700,color:'#334155'}}>{a.author}</span>
                  {a.is_cert&&<span style={{fontSize:10,color:'#7c3aed'}}>🔏 Cert</span>}
                </div>
                {!a.resolved&&roleId==='owner'&&(
                  <button onClick={()=>onResolve(a.id)} style={{background:'none',border:'none',color:'#16a34a',fontWeight:800,fontSize:13,cursor:'pointer'}}>✓</button>
                )}
              </div>
              {a.reference&&<div style={{display:'inline-flex',alignItems:'center',gap:4,background:'rgba(255,255,255,0.8)',border:'1px solid #e2e8f0',borderRadius:6,padding:'2px 8px',fontSize:11,color:'#475569',fontWeight:600,marginBottom:6}}>📍 {a.reference}</div>}
              <p style={{color:'#475569',lineHeight:1.6,marginTop:4}}>{a.body}</p>
              <p style={{color:'#94a3b8',marginTop:6,fontSize:11}}>{fmt(a.created_at)}</p>
              {a.resolved&&<p style={{color:'#16a34a',fontWeight:700,marginTop:4,fontSize:11}}>✓ Addressed</p>}
            </div>
          );
        })}
      </div>
      {canComment&&(
        <div style={{padding:12,borderTop:'1px solid #f1f5f9',background:'#fafbfc',display:'flex',flexDirection:'column',gap:8}}>
          <input type="text" placeholder={isMedia(material.type)?'Timestamp (e.g. 2:45)':'Page / Slide / Section'} value={ref_} onChange={e=>setRef_(e.target.value)}
            style={{width:'100%',border:'1px solid #e2e8f0',borderRadius:8,padding:'7px 10px',fontSize:12,outline:'none',fontFamily:'inherit'}}/>
          <textarea placeholder="Write your comment…" value={text} onChange={e=>setText(e.target.value)} rows={3}
            style={{width:'100%',border:'1px solid #e2e8f0',borderRadius:8,padding:'7px 10px',fontSize:12,resize:'none',outline:'none',fontFamily:'inherit'}}/>
          <Btn size="sm" style={{width:'100%'}} onClick={submit} disabled={!text.trim()||saving}>
            {saving?'Saving…':'Add Comment'}
          </Btn>
        </div>
      )}
    </div>
  );
}

// ══════════════════════════════════════════════════════════════
// ACTION BARS
// ══════════════════════════════════════════════════════════════
function ReviewerActions({ material, onVerdict, busy }) {
  const [sel, setSel] = useState(null);
  const [note, setNote] = useState('');
  const go = v => { if(sel===v){onVerdict(v,note);setSel(null);setNote('');}else setSel(v); };
  const BTNS = [
    {v:'approved',label:'✓ Approve',bg:'#f0fdf4',fg:'#15803d',bd:'#bbf7d0',abg:'#16a34a',afg:'#fff'},
    {v:'revise_resubmit',label:'↩ Revise & Resubmit',bg:'#fff7ed',fg:'#9a3412',bd:'#fed7aa',abg:'#ea580c',afg:'#fff'},
    {v:'not_approved',label:'✗ Not Approved',bg:'#fef2f2',fg:'#991b1b',bd:'#fecaca',abg:'#dc2626',afg:'#fff'},
    {v:'cancelled',label:'⊘ Cancel',bg:'#f9fafb',fg:'#6b7280',bd:'#e5e7eb',abg:'#6b7280',afg:'#fff'},
  ];
  return (
    <div style={{borderTop:'1px solid #e2e8f0',background:'#fff',padding:'14px 20px',flexShrink:0}}>
      <p style={{fontSize:11,fontWeight:800,color:'#94a3b8',textTransform:'uppercase',letterSpacing:'0.07em',marginBottom:10}}>Reviewer Verdict{material.cert_active?' · Certification Cycle Re-review':''}</p>
      {sel&&<div style={{marginBottom:10}}><textarea placeholder="Optional notes…" value={note} onChange={e=>setNote(e.target.value)} rows={2} style={{width:'100%',border:'1px solid #e2e8f0',borderRadius:8,padding:'8px 12px',fontSize:12,resize:'none',fontFamily:'inherit',outline:'none'}}/><p style={{fontSize:11,color:'#f59e0b',marginTop:4,fontWeight:600}}>⚠ Click again to confirm.</p></div>}
      <div style={{display:'flex',gap:8,flexWrap:'wrap'}}>
        {BTNS.map(b=>(
          <button key={b.v} onClick={()=>!busy&&go(b.v)} disabled={busy}
            style={{padding:'8px 14px',borderRadius:8,fontSize:12,fontWeight:700,cursor:busy?'not-allowed':'pointer',fontFamily:'inherit',opacity:busy?0.5:1,transition:'all 0.15s',
              background:sel===b.v?b.abg:b.bg,color:sel===b.v?b.afg:b.fg,
              border:sel===b.v?`2px solid ${b.abg}`:`1.5px solid ${b.bd}`}}>
            {b.label}
          </button>
        ))}
      </div>
    </div>
  );
}

function SignatoryActions({ onVerdict, busy }) {
  const [sel, setSel] = useState(null);
  const [note, setNote] = useState('');
  const go = v => { if(sel===v){onVerdict(v,note);setSel(null);setNote('');}else setSel(v); };
  return (
    <div style={{borderTop:'1px solid #ddd6fe',background:'#faf5ff',padding:'14px 20px',flexShrink:0}}>
      <p style={{fontSize:11,fontWeight:800,color:'#7c3aed',textTransform:'uppercase',letterSpacing:'0.07em',marginBottom:10}}>🔏 Medical Signatory — UK Certification</p>
      {sel&&<div style={{marginBottom:10}}><textarea placeholder="Notes…" value={note} onChange={e=>setNote(e.target.value)} rows={2} style={{width:'100%',border:'1px solid #ddd6fe',borderRadius:8,padding:'8px 12px',fontSize:12,resize:'none',fontFamily:'inherit',outline:'none',background:'#fff'}}/><p style={{fontSize:11,color:'#7c3aed',marginTop:4,fontWeight:600}}>Click again to confirm.</p></div>}
      <div style={{display:'flex',gap:8}}>
        {[{v:'certified',l:'📜 Certify & Approve',abg:'#0f766e'},{v:'cert_revise',l:'↩ Request Resubmission',abg:'#ea580c'}].map(b=>(
          <button key={b.v} onClick={()=>!busy&&go(b.v)} disabled={busy}
            style={{flex:1,padding:'9px 16px',borderRadius:8,fontSize:12,fontWeight:700,cursor:busy?'not-allowed':'pointer',fontFamily:'inherit',transition:'all 0.15s',
              background:sel===b.v?b.abg:b.v==='certified'?'#f0fdfa':'#fff7ed',
              color:sel===b.v?'#fff':b.v==='certified'?'#065f46':'#9a3412',
              border:sel===b.v?`2px solid ${b.abg}`:b.v==='certified'?'1.5px solid #a7f3d0':'1.5px solid #fed7aa'}}>
            {b.l}
          </button>
        ))}
      </div>
    </div>
  );
}

function OwnerResubmit({ material, onResubmit, busy }) {
  const [file, setFile] = useState(null);
  const ref_ = useRef(null);
  const cv = material.versions?.find(v=>v.version_number===material.current_version);
  return (
    <div style={{borderTop:'1px solid #fed7aa',background:'#fff7ed',padding:'14px 20px',flexShrink:0}}>
      <div style={{display:'flex',alignItems:'center',gap:16}}>
        <div style={{flex:1,minWidth:0}}>
          <p style={{fontSize:13,fontWeight:700,color:'#9a3412'}}>⚠ Revision Required{material.cert_active?' · Certification Cycle':''}</p>
          {cv?.verdict_note&&<p style={{fontSize:12,color:'#c2410c',marginTop:2}}>Note: <em>"{cv.verdict_note}"</em></p>}
          <p style={{fontSize:11,color:'#ea580c',marginTop:3}}>Review comments → make changes → upload revised file → resubmit.</p>
        </div>
        <div style={{display:'flex',alignItems:'center',gap:8,flexShrink:0}}>
          {file&&<span style={{fontSize:11,color:'#9a3412',fontWeight:600,maxWidth:100,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>{file.name}</span>}
          <button onClick={()=>ref_.current?.click()} style={{padding:'7px 12px',background:'#fff',border:'1.5px solid #fed7aa',color:'#9a3412',borderRadius:8,fontSize:12,fontWeight:700,cursor:'pointer',fontFamily:'inherit'}}>
            {file?'↺ Change':'📎 Select File'}
          </button>
          <button onClick={()=>{if(file&&!busy){onResubmit(file);setFile(null);}}} disabled={!file||busy}
            style={{padding:'7px 14px',background:file&&!busy?'#1e3a5f':'#94a3b8',color:'#fff',border:'none',borderRadius:8,fontSize:12,fontWeight:700,cursor:!file||busy?'not-allowed':'pointer',fontFamily:'inherit'}}>
            {busy?'Uploading…':'Resubmit'}
          </button>
          <input ref={ref_} type="file" style={{display:'none'}} onChange={e=>setFile(e.target.files[0])}/>
        </div>
      </div>
    </div>
  );
}

// ══════════════════════════════════════════════════════════════
// CERTIFICATE MODAL
// ══════════════════════════════════════════════════════════════
function CertModal({ material, sigUser, onClose }) {
  const [certText, setCertText] = useState('');
  const [loading, setLoading] = useState(false);
  const [ready, setReady] = useState(false);
  const DEFAULT = `This is to certify that the promotional/medical material referenced herein has been reviewed and approved by a qualified Medical Signatory in accordance with applicable UK regulatory requirements, the ABPI Code of Practice, and Essential Pharma Global's internal quality standards.\n\nThe material has been thoroughly assessed for scientific accuracy, balance, and compliance with all applicable guidelines and codes. The Medical Signatory confirms this material is appropriate for its stated purpose and intended target audience.\n\nThis certification is issued upon successful completion of the UK medical review process. The material must be used only in its approved form and within the scope defined at the time of review.`;
  const certNo = `CERT-${material.id}-${new Date().getFullYear()}-${String(Date.now()).slice(-4)}`;
  const certDate = fmtD(new Date());

  const generate = async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/anthropic',{method:'POST',headers:{'Content-Type':'application/json'},
        body:JSON.stringify({prompt:`Write a UK pharmaceutical promotional material certification statement.\n- Material: "${material.title}" (${material.id})\n- Type: ${material.type}\n- Indication: ${material.indication||'General'}\n- Audience: ${material.target_audience||'Healthcare Professionals'}\nWrite 3 formal paragraphs. Reference ABPI Code. No placeholders or signature blocks.`})});
      const d = await res.json();
      setCertText(d.text||DEFAULT);
    } catch { setCertText(DEFAULT); }
    setLoading(false); setReady(true);
  };

  const doPrint = () => {
    const w = window.open('','_blank');
    const txt = ready?certText:DEFAULT;
    w.document.write(`<!DOCTYPE html><html><head><title>Certificate — ${material.id}</title>
<style>*{box-sizing:border-box;margin:0;padding:0}body{font-family:Georgia,serif;max-width:750px;margin:0 auto;padding:55px 50px;color:#1e293b}
.wm{position:fixed;top:50%;left:50%;transform:translate(-50%,-50%) rotate(-28deg);font-size:68px;color:rgba(30,58,95,0.04);font-weight:800;pointer-events:none;white-space:nowrap}
.hdr{text-align:center;margin-bottom:38px;padding-bottom:30px;border-bottom:2.5px solid #1e3a5f}
.seal{width:86px;height:86px;border-radius:50%;border:3px double #1e3a5f;display:flex;align-items:center;justify-content:center;margin:0 auto 16px;flex-direction:column}
.sl{font-size:8.5px;font-weight:700;color:#1e3a5f;text-align:center;line-height:1.5}
h1{font-size:23px;font-weight:700;color:#1e3a5f;margin-bottom:5px}
.sub{font-size:11px;color:#94a3b8;letter-spacing:0.18em;text-transform:uppercase}
.det{background:#f8fafc;border-left:4px solid #1e3a5f;padding:18px 22px;margin:26px 0;font-size:13px;line-height:2.1}
.det strong{font-weight:600;color:#334155}.body{font-size:13px;line-height:2;color:#334155;margin:26px 0}.body p{margin-bottom:14px}
.sigs{display:flex;justify-content:space-between;margin-top:58px;padding-top:28px;border-top:1px solid #e2e8f0}
.sig{text-align:center;min-width:160px}.sig-name{font-size:13px;font-weight:700;color:#1e3a5f;margin-bottom:3px}.sig-role{font-size:10px;color:#94a3b8;text-transform:uppercase;letter-spacing:0.12em}
@media print{body{padding:30px}}</style></head><body>
<div class="wm">ESSENTIAL PHARMA GLOBAL</div>
<div class="hdr"><div class="seal"><span class="sl">ESSENTIAL<br>PHARMA<br>GLOBAL<br>✦ UK ✦</span></div>
<h1>Certificate of Medical Approval</h1><div class="sub">UK Certification · Promotional Material</div></div>
<div class="det"><strong>Certificate No:</strong> ${certNo}<br><strong>Material ID:</strong> ${material.id}<br><strong>Title:</strong> ${material.title}<br><strong>Type:</strong> ${material.type}<br><strong>Version:</strong> v${material.current_version}<br>${material.indication?`<strong>Indication:</strong> ${material.indication}<br>`:''}${material.target_audience?`<strong>Audience:</strong> ${material.target_audience}<br>`:''}<strong>Date:</strong> ${certDate}</div>
<div class="body">${txt.split('\n').map(p=>p.trim()?`<p>${p}</p>`:'').join('')}</div>
<div class="sigs"><div class="sig"><div class="sig-name">${sigUser}</div><div class="sig-role">Medical Signatory</div></div><div class="sig"><div class="sig-name">${certDate}</div><div class="sig-role">Date</div></div><div class="sig"><div class="sig-name" style="font-family:monospace;font-size:11px">${certNo}</div><div class="sig-role">Ref No.</div></div></div>
</body></html>`);
    w.document.close(); setTimeout(()=>w.print(),600);
  };

  const displayText = ready?certText:DEFAULT;
  return (
    <div style={{position:'fixed',inset:0,background:'rgba(0,0,0,0.6)',backdropFilter:'blur(4px)',display:'flex',alignItems:'center',justifyContent:'center',zIndex:9999,padding:16}}>
      <div style={{background:'#fff',borderRadius:20,boxShadow:'0 25px 80px rgba(0,0,0,0.3)',maxWidth:660,width:'100%',maxHeight:'92vh',display:'flex',flexDirection:'column'}}>
        <div style={{padding:'18px 22px',borderBottom:'1px solid #f1f5f9',display:'flex',alignItems:'center',justifyContent:'space-between'}}>
          <div><p style={{fontWeight:800,fontSize:15}}>📜 Certificate of Medical Approval</p><p style={{fontSize:11,color:'#94a3b8',marginTop:2}}>UK Certification · {material.id}</p></div>
          <button onClick={onClose} style={{background:'none',border:'none',fontSize:20,color:'#94a3b8',cursor:'pointer'}}>✕</button>
        </div>
        <div style={{flex:1,overflowY:'auto',padding:22}}>
          <div style={{border:'2px solid rgba(30,58,95,0.18)',borderRadius:18,padding:24,marginBottom:16,position:'relative',overflow:'hidden'}}>
            <div style={{position:'absolute',inset:0,display:'flex',alignItems:'center',justifyContent:'center',pointerEvents:'none',userSelect:'none'}}>
              <p style={{fontSize:52,color:'rgba(30,58,95,0.04)',fontWeight:800,transform:'rotate(-28deg)',whiteSpace:'nowrap'}}>ESSENTIAL PHARMA</p>
            </div>
            <div style={{textAlign:'center',marginBottom:18}}>
              <div style={{width:60,height:60,borderRadius:'50%',border:'3px double #1e3a5f',display:'flex',flexDirection:'column',alignItems:'center',justifyContent:'center',margin:'0 auto 12px'}}>
                <span style={{fontSize:8,fontWeight:800,color:'#1e3a5f',textAlign:'center',lineHeight:1.5}}>EP<br/>CERT<br/>✦</span>
              </div>
              <p style={{fontSize:17,fontWeight:800,color:'#1e3a5f',fontFamily:'Georgia,serif'}}>Certificate of Medical Approval</p>
              <p style={{fontSize:10,color:'#94a3b8',textTransform:'uppercase',letterSpacing:'0.14em',marginTop:3}}>UK Certification · Essential Pharma Global</p>
            </div>
            <div style={{background:'#f8fafc',borderLeft:'4px solid #1e3a5f',borderRadius:'0 8px 8px 0',padding:'12px 16px',marginBottom:16,fontSize:12,display:'grid',gridTemplateColumns:'1fr 1fr',gap:'6px 16px'}}>
              {[['Certificate No',certNo],['Material ID',material.id],['Title',material.title],['Type',material.type],['Version',`v${material.current_version}`],['Date',certDate],
                ...(material.indication?[['Indication',material.indication]]:[]),
                ...(material.target_audience?[['Audience',material.target_audience]]:[])
              ].map(([k,v])=>(
                <div key={k}><span style={{color:'#94a3b8',display:'block',fontSize:10,textTransform:'uppercase',letterSpacing:'0.05em'}}>{k}</span><span style={{fontWeight:700,color:'#1e293b',wordBreak:'break-word'}}>{v}</span></div>
              ))}
            </div>
            <div style={{marginBottom:16}}>
              <p style={{fontSize:10,color:'#94a3b8',textTransform:'uppercase',letterSpacing:'0.07em',marginBottom:8,fontWeight:700}}>Certification Statement {ready?'(editable)':''}</p>
              {!ready?(
                <div style={{border:'2px dashed rgba(30,58,95,0.2)',borderRadius:12,padding:24,textAlign:'center'}}>
                  <button onClick={generate} disabled={loading} style={{padding:'10px 20px',background:'#1e3a5f',color:'#fff',border:'none',borderRadius:10,fontSize:13,fontWeight:700,cursor:loading?'not-allowed':'pointer',fontFamily:'inherit',opacity:loading?0.7:1,marginBottom:12}}>
                    {loading?'⏳ Generating…':'✨ Generate AI Certification Text'}
                  </button>
                  <div style={{display:'flex',alignItems:'center',gap:10,margin:'0 20px 12px'}}><div style={{flex:1,height:1,background:'#e2e8f0'}}/><span style={{fontSize:11,color:'#94a3b8'}}>or</span><div style={{flex:1,height:1,background:'#e2e8f0'}}/></div>
                  <button onClick={()=>{setCertText(DEFAULT);setReady(true);}} style={{background:'none',border:'none',color:'#64748b',fontSize:12,cursor:'pointer',textDecoration:'underline',fontFamily:'inherit'}}>Use default template</button>
                </div>
              ):(
                <textarea value={certText} onChange={e=>setCertText(e.target.value)} rows={7}
                  style={{width:'100%',border:'1px solid #e2e8f0',borderRadius:10,padding:'12px 14px',fontSize:12,lineHeight:1.8,resize:'none',fontFamily:'inherit',outline:'none'}}/>
              )}
            </div>
            {ready&&(
              <div style={{display:'flex',justifyContent:'space-between',alignItems:'flex-end',paddingTop:16,borderTop:'1px solid #f1f5f9',fontSize:12}}>
                <div style={{borderTop:'1.5px solid #334155',paddingTop:8,minWidth:160}}><p style={{fontWeight:700,color:'#1e293b'}}>{sigUser}</p><p style={{color:'#94a3b8',fontSize:10,textTransform:'uppercase',letterSpacing:'0.1em'}}>Medical Signatory</p></div>
                <div style={{borderTop:'1.5px solid #334155',paddingTop:8,minWidth:120,textAlign:'center'}}><p style={{fontWeight:700}}>{certDate}</p><p style={{color:'#94a3b8',fontSize:10,textTransform:'uppercase',letterSpacing:'0.1em'}}>Date</p></div>
                <div style={{borderTop:'1.5px solid #334155',paddingTop:8,minWidth:140,textAlign:'right'}}><p style={{fontWeight:700,fontFamily:'monospace',fontSize:11}}>{certNo}</p><p style={{color:'#94a3b8',fontSize:10,textTransform:'uppercase',letterSpacing:'0.1em'}}>Ref No.</p></div>
              </div>
            )}
          </div>
        </div>
        <div style={{padding:'14px 22px',borderTop:'1px solid #f1f5f9',display:'flex',gap:10}}>
          {ready&&<Btn style={{flex:1}} onClick={doPrint}>🖨 Print / Download Certificate</Btn>}
          <Btn variant="outline" onClick={onClose}>Close</Btn>
        </div>
      </div>
    </div>
  );
}

// ══════════════════════════════════════════════════════════════
// SUBMIT FORM
// ══════════════════════════════════════════════════════════════
function SubmitForm({ ownerName, onSubmit, onCancel, busy }) {
  const [form, setForm] = useState({ title:'', type:'', indication:'', targetAudience:'', description:'', ukCert:false, file:null, fileName:'' });
  const fileRef = useRef(null);
  const setF = (k,v) => setForm(p=>({...p,[k]:v}));
  const onFile = e => {
    const f = e.target.files[0]; if(!f) return;
    const ext = f.name.split('.').pop().toLowerCase();
    const M = {pdf:'PDF Document',doc:'Word Document (.docx)',docx:'Word Document (.docx)',ppt:'PowerPoint Presentation (.pptx)',pptx:'PowerPoint Presentation (.pptx)',xls:'Excel Spreadsheet (.xlsx)',xlsx:'Excel Spreadsheet (.xlsx)',mp3:'Audio File',wav:'Audio File',m4a:'Audio File',mp4:'Video File',mov:'Video File',webm:'Video File'};
    setForm(p=>({...p,file:f,fileName:f.name,type:p.type||M[ext]||'Other'}));
  };
  const valid = form.title.trim()&&form.type&&form.file&&!busy;
  const inp = {width:'100%',border:'1.5px solid #e2e8f0',borderRadius:10,padding:'9px 14px',fontSize:13,fontFamily:'inherit',outline:'none'};
  return (
    <div style={{flex:1,overflowY:'auto',background:'#f8fafc'}}>
      <div style={{maxWidth:680,margin:'0 auto',padding:'32px 24px'}}>
        <div style={{display:'flex',alignItems:'center',gap:12,marginBottom:28}}>
          <button onClick={onCancel} style={{background:'#f1f5f9',border:'none',borderRadius:8,padding:'7px 12px',fontSize:13,cursor:'pointer',fontFamily:'inherit',color:'#64748b',fontWeight:600}}>← Back</button>
          <div><h1 style={{fontSize:22,fontWeight:800,color:'#0f172a',letterSpacing:'-0.03em'}}>Submit New Material</h1>
          <p style={{fontSize:13,color:'#64748b',marginTop:3}}>Fill in the details and upload your file for review.</p></div>
        </div>
        <div style={{background:'#fff',borderRadius:18,border:'1px solid #e2e8f0',padding:28,boxShadow:'0 2px 16px rgba(0,0,0,0.04)',display:'flex',flexDirection:'column',gap:22}}>
          <Field label="Material Title" required><input type="text" value={form.title} onChange={e=>setF('title',e.target.value)} placeholder="e.g. Product A HCP Detail Aid — Q2 2025" style={inp}/></Field>
          <Field label="Material Type" required>
            <select value={form.type} onChange={e=>setF('type',e.target.value)} style={{...inp,background:'#fff',cursor:'pointer'}}>
              <option value="">Select material type…</option>
              {MATERIAL_TYPES.map(t=><option key={t} value={t}>{t}</option>)}
            </select>
          </Field>
          <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:18}}>
            <Field label="Indication / Therapeutic Area"><input type="text" value={form.indication} onChange={e=>setF('indication',e.target.value)} placeholder="e.g. Oncology" style={inp}/></Field>
            <Field label="Target Audience"><input type="text" value={form.targetAudience} onChange={e=>setF('targetAudience',e.target.value)} placeholder="e.g. HCPs" style={inp}/></Field>
          </div>
          <Field label="Description / Objective"><textarea value={form.description} onChange={e=>setF('description',e.target.value)} placeholder="Purpose and content…" rows={3} style={{...inp,resize:'none'}}/></Field>
          <Field label="Upload Material" required>
            <div onClick={()=>fileRef.current?.click()} style={{border:'2px dashed #e2e8f0',borderRadius:16,padding:'28px 24px',textAlign:'center',cursor:'pointer',background:form.file?'#f0fdf4':'#fafbfc'}}>
              <div style={{fontSize:44,marginBottom:10}}>{form.file?fileIcon(form.type):'📎'}</div>
              <p style={{fontWeight:700,color:form.file?'#15803d':'#475569'}}>{form.file?form.fileName:'Click to upload'}</p>
              <p style={{fontSize:12,color:'#94a3b8',marginTop:4}}>PDF · DOCX · PPTX · XLSX · MP3 · MP4…</p>
              <input ref={fileRef} type="file" style={{display:'none'}} onChange={onFile} accept=".pdf,.doc,.docx,.ppt,.pptx,.xls,.xlsx,.mp3,.wav,.m4a,.mp4,.mov,.webm"/>
            </div>
          </Field>
          <div style={{display:'flex',alignItems:'flex-start',gap:14,padding:16,background:'#faf5ff',border:'1.5px solid #e9d5ff',borderRadius:14}}>
            <input type="checkbox" id="ukCert" checked={form.ukCert} onChange={e=>setF('ukCert',e.target.checked)} style={{marginTop:2,width:16,height:16,accentColor:'#7c3aed',cursor:'pointer'}}/>
            <label htmlFor="ukCert" style={{cursor:'pointer',flex:1}}>
              <p style={{fontSize:14,fontWeight:800,color:'#5b21b6'}}>🇬🇧 UK Certification Required</p>
              <p style={{fontSize:12,color:'#7c3aed',marginTop:4,lineHeight:1.6}}>After reviewer approval, a Medical Signatory must certify. The owner initiates the cycle.</p>
            </label>
          </div>
          <div style={{display:'flex',gap:12,paddingTop:6}}>
            <Btn size="lg" style={{flex:1}} onClick={()=>onSubmit(form)} disabled={!valid}>{busy?'Uploading & Submitting…':'Submit for Review →'}</Btn>
            <Btn variant="ghost" size="lg" onClick={onCancel}>Cancel</Btn>
          </div>
        </div>
      </div>
    </div>
  );
}

// ══════════════════════════════════════════════════════════════
// DASHBOARD
// ══════════════════════════════════════════════════════════════
function Dashboard({ materials, roleId, curUser, onSelect, onSubmit, loading }) {
  const [search, setSearch] = useState('');
  const [fStatus, setFStatus] = useState('all');
  const filt = materials.filter(m=>{
    const ms = !search||m.title.toLowerCase().includes(search.toLowerCase())||m.id.includes(search.toUpperCase());
    const ss = fStatus==='all'||m.status===fStatus;
    return ms&&ss;
  });
  const counts = {}; materials.forEach(m=>{counts[m.status]=(counts[m.status]||0)+1;});
  const actionCount = materials.filter(m=>(roleId==='reviewer'&&m.status===ST.REVIEW)||(roleId==='signatory'&&m.status===ST.CERT)||(roleId==='owner'&&[ST.REVISE,ST.APPROVED].includes(m.status)&&m.owner_name===curUser)).length;
  const statCards = [{s:ST.REVIEW,l:'Under Review',i:'📋'},{s:ST.REVISE,l:'Needs Revision',i:'✏️'},{s:ST.APPROVED,l:'Approved',i:'✅'},{s:ST.CERT,l:'Under Certification',i:'🔏'},{s:ST.CERTIFIED,l:'Certified',i:'📜'}];

  if (loading) return (
    <div style={{flex:1,display:'flex',alignItems:'center',justifyContent:'center'}}>
      <div style={{textAlign:'center',color:'#94a3b8'}}><Spinner/><p style={{marginTop:12,fontSize:14}}>Loading materials…</p></div>
    </div>
  );

  return (
    <div style={{flex:1,overflowY:'auto',background:'#f8fafc'}}>
      <div style={{maxWidth:900,margin:'0 auto',padding:'28px 24px'}}>
        <div style={{display:'flex',alignItems:'flex-start',justifyContent:'space-between',marginBottom:24}}>
          <div>
            <h1 style={{fontSize:22,fontWeight:800,color:'#0f172a',letterSpacing:'-0.03em'}}>Materials Dashboard</h1>
            <p style={{fontSize:13,color:'#64748b',marginTop:4,display:'flex',alignItems:'center',gap:8}}>
              {materials.length} material{materials.length!==1?'s':''} total
              {actionCount>0&&<span style={{background:'#fef3c7',color:'#92400e',fontSize:11,fontWeight:700,padding:'2px 9px',borderRadius:20,border:'1px solid #fde68a'}}>{actionCount} need{actionCount===1?'s':''} attention</span>}
            </p>
          </div>
          {roleId==='owner'&&<Btn size="lg" onClick={onSubmit}>+ Submit Material</Btn>}
        </div>
        {materials.length>0&&(
          <div style={{display:'grid',gridTemplateColumns:'repeat(5,1fr)',gap:10,marginBottom:20}}>
            {statCards.map(({s,l,i})=>{
              const active=fStatus===s;
              return <button key={s} onClick={()=>setFStatus(active?'all':s)}
                style={{padding:'12px 14px',borderRadius:14,border:active?'2px solid #1e3a5f':'1.5px solid #e2e8f0',background:active?'#1e3a5f':'#fff',textAlign:'left',cursor:'pointer',fontFamily:'inherit'}}>
                <p style={{fontSize:22,fontWeight:900,color:active?'#fff':'#0f172a',lineHeight:1,marginBottom:4}}>{counts[s]||0}</p>
                <p style={{fontSize:10,fontWeight:700,color:active?'#93c5fd':'#64748b',lineHeight:1.4}}>{i} {l}</p>
              </button>;
            })}
          </div>
        )}
        {materials.length>0&&(
          <div style={{display:'flex',gap:10,marginBottom:16}}>
            <input type="text" placeholder="Search by title or ID…" value={search} onChange={e=>setSearch(e.target.value)}
              style={{flex:1,border:'1.5px solid #e2e8f0',borderRadius:10,padding:'9px 14px',fontSize:13,fontFamily:'inherit',outline:'none',background:'#fff'}}/>
            {fStatus!=='all'&&<button onClick={()=>setFStatus('all')} style={{padding:'9px 14px',background:'#f1f5f9',border:'1px solid #e2e8f0',borderRadius:10,fontSize:12,cursor:'pointer',fontFamily:'inherit',color:'#64748b',fontWeight:600}}>Clear</button>}
          </div>
        )}
        {materials.length===0?(
          <div style={{textAlign:'center',paddingTop:80}}>
            <div style={{fontSize:64,marginBottom:16}}>📋</div>
            <p style={{fontSize:18,fontWeight:800,color:'#334155',marginBottom:8}}>No materials yet</p>
            {roleId==='owner'?<><p style={{fontSize:14,color:'#64748b',marginBottom:24}}>Submit your first material to start the review process.</p><Btn size="lg" onClick={onSubmit}>Submit Your First Material →</Btn></>:<p style={{fontSize:14,color:'#64748b'}}>No materials submitted yet.</p>}
          </div>
        ):filt.length===0?(
          <div style={{textAlign:'center',padding:'48px 0',color:'#94a3b8'}}><p style={{fontSize:16,fontWeight:600}}>No results</p></div>
        ):(
          <div style={{display:'flex',flexDirection:'column',gap:10}}>
            {filt.map(m=>{
              const needsAction=(roleId==='reviewer'&&m.status===ST.REVIEW)||(roleId==='signatory'&&m.status===ST.CERT)||(roleId==='owner'&&m.owner_name===curUser&&[ST.REVISE,ST.APPROVED].includes(m.status));
              return (
                <div key={m.id} onClick={()=>onSelect(m.id)}
                  style={{background:'#fff',borderRadius:16,border:needsAction?'1.5px solid #fde68a':'1.5px solid #e2e8f0',padding:'14px 18px',display:'flex',alignItems:'center',gap:16,cursor:'pointer',transition:'all 0.15s'}}>
                  <div style={{fontSize:32,flexShrink:0}}>{fileIcon(m.type)}</div>
                  <div style={{flex:1,minWidth:0}}>
                    <div style={{display:'flex',alignItems:'center',gap:8,flexWrap:'wrap',marginBottom:5}}>
                      <span style={{fontFamily:'monospace',fontSize:11,fontWeight:700,color:'#94a3b8'}}>{m.id}</span>
                      <StatusBadge status={m.status}/>
                      {m.uk_cert&&<span style={{background:'#faf5ff',color:'#7c3aed',border:'1px solid #ddd6fe',padding:'2px 8px',borderRadius:20,fontSize:11,fontWeight:600}}>🇬🇧</span>}
                      {needsAction&&<span style={{background:'#fffbeb',color:'#92400e',border:'1px solid #fde68a',padding:'2px 8px',borderRadius:20,fontSize:11,fontWeight:600}}>⚡ Action needed</span>}
                    </div>
                    <p style={{fontWeight:800,color:'#0f172a',overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap',fontSize:14}}>{m.title}</p>
                    <p style={{fontSize:12,color:'#94a3b8',marginTop:3}}>{m.type} · v{m.current_version} · {m.owner_name}</p>
                  </div>
                  <div style={{textAlign:'right',fontSize:12,color:'#94a3b8',flexShrink:0}}>
                    <p style={{fontWeight:600}}>{fmt(m.updated_at)}</p>
                    <p style={{marginTop:4}}>{m.annotation_count||0} comment{m.annotation_count!==1?'s':''}</p>
                  </div>
                  <span style={{fontSize:18,color:'#d1d5db'}}>›</span>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

// ══════════════════════════════════════════════════════════════
// MATERIAL DETAIL
// ══════════════════════════════════════════════════════════════
function MaterialDetail({ mat, roleId, user, onBack, onVerdict, onAddAnn, onResolveAnn, onResubmit, onInitiateCert, onShowCert, busy }) {
  const curV = mat.versions?.find(v=>v.version_number===mat.current_version);
  const canAnnotate = (roleId==='reviewer'&&mat.status===ST.REVIEW)||(roleId==='signatory'&&mat.status===ST.CERT);
  const [prefillRef, setPrefillRef] = useState('');
  const handleAnnotate = (ann) => onAddAnn({ ...ann, role: roleId, author: user, version_num: mat.current_version });
  return (
    <div style={{display:'flex',flexDirection:'column',height:'calc(100vh - 108px)'}}>
      {/* Sub-header */}
      <div style={{background:'#fff',borderBottom:'1px solid #e2e8f0',padding:'10px 20px',display:'flex',alignItems:'center',gap:12,flexShrink:0}}>
        <button onClick={onBack} style={{background:'#f1f5f9',border:'none',borderRadius:8,padding:'5px 10px',fontSize:12,cursor:'pointer',fontFamily:'inherit',color:'#64748b',fontWeight:700}}>← Back</button>
        <div style={{width:1,height:18,background:'#e2e8f0'}}/>
        <span style={{fontFamily:'monospace',fontSize:11,fontWeight:700,color:'#94a3b8',background:'#f8fafc',padding:'3px 8px',borderRadius:6}}>{mat.id}</span>
        <span style={{fontWeight:800,color:'#0f172a',fontSize:14,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap',maxWidth:280}}>{mat.title}</span>
        <StatusBadge status={mat.status}/>
        {mat.uk_cert&&<span style={{background:'#faf5ff',color:'#7c3aed',border:'1px solid #ddd6fe',padding:'2px 8px',borderRadius:20,fontSize:11,fontWeight:700}}>🇬🇧 UK Cert</span>}
        <div style={{marginLeft:'auto',display:'flex',alignItems:'center',gap:10}}>
          <span style={{fontFamily:'monospace',fontSize:11,fontWeight:700,color:'#94a3b8',background:'#f8fafc',padding:'3px 9px',borderRadius:20,border:'1px solid #e2e8f0'}}>v{mat.current_version}</span>
          {busy&&<Spinner/>}
          {mat.status===ST.CERTIFIED&&<Btn variant="teal" size="sm" onClick={onShowCert}>📜 View Certificate</Btn>}
        </div>
      </div>

      <div style={{flex:1,display:'flex',overflow:'hidden'}}>
        {/* Left sidebar */}
        <div style={{width:220,flexShrink:0,borderRight:'1px solid #e2e8f0',background:'#fff',overflowY:'auto'}}>
          <div style={{padding:16,display:'flex',flexDirection:'column',gap:22}}>
            <section>
              <p style={{fontSize:10,fontWeight:800,color:'#94a3b8',textTransform:'uppercase',letterSpacing:'0.08em',marginBottom:10}}>Details</p>
              <div style={{display:'flex',flexDirection:'column',gap:8,fontSize:12}}>
                {[['Owner',mat.owner_name],['Type',mat.type],mat.indication&&['Indication',mat.indication],mat.target_audience&&['Audience',mat.target_audience],mat.description&&['Description',mat.description]].filter(Boolean).map(([k,v])=>(
                  <div key={k}><span style={{color:'#94a3b8',display:'block',fontSize:10,textTransform:'uppercase',letterSpacing:'0.05em',marginBottom:2}}>{k}</span>
                  <span style={{fontWeight:600,color:'#334155',lineHeight:1.4}}>{v}</span></div>
                ))}
              </div>
            </section>
            <section>
              <p style={{fontSize:10,fontWeight:800,color:'#94a3b8',textTransform:'uppercase',letterSpacing:'0.08em',marginBottom:10}}>Versions ({mat.versions?.length||0})</p>
              <div style={{display:'flex',flexDirection:'column',gap:8}}>
                {[...(mat.versions||[])].reverse().map(v=>{
                  const isCur=v.version_number===mat.current_version;
                  return <div key={v.version_number} style={{borderRadius:10,padding:'10px 12px',border:isCur?'1.5px solid #1e3a5f':'1px solid #f1f5f9',background:isCur?'#f0f4ff':'#fafbfc',fontSize:11}}>
                    <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',marginBottom:4}}>
                      <span style={{fontWeight:900,color:'#0f172a',fontFamily:'monospace'}}>v{v.version_number}</span>
                      {v.verdict&&<span style={{fontSize:10,fontWeight:700,padding:'1px 7px',borderRadius:20,background:['approved','certified'].includes(v.verdict)?'#f0fdf4':['revise_resubmit','cert_revise'].includes(v.verdict)?'#fff7ed':'#fef2f2',color:['approved','certified'].includes(v.verdict)?'#15803d':['revise_resubmit','cert_revise'].includes(v.verdict)?'#9a3412':'#991b1b'}}>
                        {v.verdict==='revise_resubmit'?'revise':v.verdict==='cert_revise'?'cert-rev':v.verdict}
                      </span>}
                    </div>
                    <p style={{color:'#64748b',overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>{v.file_name}</p>
                    <p style={{color:'#94a3b8',marginTop:3}}>{fmt(v.submitted_at)}</p>
                    {v.verdict_note&&<p style={{color:'#64748b',fontStyle:'italic',marginTop:5,paddingTop:5,borderTop:'1px solid #f1f5f9'}}>"{v.verdict_note}"</p>}
                  </div>;
                })}
              </div>
            </section>
            <section>
              <p style={{fontSize:10,fontWeight:800,color:'#94a3b8',textTransform:'uppercase',letterSpacing:'0.08em',marginBottom:10}}>Audit Trail</p>
              <div style={{display:'flex',flexDirection:'column',gap:10}}>
                {[...(mat.history||[])].reverse().map((h,i)=>(
                  <div key={i} style={{paddingLeft:10,borderLeft:'2.5px solid #e2e8f0',fontSize:11}}>
                    <p style={{fontWeight:700,color:'#334155',lineHeight:1.4}}>{h.action}</p>
                    <p style={{color:'#94a3b8',marginTop:2}}>{h.by_user}</p>
                    <p style={{color:'#94a3b8'}}>{fmt(h.created_at)}</p>
                    {h.note&&<p style={{color:'#64748b',fontStyle:'italic',marginTop:3}}>"{h.note}"</p>}
                  </div>
                ))}
              </div>
            </section>
          </div>
        </div>

        {/* Viewer + annotations */}
        <div style={{flex:1,display:'flex',flexDirection:'column',overflow:'hidden'}}>
          <div style={{flex:1,display:'flex',overflow:'hidden'}}>
            <DocumentViewer
              fileUrl={curV?.file_url} filePath={curV?.file_path} fileName={curV?.file_name} type={mat.type}
              canAnnotate={canAnnotate} annotations={curV?.annotations}
              onAnnotate={handleAnnotate} onTextSelect={setPrefillRef}
            />
            <AnnotationPanel material={mat} currentVersion={curV} roleId={roleId} user={user} onAdd={onAddAnn} onResolve={onResolveAnn} prefillRef={prefillRef} onPrefillUsed={()=>setPrefillRef('')}/>
          </div>

          {/* Action bars */}
          {roleId==='reviewer'&&mat.status===ST.REVIEW&&<ReviewerActions material={mat} onVerdict={onVerdict} busy={busy}/>}
          {roleId==='signatory'&&mat.status===ST.CERT&&<SignatoryActions onVerdict={onVerdict} busy={busy}/>}
          {roleId==='owner'&&mat.status===ST.REVISE&&mat.owner_name===user&&<OwnerResubmit material={mat} onResubmit={onResubmit} busy={busy}/>}
          {roleId==='owner'&&mat.status===ST.APPROVED&&mat.uk_cert&&mat.owner_name===user&&(
            <div style={{borderTop:'1px solid #ddd6fe',background:'#faf5ff',padding:'14px 20px',flexShrink:0,display:'flex',alignItems:'center',justifyContent:'space-between'}}>
              <div><p style={{fontWeight:700,fontSize:13,color:'#5b21b6'}}>✓ Approved — UK Certification Required</p>
              <p style={{fontSize:12,color:'#7c3aed',marginTop:3}}>Initiate the certification cycle for Medical Signatory review.</p></div>
              <Btn variant="violet" size="md" onClick={onInitiateCert} disabled={busy}>Initiate Certification →</Btn>
            </div>
          )}
          {roleId==='owner'&&mat.status===ST.APPROVED&&!mat.uk_cert&&mat.owner_name===user&&(
            <div style={{borderTop:'1px solid #bbf7d0',background:'#f0fdf4',padding:'14px 20px',flexShrink:0}}>
              <p style={{fontWeight:700,fontSize:13,color:'#15803d'}}>✓ Material Approved and Ready for Distribution</p>
            </div>
          )}
          {mat.status===ST.CERTIFIED&&<div style={{borderTop:'1px solid #a7f3d0',background:'#ecfdf5',padding:'14px 20px',flexShrink:0}}>
            <p style={{fontWeight:700,fontSize:13,color:'#065f46'}}>📜 Material Certified — View the certificate above</p>
          </div>}
          {mat.status===ST.REJECTED&&<div style={{borderTop:'1px solid #fecaca',background:'#fef2f2',padding:'14px 20px',flexShrink:0}}>
            <p style={{fontWeight:700,fontSize:13,color:'#991b1b'}}>✗ Material Not Approved</p>
          </div>}
        </div>
      </div>
    </div>
  );
}

// ══════════════════════════════════════════════════════════════
// APP ROOT
// ══════════════════════════════════════════════════════════════
export default function Platform() {
  const [roleIdx, setRoleIdx] = useState(0);
  const [view, setView]       = useState('dashboard');
  const [materials, setMats]  = useState([]);
  const [sel, setSel]         = useState(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy]       = useState(false);
  const [showCert, setShowCert] = useState(false);
  const [error, setError]     = useState(null);

  const role = ROLES[roleIdx];

  // ── Load materials ───────────────────────────────────────────
  const loadMaterials = useCallback(async () => {
    try {
      const data = await apiFetch('/api/materials');
      setMats(data);
    } catch (e) { setError(e.message); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { loadMaterials(); }, [loadMaterials]);

  // ── Load selected material (full detail) ─────────────────────
  const loadDetail = useCallback(async (id) => {
    setBusy(true);
    try {
      const data = await apiFetch(`/api/materials/${id}`);
      setSel(data);
    } catch (e) { setError(e.message); }
    finally { setBusy(false); }
  }, []);

  const selectMaterial = async (id) => {
    setView('detail');
    await loadDetail(id);
  };

  // ── Submit new material ──────────────────────────────────────
  const handleSubmit = async (form) => {
    setBusy(true);
    try {
      // 1. Upload file (use 'new' as temp ID, will update after material created)
      const upload = await uploadFile(form.file, 'new', 1);

      // 2. Create material record
      const { id } = await apiFetch('/api/materials', {
        method:'POST',
        body: JSON.stringify({
          title:form.title, type:form.type, indication:form.indication,
          target_audience:form.targetAudience, description:form.description,
          uk_cert:form.ukCert, owner_name:role.user,
          file_name:upload.fileName, file_path:upload.path, file_url:upload.url,
        }),
      });

      await loadMaterials();
      setView('dashboard');
    } catch (e) { setError(e.message); }
    finally { setBusy(false); }
  };

  // ── Resubmit ─────────────────────────────────────────────────
  const handleResubmit = async (file) => {
    if (!sel) return;
    setBusy(true);
    try {
      const newV = sel.current_version + 1;
      const upload = await uploadFile(file, sel.id, newV);
      await apiFetch(`/api/materials/${sel.id}/versions`, {
        method:'POST',
        body: JSON.stringify({ file_name:upload.fileName, file_path:upload.path, file_url:upload.url, submitted_by:role.user, by_role:role.id }),
      });
      await loadDetail(sel.id);
      await loadMaterials();
    } catch (e) { setError(e.message); }
    finally { setBusy(false); }
  };

  // ── Add annotation ───────────────────────────────────────────
  const handleAddAnn = async (ann) => {
    if (!sel) return;
    try {
      await apiFetch(`/api/materials/${sel.id}/annotations`, {
        method:'POST', body: JSON.stringify(ann),
      });
      await loadDetail(sel.id);
    } catch (e) { setError(e.message); }
  };

  // ── Resolve annotation ───────────────────────────────────────
  const handleResolveAnn = async (annId) => {
    if (!sel) return;
    try {
      await apiFetch(`/api/materials/${sel.id}/annotations`, {
        method:'PATCH', body: JSON.stringify({ annotation_id: annId }),
      });
      await loadDetail(sel.id);
    } catch (e) { setError(e.message); }
  };

  // ── Verdict ──────────────────────────────────────────────────
  const handleVerdict = async (verdict, note) => {
    if (!sel||busy) return;
    setBusy(true);
    try {
      let status, historyAction;
      switch(verdict) {
        case 'approved':
          status = sel.cert_active ? ST.CERT : ST.APPROVED;
          historyAction = sel.cert_active ? 'Approved by Reviewer → returned to Medical Signatory' : 'Approved by Reviewer';
          break;
        case 'revise_resubmit': status=ST.REVISE; historyAction='Returned for Revision by Reviewer'; break;
        case 'not_approved':    status=ST.REJECTED; historyAction='Not Approved by Reviewer'; break;
        case 'cancelled':       status=ST.CANCELLED; historyAction='Material Cancelled'; break;
        case 'certified':       status=ST.CERTIFIED; historyAction='Certified by Medical Signatory'; break;
        case 'cert_revise':     status=ST.REVISE; historyAction='Medical Signatory requested resubmission'; break;
        default: status=sel.status; historyAction=verdict;
      }

      await apiFetch(`/api/materials/${sel.id}`, {
        method:'PATCH',
        body: JSON.stringify({
          status, verdict, verdict_note:note, version_number:sel.current_version,
          by_user:role.user, by_role:role.id,
          history_action:historyAction, history_note:note,
        }),
      });
      await loadDetail(sel.id);
      await loadMaterials();
    } catch (e) { setError(e.message); }
    finally { setBusy(false); }
  };

  // ── Initiate certification ────────────────────────────────────
  const handleInitiateCert = async () => {
    if (!sel||busy) return;
    setBusy(true);
    try {
      await apiFetch(`/api/materials/${sel.id}`, {
        method:'PATCH',
        body: JSON.stringify({ status:ST.CERT, cert_active:true, by_user:role.user, by_role:role.id, history_action:'UK Certification cycle initiated' }),
      });
      await loadDetail(sel.id);
      await loadMaterials();
    } catch (e) { setError(e.message); }
    finally { setBusy(false); }
  };

  // ── Render ───────────────────────────────────────────────────
  return (
    <div style={{height:'100vh',display:'flex',flexDirection:'column',fontFamily:"'DM Sans',system-ui,sans-serif"}}>
      <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>

      {error&&(
        <div style={{background:'#fef2f2',borderBottom:'1px solid #fecaca',padding:'10px 20px',display:'flex',alignItems:'center',justifyContent:'space-between',fontSize:13,color:'#991b1b'}}>
          ⚠ {error}
          <button onClick={()=>setError(null)} style={{background:'none',border:'none',cursor:'pointer',color:'#991b1b',fontWeight:700}}>✕</button>
        </div>
      )}

      {/* HEADER */}
      <header style={{background:'#fff',borderBottom:'1px solid #e2e8f0',padding:'0 20px',display:'flex',alignItems:'center',justifyContent:'space-between',height:56,flexShrink:0,boxShadow:'0 1px 3px rgba(0,0,0,0.05)'}}>
        <div style={{display:'flex',alignItems:'center',gap:12}}>
          <div style={{width:38,height:38,borderRadius:10,background:'linear-gradient(135deg,#1e3a5f,#2d5a8e)',display:'flex',alignItems:'center',justifyContent:'center',boxShadow:'0 2px 8px rgba(30,58,95,0.3)'}}>
            <span style={{color:'#fff',fontWeight:900,fontSize:11}}>EP</span>
          </div>
          <div>
            <p style={{fontWeight:800,fontSize:14,color:'#0f172a',letterSpacing:'-0.02em',lineHeight:1.2}}>Essential Pharma Global</p>
            <p style={{fontSize:11,color:'#94a3b8',lineHeight:1}}>Material Review & Approval Platform</p>
          </div>
        </div>
        <div style={{display:'flex',alignItems:'center',gap:16}}>
          <div style={{display:'flex',background:'#f1f5f9',borderRadius:12,padding:3,gap:2}}>
            {ROLES.map((r,i)=>(
              <button key={r.id} onClick={()=>{setRoleIdx(i);setView('dashboard');}}
                style={{padding:'6px 12px',borderRadius:9,border:'none',fontSize:12,fontWeight:700,cursor:'pointer',fontFamily:'inherit',background:roleIdx===i?'#fff':'transparent',color:roleIdx===i?'#1e3a5f':'#94a3b8',boxShadow:roleIdx===i?'0 1px 4px rgba(0,0,0,0.1)':'none',transition:'all 0.15s'}}>
                {r.label}
              </button>
            ))}
          </div>
          <div style={{display:'flex',alignItems:'center',gap:9,paddingLeft:16,borderLeft:'1px solid #f1f5f9'}}>
            <div style={{width:30,height:30,borderRadius:'50%',background:`linear-gradient(135deg,${role.color},${role.color}cc)`,display:'flex',alignItems:'center',justifyContent:'center',fontSize:11,fontWeight:800,color:'#fff'}}>
              {role.init}
            </div>
            <div>
              <p style={{fontSize:12,fontWeight:700,color:'#334155',lineHeight:1.2}}>{role.user}</p>
              <p style={{fontSize:10,color:'#94a3b8',lineHeight:1}}>{role.label}</p>
            </div>
          </div>
        </div>
      </header>

      {/* NAV */}
      <nav style={{background:'#fff',borderBottom:'1px solid #f1f5f9',padding:'0 20px',display:'flex',flexShrink:0}}>
        {[{id:'dashboard',label:'📋 Dashboard'},...(role.id==='owner'?[{id:'submit',label:'+ Submit Material'}]:[])].map(tab=>(
          <button key={tab.id} onClick={()=>setView(tab.id)}
            style={{padding:'10px 16px',border:'none',borderBottom:`2.5px solid ${view===tab.id?'#1e3a5f':'transparent'}`,background:'transparent',fontSize:13,fontWeight:700,cursor:'pointer',fontFamily:'inherit',color:view===tab.id?'#1e3a5f':'#94a3b8',transition:'all 0.15s'}}>
            {tab.label}
          </button>
        ))}
      </nav>

      {/* CONTENT */}
      <main style={{flex:1,overflow:'hidden',display:'flex',flexDirection:'column'}}>
        {view==='dashboard'&&<Dashboard materials={materials} roleId={role.id} curUser={role.user} onSelect={selectMaterial} onSubmit={()=>setView('submit')} loading={loading}/>}
        {view==='submit'&&role.id==='owner'&&<SubmitForm ownerName={role.user} onSubmit={handleSubmit} onCancel={()=>setView('dashboard')} busy={busy}/>}
        {view==='detail'&&sel&&<MaterialDetail mat={sel} roleId={role.id} user={role.user} onBack={()=>setView('dashboard')} onVerdict={handleVerdict} onAddAnn={handleAddAnn} onResolveAnn={handleResolveAnn} onResubmit={handleResubmit} onInitiateCert={handleInitiateCert} onShowCert={()=>setShowCert(true)} busy={busy}/>}
        {view==='detail'&&!sel&&loading&&<div style={{flex:1,display:'flex',alignItems:'center',justifyContent:'center'}}><Spinner/></div>}
      </main>

      {showCert&&sel&&<CertModal material={sel} sigUser={ROLES.find(r=>r.id==='signatory').user} onClose={()=>setShowCert(false)}/>}
    </div>
  );
}
