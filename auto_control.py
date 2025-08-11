from selenium import webdriver
from selenium.webdriver.common.by import By
from selenium.webdriver.support.ui import Select, WebDriverWait
from selenium.webdriver.chrome.options import Options
from selenium.common.exceptions import NoAlertPresentException
from selenium.webdriver.common.alert import Alert
from selenium.webdriver.support import expected_conditions as EC
import time
import re
import requests

def extract_params():
    res = requests.post("http://localhost:5000/ovis-recognize-from-camera")
    res_json = res.json()
    text = res_json.get("text")
    if not text:
        print("❌ 無辨識結果")
        return None
    
    print("📝 辨識結果：", text)

    def extract(regex):
        match = re.search(regex, text)
        return float(match.group(1)) if match else 20

    color_map = {
        "紅": "#ff0000", "紅色": "#ff0000",
        "綠": "#00ff00", "綠色": "#00ff00",
        "藍": "#0000ff", "藍色": "#0000ff",
        "黃": "#ffff00", "黃色": "#ffff00",
        "紫": "#800080", "紫色": "#800080",
        "白": "#ffffff", "白色": "#ffffff",
        "黑": "#000000", "黑色": "#000000"
    }
    color_match = re.search(r"(紅|綠|藍|黃|紫|白|黑)(色)?", text)
    #color = color_map.get(color_match.group(0), "#00ff00") if color_match else "#00ff00"
    color_key = color_match.group(0) + "色" if color_match and not color_match.group(0).endswith("色") else color_match.group(0)
    color = color_map.get(color_key, "#00ff00")
    print("🟡 color key：", color_key)
    print("🎨 color hex：", color)
    return {
        "type": "cube" if "cube" in text or "立方" in text else
                 "circle" if "circle" in text or "球" in text else
                 "lshape" if "L型" in text or "不規則" in text else "cube",
        "width": extract(r"寬(?:度)?\D*(\d+)"),
        "height": extract(r"高(?:度)?\D*(\d+)"),
        "depth": extract(r"深(?:度)?\D*(\d+)"),
        "color": color, 
        "hasHole": "有洞" in text,
        "holeWidth": extract(r"洞寬\D*(\d+)"),
        "holeHeight": extract(r"洞高\D*(\d+)"),
    }

def wait_for_recognize_button(driver):
    print("🕓 等待點擊辨識參數按鈕...")
    WebDriverWait(driver, 15).until(EC.presence_of_element_located((By.ID, "recognizeBtn")))
    while True:
        try:
            WebDriverWait(driver, 0.1).until(EC.alert_is_present())
            driver.switch_to.alert.accept()
            continue
            #alert = driver.switch_to.alert
            #print(f"⚠️ 偵測到警告視窗：{alert.text}")
            #alert.accept()
            #print("✅ 警告視窗已關閉")
        except:
            pass

            btn = driver.find_element(By.ID, "recognizeBtn")
        #clicked = btn.get_attribute("data-clicked")
        #if clicked == "true":
        #print("🔘 偵測到使用者已按下按鈕")
        #driver.execute_script("document.getElementById('recognizeBtn').setAttribute('data-clicked', 'false')")
        #break
        #except Exception as e:
        #    print(f"❌ 找不到按鈕或屬性，錯誤：{e}")
        if btn.get_attribute("data-clicked") == "true":
            driver.execute_script("arguments[0].setAttribute('data-clicked','false');", btn)
            return
        time.sleep(1)

def fill_form_with_selenium(driver, data):
    #WebDriverWait(driver, 10).until(EC.presence_of_element_located((By.ID, "shapeType")))
    #shape_select = Select(driver.find_element(By.ID, "shapeType"))
    #shape_select.select_by_value(data["type"])
    #time.sleep(1) 
    shape_element = driver.find_element(By.ID, "shapeType")
    driver.execute_script("arguments[0].value = arguments[1]; arguments[0].dispatchEvent(new Event('change'));", shape_element, data["type"])
    driver.find_element(By.ID, "color").clear()
    driver.execute_script("""
        const colorInput = document.getElementById('color');
        colorInput.value = arguments[0];
        colorInput.dispatchEvent(new Event('input'));
    """, data["color"])

    if data["type"] == "cube":
        #WebDriverWait(driver, 3).until(EC.element_to_be_clickable((By.ID, "boxWidth")))
        shape = driver.find_element(By.ID, "shapeType")
        driver.find_element(By.ID, "boxWidth").send_keys(str(data["width"]))
        driver.find_element(By.ID, "boxHeight").send_keys(str(data["height"]))
        driver.find_element(By.ID, "boxDepth").send_keys(str(data["depth"]))
    elif data["type"] == "circle":
        #WebDriverWait(driver, 3).until(EC.element_to_be_clickable((By.ID, "sphereWidth")))
        driver.find_element(By.ID, "sphereWidth").send_keys(str(data["width"]))
    elif data["type"] == "lshape":
        #WebDriverWait(driver, 3).until(EC.element_to_be_clickable((By.ID, "customWidth")))
        driver.find_element(By.ID, "customWidth").send_keys(str(data["width"]))
        driver.find_element(By.ID, "customHeight").send_keys(str(data["height"]))
        driver.find_element(By.ID, "customDepth").send_keys(str(data["depth"]))

    driver.find_element(By.ID, "color").clear()
    driver.find_element(By.ID, "color").send_keys(data["color"])

    if data.get("hasHole"):
        checkbox = driver.find_element(By.ID, "hasHole")
        if not checkbox.is_selected():
            checkbox.click()
        WebDriverWait(driver, 3).until(EC.visibility_of_element_located((By.ID, "holeWidth")))
        driver.find_element(By.ID, "holeWidth").send_keys(str(data["holeWidth"]))
        driver.find_element(By.ID, "holeHeight").send_keys(str(data["holeHeight"]))

    driver.find_element(By.ID, "generate").click()
    print("✅ 已將辨識結果填入並產生模型")

if __name__ == "__main__":
    chrome_options = Options()
    chrome_options.add_argument("--use-fake-ui-for-media-stream")
    driver = webdriver.Chrome(options=chrome_options)
    driver.get("http://localhost:5000")
    #time.sleep(1)
    while True:
        wait_for_recognize_button(driver)
        #image_base64 = capture_image_from_camera("captured_images/img.jpg")
        data = extract_params()
        if data:
            fill_form_with_selenium(driver, data)
            print("✅ 模型產生完成")
        else:
            print("❌ 辨識結果無效，請重試")
input("✅ 操作完成，請檢查網頁模型結果。關閉 Chrome 視窗後按 Enter 結束。")