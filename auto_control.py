from selenium import webdriver
from selenium.webdriver.common.by import By
from selenium.webdriver.support.ui import Select
from selenium.webdriver.chrome.options import Options
from selenium.common.exceptions import UnexpectedAlertPresentException, NoAlertPresentException
from selenium.webdriver.common.alert import Alert
import time
import os
import re
import cv2
import base64
from client import query_server

def extract_params(text):
    if not text:
        print("❌ extract_params() 收到空值")
        return {}
    def extract(regex):
        match = re.search(regex, text)
        return float(match.group(1)) if match else 0

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

def wait_for_recognize_button(driver):
    print("🕓 等待點擊辨識參數按鈕...")
    while True:
        try:
            alert = Alert(driver)
            print(f"⚠️ 偵測到警告視窗：{alert.text}")
            alert.accept()
            print("✅ 警告視窗已關閉")
            time.sleep(1)
            continue
        except NoAlertPresentException:
            pass
        btn = driver.find_element(By.ID, "recognizeBtn")
        btn_text = btn.get_attribute("value") or btn.text
        if "辨識中" in btn_text:
            break
        time.sleep(1)
    print("🔘 偵測到使用者已點擊按鈕")
    time.sleep(2)

def capture_image_from_camera(save_path="captured_images/img.jpg", driver=None):
    save_dir = "captured_images"
    os.makedirs(save_dir, exist_ok=True)
    save_path = os.path.join(save_dir, "img.jpg")
    
    cap = cv2.VideoCapture(0)
    if not cap.isOpened():
        print("❌ 無法開啟攝影機")
        return None
    ret, frame = cap.read()
    cap.release()
    if not ret:
        print("❌ 無法讀取攝影機畫面")
        return None
    cv2.imwrite(save_path, frame)
    print(f"✅ 擷取成功：{save_path}")
    with open(save_path, "rb") as img_file:
        image_base64 = base64.b64encode(img_file.read()).decode('utf-8')
    return image_base64

# ✅ 2. Selenium 自動開啟網頁並填入參數

def fill_form_with_selenium(driver, data):
    #driver = webdriver.Chrome()
    #driver.get("http://localhost:5173")
    time.sleep(2)
    shape_select = Select(driver.find_element(By.ID, "shapeType"))
    shape_select.select_by_value(data["type"])

    if data["type"] == "cube":
        driver.find_element(By.ID, "boxWidth").send_keys(str(data["width"]))
        driver.find_element(By.ID, "boxHeight").send_keys(str(data["height"]))
        driver.find_element(By.ID, "boxDepth").send_keys(str(data["depth"]))
    elif data["type"] == "circle":
        driver.find_element(By.ID, "sphereWidth").send_keys(str(data["width"]))
    elif data["type"] == "lshape":
        driver.find_element(By.ID, "customWidth").send_keys(str(data["width"]))
        driver.find_element(By.ID, "customHeight").send_keys(str(data["height"]))
        driver.find_element(By.ID, "customDepth").send_keys(str(data["depth"]))

    driver.find_element(By.ID, "color").clear()
    driver.find_element(By.ID, "color").send_keys(data["color"])

    if data.get("hasHole"):
        checkbox = driver.find_element(By.ID, "hasHole")
        if not checkbox.is_selected():
            checkbox.click()
        time.sleep(0.5)
        driver.find_element(By.ID, "holeWidth").send_keys(str(data["holeWidth"]))
        driver.find_element(By.ID, "holeHeight").send_keys(str(data["holeHeight"]))

    driver.find_element(By.ID, "generate").click()
    print("✅ 已將辨識結果填入並產生模型")



if __name__ == "__main__":
    chrome_options = Options()
    chrome_options.add_argument("--use-fake-ui-for-media-stream") 
    #image_base = capture_image_from_camera()
    driver = webdriver.Chrome(options=chrome_options)
    driver.get("http://localhost:5173")
    time.sleep(2)

    image_base64 = capture_image_from_camera("captured_images/img.jpg", driver)
    if image_base64:
        raw_result = query_server("請辨識圖中的文字。", image_base64)
        if raw_result is None:
            print("❌ 辨識失敗，未收到結果")
        else:
            parsed_data = extract_params(raw_result)
            fill_form_with_selenium(driver, parsed_data)
