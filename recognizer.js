export async function createRecognizer(videoElement) {
    const stream = await navigator.mediaDevices.getUserMedia({ video: true });
    videoElement.srcObject = stream;
    
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');
    canvas.width = 640;
    canvas.height = 480;

    return async function recognize() {
        ctx.drawImage(videoElement, 0, 0, canvas.width, canvas.height);
        const imageData = canvas.toDataURL('image/jpg', 0.92);
        const link = document.createElement('a');
        link.href = imageData;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        alert('已拍攝圖片，正在辨識...');
        const res = await fetch('http://localhost:5000/ovis-recognize', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ image: imageData })
        });
        const data = await res.json();
        if (!data || !data.text) return null;

        const text = data.text;
        console.log('辨識結果:', text);

        const typeMatch = text.match(/(cube|circle|lshape|立方體|球體|L型)/i);
        const width = parseFloat((text.match(/寬\s*(\d+)/) || [])[1]);
        const height = parseFloat((text.match(/高\s*(\d+)/) || [])[1]);
        const depth = parseFloat((text.match(/深\s*(\d+)/) || [])[1]);
        const color = (text.match(/色\s*(#?[0-9a-fA-F]{6})/) || [])[1] || '#00ff00';
        const hasHole = /有洞/.test(text);
        const holeWidth = parseFloat((text.match(/洞寬\s*(\d+)/) || [])[1]) || 0;
        const holeHeight = parseFloat((text.match(/洞高\s*(\d+)/) || [])[1]) || 0;

        if (!typeMatch || isNaN(width) || isNaN(height) || isNaN(depth)) return null;

        let type = typeMatch[1].toLowerCase();
        if(type.includes('立方體'))
            type = 'cube';
        else if(type.includes('球體'))
            type = 'circle';
        else if(type.includes('L型') || type.includes('l型'))
            type = 'lshape';
        return {
            type,
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