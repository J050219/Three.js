export function createRecognizer() {
    const video = document.createElement('video');
    video.autoplay = true;
    video.width = 640;
    video.height = 480;
    video.style.display = 'none';
    document.body.appendChild(video);

    // 開啟攝影機
    navigator.mediaDevices.getUserMedia({ video: true }).then((stream) => {
        video.srcObject = stream;
    }).catch(err => console.error('攝影機啟動失敗:', err));

    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');
    canvas.width = 640;
    canvas.height = 480;

    return async function recognize() {
        ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
        const imageData = canvas.toDataURL('image/png');

        // ✅ 呼叫你本地後端的 OVIS 接口
        const res = await fetch('http://localhost:5000/ovis-recognize', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ image: imageData })
        });

        const data = await res.json();
        if (!data || !data.text) return null;

        const text = data.text;
        console.log('[OVIS 辨識文字]', text);

        const typeMatch = text.match(/(cube|circle|lshape)/i);
        const width = parseFloat((text.match(/寬(\d+)/) || [])[1]);
        const height = parseFloat((text.match(/高(\d+)/) || [])[1]);
        const depth = parseFloat((text.match(/深(\d+)/) || [])[1]);
        const color = (text.match(/色(#?[0-9a-fA-F]{6})/) || [])[1] || '#00ff00';
        const hasHole = /有洞/.test(text);
        const holeWidth = parseFloat((text.match(/洞寬(\d+)/) || [])[1]) || 0;
        const holeHeight = parseFloat((text.match(/洞高(\d+)/) || [])[1]) || 0;

        if (!typeMatch || !width || !height || !depth) return null;

        return {
            type: typeMatch[1].toLowerCase(),
            width,
            height,
            depth,
            color,
            hasHole,
            holeWidth,
            holeHeight
        };
    };
}
