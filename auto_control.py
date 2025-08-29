from selenium import webdriver
from selenium.webdriver.common.by import By
from selenium.webdriver.support.ui import WebDriverWait
from selenium.webdriver.chrome.options import Options
from selenium.webdriver.support import expected_conditions as EC
import time
import re
import requests

def extract_params():
    try:
        res = requests.post("http://localhost:5000/ovis-recognize-from-camera", timeout=15)
        res.raise_for_status()
        res_json = res.json()
    except Exception as e:
        print("❌ OVIS 呼叫失敗：", e)
        return None
    text = (res_json or {}).get("text", "")
    if not text:
        print("❌ 無辨識結果")
        return None
    
    print("📝 辨識結果：", text)

    def extract(regex, default=20):
        match = re.search(regex, text)
        try:
            return float(match.group(1)) if match else default
        except Exception as e:
            print("❌ 提取參數時發生錯誤：", e)
            return default

    color_map = {
        "紅": "#ff0000", "紅色": "#ff0000",
        "綠": "#00ff00", "綠色": "#00ff00",
        "藍": "#0000ff", "藍色": "#0000ff",
        "黃": "#ffff00", "黃色": "#ffff00",
        "紫": "#800080", "紫色": "#800080",
        "白": "#ffffff", "白色": "#ffffff",
        "黑": "#000000", "黑色": "#000000",
        "橘": "#ffa500", "橘色": "#ffa500",
        "灰": "#808080", "灰色": "#808080",
        "粉紅": "#ffc0cb", "粉紅色": "#ffc0cb",
    }
    color_match = re.search(r"(紅|綠|藍|黃|紫|白|黑|橘|灰|粉紅)(色)?", text)
    color_key = color_match.group(0) + "色" if color_match and not color_match.group(0).endswith("色") else color_match.group(0)
    color = color_map.get(color_key, "#00ff00")
    print("🟡 color key：", color_key)
    print("🎨 color hex：", color)
    
    t = ("tI" if re.search(r"I\s*形|I型", text) else
         "tT" if re.search(r"T\s*形|T型", text) else
         "tZ" if re.search(r"Z\s*形|Z型", text) else
         "tL" if re.search(r"L\s*形|L型", text) else
         "circle" if re.search(r"circle|球", text) else
         "lshape" if re.search(r"不規則", text) else "cube")

    w = extract(r"(?:寬|邊長|直徑|長|width)\D*(\d+(?:\.\d+)?)", 20)
    h = extract(r"(?:高|height)\D*(\d+(?:\.\d+)?)", 20)
    d = extract(r"(?:深|厚|depth)\D*(\d+(?:\.\d+)?)", 20)

    has_hole = re.search(r"(有洞|有孔|孔洞|鏤空|簍空)", text, re.I) is not None
    hole_w   = extract(r"(?:洞寬|孔寬|hole\s*width)\D*(\d+(?:\.\d+)?)", 10)
    hole_h   = extract(r"(?:洞高|孔高|hole\s*height)\D*(\d+(?:\.\d+)?)", 10)

    if t in ("tI","tT","tZ","tL"): h = d = w; has_hole = False
    if t == "circle": h = d = w

    return {"type":t, "width":w, "height":h, "depth":d,
            "color":color, "hasHole":has_hole, "holeWidth":hole_w, "holeHeight":hole_h}

def _ensure_button_click_hook(driver):
    """在前端注入監聽：按下辨識按鈕時設定 data-clicked='true'"""
    driver.execute_script("""
    (function(){
      const btn = document.getElementById('recognizeBtn');
      if (!btn) return;
      if (!btn.__hooked) {
        btn.__hooked = true;
        btn.addEventListener('click', () => btn.setAttribute('data-clicked','true'));
      }
    })();
    """)

def wait_for_recognize_button(driver):
    btn = WebDriverWait(driver, 15).until(EC.presence_of_element_located((By.ID, "recognizeBtn")))
    _ensure_button_click_hook(driver)
    print("🕓 等待點擊辨識參數按鈕...")
    while True:
        try:
            _ensure_button_click_hook(driver)
            btn = driver.find_element(By.ID, "recognizeBtn")
            if btn.get_attribute("data-clicked") == "true":
                driver.execute_script("arguments[0].setAttribute('data-clicked','false');", btn)
                return
            time.sleep(0.2)
        except Exception as e:
            print("❌ 等待辨識按鈕時發生錯誤：", e)

            """ btn = driver.find_element(By.ID, "recognizeBtn")
        if btn.get_attribute("data-clicked") == "true":
            driver.execute_script("arguments[0].setAttribute('data-clicked','false');", btn)
            return """
            time.sleep(0.5)

def fill_form_with_selenium(driver, data):
    #shape_element = driver.find_element(By.ID, "shapeType")
    #driver.execute_script("arguments[0].value = arguments[1]; arguments[0].dispatchEvent(new Event('change'));", shape_element, data["type"])
    #driver.find_element(By.ID, "color").clear()
    #driver.execute_script("""
        #const colorInput = document.getElementById('color');
        #colorInput.value = arguments[0];
        #colorInput.dispatchEvent(new Event('input'));
    #""", data["color"])

    def set_val(eid, val, evt = "input"):
        driver.execute_script(
            "var el=document.getElementById(arguments[0]);"
            "if(el){el.value=arguments[1]; el.dispatchEvent(new Event(arguments[2]));}",
            eid, str(val), evt
        )

    driver.execute_script(
        "var el=document.getElementById('shapeType');"
        "if(el){el.value=arguments[0]; el.dispatchEvent(new Event('change'));}",
        data["type"]
    )
    set_val("color", data["color"], "input")
    
    if data["type"] == "cube" or data["type"] in ("tI", "tT", "tZ", "tL"):
        set_val("boxWidth", data["width"])
        if data["type"] == "cube":
            set_val("boxHeight", data["height"])
            set_val("boxDepth", data["depth"])
    elif data["type"] == "circle":
        # 前端的球體欄位名為 sphereWidth（直徑）
        set_val("sphereWidth", data["width"])
    elif data["type"] == "lshape":
        set_val("customWidth", data["width"])
        set_val("customHeight", data["height"])
        set_val("customDepth", data["depth"])

    # 孔洞（只有 cube / circle / lshape 可用）
    if data.get("hasHole") and data["type"] in ("cube", "circle", "lshape"):
        driver.execute_script("var c=document.getElementById('hasHole'); if(c && !c.checked){c.click();}")
        WebDriverWait(driver, 5).until(EC.visibility_of_element_located((By.ID, "holeWidth")))
        set_val("holeWidth", data["holeWidth"])
        set_val("holeHeight", data["holeHeight"])
    else:
        driver.execute_script("var c=document.getElementById('hasHole'); if(c && c.checked){c.click();}")

    # 產生
    driver.execute_script("document.getElementById('generate').click();")
    print("✅ 已將辨識結果填入並產生模型")

def main():
    chrome_options = Options()
    chrome_options.add_argument("--use-fake-ui-for-media-stream")  # 允許存取相機
    driver = webdriver.Chrome(options=chrome_options)
    driver.set_window_size(1280, 900)
    driver.get("http://localhost:5000")

    try:
        while True:
            wait_for_recognize_button(driver)
            data = extract_params()
            if data:
                fill_form_with_selenium(driver, data)
                print("✅ 模型產生完成")
            else:
                print("❌ 辨識結果無效，請重試")
    except KeyboardInterrupt:
        print("\n👋 已中止。")
    finally:
        try:
            driver.quit()
        except Exception:
            pass

if __name__ == "__main__":
    main()