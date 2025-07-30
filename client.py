import base64
import requests

def encode_image_to_base64(image_path):
    with open(image_path, "rb") as img_file:
        return base64.b64encode(img_file.read()).decode('utf-8')

def query_server(prompt, image_base64):
    import requests
    payload = {
        #"task_type": "vlm_generate",
        "prompt": prompt,
        "image": image_base64
    }
    
    try:
        response = requests.post("http://192.168.178.151:5678/webhook/mcp", json=payload)
        print("🔧 status code:", response.status_code)
        print("🧾 原始回應內容：", response.text)
        print("📜 Header:", response.headers)
        print("🧾 回應文字 repr:", repr(response.text))
        result = response.json()

        if isinstance(result, list):
            return result[0]
        elif isinstance(result, dict):
            return result["result"]
        else:
            raise ValueError("❌ 未知的 API 回傳格式")
        #return result
    except requests.exceptions.JSONDecodeError:
        print("❌ JSON 解析失敗")
        return None
    except Exception as e:
        print(f"❌ 發生錯誤: {e}")
        return None

# 使用範例
if __name__ == "__main__":
    image_path = "captured_images\img.jpg"  # 替換為你本地圖片路徑
    prompt = "請辨識圖中的文字。"
    image_base64 = encode_image_to_base64(image_path)
    result = query_server(prompt, image_base64)
    print("📦 辨識結果：", result)
    query_server(image_base64, prompt)
