import React, {useEffect, useState} from 'react';
import {Copy, X} from 'lucide-react';

export default function DiagnosticsButton({getReport, className = 'secondary'}) {
  const [manual, setManual] = useState(''), [copied, setCopied] = useState(false);
  useEffect(() => {if (copied) {const timer = setTimeout(() => setCopied(false), 4000); return () => clearTimeout(timer);}}, [copied]);
  async function copy() {
    const report = JSON.stringify(getReport(), null, 2);
    try {
      if (!navigator.clipboard?.writeText) throw Error('Clipboard unavailable');
      await navigator.clipboard.writeText(report);
      setCopied(true);
    } catch {setManual(report);}
  }
  return <><button type='button' className={className + ' diagnostics-button'} onClick={copy} aria-label='Copy diagnostics'><Copy size={16}/><span aria-live='polite'>{copied ? 'Copied' : 'Copy diagnostics'}</span></button>{manual && <div className='modal-shade'><section className='modal' role='dialog' aria-modal='true' aria-label='Copy diagnostic data'><div className='section-title'><h2>Copy diagnostic data</h2><button type='button' className='icon-button' aria-label='Close diagnostics' onClick={() => setManual('')}><X size={20}/></button></div><p>Automatic copy is unavailable here. Select the report below, then choose Copy.</p><textarea aria-label='Diagnostic report' readOnly rows={14} value={manual} onFocus={e => e.currentTarget.select()}/><p className='micro'>API keys, login tokens and bank records are excluded.</p></section></div>}</>;
}
