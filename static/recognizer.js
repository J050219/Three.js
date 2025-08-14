function ensureToast() {
  let el = document.getElementById('toast');
  if (!el) {
    el = document.createElement('div');
    el.id = 'toast';
    Object.assign(el.style, {
      position: 'fixed',
      left: '12px',
      bottom: '12px',
      padding: '8px 12px',
      background: 'rgba(0,0,0,0.75)',
      color: '#fff',
      borderRadius: '8px',
      zIndex: 9999,
      fontFamily: 'system-ui, sans-serif',
      maxWidth: '60vw',
      display: 'none'
    });
    document.body.appendChild(el);
  }
  return el;
}
function showToast(msg) {
  const el = ensureToast();
  el.textContent = msg;
  el.style.display = 'block';
}
function hideToast() {
  const el = document.getElementById('toast');
  if (el) el.style.display = 'none';
}

function normalizeColor(input) {
  const map = {
    '紅': '#ff0000', '紅色': '#ff0000',
    '藍': '#0000ff', '藍色': '#0000ff',
    '綠': '#00ff00', '綠色': '#00ff00',
    '白': '#ffffff', '白色': '#ffffff',
    '黑': '#000000', '黑色': '#000000',
    '紫': '#800080', '紫色': '#800080',
    '黃': '#ffff00', '黃色': '#ffff00',
    '橘': '#ffa500', '橘色': '#ffa500',
    '灰': '#808080', '灰色': '#808080',
    '粉紅': '#ffc0cb', '粉紅色': '#ffc0cb'
  };
  if (!input) return '#00ff00';
  if (/^#?[0-9a-fA-F]{6}$/.test(input)) return input.startsWith('#') ? input : '#' + input;
  const hex = map[input.trim()];
  return hex || '#00ff00';
}

function pickNumber(text, regex, fallback = 20) {
  const m = text.match(regex);
  return m ? parseFloat(m[1]) : fallback;
}

export async function createRecognizer(videoElement) {
    try {
        const stream = await navigator.mediaDevices.getUserMedia({ video: true });
        videoElement.srcObject = stream;
        await videoElement.play().catch(() => {});
        console.log("✅ 視訊播放成功");
    } catch (err) {
        console.error("❌ 無法播放視訊", err);
    }
    let busy = false; 

    return async function recognize(callback) {
        if (busy) return; 
        busy = true;
        const btn = document.getElementById('recognizeBtn');
        const restoreBtn = () => { if (btn) { btn.disabled = false; btn.textContent = '辨識參數'; } };
        if (btn) { btn.disabled = true; btn.textContent = '辨識中…'; }
        showToast('📷 已拍攝圖片，正在辨識…');
        try {
            const res = await fetch("/ovis-recognize-from-camera", { method: 'POST' });
            if (!res.ok) throw new Error('HTTP ' + res.status);
            const resJson = await res.json();
            if (resJson.error) {
                console.error('伺服器回應錯誤:', resJson.error);
                showToast('❌ 辨識失敗：' + resJson.error);
                setTimeout(hideToast, 1500);
                return;
            }
            const text = String(resJson.text || '');
            console.log('辨識結果:', text);
            window.__recognizeResult = text;
            
            const extract = (regex) => {
                const match = text.match(regex);
                return match ? parseFloat(match[1]) : 20;
            };
            const type =
                /(?:cube|立方)/i.test(text) ? 'cube' :
                /(?:circle|球)/i.test(text) ? 'circle' :
                /(?:lshape|不規則|L型)/i.test(text) ? 'lshape' : 'cube';
            const colorRaw = (text.match(/(紅|綠|藍|黃|紫|白|黑)(色)?/) || [])[0] || '綠色';
            const color = colorMap[colorRaw] || '#00ff00';
            const hasHole = /(有洞|鏤空|簍空)/.test(text);
            const result = {
                type: /cube|立方/i.test(text) ? "cube" :
                      /circle|球/i.test(text) ? "circle" :
                      /lshape|不規則|L型/i.test(text) ? "lshape" : "cube",
                width: extract(/(?:寬|width)[^\d]{0,3}(\d+)/i),
                height: extract(/(?:高|height)[^\d]{0,3}(\d+)/i),
                depth: extract(/(?:深|depth)[^\d]{0,3}(\d+)/i),
                color: color,
                hasHole: /有洞/.test(text),
                holeWidth: extract(/(?:洞寬|holeWidth)[^\d]{0,3}(\d+)/i),
                holeHeight: extract(/(?:洞高|holeHeight)[^\d]{0,3}(\d+)/i)
            };
            showToast('✅ 辨識成功，已套用參數');
            setTimeout(hideToast, 800);

            if (typeof callback === 'function') callback(result);
        } catch (err) {
            console.error('辨識錯誤:', err);
            showToast('⚠️ 發生錯誤，請稍後再試');
            setTimeout(hideToast, 1500);
        }finally {
        busy = false;
        restoreBtn();
        }
    };
}