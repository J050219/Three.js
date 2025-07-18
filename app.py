from flask import Flask, request, jsonify
import base64
from PIL import Image
from io import BytesIO
import os
import torch
from datetime import datetime
from transformers import AutoTokenizer, AutoModelForCausalLM, AutoProcessor
print("🚀 開始執行 app.py")

local_model_path = "./models/Ovis2-4B"

model = AutoModelForCausalLM.from_pretrained(
    local_model_path,
    torch_dtype=torch.float16,
    trust_remote_code=True,
).to("cpu")
tokenizer = AutoTokenizer.from_pretrained(local_model_path, trust_remote_code=True)
processor = AutoProcessor.from_pretrained(local_model_path, trust_remote_code=True)
print("✅ 模型載入完成")
app = Flask(__name__)

SAVE_DIR = "captured_images"
os.makedirs(SAVE_DIR, exist_ok=True)

@app.route('/ovis-recognize', methods=['POST'])
def recognize():
    try:
        data = request.get_json()
        image_b64 = data.get('image')

        if not image_b64.startswith('data:image'):
            return jsonify({'error': '無效圖片格式'}), 400

        header, encoded = image_b64.split(',', 1)
        image_bytes = base64.b64decode(encoded)
        image = Image.open(BytesIO(image_bytes)).convert('RGB')

        timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
        image_path = os.path.join(SAVE_DIR, f"captured_image_{timestamp}.jpg")
        image.save(image_path)  
        print(f"📷 圖片已儲存：{image_path}")

        prompt = "<|image|> 請辨識圖中物體的類型、寬、高、深、顏色、是否簍空與洞尺寸。"
        inputs = processor(image, prompt, return_tensors="pt").to("cuda")
        with torch.inference_mode():
            generated_ids = model.generate(**inputs, max_new_tokens=128)
        output = tokenizer.batch_decode(generated_ids, skip_special_tokens=True)[0]
        print("[模型辨識結果]", output)
        return jsonify({"text": output})
    except Exception as e:
        return jsonify({"error": str(e)}), 500

if __name__ == '__main__':
    print("✅ 啟動 Flask...")
    app.run(host="localhost", port=5000)
