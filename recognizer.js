export async function createRecognizer(videoElement) {
    try {
        const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: "user" }});
        videoElement.srcObject = stream;
        await new Promise((resolve) => {
            videoElement.onloadedmetadata = () => {
                videoElement.play();
                resolve();
            };
        });
    } catch (err) {
        console.error('無法存取攝影機:', err);
        alert('無法存取攝影機，請檢查權限設定');
        return () => {};
    }
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');
    canvas.width = 640;
    canvas.height = 480;

    return async function recognize(callback) {
        ctx.drawImage(videoElement, 0, 0, canvas.width, canvas.height);
        const imageData = canvas.toDataURL('image/jpg', 0.92);
        alert('已拍攝圖片，正在辨識...');
        try {
            const res = await fetch('http://192.168.178.151:5678/webhook/mcp', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ image: imageData })
            });
            const resJson = await res.json();
            if (resJson.error) {
                console.error('伺服器回應錯誤:', resJson.error);
                return;
            }

            const text = resJson.text;
            console.log('辨識結果:', text);
        
            const extract = (regex) => parseFloat((text.match(regex) || [])[1]);

            const result = {
                type: /cube|立方/i.test(text) ? "cube" :
                      /circle|球/i.test(text) ? "circle" :
                      /lshape|不規則|L型/i.test(text) ? "lshape" : "cube",
                width: extract(/(?:寬|width)\s*(\d+)/i),
                height: extract(/(?:高|height)\s*(\d+)/i),
                depth: extract(/(?:深|depth)\s*(\d+)/i),
                color: (text.match(/色\s*(#?[0-9a-fA-F]{6})/) || [])[1] || '#00ff00',
                hasHole: /有洞/.test(text),
                holeWidth: extract(/(?:洞寬|holeWidth)\s*(\d+)/i),
                holeHeight: extract(/(?:洞高|holeHeight)\s*(\d+)/i)
            };

            alert('✅ 辨識成功，自動產生模型中');
            if (typeof callback === 'function') {
                callback(result);
            }
        } catch (err) {
            console.error('辨識錯誤:', err);
            alert('發生錯誤');
        }
    };
}