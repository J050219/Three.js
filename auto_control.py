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
    if "text" not in res_json:
        print("❌ 無辨識結果")
        return None
    text = res_json["text"]
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
    color = color_map.get(color_match.group(0), "#00ff00") if color_match else "#00ff00"

    return {
        "type": "cube" if "cube" in text or "立方" in text else
                 "circle" if "circle" in text or "球" in text else
                 "lshape" if "L型" in text or "不規則" in text else "cube",
        "width": extract(r"寬(?:度)?\D*(\d+)"),
        "height": extract(r"高(?:度)?\D*(\d+)"),
        "depth": extract(r"深(?:度)?\D*(\d+)"),
        "color": "#00ff00",  # 可加入顏色抽取規則
        "hasHole": "有洞" in text,
        "holeWidth": extract(r"洞寬\D*(\d+)"),
        "holeHeight": extract(r"洞高\D*(\d+)"),
    }

#def wait_for_recognize_button(driver):
    #print("🕓 等待點擊辨識參數按鈕...")
    #while True:
        #try:
            #alert = Alert(driver)
            #print(f"⚠️ 偵測到警告視窗：{alert.text}")
            #alert.accept()
            #print("✅ 警告視窗已關閉")
            #time.sleep(1)
            #continue
        #except NoAlertPresentException:
            #pass
        #btn = driver.find_element(By.ID, "recognizeBtn")
        #btn_text = btn.get_attribute("value") or btn.text
        #if "辨識中" in btn_text:
            #break
        #time.sleep(2)
    #print("🔘 偵測到使用者已點擊按鈕")
    #time.sleep(2)

#def capture_image_from_camera():
    #save_dir = "captured_images"
    #os.makedirs(save_dir, exist_ok=True)
    #save_path = os.path.join(save_dir, "img.jpg")
    
    #cap = cv2.VideoCapture(0, cv2.CAP_DSHOW)
    #if not cap.isOpened():
        #print("❌ 無法開啟攝影機")
        #return None
    #ret, frame = cap.read()
    #cap.release()
    #if not ret:
        #print("❌ 無法讀取攝影機畫面")
        #return None
    #cv2.imwrite(save_path, frame)
    #print(f"✅ 擷取成功：{save_path}")
    #with open(save_path, "rb") as img_file:
        #image_base64 = base64.b64encode(img_file.read()).decode('utf-8')
    #return image_base64

def fill_form_with_selenium(driver, data):
    WebDriverWait(driver, 10).until(EC.presence_of_element_located((By.ID, "shapeType")))
    shape_select = Select(driver.find_element(By.ID, "shapeType"))
    shape_select.select_by_value(data["type"])
    time.sleep(1)  # 等待選擇器更新
    driver.find_element(By.ID, "boxWidth").send_keys(str(data["width"]))
    driver.find_element(By.ID, "boxHeight").send_keys(str(data["height"]))
    driver.find_element(By.ID, "boxDepth").send_keys(str(data["depth"]))
    driver.find_element(By.ID, "color").clear()
    driver.find_element(By.ID, "color").send_keys(data["color"])
    if data["hasHole"]:
        checkbox = driver.find_element(By.ID, "hasHole")
        if not checkbox.is_selected():
            checkbox.click()
        driver.find_element(By.ID, "holeWidth").send_keys(str(data["holeWidth"]))
        driver.find_element(By.ID, "holeHeight").send_keys(str(data["holeHeight"]))
    driver.find_element(By.ID, "generate").click()
    print("✅ 已將辨識結果填入並產生模型")

if __name__ == "__main__":
    chrome_options = Options()
    #chrome_options.add_argument("--use-fake-ui-for-media-stream")
    driver = webdriver.Chrome(options=chrome_options)
    driver.get("http://localhost:5173")
    time.sleep(1)
    #wait_for_recognize_button(driver)
    #image_base64 = capture_image_from_camera("captured_images/img.jpg")
    data = extract_params()
    if data:
        fill_form_with_selenium(driver, data)
        print("✅ 模型產生完成")

    input("✅ 操作完成，請檢查網頁模型結果。關閉 Chrome 視窗後按 Enter 結束。")