from flask import Flask, request, jsonify  
from flask_cors import CORS
import base64
from PIL import Image
import io
import os
import torch
from datetime import datetime
from transformers import AutoModelForCausalLM, AutoTokenizer, AutoImageProcessor

print("載入 OVIS 模型中...")

local_model_path = "./models/Ovis2-4B"
model = AutoModelForCausalLM.from_pretrained(
    local_model_path,
    torch_dtype=torch.float16,
    trust_remote_code=True,
    multimodel_max_length=32768
).to("cpu").eval()
print("✅ 模型載入完成")

tokenizer = AutoTokenizer.from_pretrained(local_model_path, trust_remote_code=True)
image_processor = AutoImageProcessor.from_pretrained(local_model_path, trust_remote_code=True)

SAVE_DIR = "captured_images"
os.makedirs(SAVE_DIR, exist_ok=True)
app = Flask(__name__)
CORS(app)

@app.route('/ovis-recognize', methods=['POST'])
def recognize():
    #try:
        data = request.get_json()
        if 'image' not in data:
            return jsonify({"error": "缺少 image 欄位"}), 400
        print("📷 接收到圖片")
        image_data = data['image'].split(",")[-1]
        image_bytes = base64.b64decode(image_data)
        image = Image.open(io.BytesIO(image_bytes)).convert('RGB')
        
        timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
        image_path = os.path.join(SAVE_DIR, f"captured_{timestamp}.jpg")
        image.save(image_path)  
        print(f"📷 圖片已儲存：{image_path}")


        #text_tokenizer = model.get_text_tokenizer()
        #visual_tokenizer = model.get_visual_tokenizer()
        image_inputs = image_processor(image, return_tensors="pt").to("cuda")
        image_tensor = image_inputs["pixel_values"].to("cuda")
        
        prompt = "<|image|> 請辨識圖中物體的類型、寬、高、深、顏色、是否簍空與洞尺寸。"
        text_inputs = tokenizer(prompt, return_tensors="pt").to("cuda")

        output = model.generate(
            vision_input=image_tensor,
            input_ids=text_inputs["input_ids"],
            attention_mask=text_inputs["attention_mask"],
            max_new_tokens=128,
            do_sample=False
        )
        result = tokenizer.decode(output[0], skip_special_tokens=True)
        print("[模型辨識結果]", result)
        return jsonify({"text": result})
    #except Exception as e:
        #print("❌ 辨識錯誤：", str(e))
        #return jsonify({"error": str(e)}), 500

if __name__ == '__main__':
    print("✅ 啟動 Flask...")
    app.run(host="127.0.0.1", port=5000, debug=False)
    #app.run(debug=True, port=5000)

