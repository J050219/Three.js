from flask import Flask, jsonify, request, Response, abort, send_from_directory
import cv2
import base64
import requests
import os
from flask_cors import CORS

app = Flask(__name__, static_folder="static", static_url_path="/static")
CORS(app)
os.makedirs("captured_images", exist_ok=True)

@app.route('/static/node_modules/<path:filename>')
def static_node_modules(filename):
    base = os.path.join(app.static_folder, 'node_modules')
    full = os.path.join(base, filename)

    # 1) 目錄 → 傳回 index.js
    if os.path.isdir(full):
        idx = os.path.join(filename, 'index.js')
        if os.path.exists(os.path.join(base, idx)):
            return send_from_directory(base, idx)

    # 2) 檔案剛好存在 → 直接回
    if os.path.exists(full):
        return send_from_directory(base, filename)

    # 3) 沒副檔名 → 依序補 .js / .mjs
    root, ext = os.path.splitext(full)
    if ext == '':
        for suf in ('.js', '.mjs'):
            cand = root + suf
            if os.path.exists(cand):
                return send_from_directory(base, filename + suf)

    return abort(404)
camera = cv2.VideoCapture(0, cv2.CAP_DSHOW)
if not camera.isOpened():
    print("❌ 無法開啟攝影機")
    
def encode_image_to_base64(image_path):
    with open(image_path, "rb") as img_file:
        return base64.b64encode(img_file.read()).decode('utf-8')

def query_server(prompt, image_base64):
    payload = {
        "task_type": "vlm_generate",
        "text_query": prompt,
        "image_base64": image_base64
    }
    try:
        response = requests.post("http://192.168.178.151:5678/webhook/mcp", json=payload)
        print("🔧 status code:", response.status_code)
        print("🧾 回應內容：", response.text)
        if response.status_code == 200:
            result = response.json()
            if isinstance(result, list) and 'response' in result[0]:
                return result[0]['response']
            elif isinstance(result, dict) and 'response' in result:
                return result['response']
        return None
    except Exception as e:
        print("❌ OVIS 辨識錯誤：", e)
        return None

def gen_frames():
    while True:
        success, frame = camera.read()
        if not success:
            continue
        ret, buffer = cv2.imencode('.jpg', frame)
        if not ret:
            continue
        frame_bytes = buffer.tobytes()
        yield (b'--frame\r\n'
               b'Content-Type: image/jpeg\r\n\r\n' + frame_bytes + b'\r\n')

@app.route('/get-camera-frame')
def get_camera_frame():
    return Response(gen_frames(), mimetype='multipart/x-mixed-replace; boundary=frame')

@app.route('/ovis-recognize-from-camera', methods=['POST'])
def recognize_from_camera():
    try:
        success, frame = camera.read()
        if not success:
            return jsonify({"error": "❌ 無法讀取攝影機畫面"}), 500

        image_path = "captured_images/img.jpg"
        cv2.imwrite(image_path, frame)
        print("✅ 圖片已儲存：", image_path)

        image_base64 = encode_image_to_base64(image_path)
        result = query_server("請辨識圖中的文字。", image_base64)

        if result:
            return jsonify({"text": result})
        else:
            return jsonify({"error": "❌ 辨識失敗"}), 400
    except Exception as e:
        print("🔥 Flask 錯誤：", e)
        return jsonify({"error": str(e)}), 500

@app.route('/')
def serve_index():
    return send_from_directory('static', 'index.html')

if __name__ == '__main__':
    app.run(host='0.0.0.0', port=5000)