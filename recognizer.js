export async function createRecognizer(videoElement) {
    try {
        const stream = await navigator.mediaDevices.getUserMedia({ video: true });
        videoElement.srcObject = stream;
        await videoElement.play();
        console.log("✅ 視訊播放成功");
    } catch (err) {
        console.error("❌ 無法播放視訊", err);
    }

    return async function recognize(callback) {
        alert('已拍攝圖片，正在辨識...');
        try {
            const res = await fetch("/ovis-recognize-from-camera", { method: 'POST' });
            const resJson = await res.json();
            if (resJson.error) {
                alert("❌ 辨識失敗：" + resJson.error);
                console.error('伺服器回應錯誤:', resJson.error);
                return;
            }

            const text = resJson.text;
            console.log('辨識結果:', text);
            window.__recognizeResult = text;

            const colorMap = {
                '紅': '#ff0000', '紅色': '#ff0000',
                '藍': '#0000ff', '藍色': '#0000ff',
                '綠': '#00ff00', '綠色': '#00ff00',
                '白': '#ffffff', '白色': '#ffffff',
                '黑': '#000000', '黑色': '#000000',
                '紫': '#800080', '紫色': '#800080',
                '黃': '#ffff00', '黃色': '#ffff00'
            };
            const extract = (regex) => {
                const match = text.match(regex);
                return match ? parseFloat(match[1]) : 20;
            };
            const colorRaw = (text.match(/(紅|綠|藍|黃|紫|白|黑)(色)?/) || [])[0] || '綠色';
            const color = colorMap[colorRaw] || '#00ff00';
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
            alert('✅ 辨識成功，自動產生模型中');
            
            if (typeof callback === 'function') callback(result);
        } catch (err) {
            console.error('辨識錯誤:', err);
            alert('發生錯誤');
        }
    };
}