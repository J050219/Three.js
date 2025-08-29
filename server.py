from flask import Flask, jsonify, request, Response, abort, send_from_directory
import cv2
import base64
import requests
import os
from flask_cors import CORS

OVIS_URL = os.environ.get("OVIS_URL", "http://192.168.178.151:5678/webhook/mcp")
OVIS_TIMEOUT = float(os.environ.get("OVIS_TIMEOUT", "6.0"))
app = Flask(__name__, static_folder="static", static_url_path="/static")
CORS(app)
os.makedirs("captured_images", exist_ok=True)

@app.route('/static/node_modules/<path:filename>')
def static_node_modules(filename):
    base = os.path.join(app.static_folder, 'node_modules')
    full = os.path.join(base, filename)

    if os.path.isdir(full):
        idx = os.path.join(filename, 'index.js')
        if os.path.exists(os.path.join(base, idx)):
            return send_from_directory(base, idx)

    if os.path.exists(full):
        return send_from_directory(base, filename)

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
        r = requests.post(OVIS_URL, json=payload, timeout=OVIS_TIMEOUT) 
        """ response = requests.post("http://192.168.178.151:5678/webhook/mcp", json=payload)
        print("🔧 status code:", response.status_code)
        print("🧾 回應內容：", response.text) """
        if r.status_code == 200:
            result = r.json()
            if isinstance(result, list) and result and isinstance(result[0], dict) and 'response' in result[0]:
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
        prompt = (
            "請看圖中的單一物體，請用中文回覆一行，包含："
            "形狀(立方體/球體/不規則或 tI/tT/tZ/tL)、顏色、"
            "尺寸（立方/不規則給寬/高/深；球體給直徑）、"
            "是否有孔洞；若有孔洞請加上『孔寬X、孔高Y』或『洞寬X、洞高Y』。"
            "範例：綠色立方體，寬20，高12，深10，有孔，孔寬8，孔高6。"
        )
        result = query_server(prompt, image_base64)

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