from flask import Flask, request, jsonify
import base64
from PIL import Image
import io
#from ovis_model import OVISRecognizer
from flash_attn import OVISRecognizer  # 這依照該模型提供的 API

app = Flask(__name__)
model = OVISRecognizer("capture.jpg")

@app.route('/ovis-recognize', methods=['POST'])
def recognize():
    try:
        data = request.json
        image_b64 = data.get('image').split(',')[1]
        image_bytes = base64.b64decode(image_b64)
        image = Image.open(io.BytesIO(image_bytes))

        result = model.predict(image)
        print("[模型辨識結果]", result)
        return jsonify({"text": result})
    except Exception as e:
        return jsonify({"error": str(e)}), 500

if __name__ == '__main__':
    app.run(host="localhost", port=5000)
