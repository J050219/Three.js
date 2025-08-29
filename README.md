# 使用者互動 3D 建模工具

這是一個使用 [Three.js](https://threejs.org/) 製作的 Web 應用程式，使用者自訂 3D 形狀（立方體、球體、不規則圖形和四種不同的方塊（I/T/Z/L）），可以設定尺寸、顏色與簍空參數，並即時在畫面中生成對應模型。

---

## 安裝&執行

### 1) 安裝 Python 相依

> 建議 Python 3.10+

```bash
pip install flask flask-cors opencv-python requests selenium
```

### 2) 安裝前端套件（安裝到 static 資料夾）

```bash
cd static
npm init -y
npm i three three-csg-ts @tweenjs/tween.js
```

### 3)（可選）設定 OVIS 端點

`server.py` 會把拍攝影像送往 OVIS 服務

```bash
# Windows (PowerShell)
$env:OVIS_URL="http://192.168.178.151:5678/webhook/mcp"
$env:OVIS_TIMEOUT="8.0"
```

### 4) 啟動後端（Flask）

```bash
python server.py
# 伺服器預設 http://localhost:5000
```

### 5) 啟動前端網頁

```bash
 npm run start
```

### 6) 啟動自動化（Selenium）

```bash
python auto_control.py
```

- 需安裝 Chrome 與對應 ChromeDriver。

---

## 主要功能

- **圖形類型**
  - 立方體（`cube`）
  - 球體（`circle`）
  - 不規則形狀（`lshape`）
  - T型
  - T型
  - Z型
  - L型
- **參數**
  - 尺寸：寬 / 高 / 深（球體:直徑、方塊:單位邊長）
  - 顏色：紅/綠/藍/黃/紫/白/黑/橘/灰/粉紅
  - 簍空：立方體 / 球體 / L 形可設定「有孔」與孔寬 / 孔高（方塊不支援簍空）
- **操作（滑鼠／鍵盤）**
  - 左鍵點擊：選取；點空白處取消。
  - Shift + 左鍵拖曳：旋轉選取物。
  - 右鍵拖曳：XZ 平面移動。
  - 空白鍵 + 右鍵拖曳：垂直移動。
  - Delete / Backspace：刪除選取物件。
  - 滾輪：沿視線方向前後移動相機。
- **最佳化擺放**
- **物體清單（Library）**
  - 產生或辨識後都會存入 `localStorage: recognizedLibrary`，可再次放回場景。
- **攝影機串流 + 參數辨識**
  - 右下角以 `<img src="/get-camera-frame">` 顯示 MJPEG 串流。
  - 按「辨識參數」：後端拍照 → 送至 OVIS → 回傳一行中文描述 → 前端解析並自動填表／建模。

---

## 專案結構

> Flask 以 `static/` 作為靜態根目錄(放置前端檔案)；Node 模組安裝在 `static/node_modules/`。

```
Animation-System/
├─ server.py                # Flask：攝影機串流、OVIS 轉接、模組供應
├─ auto_control.py          # Selenium 自動化：等待前端按鈕 → 取辨識 → 自動填表／建模
├─ captured_images/         # 後端拍照輸出
│  └─ img.jpg
└─ static/
   ├─ index.html            # 前端頁面
   ├─ main.js               # Three.js 場景、建模、拖曳/旋轉、最佳化、Library
   ├─ recognizer.js         # 呼叫 /ovis-recognize-from-camera 並解析中文描述 → 物件參數
   └─ node_modules/         # three / three-csg-ts / @tweenjs/tween.js
```
---

## 使用方法
1. 開啟`http://localhost:5000` → 右側 UI 可輸入：

  - 選擇圖形類型（立方體 / 球體 / 不規則圖形/ I/ T/ Z/ L 方塊）
  - 設定寬度、高度、深度
  - 選擇顏色（HEX 格式，如 #ff0000）
  - 是否簍空（輸入孔洞的寬高）
2. 點擊**產生物體**:生成對應 3D 模型。
3. (須執行`auto_control.py`)點擊**辨識參數**：從攝影機拍照、回送 OVIS 辨識描述，自動套表單並生成。
4. **物件清單**:放置生成過的物體參數，可將物體再次放回場景內。
5. 點擊**最佳化擺放**；進行中可按**停止最佳化**。

---

